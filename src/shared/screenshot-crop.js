(() => {
  async function cropViewportPng(viewportPngDataUrl, box, devicePixelRatio) {
    const dpr = devicePixelRatio || 1;
    const sx = Math.max(0, Math.round(box.x * dpr));
    const sy = Math.max(0, Math.round(box.y * dpr));
    const sw = Math.max(1, Math.round(box.width * dpr));
    const sh = Math.max(1, Math.round(box.height * dpr));

    const blob = await (await fetch(viewportPngDataUrl)).blob();
    const bitmap = await createImageBitmap(blob);

    const clampedW = Math.min(sw, Math.max(1, bitmap.width - sx));
    const clampedH = Math.min(sh, Math.max(1, bitmap.height - sy));

    const canvas = new OffscreenCanvas(clampedW, clampedH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, sx, sy, clampedW, clampedH, 0, 0, clampedW, clampedH);
    bitmap.close && bitmap.close();

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
    return btoa(binary);
  }

  globalThis.ScreenshotCrop = {
    cropViewportPng
  };
})();
