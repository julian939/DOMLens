(() => {
  const HIGHLIGHT_COLORS = {
    margin: 'rgba(246, 178, 107, 0.55)',
    border: 'rgba(255, 229, 153, 0.66)',
    padding: 'rgba(147, 196, 125, 0.55)',
    content: 'rgba(111, 168, 220, 0.66)',
    outline: 'rgba(33, 90, 175, 0.9)'
  };

  const TOAST_DURATION_MS = 1200;
  const CAPTURE_POP_MS = 1200;
  const CAPTURE_FADE_MS = 280;
  const CAPTURE_SCAN_MS = 1200;
  const CAPTURE_CHARGE_MS = 1000;
  const CAPTURE_BAND_MIN_PX = 2;
  const CAPTURE_BAND_MAX_PX = 4;
  const CAPTURE_BAND_FACTOR = 0.02;
  const CAPTURE_INNER_EDGE_PX = 1;
  const CAPTURE_SCAN_GLOW = '0 0 0 1px rgba(124, 58, 237, 0.4), 0 0 16px 3px rgba(219, 39, 119, 0.5), 0 0 36px 8px rgba(59, 130, 246, 0.4)';

  const GEMINI_GRADIENT_STOPS = '#1E40AF, #3B82F6, #7C3AED, #DB2777, #F59E0B, #1E40AF';

  let host = null;
  let shadow = null;
  let layers = null;
  let panel = null;
  let toast = null;
  let captureRingEl = null;
  let captureHideTimeoutId = 0;
  let toastTimeoutId = 0;

  /* Locked-target mode keeps Highlight Layers glued to a single element.
     Only re-renders on scroll/resize, not every RAF tick. */
  let lockedTarget = null;
  let lockedCs = null;
  let lockedRafId = 0;
  let lockedDirty = false;

  /* Capture Layer placement follows its own target. */
  let captureTarget = null;
  let captureRafId = 0;
  let captureDirty = false;

  function createLayer(cls) {
    const el = document.createElement('div');
    el.className = `layer ${cls}`;
    return el;
  }

  function init() {
    if (host) return;
    try {
      CSS.registerProperty({
        name: '--domlens-scan-angle',
        syntax: '<angle>',
        initialValue: '0deg',
        inherits: false
      });
    } catch (_) {}
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
      @property --domlens-scan-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }
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

      .capture-ring {
        all: initial;
        visibility: inherit;
        position: fixed;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        padding: var(--domlens-band, ${CAPTURE_BAND_MAX_PX}px);
        opacity: 0;
        -webkit-mask:
          linear-gradient(#000, #000) content-box,
          linear-gradient(#000, #000);
        -webkit-mask-composite: xor;
                mask:
          linear-gradient(#000, #000) content-box,
          linear-gradient(#000, #000);
        mask-composite: exclude;
      }
      .capture-ring::before {
        content: '';
        position: absolute;
        box-sizing: border-box;
        inset: var(--domlens-band, ${CAPTURE_BAND_MAX_PX}px);
        border-radius: var(--domlens-inner-radius, 0);
        box-shadow: 0 0 0 ${CAPTURE_INNER_EDGE_PX}px rgba(20, 20, 28, 0.95);
        pointer-events: none;
      }
      .capture-ring.visible { display: block; }
      .capture-ring.active {
        opacity: 1;
        background: conic-gradient(from 0deg, ${GEMINI_GRADIENT_STOPS});
      }
      .capture-ring.popping {
        background: conic-gradient(from 0deg, ${GEMINI_GRADIENT_STOPS});
        animation: domlens-capture-pop ${CAPTURE_POP_MS}ms ease-out 1 forwards;
      }
      .capture-ring.charging {
        opacity: 1;
        background: conic-gradient(from var(--domlens-scan-angle), ${GEMINI_GRADIENT_STOPS});
        animation: domlens-capture-charge ${CAPTURE_CHARGE_MS}ms linear 1 forwards;
      }
      .capture-ring.scanning {
        opacity: 1;
        background: conic-gradient(from var(--domlens-scan-angle), ${GEMINI_GRADIENT_STOPS});
        box-shadow: ${CAPTURE_SCAN_GLOW};
        animation: domlens-capture-scan ${CAPTURE_SCAN_MS}ms linear 1 forwards;
      }
      .capture-ring.fading {
        background: conic-gradient(from var(--domlens-scan-angle), ${GEMINI_GRADIENT_STOPS});
        animation: domlens-capture-fade ${CAPTURE_FADE_MS}ms ease-out 1 forwards;
      }
      @keyframes domlens-capture-fade {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes domlens-capture-pop {
        0%   { opacity: 1; }
        85%  { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes domlens-capture-charge {
        0%   { --domlens-scan-angle:   0deg; opacity: 1; }
        100% { --domlens-scan-angle: 360deg; opacity: 1; }
      }
      @keyframes domlens-capture-scan {
        0%   { --domlens-scan-angle: 360deg; opacity: 1; }
        85%  { --domlens-scan-angle: 720deg; opacity: 1; }
        100% { --domlens-scan-angle: 720deg; opacity: 0; }
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

    captureRingEl = document.createElement('div');
    captureRingEl.className = 'capture-ring';
    shadow.appendChild(captureRingEl);

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

  function clampToViewport(cursor, w, h, preferAbove) {
    const offset = 16;
    const { x, y } = cursor;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (preferAbove) {
      let left = x + offset;
      let top = y - h - 12;
      if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
      if (top < 4) top = Math.min(vh - h - 4, y + 24);
      return { left, top };
    }

    let left = x + offset;
    let top = y + offset;
    if (left + w > vw - 4) left = Math.max(4, x - offset - w);
    if (top + h > vh - 4) top = Math.max(4, y - offset - h);
    return { left, top };
  }

  function positionPanel(cursor) {
    const rect = panel.getBoundingClientRect();
    const { left, top } = clampToViewport(cursor, rect.width, rect.height, false);
    panel.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function showPanel(panelHtml, cursor) {
    panel.innerHTML = panelHtml;
    panel.style.display = 'block';
    panel.style.transform = 'translate3d(0px, 0px, 0)';
    positionPanel(cursor);
  }

  function setPanelContent(panelHtml) {
    if (!panel) return;
    panel.innerHTML = panelHtml;
    if (panel.style.display === 'none') panel.style.display = 'block';
  }

  function showFor(el, cursor, panelHtml, cs) {
    renderHighlight(el, cs);
    showPanel(panelHtml, cursor);
    show();
  }

  function updateHighlight(el, cs) {
    renderHighlight(el, cs);
    show();
  }

  function repositionPanel(cursor) {
    if (!panel || panel.style.display === 'none') return;
    positionPanel(cursor);
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
    captureDirty = true;
    if (lockedTarget && !lockedRafId) scheduleLockedFrame();
    if (captureTarget && !captureRafId) scheduleCaptureFrame();
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

  /* --- Capture Ring -------------------------------------------------- */

  function parseRadiusValue(val, refSize) {
    const raw = (val || '').trim().split(/\s+/)[0];
    if (raw.endsWith('%')) return (parseFloat(raw) / 100) * refSize;
    return parseFloat(raw) || 0;
  }

  function computeBandWidth(rect) {
    const size = (rect.width + rect.height) / 2;
    return Math.max(
      CAPTURE_BAND_MIN_PX,
      Math.min(size * CAPTURE_BAND_FACTOR, CAPTURE_BAND_MAX_PX)
    );
  }

  function placeCaptureRingToRect(rect, el) {
    if (rect.width <= 0 || rect.height <= 0) {
      captureRingEl.style.display = 'none';
      return;
    }
    const pad = computeBandWidth(rect);
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let tl = 0, tr = 0, br = 0, bl = 0;
    if (el) {
      try {
        const cs = getComputedStyle(el);
        tl = parseRadiusValue(cs.borderTopLeftRadius, rect.width);
        tr = parseRadiusValue(cs.borderTopRightRadius, rect.width);
        br = parseRadiusValue(cs.borderBottomRightRadius, rect.width);
        bl = parseRadiusValue(cs.borderBottomLeftRadius, rect.width);
      } catch (_) {}
    }

    const outsideClipped =
      rect.top - pad < 0 ||
      rect.left - pad < 0 ||
      rect.right + pad > vw ||
      rect.bottom + pad > vh;

    captureRingEl.style.setProperty('--domlens-band', `${pad}px`);

    if (outsideClipped) {
      captureRingEl.style.top = `${rect.top}px`;
      captureRingEl.style.left = `${rect.left}px`;
      captureRingEl.style.width = `${rect.width}px`;
      captureRingEl.style.height = `${rect.height}px`;
      captureRingEl.style.borderRadius =
        `${Math.max(0, tl - pad)}px ${Math.max(0, tr - pad)}px ${Math.max(0, br - pad)}px ${Math.max(0, bl - pad)}px`;
      captureRingEl.style.setProperty(
        '--domlens-inner-radius',
        `${Math.max(0, tl - 2 * pad)}px ${Math.max(0, tr - 2 * pad)}px ${Math.max(0, br - 2 * pad)}px ${Math.max(0, bl - 2 * pad)}px`
      );
    } else {
      captureRingEl.style.top = `${rect.top - pad}px`;
      captureRingEl.style.left = `${rect.left - pad}px`;
      captureRingEl.style.width = `${rect.width + pad * 2}px`;
      captureRingEl.style.height = `${rect.height + pad * 2}px`;
      captureRingEl.style.borderRadius =
        `${tl ? tl + pad : 0}px ${tr ? tr + pad : 0}px ${br ? br + pad : 0}px ${bl ? bl + pad : 0}px`;
      captureRingEl.style.setProperty(
        '--domlens-inner-radius',
        `${tl}px ${tr}px ${br}px ${bl}px`
      );
    }
  }

  function scheduleCaptureFrame() {
    captureRafId = requestAnimationFrame(() => {
      captureRafId = 0;
      if (!captureTarget) return;
      if (!captureDirty) return;
      captureDirty = false;
      try {
        placeCaptureRingToRect(captureTarget.getBoundingClientRect(), captureTarget);
      } catch (_) {
        captureRingHide();
      }
    });
  }

  function captureRingShow(el) {
    if (!captureRingEl || !el) return;
    captureTarget = el;
    if (captureHideTimeoutId) {
      clearTimeout(captureHideTimeoutId);
      captureHideTimeoutId = 0;
    }
    captureRingEl.classList.remove('popping', 'charging', 'scanning', 'fading');
    captureRingEl.classList.add('visible', 'active');
    show();
    try {
      placeCaptureRingToRect(el.getBoundingClientRect(), el);
    } catch (_) {
      captureRingHide();
      return;
    }
    captureDirty = false;
    if (captureRafId) cancelAnimationFrame(captureRafId);
  }

  function captureRingHide() {
    if (!captureRingEl) return;
    if (captureRafId) {
      cancelAnimationFrame(captureRafId);
      captureRafId = 0;
    }
    if (captureHideTimeoutId) {
      clearTimeout(captureHideTimeoutId);
      captureHideTimeoutId = 0;
    }
    captureTarget = null;
    captureRingEl.classList.remove('visible', 'active', 'popping', 'charging', 'scanning');
    captureRingEl.style.display = '';
  }

  function captureRingPop() {
    if (!captureRingEl) return;
    if (!captureRingEl.classList.contains('visible')) return;
    /* Drop the steady-state active class so the pop animation's keyframes
       fully own the visible ring; force a reflow so the animation restarts
       cleanly even if .popping was just set on a previous capture. */
    captureRingEl.classList.remove('active', 'charging', 'scanning', 'fading');
    void captureRingEl.offsetWidth;
    captureRingEl.classList.add('popping');
    if (captureHideTimeoutId) clearTimeout(captureHideTimeoutId);
    captureHideTimeoutId = setTimeout(() => {
      captureHideTimeoutId = 0;
      captureRingHide();
    }, CAPTURE_POP_MS + 20);
  }

  function captureRingStartCharging(el) {
    if (!captureRingEl) return;
    if (!captureRingEl.classList.contains('visible')) captureRingShow(el);
    captureRingEl.classList.remove('active', 'popping', 'scanning', 'fading');
    void captureRingEl.offsetWidth;
    captureRingEl.classList.add('charging');
    if (captureHideTimeoutId) clearTimeout(captureHideTimeoutId);
  }

  function captureRingStartScan(el) {
    if (!captureRingEl) return;
    if (!captureRingEl.classList.contains('visible')) captureRingShow(el);
    captureRingEl.classList.remove('active', 'charging', 'popping', 'fading');
    void captureRingEl.offsetWidth;
    captureRingEl.classList.add('scanning');
    if (captureHideTimeoutId) clearTimeout(captureHideTimeoutId);
    captureHideTimeoutId = setTimeout(() => {
      captureHideTimeoutId = 0;
      captureRingHide();
    }, CAPTURE_SCAN_MS + 20);
  }

  function captureRingFadeFromCharging() {
    if (!captureRingEl) return;
    if (!captureRingEl.classList.contains('visible')) return;
    captureRingEl.classList.remove('active', 'charging', 'scanning', 'popping');
    void captureRingEl.offsetWidth;
    captureRingEl.classList.add('fading');
    if (captureHideTimeoutId) clearTimeout(captureHideTimeoutId);
    captureHideTimeoutId = setTimeout(() => {
      captureHideTimeoutId = 0;
      captureRingHide();
    }, CAPTURE_FADE_MS + 20);
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
    captureRing: {
      show: captureRingShow,
      pop: captureRingPop,
      startCharging: captureRingStartCharging,
      startScan: captureRingStartScan,
      fadeFromCharging: captureRingFadeFromCharging,
      hide: captureRingHide
    },
    TOAST_DURATION_MS,
    CAPTURE_POP_MS,
    CAPTURE_FADE_MS,
    CAPTURE_SCAN_MS,
    CAPTURE_CHARGE_MS
  };
})();
