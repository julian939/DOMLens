(() => {
  const MODIFIER_EVENT_MAP = {
    Alt: (e) => e.altKey,
    Control: (e) => e.ctrlKey,
    Meta: (e) => e.metaKey,
    Shift: (e) => e.shiftKey
  };

  const HIGHLIGHT_COLORS = {
    margin: 'rgba(246, 178, 107, 0.55)',
    border: 'rgba(255, 229, 153, 0.66)',
    padding: 'rgba(147, 196, 125, 0.55)',
    content: 'rgba(111, 168, 220, 0.66)',
    outline: 'rgba(33, 90, 175, 0.9)'
  };

  const FLASH_COLORS = {
    content: 'rgba(120, 220, 140, 0.7)',
    outline: 'rgba(46, 160, 67, 0.95)'
  };
  const FLASH_DURATION_MS = 600;
  const TOAST_DURATION_MS = 1200;
  const COPY_TEXT_MAX_LEN = 60;
  const DOUBLE_TAP_WINDOW_MS = 250;

  const SNIPPET_TEXT_MAX_LEN = 120;
  const SNIPPET_PARENT_MAX_DEPTH = 3;
  const SNIPPET_HREF_MAX_LEN = 40;
  const VOID_ELEMENT_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const SNIPPET_PRIORITY_ATTRS = [
    'id',
    'data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-component',
    'role',
    'aria-label',
    'name',
    'type',
    'alt',
    'placeholder',
    'href'
  ];

  const UTILITY_CLASS_PREFIXES = [
    'text-', 'bg-', 'border-', 'rounded-', 'shadow-', 'ring-', 'opacity-',
    'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'ps-', 'pe-',
    'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-', 'ms-', 'me-',
    'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-', 'size-',
    'gap-', 'gap-x-', 'gap-y-', 'space-x-', 'space-y-',
    'items-', 'justify-', 'self-', 'place-', 'content-',
    'top-', 'bottom-', 'left-', 'right-', 'inset-', 'z-',
    'cursor-', 'select-', 'pointer-', 'overflow-', 'whitespace-',
    'duration-', 'ease-', 'animate-', 'delay-',
    'translate-', 'rotate-', 'scale-', 'skew-', 'origin-',
    'font-', 'tracking-', 'leading-', 'line-clamp-', 'list-',
    'fill-', 'stroke-', 'aspect-',
    'col-', 'row-', 'order-', 'divide-',
    'grid-cols-', 'grid-rows-', 'auto-cols-', 'auto-rows-', 'auto-flow-',
    'basis-', 'grow-', 'shrink-', 'flex-',
    'object-', 'isolate-', 'mix-blend-', 'bg-blend-',
    'backdrop-', 'filter-', 'blur-', 'brightness-', 'contrast-',
    'transition-', 'transform-'
  ];

  const UTILITY_CLASS_KEYWORDS = new Set([
    'flex', 'grid', 'hidden', 'block', 'inline', 'inline-block',
    'inline-flex', 'inline-grid', 'table', 'table-row', 'table-cell',
    'absolute', 'relative', 'fixed', 'sticky', 'static',
    'transition', 'transform', 'transform-gpu',
    'truncate', 'uppercase', 'lowercase', 'capitalize', 'italic',
    'underline', 'line-through', 'no-underline',
    'overflow-hidden', 'overflow-visible', 'overflow-auto', 'overflow-scroll',
    'sr-only', 'not-sr-only',
    'rounded', 'border', 'shadow', 'ring',
    'antialiased', 'subpixel-antialiased',
    'visible', 'invisible', 'collapse',
    'isolate', 'group', 'peer',
    'container'
  ]);

  const HASH_CLASS_PATTERNS = [
    /^css-[a-z0-9]+$/i,
    /^sc-[a-zA-Z0-9]+$/,
    /^_[A-Za-z0-9_-]{4,}$/,
    /^[a-z][a-zA-Z0-9]*__[A-Za-z0-9_-]+--[A-Za-z0-9]+$/,
    /[a-f0-9]{6,}/i
  ];

  const CURATED_STYLE_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'border', 'border-radius', 'box-sizing',
    'box-shadow', 'opacity', 'visibility', 'overflow', 'z-index',
    'background', 'background-color', 'background-image',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-align', 'text-decoration',
    'text-transform', 'white-space',
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
    'align-content', 'align-self', 'gap', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-area',
    'grid-column', 'grid-row',
    'transform', 'transform-origin', 'transition', 'animation',
    'cursor', 'pointer-events', 'user-select'
  ];

  const state = {
    settings: null,
    enabled: false,
    active: false,
    cursor: { x: 0, y: 0 },
    target: null,
    cachedStyle: null,
    rafScheduled: false,
    listenersAttached: false,
    flashTimeoutId: 0,
    toastTimeoutId: 0,
    pendingCopyTimeoutId: 0,
    pendingCopyTarget: null
  };

  let host = null;
  let shadow = null;
  let layers = null;
  let panel = null;
  let toast = null;

  function init() {
    ensureOverlay();
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
    state.enabled = settings.modifiers.length > 0;
    if (!state.enabled) deactivate();
  }

  function ensureOverlay() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-web-element-inspector', '');
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      zIndex: '2147483647'
    });
    document.documentElement.appendChild(host);

    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .layer {
        all: initial;
        position: fixed;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        will-change: transform, width, height;
      }
      .margin   { background: ${HIGHLIGHT_COLORS.margin}; }
      .border   { background: ${HIGHLIGHT_COLORS.border}; }
      .padding  { background: ${HIGHLIGHT_COLORS.padding}; }
      .content  {
        background: ${HIGHLIGHT_COLORS.content};
        outline: 1px solid ${HIGHLIGHT_COLORS.outline};
      }
      .layer.flash {
        animation: domlens-flash ${FLASH_DURATION_MS}ms ease-out 1;
      }
      @keyframes domlens-flash {
        0% {
          background: ${FLASH_COLORS.content};
          outline-color: ${FLASH_COLORS.outline};
        }
        60% {
          background: ${FLASH_COLORS.content};
          outline-color: ${FLASH_COLORS.outline};
        }
        100% {
          background: inherit;
          outline-color: inherit;
        }
      }
      .panel {
        all: initial;
        position: fixed;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        max-width: 340px;
        min-width: 220px;
        background: #1f1f1f;
        color: #e6e6e6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.45;
        padding: 10px 12px;
        border-radius: 6px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.4);
      }
      .panel * { box-sizing: border-box; }
      .selector {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        color: #ffffff;
        word-break: break-all;
        margin-bottom: 8px;
      }
      .sel-tag    { color: #ff8da1; }
      .sel-id     { color: #ffd479; }
      .sel-class  { color: #7ad9ff; }
      .row {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-top: 4px;
      }
      .label {
        color: #9ba1a8;
        min-width: 64px;
      }
      .value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: #e6e6e6;
      }
      .swatch {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.25);
        vertical-align: -2px;
        margin-right: 4px;
      }
      .group {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.08);
      }
      .toast {
        all: initial;
        position: fixed;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #ffffff;
        background: rgba(46, 160, 67, 0.95);
        padding: 6px 12px;
        border-radius: 999px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        white-space: nowrap;
      }
      .toast.show {
        display: block;
        animation: domlens-toast ${TOAST_DURATION_MS}ms ease-out 1;
      }
      @keyframes domlens-toast {
        0%   { opacity: 0; transform: translateY(4px); }
        10%  { opacity: 1; transform: translateY(0); }
        80%  { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-4px); }
      }
    `;
    shadow.appendChild(style);

    layers = {
      margin: createLayer('margin'),
      border: createLayer('border'),
      padding: createLayer('padding'),
      content: createLayer('content')
    };
    Object.values(layers).forEach((el) => shadow.appendChild(el));

    panel = document.createElement('div');
    panel.className = 'panel';
    shadow.appendChild(panel);

    toast = document.createElement('div');
    toast.className = 'toast';
    shadow.appendChild(toast);

    document.addEventListener('fullscreenchange', () => {
      const fsEl = document.fullscreenElement;
      const newParent = fsEl || document.documentElement;
      if (host.parentNode !== newParent) {
        newParent.appendChild(host);
      }
    });
  }

  function createLayer(cls) {
    const el = document.createElement('div');
    el.className = `layer ${cls}`;
    return el;
  }

  function attachWindowLifecycle() {
    window.addEventListener('blur', deactivate);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) deactivate();
    });
  }

  function attachKeyListeners() {
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true, passive: true });
  }

  function modifiersHeld(event) {
    if (!state.settings || !state.settings.modifiers.length) return false;
    return state.settings.modifiers.every((mod) => MODIFIER_EVENT_MAP[mod]?.(event));
  }

  function onKeyDown(event) {
    if (!state.enabled) return;
    if (modifiersHeld(event)) {
      activate();
      if (state.active && event.code === 'KeyC' && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        onCopyKey();
      }
    }
  }

  function onCopyKey() {
    if (state.pendingCopyTimeoutId) {
      // Second press within window → double-tap → copy all
      clearTimeout(state.pendingCopyTimeoutId);
      state.pendingCopyTimeoutId = 0;
      const target = state.pendingCopyTarget || state.target;
      state.pendingCopyTarget = null;
      onCopyAllShortcut(target);
      return;
    }
    // First press → arm timer for single-copy path
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
    if (!state.active) return;
    if (!modifiersHeld(event)) deactivate();
  }

  function activate() {
    if (state.active) return;
    state.active = true;
    attachInspectListeners();
  }

  function deactivate() {
    if (!state.active) {
      hideOverlay();
      return;
    }
    state.active = false;
    detachInspectListeners();
    state.target = null;
    state.cachedStyle = null;
    cancelPendingCopy();
    clearFlash();
    hideToast();
    hideOverlay();
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
    if (!el || el === host || (host && host.contains(el))) {
      hideOverlay();
      return;
    }

    if (el !== state.target) {
      state.target = el;
      state.cachedStyle = getComputedStyle(el);
      clearFlash();
      renderPanel(el, state.cachedStyle);
    }

    renderHighlight(el);
    positionPanel();
  }

  function renderHighlight(el) {
    const rect = el.getBoundingClientRect();
    const cs = state.cachedStyle;

    const margin = {
      top: parseFloat(cs.marginTop) || 0,
      right: parseFloat(cs.marginRight) || 0,
      bottom: parseFloat(cs.marginBottom) || 0,
      left: parseFloat(cs.marginLeft) || 0
    };
    const padding = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    const border = {
      top: parseFloat(cs.borderTopWidth) || 0,
      right: parseFloat(cs.borderRightWidth) || 0,
      bottom: parseFloat(cs.borderBottomWidth) || 0,
      left: parseFloat(cs.borderLeftWidth) || 0
    };

    placeLayer(layers.margin, {
      top: rect.top - margin.top,
      left: rect.left - margin.left,
      width: rect.width + margin.left + margin.right,
      height: rect.height + margin.top + margin.bottom
    }, hasAny(margin));

    placeLayer(layers.border, {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }, hasAny(border));

    placeLayer(layers.padding, {
      top: rect.top + border.top,
      left: rect.left + border.left,
      width: rect.width - border.left - border.right,
      height: rect.height - border.top - border.bottom
    }, hasAny(padding));

    placeLayer(layers.content, {
      top: rect.top + border.top + padding.top,
      left: rect.left + border.left + padding.left,
      width: rect.width - border.left - border.right - padding.left - padding.right,
      height: rect.height - border.top - border.bottom - padding.top - padding.bottom
    }, true);
  }

  function hasAny(box) {
    return box.top > 0 || box.right > 0 || box.bottom > 0 || box.left > 0;
  }

  function placeLayer(el, rect, visible) {
    if (!visible || rect.width <= 0 || rect.height <= 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.top = `${rect.top}px`;
    el.style.left = `${rect.left}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  function renderPanel(el, cs) {
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

    panel.innerHTML = selectorHtml + groupsHtml;
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

  function positionPanel() {
    const { x, y } = state.cursor;
    panel.style.display = 'block';
    const offset = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    panel.style.left = `0px`;
    panel.style.top = `0px`;
    const rect = panel.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    let left = x + offset;
    let top = y + offset;
    if (left + w > vw - 4) left = Math.max(4, x - offset - w);
    if (top + h > vh - 4) top = Math.max(4, y - offset - h);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function hideOverlay() {
    if (!layers) return;
    Object.values(layers).forEach((el) => (el.style.display = 'none'));
    if (panel) panel.style.display = 'none';
  }

  function onCopyShortcut(target) {
    const el = target || state.target;
    if (!el) return;
    const line = buildElementSnippet(el);
    writeClipboard(line);
    triggerFlash();
    showToast('Copied!');
  }

  function onCopyAllShortcut(target) {
    const el = target || state.target;
    if (!el) return;
    const payload = buildFullSnapshot(el);
    writeClipboard(payload);
    triggerFlash();
    showToast('All info copied!');
  }

  function buildFullSnapshot(el) {
    const selector = buildUniqueSelector(el);
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const x = Math.round(rect.left);
    const y = Math.round(rect.top);
    const html = el.outerHTML || '';
    const styles = collectCuratedStyles(el);
    const text = extractFullVisibleText(el);

    const parts = [];
    parts.push('# DOMLens — Element snapshot');
    parts.push('');
    parts.push('## Selector');
    parts.push(selector);
    parts.push('');
    parts.push('## Box');
    parts.push(`width: ${width}px  height: ${height}px  x: ${x}  y: ${y}`);
    parts.push('');
    parts.push('## HTML');
    parts.push(html);
    parts.push('');
    parts.push('## Computed styles');
    parts.push(styles);
    if (text) {
      parts.push('');
      parts.push('## Text');
      parts.push(text);
    }
    return parts.join('\n');
  }

  function collectCuratedStyles(el) {
    const cs = getComputedStyle(el);
    const lines = [];
    for (const prop of CURATED_STYLE_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      // Filter out obvious "empty" defaults
      if (trimmed === 'none' || trimmed === 'normal' || trimmed === 'auto' ||
          trimmed === '0px' || trimmed === 'rgba(0, 0, 0, 0)') {
        continue;
      }
      lines.push(`${prop}: ${trimmed}`);
    }
    return lines.join('\n');
  }

  function extractFullVisibleText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message || 'Copied!';
    if (state.toastTimeoutId) {
      clearTimeout(state.toastTimeoutId);
      state.toastTimeoutId = 0;
    }
    toast.classList.remove('show');
    toast.style.display = 'block';
    toast.style.left = '0px';
    toast.style.top = '0px';
    const rect = toast.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const { x, y } = state.cursor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 16;
    let top = y - h - 12;
    if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
    if (top < 4) top = Math.min(vh - h - 4, y + 24);
    toast.style.left = `${left}px`;
    toast.style.top = `${top}px`;
    void toast.offsetWidth;
    toast.classList.add('show');
    state.toastTimeoutId = setTimeout(() => {
      toast.classList.remove('show');
      toast.style.display = 'none';
      state.toastTimeoutId = 0;
    }, TOAST_DURATION_MS);
  }

  function hideToast() {
    if (state.toastTimeoutId) {
      clearTimeout(state.toastTimeoutId);
      state.toastTimeoutId = 0;
    }
    if (toast) {
      toast.classList.remove('show');
      toast.style.display = 'none';
    }
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

  function triggerFlash() {
    if (!layers) return;
    clearFlash();
    const flashTargets = [layers.content, layers.padding, layers.border, layers.margin];
    flashTargets.forEach((el) => {
      if (el && el.style.display !== 'none') el.classList.add('flash');
    });
    state.flashTimeoutId = setTimeout(() => {
      flashTargets.forEach((el) => el && el.classList.remove('flash'));
      state.flashTimeoutId = 0;
    }, FLASH_DURATION_MS);
  }

  function clearFlash() {
    if (state.flashTimeoutId) {
      clearTimeout(state.flashTimeoutId);
      state.flashTimeoutId = 0;
    }
    if (!layers) return;
    Object.values(layers).forEach((el) => el.classList.remove('flash'));
  }

  function buildUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';

    if (el.id && isUnique(el, idSelector(el))) {
      return idSelector(el);
    }

    const tag = el.tagName.toLowerCase();
    if (el.classList.length) {
      const classSel = tag + '.' + Array.from(el.classList).map(CSS.escape).join('.');
      if (isUnique(el, classSel)) return classSel;
    }

    const segments = [];
    let node = el;
    let anchorFound = false;

    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id && isUnique(node, idSelector(node))) {
        segments.unshift(idSelector(node));
        anchorFound = true;
        break;
      }

      const nodeTag = node.tagName.toLowerCase();
      let segment = nodeTag;

      if (node.classList.length) {
        const candidate = nodeTag + '.' + Array.from(node.classList).map(CSS.escape).join('.');
        if (isUnique(node, candidate)) {
          segments.unshift(candidate);
          anchorFound = true;
          break;
        }
      }

      const parent = node.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(node) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }

      segments.unshift(segment);
      node = node.parentElement;
    }

    if (!anchorFound) segments.unshift('html');

    const joined = segments.join(' > ');
    if (isUnique(el, joined)) return joined;

    return buildFullPath(el);
  }

  function idSelector(el) {
    const id = el.id;
    if (/^[A-Za-z_][\w-]*$/.test(id)) {
      return `#${CSS.escape(id)}`;
    }
    return `[id="${id.replace(/"/g, '\\"')}"]`;
  }

  function isUnique(el, selector) {
    try {
      const matches = (el.ownerDocument || document).querySelectorAll(selector);
      return matches.length === 1 && matches[0] === el;
    } catch (_) {
      return false;
    }
  }

  function buildFullPath(el) {
    const segments = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      let segment = tag;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (sameTagSiblings.length > 1) {
          segment += `:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`;
        }
      }
      segments.unshift(segment);
      node = node.parentElement;
    }
    segments.unshift('html');
    return segments.join(' > ');
  }

  function extractVisibleText(el) {
    if (!el) return '';
    const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (raw.length <= COPY_TEXT_MAX_LEN) return raw;
    const slice = raw.slice(0, COPY_TEXT_MAX_LEN);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > COPY_TEXT_MAX_LEN * 0.6 ? slice.slice(0, lastSpace) : slice;
    return cut.replace(/[\s…]+$/, '') + '…';
  }

  function truncateAtWordBoundary(text, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    const slice = text.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice;
    return cut.replace(/[\s…]+$/, '') + '…';
  }

  function isSemanticClass(name) {
    if (!name) return false;
    if (name.includes('[') || name.includes(':') || name.includes('/')) return false;
    if (UTILITY_CLASS_KEYWORDS.has(name)) return false;
    for (const prefix of UTILITY_CLASS_PREFIXES) {
      if (name.startsWith(prefix)) return false;
    }
    for (const pattern of HASH_CLASS_PATTERNS) {
      if (pattern.test(name)) return false;
    }
    return true;
  }

  function filterSemanticClasses(classList) {
    const out = [];
    for (const name of classList) {
      if (isSemanticClass(name)) out.push(name);
    }
    return out;
  }

  function getElementOwnText(el) {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) out += node.nodeValue;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function getSnippetText(el) {
    const own = getElementOwnText(el);
    if (own) return truncateAtWordBoundary(own, SNIPPET_TEXT_MAX_LEN);
    const full = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return truncateAtWordBoundary(full, SNIPPET_TEXT_MAX_LEN);
  }

  function collectSnippetAttrs(el) {
    const pairs = [];
    for (const name of SNIPPET_PRIORITY_ATTRS) {
      if (!el.hasAttribute(name)) continue;
      let value = el.getAttribute(name) || '';
      if (name === 'href' && value.length > SNIPPET_HREF_MAX_LEN) {
        value = value.slice(0, SNIPPET_HREF_MAX_LEN - 1) + '…';
      }
      pairs.push([name, value]);
    }
    const classes = el.classList && el.classList.length
      ? filterSemanticClasses(Array.from(el.classList))
      : [];
    if (classes.length) pairs.push(['class', classes.join(' ')]);
    return pairs;
  }

  function shortAncestorSelector(node) {
    if (!node || node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (node.id) return `${tag}#${node.id}`;
    const testid = node.getAttribute && node.getAttribute('data-testid');
    if (testid) return `${tag}[data-testid="${testid}"]`;
    if (node.classList && node.classList.length) {
      const semantic = filterSemanticClasses(Array.from(node.classList));
      if (semantic.length) return `${tag}.${semantic[0]}`;
    }
    return tag;
  }

  function buildParentBreadcrumb(el) {
    const segments = [];
    let node = el.parentElement;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < SNIPPET_PARENT_MAX_DEPTH) {
      if (node === document.documentElement || node === document.body) break;
      const seg = shortAncestorSelector(node);
      segments.unshift(seg);
      const hasAnchor = node.id
        || (node.getAttribute && node.getAttribute('data-testid'))
        || (node.classList && filterSemanticClasses(Array.from(node.classList)).length > 0);
      if (hasAnchor) break;
      node = node.parentElement;
      depth++;
    }
    if (!segments.length) return '';
    return segments.join(' > ');
  }

  function buildElementSnippet(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el === document.documentElement) return '<html>';
    if (el === document.body) return '<body>';

    const tag = el.tagName.toLowerCase();
    const attrs = collectSnippetAttrs(el);
    const attrStr = attrs.map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
    const isVoid = VOID_ELEMENT_TAGS.has(tag);
    const text = isVoid ? '' : getSnippetText(el);

    let snippet;
    if (isVoid) {
      snippet = `<${tag}${attrStr} />`;
    } else {
      snippet = `<${tag}${attrStr}>${escapeHtml(text)}</${tag}>`;
    }

    const hasIdentifier = attrs.some(([k]) => k === 'id'
      || k === 'aria-label'
      || k.startsWith('data-'));
    const textIsMeaningful = text && text.length > 2;
    if (!hasIdentifier && !textIsMeaningful) {
      const breadcrumb = buildParentBreadcrumb(el);
      if (breadcrumb) snippet += `  ← in ${breadcrumb}`;
    }
    return snippet;
  }

  function isTransparent(value) {
    if (!value) return true;
    if (value === 'transparent') return true;
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 4 && parts[3] === 0) return true;
    return false;
  }

  function cleanFontFamily(value) {
    if (!value) return '';
    const first = value.split(',')[0].trim();
    return first.replace(/^["']|["']$/g, '');
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

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
