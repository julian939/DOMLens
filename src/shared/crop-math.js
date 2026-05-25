/*
 * Pure math for the screenshot crop. Extracted so it can be unit-tested from
 * the command line without spinning up a Worker or a Canvas.
 *
 * The Worker imports this file via importScripts(); the unit tests require()
 * it as a CommonJS module.
 */
(function () {
  /*
   * Map a viewport-relative box (CSS pixels) into device-pixel coordinates and
   * clamp it to the actual captured image. Returns null when the box has no
   * intersection with the image (zero-area or fully off-screen).
   */
  function computeCropRect(box, devicePixelRatio, imageWidth, imageHeight) {
    if (!box) return null;
    const dpr = devicePixelRatio || 1;
    const w = box.width;
    const h = box.height;
    if (!(w > 0) || !(h > 0)) return null;

    const sx = Math.round(box.x * dpr);
    const sy = Math.round(box.y * dpr);
    const sw = Math.max(1, Math.round(w * dpr));
    const sh = Math.max(1, Math.round(h * dpr));

    const x = Math.max(0, sx);
    const y = Math.max(0, sy);
    const right = Math.min(imageWidth, sx + sw);
    const bottom = Math.min(imageHeight, sy + sh);
    const width = right - x;
    const height = bottom - y;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  const api = { computeCropRect };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.CropMath = api;
  }
})();
