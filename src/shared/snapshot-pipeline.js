/*
 * Snapshot Pipeline.
 *
 * Three-phase orchestration for the Element Snapshot:
 *
 *   1. Pre-Compute — kicked off at key-down against the locked target. Builds
 *      everything except the screenshot (HTML, computed-style diff, assets,
 *      metadata). Speculative: must be safe to abandon if the dispatcher
 *      cancels or commits a snippet before the hold threshold crosses.
 *
 *   2. Capture — at threshold-cross. Re-reads box via getBoundingClientRect
 *      (never reused from key-down, because scroll/animation can drift), then
 *      flips the Overlay to visibility:hidden for one paint frame, fires
 *      captureVisibleTab, and synchronously restores the Overlay on dataURL
 *      receipt — without waiting for crop.
 *
 *   3. Commit — delegates crop to the Screenshot Crop Worker, merges its
 *      output with the Pre-Compute payload, and returns the final JSON
 *      string ready for the clipboard.
 */
(() => {
  function startPreCompute(el) {
    let aborted = false;
    const promise = new Promise((resolve) => {
      /* Defer one microtask so the caller can wire up an abort if needed. */
      Promise.resolve().then(() => {
        if (aborted) { resolve(null); return; }
        try {
          resolve(globalThis.ElementCopy.buildSnapshotSansScreenshot(el));
        } catch (_) {
          resolve(null);
        }
      });
    });
    return {
      promise,
      abort() { aborted = true; }
    };
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function capture(el) {
    /* Always re-read box at capture: page may have scrolled or animated
       during the hold. */
    const box = globalThis.ElementCopy.boxFromRect(el);
    globalThis.Overlay.hide();
    globalThis.Overlay.hideToast();
    await nextFrame();
    const dataUrl = await globalThis.ElementCopy.requestViewportCapture();
    /* Restore the overlay synchronously on dataURL receipt — do NOT await
       the Worker. The crop runs off-thread. */
    globalThis.Overlay.show();
    return { box, dataUrl };
  }

  async function commit(preCompute, captureResult) {
    const sansScreenshot = await preCompute.promise;
    if (!sansScreenshot) return null;
    /* Overwrite the box with the freshly-refreshed one from Capture. */
    sansScreenshot.box = captureResult.box;
    if (captureResult.dataUrl) {
      try {
        const base64 = await globalThis.ScreenshotCrop.cropViewportPng(
          captureResult.dataUrl,
          captureResult.box,
          sansScreenshot.meta.devicePixelRatio
        );
        if (base64) {
          sansScreenshot.screenshot = {
            mimeType: 'image/png',
            encoding: 'base64',
            data: base64
          };
        }
      } catch (_) {
        /* Crop failure shouldn't kill the snapshot — fall through without
           a screenshot, matching the legacy buildSnapshot behaviour. */
      }
    }
    return JSON.stringify(sansScreenshot);
  }

  globalThis.SnapshotPipeline = {
    startPreCompute,
    capture,
    commit
  };
})();
