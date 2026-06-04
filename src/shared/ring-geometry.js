/*
 * Pure geometry for the Capture Ring. Extracted so it can be unit-tested from
 * the command line without a Shadow DOM or getComputedStyle — the same pattern
 * as crop-math.js for the screenshot crop.
 *
 * The Capture Ring module (capture-ring.js) reads the DOM (bounding rect,
 * border-radius) and owns the band/timing constants; everything numeric lives
 * here. The Worker-free, Canvas-free portion is the deterministic part worth
 * testing: band width, radius parsing, and ring placement under viewport
 * clipping.
 */
(function () {
  /*
   * Band thickness scales with the element's average side, clamped between a
   * floor and a ceiling. The caller passes its own constants so the product
   * values stay owned by the ring, not buried here.
   */
  function computeBandWidth(rect, opts) {
    const o = opts || {};
    const min = o.min == null ? 2 : o.min;
    const max = o.max == null ? 4 : o.max;
    const factor = o.factor == null ? 0.02 : o.factor;
    const size = (rect.width + rect.height) / 2;
    return Math.max(min, Math.min(size * factor, max));
  }

  /*
   * Resolve a single border-radius component to pixels. Percentages resolve
   * against the supplied reference size (matching the legacy behaviour, which
   * always passed rect.width). Only the first token is used.
   */
  function parseRadiusValue(val, refSize) {
    const raw = (val || '').trim().split(/\s+/)[0];
    if (raw.endsWith('%')) return (parseFloat(raw) / 100) * refSize;
    return parseFloat(raw) || 0;
  }

  /*
   * Compute the ring's placement around an element.
   *
   *   input = {
   *     rect:     { top, left, right, bottom, width, height },  // viewport-relative
   *     radii:    { tl, tr, br, bl },                           // resolved px
   *     band:     number,                                       // band thickness px
   *     viewport: { width, height }
   *   }
   *
   * Returns null for a zero-area rect (the ring should hide). Otherwise returns
   *
   *   {
   *     clipped:     boolean,            // true → ring would overflow the viewport
   *     box:         { top, left, width, height },
   *     outerRadius: [tl, tr, br, bl],   // px numbers for the ring element
   *     innerRadius: [tl, tr, br, bl]    // px numbers for the inner hairline
   *   }
   *
   * When the band would push the ring outside the viewport we draw it *inside*
   * the element's bounds instead of around them, shrinking the radii so the
   * corners stay concentric.
   */
  function computeRingPlacement(input) {
    const rect = input.rect;
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;

    const band = input.band;
    const radii = input.radii || { tl: 0, tr: 0, br: 0, bl: 0 };
    const tl = radii.tl || 0;
    const tr = radii.tr || 0;
    const br = radii.br || 0;
    const bl = radii.bl || 0;
    const vw = input.viewport.width;
    const vh = input.viewport.height;

    const clipped =
      rect.top - band < 0 ||
      rect.left - band < 0 ||
      rect.right + band > vw ||
      rect.bottom + band > vh;

    if (clipped) {
      return {
        clipped: true,
        box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        outerRadius: [
          Math.max(0, tl - band),
          Math.max(0, tr - band),
          Math.max(0, br - band),
          Math.max(0, bl - band)
        ],
        innerRadius: [
          Math.max(0, tl - 2 * band),
          Math.max(0, tr - 2 * band),
          Math.max(0, br - 2 * band),
          Math.max(0, bl - 2 * band)
        ]
      };
    }

    return {
      clipped: false,
      box: {
        top: rect.top - band,
        left: rect.left - band,
        width: rect.width + band * 2,
        height: rect.height + band * 2
      },
      outerRadius: [
        tl ? tl + band : 0,
        tr ? tr + band : 0,
        br ? br + band : 0,
        bl ? bl + band : 0
      ],
      innerRadius: [tl, tr, br, bl]
    };
  }

  var api = { computeBandWidth, parseRadiusValue, computeRingPlacement };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.RingGeometry = api;
  }
})();
