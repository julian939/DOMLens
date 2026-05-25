/*
 * Screenshot Crop Worker.
 *
 * MV3 pattern: this file is launched from the content script via
 *   new Worker(chrome.runtime.getURL('src/shared/screenshot-crop.worker.js'))
 * and is therefore declared in manifest.json's web_accessible_resources.
 *
 * All heavy ops (createImageBitmap, OffscreenCanvas, blob, base64 encode)
 * stay inside the Worker so the page never visibly janks during a snapshot.
 */
importScripts('crop-math.js');

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    const base64 = await crop(data.pngDataUrl, data.box, data.devicePixelRatio);
    self.postMessage({ id, ok: true, base64 });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
};

async function crop(pngDataUrl, box, devicePixelRatio) {
  if (!box || !(box.width > 0) || !(box.height > 0)) {
    throw new Error('zero-area box');
  }
  if (!pngDataUrl) throw new Error('missing pngDataUrl');

  const blob = await (await fetch(pngDataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  const rect = self.CropMath.computeCropRect(
    box,
    devicePixelRatio,
    bitmap.width,
    bitmap.height
  );
  if (!rect) {
    if (bitmap.close) bitmap.close();
    throw new Error('crop rect has no intersection with image');
  }

  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    bitmap,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, rect.width, rect.height
  );
  if (bitmap.close) bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: 'image/png' });
  const buf = await outBlob.arrayBuffer();
  return arrayBufferToBase64(buf);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return self.btoa(binary);
}
