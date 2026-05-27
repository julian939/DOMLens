(() => {
  const MODIFIER_EVENT_MAP = {
    Alt: (e) => e.altKey,
    Control: (e) => e.ctrlKey,
    Meta: (e) => e.metaKey,
    Shift: (e) => e.shiftKey
  };

  const state = {
    settings: null,
    enabled: false,
    active: false,
    cursor: { x: 0, y: 0 },
    target: null,
    cachedStyle: null,
    rafScheduled: false,
    listenersAttached: false,
    /* Gesture state — populated at actionKeyDown, cleared on any terminal. */
    dispatcher: null,
    holdTarget: null,
    preCompute: null,
    capturePromise: null,
    /* True from Action-Key-Down until the capture animation ends. While true,
       mousemove must not re-render Highlight Layers, Capture Ring, or Info
       Panel; cursor updates remain allowed for toast placement. */
    lifecycleLock: false,
    /* Capture Latch: set on a successful Snippet/Snapshot commit. While true,
       Inspect Mode cannot re-enter — the user must release the Hotkey and
       press it again. Cleared on any observed Hotkey keyup (including the
       implicit release on tab switch, window blur, or deactivate). Cancels
       do not engage the latch. See docs/adr/0004-commit-exits-inspect-mode.md */
    captureLatched: false
  };

  /* Track pressed non-modifier keys so we can detect "is hotkey held" */
  const pressedKeys = new Set();

  function init() {
    globalThis.Overlay.init();
    setupDispatcher();
    attachWindowLifecycle();
    attachKeyListeners();

    globalThis.InspectSettings.load().then((settings) => {
      applySettings(settings);
    });
    globalThis.InspectSettings.onChange((settings) => {
      applySettings(settings);
    });
  }

  function setupDispatcher() {
    const dispatcher = globalThis.GestureDispatcher.createDispatcher();
    /* Hold-progress ticks are intentionally ignored: the deep-blue Capture
       Ring's mere presence communicates "key is pressed"; the colour switch
       at threshold-cross is itself the threshold indicator. */
    dispatcher.onTerminal((kind, payload) => {
      if (kind === 'snippet') {
        handleSnippet(payload);
      } else if (kind === 'snapshot') {
        handleSnapshot(payload);
      } else if (kind === 'cancel') {
        handleCancel(payload);
      }
    });
    dispatcher.onZoneChange((zone) => {
      if (zone === 'dead-zone') {
        const target = state.holdTarget;
        if (target) globalThis.Overlay.captureRing.startCharging(target);
      }
      /* snapshot-zone: no additional action — the snapshot terminal fires at
         the same moment and drives startScan. */
    });
    state.dispatcher = dispatcher;
  }

  function applySettings(settings) {
    state.settings = settings;
    state.enabled = !!(settings.hotkey && settings.hotkey.code);
    if (!state.enabled) deactivate();
  }

  function attachWindowLifecycle() {
    window.addEventListener('blur', () => {
      pressedKeys.clear();
      if (state.dispatcher) state.dispatcher.cancel('blur');
      deactivate();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pressedKeys.clear();
        if (state.dispatcher) state.dispatcher.cancel('tab-switch');
        deactivate();
      }
    });
  }

  function attachKeyListeners() {
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true, passive: true });
  }

  function isModifierKey(key) {
    return key in MODIFIER_EVENT_MAP;
  }

  function hotkeyHeld(event) {
    if (!state.settings || !state.settings.hotkey) return false;
    const hotkey = state.settings.hotkey;

    // If the hotkey is a modifier key, use the event flags
    if (isModifierKey(hotkey.key)) {
      return MODIFIER_EVENT_MAP[hotkey.key](event);
    }

    // Otherwise check our tracked set
    return pressedKeys.has(hotkey.code);
  }

  function isHotkeyCurrentlyHeld() {
    if (!state.settings || !state.settings.hotkey) return false;
    const hotkey = state.settings.hotkey;
    /* For modifier-key hotkeys we cannot inspect the current state without an
       event — treat state.active as the authoritative signal instead. */
    if (isModifierKey(hotkey.key)) return state.active;
    return pressedKeys.has(hotkey.code);
  }

  function onKeyDown(event) {
    if (!state.enabled) return;

    /* Esc during a hold cancels the gesture. Handled before hotkey checks
       so it works regardless of whether the hotkey is currently held. */
    if (event.key === 'Escape' && state.dispatcher && state.dispatcher.isHolding()) {
      state.dispatcher.cancel('esc');
      return;
    }

    // Track all non-modifier keys
    if (!isModifierKey(event.key)) {
      pressedKeys.add(event.code);
    }

    if (hotkeyHeld(event)) {
      activate();

      const actionCode = state.settings.actionKey && state.settings.actionKey.code;
      if (state.active && actionCode && event.code === actionCode && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        onActionKeyDown();
      }
    }
  }

  function acquireTarget() {
    if (state.target) return state.target;
    const fromPoint = document.elementFromPoint(state.cursor.x, state.cursor.y);
    if (fromPoint && !globalThis.Overlay.isOwnNode(fromPoint)) return fromPoint;
    return null;
  }

  function onActionKeyDown() {
    const target = acquireTarget();
    if (!target || !state.dispatcher) return;
    /* Lock entry: Info Panel and Highlight Layers are hidden immediately so
       the Capture Ring owns the visual feedback for the gesture. The element
       being captured is communicated by the ring's outline alone — the box-
       model layers were tied to the Info Panel's inspection role. */
    state.lifecycleLock = true;
    globalThis.Overlay.hidePanel();
    globalThis.Overlay.hideHighlightLayers();
    /* Target is locked at key-down. Cursor drift during the hold does not
       retarget. */
    state.holdTarget = target;
    /* Capture Ring becomes visible the instant the Action Key is pressed —
       deep-blue zone-1 state. It stays through both Hold-Gesture zones and
       either pops (Snippet release) or transitions to scanning (threshold-
       cross) at a terminal. */
    globalThis.Overlay.captureRing.show(target);
    /* Pre-Compute is speculative — abandoned if dispatcher cancels or commits
       a snippet before the threshold crosses. */
    state.preCompute = globalThis.SnapshotPipeline.startPreCompute(target);
    state.dispatcher.actionKeyDown(target);
  }

  function onKeyUp(event) {
    // Un-track released keys
    if (!isModifierKey(event.key)) {
      pressedKeys.delete(event.code);
    }

    if (state.dispatcher && state.dispatcher.isHolding()) {
      const actionCode = state.settings && state.settings.actionKey && state.settings.actionKey.code;
      if (actionCode && event.code === actionCode) {
        state.dispatcher.actionKeyUp();
      } else if (!hotkeyHeld(event)) {
        /* Hotkey released during a hold → cancel. */
        state.dispatcher.cancel('hotkey-release');
      }
    }

    /* Capture Latch is released the moment the Hotkey leaves the keyboard,
       regardless of whether Inspect Mode is currently active. The next
       keydown on the Hotkey will then re-enter Inspect Mode normally. */
    if (state.captureLatched && !hotkeyHeld(event)) {
      state.captureLatched = false;
    }

    if (!state.active) return;
    if (!hotkeyHeld(event)) deactivate();
  }

  function exitLifecycleLock() {
    state.lifecycleLock = false;
    if (state.active && isHotkeyCurrentlyHeld()) {
      scheduleRender();
    }
  }

  function clearGestureState() {
    globalThis.Overlay.captureRing.hide();
    globalThis.Overlay.exitLockedTargetMode();
    state.holdTarget = null;
    if (state.preCompute) {
      state.preCompute.abort();
      state.preCompute = null;
    }
    state.capturePromise = null;
  }

  function engageCaptureLatch() {
    /* Commit terminal: end Inspect Mode immediately. Highlight Layers and
       Info Panel disappear so the Capture Ring + Toast feedback owns the
       screen during their shared 1200 ms lifecycle. The Hotkey must be
       released and pressed again before Inspect Mode can re-enter. */
    state.captureLatched = true;
    state.active = false;
    state.target = null;
    state.cachedStyle = null;
    detachInspectListeners();
    globalThis.Overlay.exitLockedTargetMode();
    globalThis.Overlay.hideHighlightLayers();
    globalThis.Overlay.hidePanel();
    state.holdTarget = null;
    if (state.preCompute) {
      state.preCompute.abort();
      state.preCompute = null;
    }
    state.capturePromise = null;
  }

  function handleSnippet(target) {
    /* Snippet: abandon Pre-Compute (no clipboard write from it), pop the
       Capture Ring in deep-blue, engage the Capture Latch. clearGestureState
       would hide the ring outright — we skip the ring.hide call here and let
       the pop animation self-clean over the shared lifecycle. */
    engageCaptureLatch();
    onCopyShortcut(target);
    setTimeout(exitLifecycleLock, globalThis.Overlay.CAPTURE_POP_MS + 20);
  }

  async function handleSnapshot(target) {
    /* Snapshot fired at threshold-cross. Pre-Compute is already running.
       The Capture Ring is already visible in its deep-blue active state —
       startScan swaps the background to the rotating Gemini conic gradient
       on the same ring, same position, same border thickness. Toast fires
       synchronously with the scan so both end together (per ADR 0004). */
    const preCompute = state.preCompute;
    state.preCompute = null;
    engageCaptureLatch();
    globalThis.Overlay.captureRing.startScan(target);
    globalThis.Overlay.showToast('Snapshot Copied!', target.getBoundingClientRect());
    setTimeout(exitLifecycleLock, globalThis.Overlay.CAPTURE_SCAN_MS + 20);
    if (!preCompute) return;
    const includeScreenshot = !!(state.settings && state.settings.snapshot && state.settings.snapshot.includeScreenshot);
    try {
      let captureResult;
      if (includeScreenshot) {
        captureResult = await globalThis.SnapshotPipeline.capture(target);
      } else {
        captureResult = { box: globalThis.ElementCopy.boxFromRect(target), dataUrl: null };
      }
      const payload = await globalThis.SnapshotPipeline.commit(preCompute, captureResult);
      if (!payload) return;
      writeClipboard(payload);
    } catch (_) {
      /* Capture failure produces no toast — silent regression-safe. */
    }
  }

  function handleCancel(reason) {
    if (reason === 'dead-zone-release') {
      /* Dead Zone cancel: ring was in .charging — fade it out cleanly.
         No clipboard write, no toast. Lock exits on fade-end. */
      globalThis.Overlay.exitLockedTargetMode();
      state.holdTarget = null;
      if (state.preCompute) {
        state.preCompute.abort();
        state.preCompute = null;
      }
      state.capturePromise = null;
      globalThis.Overlay.captureRing.fadeFromCharging();
      setTimeout(exitLifecycleLock, globalThis.Overlay.CAPTURE_FADE_MS + 20);
      return;
    }
    clearGestureState();
    exitLifecycleLock();
  }

  function activate() {
    /* Capture Latch blocks re-entry until the Hotkey is released and pressed
       again. See docs/adr/0004-commit-exits-inspect-mode.md */
    if (state.captureLatched) return;
    if (state.active) return;
    state.active = true;
    attachInspectListeners();
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
    detachInspectListeners();
    state.target = null;
    state.cachedStyle = null;
    clearGestureState();
    globalThis.Overlay.hideToast();
    globalThis.Overlay.hide();
  }

  function attachInspectListeners() {
    if (state.listenersAttached) return;
    state.listenersAttached = true;
    window.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
    window.addEventListener('scroll', scheduleRender, { capture: true, passive: true });
    window.addEventListener('resize', scheduleRender, { passive: true });
  }

  function detachInspectListeners() {
    if (!state.listenersAttached) return;
    state.listenersAttached = false;
    window.removeEventListener('mousemove', onMouseMove, { capture: true });
    window.removeEventListener('scroll', scheduleRender, { capture: true });
    window.removeEventListener('resize', scheduleRender);
  }

  function onMouseMove(event) {
    state.cursor.x = event.clientX;
    state.cursor.y = event.clientY;
    if (state.lifecycleLock) return;
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

  function render() {
    const { x, y } = state.cursor;
    const el = document.elementFromPoint(x, y);
    if (!el || globalThis.Overlay.isOwnNode(el)) {
      globalThis.Overlay.hide();
      return;
    }

    const targetChanged = el !== state.target;
    if (targetChanged) {
      state.target = el;
      state.cachedStyle = getComputedStyle(el);
    }

    const panelHtml = buildPanelHtml(el, state.cachedStyle);
    globalThis.Overlay.showFor(el, state.cursor, panelHtml, state.cachedStyle);
  }

  function buildPanelHtml(el, cs) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = el.classList.length ? '.' + Array.from(el.classList).join('.') : '';

    const selectorHtml = `
      <div class="selector">
        <span class="sel-tag">${escapeHtml(tag)}</span>${
          id ? `<span class="sel-id">${escapeHtml(id)}</span>` : ''
        }${
          classes ? `<span class="sel-class">${escapeHtml(classes)}</span>` : ''
        }
      </div>
    `;

    const enabled = (state.settings && state.settings.infoFields) || {};
    const registry = (globalThis.InfoFields && globalThis.InfoFields.REGISTRY) || [];
    const groups = (globalThis.InfoFields && globalThis.InfoFields.GROUPS) || [];

    const rowsByGroup = new Map();
    for (const field of registry) {
      if (!enabled[field.id]) continue;
      const result = safeGetValue(field, el, cs);
      if (!result) continue;
      const rowHtml = renderFieldRow(field.label, result);
      if (!rowHtml) continue;
      if (!rowsByGroup.has(field.group)) rowsByGroup.set(field.group, []);
      rowsByGroup.get(field.group).push(rowHtml);
    }

    let firstGroup = true;
    let groupsHtml = '';
    for (const group of groups) {
      const rows = rowsByGroup.get(group.id);
      if (!rows || !rows.length) continue;
      const cls = firstGroup ? 'fields' : 'fields group';
      groupsHtml += `<div class="${cls}">${rows.join('')}</div>`;
      firstGroup = false;
    }

    return selectorHtml + groupsHtml;
  }

  function safeGetValue(field, el, cs) {
    try {
      return field.getValue(el, cs);
    } catch (_) {
      return null;
    }
  }

  function renderFieldRow(label, value) {
    if (!value) return '';
    const text = value.text == null ? '' : String(value.text);
    if (!text) return '';
    let valueHtml;
    if (value.kind === 'color') {
      valueHtml = renderSwatch(value.color) + escapeHtml(text);
    } else {
      valueHtml = escapeHtml(text);
    }
    return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${valueHtml}</span></div>`;
  }

  function renderSwatch(color) {
    return `<span class="swatch" style="background:${color}"></span>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function onCopyShortcut(target) {
    const el = target || state.target;
    if (!el) return;
    const line = globalThis.ElementCopy.buildSnippet(el);
    writeClipboard(line);
    globalThis.Overlay.captureRing.pop();
    globalThis.Overlay.showToast('Copied!', el.getBoundingClientRect());
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
