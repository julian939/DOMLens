(() => {
  const WHEEL_STEP_THRESHOLD = 50;
  const WHEEL_COOLDOWN_MS = 80;
  const WHEEL_PANEL_DEBOUNCE_MS = 100;

  const inspectCache = new WeakMap();
  let inspectCacheGeneration = 0;

  const state = {
    settings: null,
    enabled: false,
    active: false,
    cursor: { x: 0, y: 0 },
    target: null,
    cachedStyle: null,
    rafScheduled: false,
    listenersAttached: false,
    /* The Capture Session owns the gesture + feedback arc (dispatcher, hold
       target, pre-compute, ring/toast/clipboard, shared feedback timing).
       content.js keeps only the Inspect Mode flags below. See ADR 0004. */
    session: null,
    /* HotkeyMatcher owns key tracking + Hotkey/Action-Key matching. */
    matcher: null,
    /* True from Action-Key-Down until the capture animation ends. While true,
       mousemove must not re-render Highlight Layers, Capture Ring, or Info
       Panel; cursor updates remain allowed for toast placement. */
    lifecycleLock: false,
    /* Capture Latch: set on a successful Snippet/Snapshot commit. While true,
       Inspect Mode cannot re-enter — the user must release the Hotkey and
       press it again. Cleared on any observed Hotkey keyup (including the
       implicit release on tab switch, window blur, or deactivate). Cancels
       do not engage the latch. See docs/adr/0004-commit-exits-inspect-mode.md */
    captureLatched: false,
    scrollNavigator: null,
    wheelState: { accum: 0, lastStepAt: 0 },
    pendingPanelEl: null,
    panelDebounceTimer: 0,
    panelSettingsKey: ''
  };

  function init() {
    globalThis.Overlay.init();
    state.scrollNavigator = globalThis.ScrollNavigator.createNavigator();
    state.matcher = globalThis.HotkeyMatcher.createMatcher({
      getSettings: () => state.settings,
      isActive: () => state.active
    });
    setupSession();
    attachWindowLifecycle();
    attachKeyListeners();
    attachCursorTracking();

    globalThis.InspectSettings.load().then((settings) => {
      applySettings(settings);
    });
    globalThis.InspectSettings.onChange((settings) => {
      applySettings(settings);
    });
  }

  function setupSession() {
    /* The Capture Session owns the whole capture act and signals two lifecycle
       transitions back: onInspectExit (at a commit) and onSettled (when the
       feedback window closes). content.js stays the Inspect Mode state machine.
       See ADR 0004. */
    state.session = globalThis.CaptureSession.createSession({
      ring: globalThis.Overlay.captureRing,
      toast: { show: (msg, rect) => globalThis.Overlay.showToast(msg, rect) },
      clipboard: { write: writeClipboard },
      snapshotPipeline: globalThis.SnapshotPipeline,
      elementCopy: globalThis.ElementCopy,
      getSettings: () => state.settings,
      onInspectExit: onCaptureCommit,
      onSettled: onCaptureSettled
    });
  }

  function onCaptureCommit() {
    /* Commit terminal: end Inspect Mode immediately and engage the Capture
       Latch. Highlight Layers and Info Panel disappear so the Capture Ring +
       Toast own the screen during their shared feedback window. The Hotkey must
       be released and pressed again before Inspect Mode can re-enter. */
    state.captureLatched = true;
    state.active = false;
    state.target = null;
    state.cachedStyle = null;
    detachInspectListeners();
    globalThis.Overlay.exitLockedTargetMode();
    globalThis.Overlay.hideHighlightLayers();
    globalThis.Overlay.hidePanel();
  }

  function onCaptureSettled() {
    /* Feedback window closed (or a non-Dead-Zone cancel): release the lock and,
       if still inspecting with the Hotkey held, resume the render loop. */
    state.lifecycleLock = false;
    if (state.active && state.matcher.isHeldNow()) {
      scheduleRender();
    }
  }

  function applySettings(settings) {
    state.settings = settings;
    state.enabled = !!(settings.hotkey && settings.hotkey.code);
    state.panelSettingsKey = panelSettingsKey(settings);
    inspectCacheGeneration += 1;
    if (!state.enabled) deactivate();
  }

  function panelSettingsKey(settings) {
    if (!settings) return '';
    return JSON.stringify({
      infoFields: settings.infoFields || {},
      snippetTripleQuoteBlock: settings.snippetTripleQuoteBlock
    });
  }

  function getCachedStyle(el) {
    const key = state.panelSettingsKey;
    let entry = inspectCache.get(el);
    if (entry && entry.gen === inspectCacheGeneration && entry.styleKey === key && entry.cs) {
      return entry.cs;
    }
    const cs = getComputedStyle(el);
    if (!entry) entry = {};
    entry.cs = cs;
    entry.styleKey = key;
    entry.gen = inspectCacheGeneration;
    inspectCache.set(el, entry);
    return cs;
  }

  function getCachedPanelHtml(el, cs) {
    const key = state.panelSettingsKey;
    let entry = inspectCache.get(el);
    if (entry && entry.gen === inspectCacheGeneration && entry.styleKey === key && entry.panelHtml) {
      return entry.panelHtml;
    }
    const panelHtml = globalThis.InfoPanel.htmlFor(el, cs, state.settings);
    if (!entry) entry = {};
    entry.panelHtml = panelHtml;
    entry.styleKey = key;
    entry.gen = inspectCacheGeneration;
    inspectCache.set(el, entry);
    return panelHtml;
  }

  function attachWindowLifecycle() {
    window.addEventListener('blur', () => {
      state.matcher.clear();
      if (state.session) state.session.cancel('blur');
      deactivate();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        state.matcher.clear();
        if (state.session) state.session.cancel('tab-switch');
        deactivate();
      }
    });
  }

  function attachKeyListeners() {
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true, passive: true });
  }

  /* The cursor must be known *before* Inspect Mode is entered: pressing the
     Hotkey while the mouse is already resting on an element produced no render
     (and a stale acquireTarget) because the only place cursor was tracked was
     the inspect-scoped mousemove listener. This permanent, render-free listener
     keeps state.cursor fresh at all times so activate() can paint immediately. */
  function attachCursorTracking() {
    window.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
  }

  function scrollNavigationActive() {
    return !!(state.active
      && state.settings
      && state.settings.scrollNavigation);
  }

  function onKeyDown(event) {
    if (!state.enabled) return;

    if (scrollNavigationActive() && state.matcher.isPageScrollKey(event)) {
      event.preventDefault();
      event.stopPropagation();
    }

    /* Esc during a hold cancels the gesture. Handled before hotkey checks
       so it works regardless of whether the hotkey is currently held. */
    if (event.key === 'Escape' && state.session && state.session.isHolding()) {
      state.session.cancel('esc');
      return;
    }

    state.matcher.trackKeyDown(event);

    if (state.matcher.isHeld(event)) {
      activate();
      if (state.active && state.matcher.isActionKey(event) && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        onActionKeyDown();
      }
    }
  }

  function acquireTarget() {
    const selected = state.scrollNavigator && state.scrollNavigator.current();
    if (selected) return selected;
    if (state.target) return state.target;
    const fromPoint = document.elementFromPoint(state.cursor.x, state.cursor.y);
    if (fromPoint && !globalThis.Overlay.isOwnNode(fromPoint)) return fromPoint;
    return null;
  }

  function onActionKeyDown() {
    const target = acquireTarget();
    if (!target || !state.session) return;
    /* Lock entry: Info Panel and Highlight Layers are hidden immediately so the
       Capture Ring owns the visual feedback. The Capture Session takes the act
       from here — ring, pre-compute, gesture, and feedback (ADR 0004). */
    state.lifecycleLock = true;
    globalThis.Overlay.hidePanel();
    globalThis.Overlay.hideHighlightLayers();
    state.session.begin(target);
  }

  function onKeyUp(event) {
    state.matcher.trackKeyUp(event);

    if (state.session && state.session.isHolding()) {
      if (state.matcher.isActionKey(event)) {
        state.session.actionKeyUp();
      } else if (!state.matcher.isHeld(event)) {
        /* Hotkey released during a hold → cancel. */
        state.session.cancel('hotkey-release');
      }
    }

    /* Capture Latch is released the moment the Hotkey leaves the keyboard,
       regardless of whether Inspect Mode is currently active. The next
       keydown on the Hotkey will then re-enter Inspect Mode normally. */
    if (state.captureLatched && !state.matcher.isHeld(event)) {
      state.captureLatched = false;
    }

    if (!state.active) return;
    if (!state.matcher.isHeld(event)) deactivate();
  }

  function activate() {
    /* Capture Latch blocks re-entry until the Hotkey is released and pressed
       again. See docs/adr/0004-commit-exits-inspect-mode.md */
    if (state.captureLatched) return;
    if (state.active) return;
    state.active = true;
    if (state.scrollNavigator) state.scrollNavigator.reset();
    state.wheelState = { accum: 0, lastStepAt: 0 };
    cancelDeferredPanelUpdate();
    attachInspectListeners();
    /* Paint immediately from the last known cursor — the mouse may already be
       resting on the target with no further mousemove coming. Without this the
       Highlight Layer / Info Panel (and any Action-Key target) would only
       appear after the user nudged the mouse. */
    scheduleRender();
  }

  function deactivate() {
    /* Any deactivate path (blur, tab switch, hotkey release, settings change)
       implies the Hotkey is no longer held — clear the latch unconditionally. */
    state.captureLatched = false;
    if (!state.active) {
      globalThis.Overlay.hide();
      return;
    }
    state.active = false;
    state.lifecycleLock = false;
    if (state.scrollNavigator) state.scrollNavigator.reset();
    state.wheelState = { accum: 0, lastStepAt: 0 };
    cancelDeferredPanelUpdate();
    detachInspectListeners();
    state.target = null;
    state.cachedStyle = null;
    if (state.session) state.session.clearVisuals();
    globalThis.Overlay.exitLockedTargetMode();
    globalThis.Overlay.hideToast();
    globalThis.Overlay.hide();
  }

  function attachInspectListeners() {
    if (state.listenersAttached) return;
    state.listenersAttached = true;
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('scroll', onInspectScroll, { capture: true, passive: true });
    window.addEventListener('resize', onInspectResize, { passive: true });
  }

  function detachInspectListeners() {
    if (!state.listenersAttached) return;
    state.listenersAttached = false;
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('scroll', onInspectScroll, { capture: true });
    window.removeEventListener('resize', onInspectResize);
  }

  function onInspectScroll() {
    if (state.lifecycleLock || !state.target || !state.cachedStyle) {
      scheduleRender();
      return;
    }
    globalThis.Overlay.updateHighlight(state.target, state.cachedStyle);
    globalThis.Overlay.repositionPanel(state.cursor, state.target);
  }

  function onInspectResize() {
    if (state.lifecycleLock || !state.target || !state.cachedStyle) {
      scheduleRender();
      return;
    }
    globalThis.Overlay.updateHighlight(state.target, state.cachedStyle);
    globalThis.Overlay.repositionPanel(state.cursor, state.target);
  }

  function onWheel(event) {
    if (!scrollNavigationActive()) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.lifecycleLock) return;

    const result = globalThis.WheelStep.accumulateWheel(
      event.deltaY,
      state.wheelState,
      WHEEL_STEP_THRESHOLD,
      WHEEL_COOLDOWN_MS,
      Date.now()
    );
    state.wheelState = result.state;
    if (!result.steps || !state.scrollNavigator) return;

    const direction = result.steps > 0 ? -1 : 1;
    if (state.scrollNavigator.step(direction, state.cursor.x, state.cursor.y)) {
      const el = state.scrollNavigator.current();
      if (el) paintWheelTarget(el);
    }
  }

  function onMouseMove(event) {
    /* Permanent listener: always keep the cursor fresh so activate() can paint
       from a resting mouse. Everything below is Inspect-Mode-only. */
    state.cursor.x = event.clientX;
    state.cursor.y = event.clientY;
    if (!state.active || state.lifecycleLock) return;
    if (state.pendingPanelEl) flushPendingPanelUpdate();
    scheduleRender();
  }

  function scheduleRender() {
    if (state.rafScheduled || !state.active) return;
    state.rafScheduled = true;
    requestAnimationFrame(() => {
      state.rafScheduled = false;
      if (!state.active) return;
      render();
    });
  }

  function cancelDeferredPanelUpdate() {
    state.pendingPanelEl = null;
    if (state.panelDebounceTimer) {
      clearTimeout(state.panelDebounceTimer);
      state.panelDebounceTimer = 0;
    }
  }

  function scheduleDebouncedPanelUpdate(el) {
    state.pendingPanelEl = el;
    if (state.panelDebounceTimer) clearTimeout(state.panelDebounceTimer);
    state.panelDebounceTimer = setTimeout(() => {
      state.panelDebounceTimer = 0;
      if (!state.active || state.pendingPanelEl !== state.target) return;
      const panelHtml = getCachedPanelHtml(state.target, state.cachedStyle);
      globalThis.Overlay.setPanelContent(panelHtml);
      globalThis.Overlay.repositionPanel(state.cursor, state.target);
      state.pendingPanelEl = null;
    }, WHEEL_PANEL_DEBOUNCE_MS);
  }

  function flushPendingPanelUpdate() {
    if (!state.pendingPanelEl || state.pendingPanelEl !== state.target) return;
    if (state.panelDebounceTimer) {
      clearTimeout(state.panelDebounceTimer);
      state.panelDebounceTimer = 0;
    }
    const panelHtml = getCachedPanelHtml(state.target, state.cachedStyle);
    globalThis.Overlay.setPanelContent(panelHtml);
    globalThis.Overlay.repositionPanel(state.cursor, state.target);
    state.pendingPanelEl = null;
  }

  function paintWheelTarget(el) {
    state.target = el;
    state.cachedStyle = getCachedStyle(el);
    globalThis.Overlay.updateHighlight(el, state.cachedStyle);
    scheduleDebouncedPanelUpdate(el);
  }

  function paintTarget(el) {
    if (!el) {
      cancelDeferredPanelUpdate();
      globalThis.Overlay.hide();
      state.target = null;
      return;
    }

    cancelDeferredPanelUpdate();
    const targetChanged = el !== state.target;
    if (targetChanged) {
      state.target = el;
      state.cachedStyle = getCachedStyle(el);
      const panelHtml = getCachedPanelHtml(el, state.cachedStyle);
      globalThis.Overlay.showFor(el, state.cursor, panelHtml, state.cachedStyle);
      return;
    }

    globalThis.Overlay.updateHighlight(el, state.cachedStyle);
    globalThis.Overlay.repositionPanel(state.cursor, el);
  }

  function render() {
    const { x, y } = state.cursor;
    const leaf = document.elementFromPoint(x, y);
    if (!leaf || globalThis.Overlay.isOwnNode(leaf)) {
      globalThis.Overlay.hide();
      state.target = null;
      return;
    }

    if (state.scrollNavigator) state.scrollNavigator.setLeaf(leaf);
    const el = (state.scrollNavigator && state.scrollNavigator.current()) || leaf;
    paintTarget(el);
  }

  function writeClipboard(text) {
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (p && typeof p.catch === 'function') {
        p.catch(() => fallbackCopy(text));
      } else if (!p) {
        fallbackCopy(text);
      }
    } catch (_) {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      // silent fail — absence of capture pulse is signal enough
    }
  }

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
