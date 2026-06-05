(() => {
  const HIGHLIGHT_COLORS = {
    margin: 'rgba(246, 178, 107, 0.55)',
    border: 'rgba(255, 229, 153, 0.66)',
    padding: 'rgba(147, 196, 125, 0.55)',
    content: 'rgba(111, 168, 220, 0.66)',
    outline: 'rgba(33, 90, 175, 0.9)'
  };

  const TOAST_DURATION_MS = 1200;

  /* The Capture Ring owns its own animation timing, band sizing, and gradient
     (see capture-ring.js / ADR 0004). Overlay re-exports the timings for
     backward compat and borrows the gradient for the Capture Toast's border. */
  const Ring = globalThis.CaptureRing;
  const CAPTURE_POP_MS = Ring.POP_MS;
  const CAPTURE_FADE_MS = Ring.FADE_MS;
  const CAPTURE_SCAN_MS = Ring.SCAN_MS;
  const CAPTURE_CHARGE_MS = Ring.CHARGE_MS;

  const GEMINI_GRADIENT_STOPS = Ring.GRADIENT_STOPS;

  let host = null;
  let shadow = null;
  let layers = null;
  let panel = null;
  let toast = null;
  let toastTimeoutId = 0;

  /* The Capture Ring lives in its own module; Overlay holds its instance and
     delegates, flipping host visibility before each show. */
  let ringApi = null;

  /* Locked-target mode keeps Highlight Layers glued to a single element.
     Only re-renders on scroll/resize, not every RAF tick. */
  let lockedTarget = null;
  let lockedCs = null;
  let lockedRafId = 0;
  let lockedDirty = false;

  function createLayer(cls) {
    const el = document.createElement('div');
    el.className = `layer ${cls}`;
    return el;
  }

  function init() {
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
        visibility: inherit;
        position: fixed;
        top: 0;
        left: 0;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        contain: layout style paint;
        will-change: transform;
      }
      .margin   { background: ${HIGHLIGHT_COLORS.margin}; }
      .border   { background: ${HIGHLIGHT_COLORS.border}; }
      .padding  { background: ${HIGHLIGHT_COLORS.padding}; }
      .content  {
        background: ${HIGHLIGHT_COLORS.content};
        outline: 1px solid ${HIGHLIGHT_COLORS.outline};
      }
      .panel {
        all: initial;
        visibility: inherit;
        position: fixed;
        top: 0;
        left: 0;
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
        overflow: hidden;
        contain: layout style paint;
        will-change: transform;
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
      .content-row {
        margin-top: 6px;
      }
      .content-label {
        display: block;
        color: #9ba1a8;
        font-size: 11px;
        margin-bottom: 2px;
      }
      .content-value {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        color: #f0f0f0;
        font-size: 12px;
        line-height: 1.4;
        word-break: break-word;
      }

      .toast {
        all: initial;
        visibility: inherit;
        position: fixed;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #ffffff;
        background:
          linear-gradient(rgba(20, 20, 28, 0.95), rgba(20, 20, 28, 0.95)) padding-box,
          conic-gradient(from 0deg, ${GEMINI_GRADIENT_STOPS}) border-box;
        border: 1px solid transparent;
        padding: 6px 12px;
        border-radius: 999px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
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

    /* The ring mounts itself into the shared Shadow root (its own <style> and
       element), between the Highlight Layers and the Panel for correct paint
       order. */
    ringApi = globalThis.CaptureRing.createRing(shadow);

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

    window.addEventListener('scroll', markLockedDirty, { capture: true, passive: true });
    window.addEventListener('resize', markLockedDirty, { passive: true });
  }

  function isOwnNode(el) {
    return el === host || (host && host.contains(el));
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
    el.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  function renderHighlight(el, cs) {
    const rect = el.getBoundingClientRect();
    renderHighlightFromRect(rect, cs);
  }

  function renderHighlightFromRect(rect, cs) {

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

  function findBestPanelPosition(cursor, w, h, elementRect) {
    const offset = 16;
    const { x, y } = cursor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Candidate positions relative to the cursor (x, y)
    const candidates = [
      // 1. Right-Below (default)
      { left: x + offset, top: y + offset },
      // 2. Left-Below
      { left: x - offset - w, top: y + offset },
      // 3. Right-Above
      { left: x + offset, top: y - offset - h },
      // 4. Left-Above
      { left: x - offset - w, top: y - offset - h }
    ];

    let bestPos = null;
    let fallbackPos = null;

    for (let i = 0; i < candidates.length; i++) {
      const pos = candidates[i];
      let left = pos.left;
      let top = pos.top;

      // Fit inside viewport bounds (with 4px boundary padding)
      if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
      if (left < 4) left = 4;
      if (top + h > vh - 4) top = Math.max(4, vh - h - 4);
      if (top < 4) top = 4;

      // Check if this position overlaps with the target element's rect
      if (elementRect) {
        const hasOverlap = !(left + w < elementRect.left ||
                             left > elementRect.right ||
                             top + h < elementRect.top ||
                             top > elementRect.bottom);
        if (!hasOverlap) {
          bestPos = { left, top };
          break;
        }
      }

      if (!fallbackPos) {
        fallbackPos = { left, top };
      }
    }

    return bestPos || fallbackPos || { left: x + offset, top: y + offset };
  }

  function positionPanel(cursor, el) {
    const rect = panel.getBoundingClientRect();
    const elementRect = el && typeof el.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : null;
    const { left, top } = findBestPanelPosition(cursor, rect.width, rect.height, elementRect);
    panel.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function showPanel(panelHtml, cursor, el) {
    panel.innerHTML = panelHtml;
    panel.style.display = 'block';
    panel.style.transform = 'translate3d(0px, 0px, 0)';
    positionPanel(cursor, el);
  }

  function setPanelContent(panelHtml) {
    if (!panel) return;
    panel.innerHTML = panelHtml;
    if (panel.style.display === 'none') panel.style.display = 'block';
  }

  function showFor(el, cursor, panelHtml, cs) {
    renderHighlight(el, cs);
    showPanel(panelHtml, cursor, el);
    show();
  }

  function updateHighlight(el, cs) {
    renderHighlight(el, cs);
    show();
  }

  function repositionPanel(cursor, el) {
    if (!panel || panel.style.display === 'none') return;
    positionPanel(cursor, el);
  }

  /* Hide/show via the shadow-host's visibility so the layout tree stays put.
     This lets the capture path collapse its two-RAF defensive wait to a
     single paint frame: visibility flips do not invalidate layout. */
  function hide() {
    if (!host) return;
    host.style.visibility = 'hidden';
  }

  function show() {
    if (!host) return;
    host.style.visibility = 'visible';
  }

  function enterLockedTargetMode(el) {
    if (!el) return;
    lockedTarget = el;
    try {
      lockedCs = getComputedStyle(el);
    } catch (_) {
      lockedCs = null;
    }
    show();
    lockedDirty = true;
    if (lockedRafId) cancelAnimationFrame(lockedRafId);
    scheduleLockedFrame();
  }

  function exitLockedTargetMode() {
    lockedTarget = null;
    lockedCs = null;
    lockedDirty = false;
    if (lockedRafId) {
      cancelAnimationFrame(lockedRafId);
      lockedRafId = 0;
    }
  }

  function markLockedDirty() {
    lockedDirty = true;
    if (lockedTarget && !lockedRafId) scheduleLockedFrame();
  }

  function scheduleLockedFrame() {
    lockedRafId = requestAnimationFrame(() => {
      lockedRafId = 0;
      if (!lockedTarget || !lockedCs) return;
      if (!lockedDirty) return;
      lockedDirty = false;
      try {
        renderHighlight(lockedTarget, lockedCs);
      } catch (_) {
        exitLockedTargetMode();
      }
    });
  }

  function hidePanel() {
    if (panel) panel.style.display = 'none';
  }

  function hideHighlightLayers() {
    if (!layers) return;
    layers.margin.style.display = 'none';
    layers.border.style.display = 'none';
    layers.padding.style.display = 'none';
    layers.content.style.display = 'none';
  }

  function showToast(message, elementRect) {
    if (!toast) return;
    toast.textContent = message || 'Copied!';
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
      toastTimeoutId = 0;
    }
    toast.classList.remove('show');
    toast.style.display = 'block';
    toast.style.left = '0px';
    toast.style.top = '0px';
    const toastRect = toast.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const avgSize = (elementRect.width + elementRect.height) / 2;
    const gap = Math.max(8, Math.min(avgSize * 0.05, 22));
    let left = elementRect.left + elementRect.width / 2 - toastRect.width / 2;
    left = Math.max(4, Math.min(left, vw - toastRect.width - 4));

    const candidates = [
      elementRect.bottom + gap,
      elementRect.top - toastRect.height - gap,
      elementRect.bottom - toastRect.height - gap,
      elementRect.top + gap,
    ];
    let top = null;
    for (const t of candidates) {
      if (t >= 4 && t + toastRect.height <= vh - 4) {
        top = t;
        break;
      }
    }
    if (top === null) {
      top = Math.max(4, Math.min(elementRect.bottom + gap, vh - toastRect.height - 4));
    }
    toast.style.left = `${left}px`;
    toast.style.top = `${top}px`;
    void toast.offsetWidth;
    toast.classList.add('show');
    toastTimeoutId = setTimeout(() => {
      toast.classList.remove('show');
      toast.style.display = 'none';
      toastTimeoutId = 0;
    }, TOAST_DURATION_MS);
  }

  function hideToast() {
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
      toastTimeoutId = 0;
    }
    if (toast) {
      toast.classList.remove('show');
      toast.style.display = 'none';
    }
  }

  globalThis.Overlay = {
    init,
    isOwnNode,
    showFor,
    updateHighlight,
    setPanelContent,
    repositionPanel,
    hide,
    show,
    hidePanel,
    hideHighlightLayers,
    showToast,
    hideToast,
    enterLockedTargetMode,
    exitLockedTargetMode,
    /* Delegate to the Capture Ring module. Host visibility (the shared
       visibility:hidden trick) stays Overlay's concern, so the show paths flip
       it on before handing off. */
    captureRing: {
      show: (el) => { show(); if (ringApi) ringApi.show(el); },
      pop: () => { if (ringApi) ringApi.pop(); },
      startCharging: (el) => { show(); if (ringApi) ringApi.startCharging(el); },
      startScan: (el) => { show(); if (ringApi) ringApi.startScan(el); },
      fadeFromCharging: () => { if (ringApi) ringApi.fadeFromCharging(); },
      hide: () => { if (ringApi) ringApi.hide(); },
      /* Durations the Capture Session reads to time the shared feedback window. */
      POP_MS: CAPTURE_POP_MS,
      SCAN_MS: CAPTURE_SCAN_MS,
      FADE_MS: CAPTURE_FADE_MS
    },
    TOAST_DURATION_MS,
    CAPTURE_POP_MS,
    CAPTURE_FADE_MS,
    CAPTURE_SCAN_MS,
    CAPTURE_CHARGE_MS
  };
})();
