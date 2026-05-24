(() => {
  const MODIFIER_EVENT_MAP = {
    Alt: (e) => e.altKey,
    Control: (e) => e.ctrlKey,
    Meta: (e) => e.metaKey,
    Shift: (e) => e.shiftKey
  };

  const DOUBLE_TAP_WINDOW_MS = 250;

  const state = {
    settings: null,
    enabled: false,
    active: false,
    cursor: { x: 0, y: 0 },
    target: null,
    cachedStyle: null,
    rafScheduled: false,
    listenersAttached: false,
    pendingCopyTimeoutId: 0,
    pendingCopyTarget: null
  };

  /* Track pressed non-modifier keys so we can detect "is hotkey held" */
  const pressedKeys = new Set();

  function init() {
    globalThis.Overlay.init();
    attachWindowLifecycle();
    attachKeyListeners();

    globalThis.InspectSettings.load().then((settings) => {
      applySettings(settings);
    });
    globalThis.InspectSettings.onChange((settings) => {
      applySettings(settings);
    });
  }

  function applySettings(settings) {
    state.settings = settings;
    state.enabled = !!(settings.hotkey && settings.hotkey.code);
    if (!state.enabled) deactivate();
  }

  function attachWindowLifecycle() {
    window.addEventListener('blur', () => {
      pressedKeys.clear();
      deactivate();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pressedKeys.clear();
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

  function onKeyDown(event) {
    if (!state.enabled) return;

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
        onCopyKey();
      }
    }
  }

  function onCopyKey() {
    if (state.pendingCopyTimeoutId) {
      clearTimeout(state.pendingCopyTimeoutId);
      state.pendingCopyTimeoutId = 0;
      const target = state.pendingCopyTarget || state.target;
      state.pendingCopyTarget = null;
      onCopyAllShortcut(target);
      return;
    }
    const target = state.target;
    if (!target) return;
    state.pendingCopyTarget = target;
    state.pendingCopyTimeoutId = setTimeout(() => {
      const t = state.pendingCopyTarget;
      state.pendingCopyTimeoutId = 0;
      state.pendingCopyTarget = null;
      if (!t) return;
      onCopyShortcut(t);
    }, DOUBLE_TAP_WINDOW_MS);
  }

  function cancelPendingCopy() {
    if (state.pendingCopyTimeoutId) {
      clearTimeout(state.pendingCopyTimeoutId);
      state.pendingCopyTimeoutId = 0;
    }
    state.pendingCopyTarget = null;
  }

  function onKeyUp(event) {
    // Un-track released keys
    if (!isModifierKey(event.key)) {
      pressedKeys.delete(event.code);
    }

    if (!state.active) return;
    if (!hotkeyHeld(event)) deactivate();
  }

  function activate() {
    if (state.active) return;
    state.active = true;
    attachInspectListeners();
  }

  function deactivate() {
    if (!state.active) {
      globalThis.Overlay.hide();
      return;
    }
    state.active = false;
    detachInspectListeners();
    state.target = null;
    state.cachedStyle = null;
    cancelPendingCopy();
    globalThis.Overlay.clearFlash();
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
      globalThis.Overlay.clearFlash();
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
    globalThis.Overlay.flash();
    globalThis.Overlay.showToast('Copied!', state.cursor);
  }

  async function onCopyAllShortcut(target) {
    const el = target || state.target;
    if (!el) return;
    const includeScreenshot = !!(state.settings && state.settings.snapshot && state.settings.snapshot.includeScreenshot);
    if (includeScreenshot) {
      // Hide the overlay for one frame so the captured viewport PNG does not
      // include DOMLens chrome (highlight layers, info panel, toast).
      globalThis.Overlay.hide();
      globalThis.Overlay.hideToast();
      await nextFramePaint();
    }
    const payload = await globalThis.ElementCopy.buildSnapshot(el, { includeScreenshot });
    writeClipboard(payload);
    if (includeScreenshot && state.active && state.target === el) {
      // Re-render so highlight layers come back, then flash on top of them.
      render();
    }
    globalThis.Overlay.flash();
    globalThis.Overlay.showToast('All info copied!', state.cursor);
  }

  function nextFramePaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
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
      // silent fail — non-flashing is signal enough
    }
  }

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
