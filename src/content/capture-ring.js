/*
 * Capture Ring.
 *
 * The dedicated Shadow-DOM overlay drawn at the captured element's outer
 * border — the canonical visible body of all capture feedback (see ADR 0001).
 * This module owns the ring entirely: its element, its CSS, its animation
 * timing, its band sizing, and its own scroll/resize repositioning. Pure
 * placement math lives in ring-geometry.js (RingGeometry); the DOM-touching
 * parts (bounding rect, border-radius, inline styles) live here.
 *
 * The ring is a tenant of a Shadow root it does not own — createRing(shadow)
 * is handed the root by the Overlay and appends its own <style> and element.
 * Host visibility (the visibility:hidden trick the Overlay uses to hide/show
 * everything at once) stays the Overlay's concern; the Overlay's captureRing
 * wrapper flips host visibility before delegating here.
 *
 * Observable states (per CONTEXT.md → Capture Ring):
 *   active   — static gradient while the Action Key is held in the Snippet zone
 *   charging — rotating gradient build-up during the Dead Zone
 *   scanning — the rotating Capture Scan once a Snapshot commits
 *   popping  — Snippet confirmation pop, held for the shared feedback window
 *   fading   — clean fade-out for a Dead Zone cancel
 */
(() => {
  const GEMINI_GRADIENT_STOPS = '#1E40AF, #3B82F6, #7C3AED, #DB2777, #F59E0B, #1E40AF';

  const POP_MS = 1200;
  const FADE_MS = 280;
  const SCAN_MS = 1200;
  const CHARGE_MS = 1000;

  const BAND_MIN_PX = 2;
  const BAND_MAX_PX = 4;
  const BAND_FACTOR = 0.02;
  const INNER_EDGE_PX = 1;
  const BAND_OPTS = { min: BAND_MIN_PX, max: BAND_MAX_PX, factor: BAND_FACTOR };

  const SCAN_GLOW = '0 0 0 1px rgba(124, 58, 237, 0.4), 0 0 16px 3px rgba(219, 39, 119, 0.5), 0 0 36px 8px rgba(59, 130, 246, 0.4)';

  function registerScanAngle() {
    try {
      CSS.registerProperty({
        name: '--domlens-scan-angle',
        syntax: '<angle>',
        initialValue: '0deg',
        inherits: false
      });
    } catch (_) {}
  }

  function styleText() {
    return `
      @property --domlens-scan-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }
      .capture-ring {
        all: initial;
        visibility: inherit;
        position: fixed;
        pointer-events: none;
        display: none;
        box-sizing: border-box;
        padding: var(--domlens-band, ${BAND_MAX_PX}px);
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
        inset: var(--domlens-band, ${BAND_MAX_PX}px);
        border-radius: var(--domlens-inner-radius, 0);
        box-shadow: 0 0 0 ${INNER_EDGE_PX}px rgba(20, 20, 28, 0.95);
        pointer-events: none;
      }
      .capture-ring.visible { display: block; }
      .capture-ring.active {
        opacity: 1;
        background: conic-gradient(from 0deg, ${GEMINI_GRADIENT_STOPS});
      }
      .capture-ring.popping {
        background: conic-gradient(from 0deg, ${GEMINI_GRADIENT_STOPS});
        animation: domlens-capture-pop ${POP_MS}ms ease-out 1 forwards;
      }
      .capture-ring.charging {
        opacity: 1;
        background: conic-gradient(from var(--domlens-scan-angle), ${GEMINI_GRADIENT_STOPS});
        animation: domlens-capture-charge ${CHARGE_MS}ms linear 1 forwards;
      }
      .capture-ring.scanning {
        opacity: 1;
        background: conic-gradient(from var(--domlens-scan-angle), ${GEMINI_GRADIENT_STOPS});
        box-shadow: ${SCAN_GLOW};
        animation: domlens-capture-scan ${SCAN_MS}ms linear 1 forwards;
      }
      .capture-ring.fading {
        background: conic-gradient(from var(--domlens-scan-angle), ${GEMINI_GRADIENT_STOPS});
        animation: domlens-capture-fade ${FADE_MS}ms ease-out 1 forwards;
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
    `;
  }

  /*
   * Build the ring inside the supplied Shadow root and return its imperative
   * interface. The ring tracks its own target and repositions on scroll/resize.
   */
  function createRing(shadow) {
    registerScanAngle();

    const styleEl = document.createElement('style');
    styleEl.textContent = styleText();
    shadow.appendChild(styleEl);

    const ringEl = document.createElement('div');
    ringEl.className = 'capture-ring';
    shadow.appendChild(ringEl);

    let target = null;
    let rafId = 0;
    let dirty = false;
    let hideTimeoutId = 0;

    function readRadii(el, refWidth) {
      const RG = globalThis.RingGeometry;
      if (!el) return { tl: 0, tr: 0, br: 0, bl: 0 };
      try {
        const cs = getComputedStyle(el);
        return {
          tl: RG.parseRadiusValue(cs.borderTopLeftRadius, refWidth),
          tr: RG.parseRadiusValue(cs.borderTopRightRadius, refWidth),
          br: RG.parseRadiusValue(cs.borderBottomRightRadius, refWidth),
          bl: RG.parseRadiusValue(cs.borderBottomLeftRadius, refWidth)
        };
      } catch (_) {
        return { tl: 0, tr: 0, br: 0, bl: 0 };
      }
    }

    function place(el) {
      const RG = globalThis.RingGeometry;
      const rect = el.getBoundingClientRect();
      const band = RG.computeBandWidth(rect, BAND_OPTS);
      const radii = readRadii(el, rect.width);
      const placement = RG.computeRingPlacement({
        rect,
        radii,
        band,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      });
      if (!placement) {
        ringEl.style.display = 'none';
        return;
      }
      const { box, outerRadius, innerRadius } = placement;
      ringEl.style.setProperty('--domlens-band', `${band}px`);
      ringEl.style.top = `${box.top}px`;
      ringEl.style.left = `${box.left}px`;
      ringEl.style.width = `${box.width}px`;
      ringEl.style.height = `${box.height}px`;
      ringEl.style.borderRadius = outerRadius.map((n) => `${n}px`).join(' ');
      ringEl.style.setProperty('--domlens-inner-radius', innerRadius.map((n) => `${n}px`).join(' '));
    }

    function scheduleFrame() {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!target) return;
        if (!dirty) return;
        dirty = false;
        try {
          place(target);
        } catch (_) {
          hide();
        }
      });
    }

    function markDirty() {
      dirty = true;
      if (target && !rafId) scheduleFrame();
    }

    function show(el) {
      if (!el) return;
      target = el;
      if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = 0;
      }
      ringEl.classList.remove('popping', 'charging', 'scanning', 'fading');
      ringEl.classList.add('visible', 'active');
      try {
        place(el);
      } catch (_) {
        hide();
        return;
      }
      dirty = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    function hide() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = 0;
      }
      target = null;
      ringEl.classList.remove('visible', 'active', 'popping', 'charging', 'scanning');
      ringEl.style.display = '';
    }

    function pop() {
      if (!ringEl.classList.contains('visible')) return;
      /* Drop the steady-state classes so the pop keyframes own the ring; force
         a reflow so the animation restarts cleanly. */
      ringEl.classList.remove('active', 'charging', 'scanning', 'fading');
      void ringEl.offsetWidth;
      ringEl.classList.add('popping');
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
      hideTimeoutId = setTimeout(() => {
        hideTimeoutId = 0;
        hide();
      }, POP_MS + 20);
    }

    function startCharging(el) {
      if (!ringEl.classList.contains('visible')) show(el);
      ringEl.classList.remove('active', 'popping', 'scanning', 'fading');
      void ringEl.offsetWidth;
      ringEl.classList.add('charging');
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
    }

    function startScan(el) {
      if (!ringEl.classList.contains('visible')) show(el);
      ringEl.classList.remove('active', 'charging', 'popping', 'fading');
      void ringEl.offsetWidth;
      ringEl.classList.add('scanning');
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
      hideTimeoutId = setTimeout(() => {
        hideTimeoutId = 0;
        hide();
      }, SCAN_MS + 20);
    }

    function fadeFromCharging() {
      if (!ringEl.classList.contains('visible')) return;
      ringEl.classList.remove('active', 'charging', 'scanning', 'popping');
      void ringEl.offsetWidth;
      ringEl.classList.add('fading');
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
      hideTimeoutId = setTimeout(() => {
        hideTimeoutId = 0;
        hide();
      }, FADE_MS + 20);
    }

    window.addEventListener('scroll', markDirty, { capture: true, passive: true });
    window.addEventListener('resize', markDirty, { passive: true });

    return {
      show,
      pop,
      startCharging,
      startScan,
      fadeFromCharging,
      hide,
      /* The session asks the ring how long until "settled" — timing lives in
         exactly one place. See ADR 0004. */
      POP_MS,
      SCAN_MS,
      FADE_MS,
      CHARGE_MS
    };
  }

  globalThis.CaptureRing = {
    createRing,
    POP_MS,
    SCAN_MS,
    FADE_MS,
    CHARGE_MS,
    GRADIENT_STOPS: GEMINI_GRADIENT_STOPS
  };
})();
