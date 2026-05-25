/*
 * Main-thread wrapper around the Screenshot Crop Worker.
 *
 * Exposes a single function:
 *   ScreenshotCrop.cropViewportPng(pngDataUrl, box, devicePixelRatio)
 *     -> Promise<base64 string>
 *
 * The wrapper spawns one persistent Worker on first use and multiplexes
 * crop requests over it using a numeric id. All decode/raster/encode work
 * runs inside the Worker.
 */
(() => {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    const url = chrome.runtime.getURL('src/shared/screenshot-crop.worker.js');
    worker = new Worker(url);
    worker.onmessage = (event) => {
      const msg = event.data || {};
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.base64);
      else entry.reject(new Error(msg.error || 'crop failed'));
    };
    worker.onerror = (err) => {
      /* If the worker itself dies, fail every in-flight request and reset
         so the next call gets a fresh worker. */
      for (const [, entry] of pending) entry.reject(err);
      pending.clear();
      worker.terminate();
      worker = null;
    };
    return worker;
  }

  function cropViewportPng(pngDataUrl, box, devicePixelRatio) {
    return new Promise((resolve, reject) => {
      try {
        const w = ensureWorker();
        const id = nextId++;
        pending.set(id, { resolve, reject });
        w.postMessage({ id, pngDataUrl, box, devicePixelRatio });
      } catch (err) {
        reject(err);
      }
    });
  }

  globalThis.ScreenshotCrop = { cropViewportPng };
})();
