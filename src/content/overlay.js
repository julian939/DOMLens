(() => {
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

  let host = null;
  let shadow = null;
  let layers = null;
  let panel = null;
  let toast = null;
  let progressBar = null;
  let flashTimeoutId = 0;
  let toastTimeoutId = 0;

  /* Locked-target mode keeps Highlight Layers glued to a single element via
     RAF, decoupled from cursor-driven elementFromPoint tracking. */
  let lockedTarget = null;
  let lockedCs = null;
  let lockedRafId = 0;

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
        /* all: initial resets visibility to its initial value (visible),
           overriding host visibility inheritance. Re-opt-in to inherit so
           Overlay.hide() actually hides painted layers. */
        visibility: inherit;
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
        visibility: inherit;
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
        overflow: hidden;
      }
      .hold-progress {
        position: absolute;
        top: 0;
        left: 0;
        height: 3px;
        width: 0;
        background: ${HIGHLIGHT_COLORS.outline};
        pointer-events: none;
        display: none;
        will-change: width;
      }
      .hold-progress.active { display: block; }
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
        visibility: inherit;
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
    progressBar = document.createElement('div');
    progressBar.className = 'hold-progress';
    panel.appendChild(progressBar);
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
    el.style.top = `${rect.top}px`;
    el.style.left = `${rect.left}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  function renderHighlight(el, cs) {
    const rect = el.getBoundingClientRect();

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

  function showPanel(panelHtml, cursor) {
    panel.innerHTML = panelHtml;
    panel.style.display = 'block';
    panel.style.left = '0px';
    panel.style.top = '0px';
    const rect = panel.getBoundingClientRect();
    const { left, top } = clampToViewport(cursor, rect.width, rect.height, false);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function showFor(el, cursor, panelHtml, cs) {
    renderHighlight(el, cs);
    showPanel(panelHtml, cursor);
    show();
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
    if (lockedRafId) cancelAnimationFrame(lockedRafId);
    scheduleLockedFrame();
  }

  function exitLockedTargetMode() {
    lockedTarget = null;
    lockedCs = null;
    if (lockedRafId) {
      cancelAnimationFrame(lockedRafId);
      lockedRafId = 0;
    }
  }

  function scheduleLockedFrame() {
    lockedRafId = requestAnimationFrame(() => {
      lockedRafId = 0;
      if (!lockedTarget || !lockedCs) return;
      try {
        renderHighlight(lockedTarget, lockedCs);
      } catch (_) {
        /* If the locked element has been detached, exit cleanly. */
        exitLockedTargetMode();
        return;
      }
      scheduleLockedFrame();
    });
  }

  function setHoldProgress(fraction) {
    if (!progressBar) return;
    if (fraction == null || fraction <= 0) {
      progressBar.classList.remove('active');
      progressBar.style.width = '0';
      return;
    }
    const clamped = fraction >= 1 ? 1 : fraction;
    progressBar.classList.add('active');
    progressBar.style.width = `${(clamped * 100).toFixed(2)}%`;
  }

  function flash() {
    if (!layers) return;
    clearFlash();
    const flashTargets = [layers.content, layers.padding, layers.border, layers.margin];
    flashTargets.forEach((el) => {
      if (el && el.style.display !== 'none') el.classList.add('flash');
    });
    flashTimeoutId = setTimeout(() => {
      flashTargets.forEach((el) => el && el.classList.remove('flash'));
      flashTimeoutId = 0;
    }, FLASH_DURATION_MS);
  }

  function clearFlash() {
    if (flashTimeoutId) {
      clearTimeout(flashTimeoutId);
      flashTimeoutId = 0;
    }
    if (!layers) return;
    Object.values(layers).forEach((el) => el.classList.remove('flash'));
  }

  function showToast(message, cursor) {
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
    const rect = toast.getBoundingClientRect();
    const { left, top } = clampToViewport(cursor, rect.width, rect.height, true);
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
    hide,
    show,
    flash,
    clearFlash,
    showToast,
    hideToast,
    enterLockedTargetMode,
    exitLockedTargetMode,
    setHoldProgress
  };
})();
