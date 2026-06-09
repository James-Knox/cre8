/*
 * Image -> PICO-8 pixel art conversion.
 *
 * This is the offline "translate an input image to pixel information" engine:
 * give it any image (photo, drawing, reference art) and a target size, and it
 * produces a frame of PICO-8 palette indices. No network or API key required.
 *
 * Pipeline: downscale -> brightness/contrast -> (optional Floyd-Steinberg
 * dithering) -> nearest palette colour. Fully transparent source pixels stay
 * transparent.
 */
(function (global) {
  'use strict';

  const T = Model.TRANSPARENT;

  // Draw the source image into a w x h buffer using the chosen fit mode.
  function rasterise(img, w, h, fit) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = fit !== 'pixel';
    ctx.clearRect(0, 0, w, h);

    const iw = img.width;
    const ih = img.height;
    let dw = w;
    let dh = h;
    let dx = 0;
    let dy = 0;

    if (fit === 'contain' || fit === 'pixel') {
      const s = Math.min(w / iw, h / ih);
      dw = Math.round(iw * s);
      dh = Math.round(ih * s);
      dx = Math.floor((w - dw) / 2);
      dy = Math.floor((h - dh) / 2);
    } else if (fit === 'cover') {
      const s = Math.max(w / iw, h / ih);
      dw = Math.round(iw * s);
      dh = Math.round(ih * s);
      dx = Math.floor((w - dw) / 2);
      dy = Math.floor((h - dh) / 2);
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    return ctx.getImageData(0, 0, w, h);
  }

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  /**
   * Convert an HTMLImageElement to a frame (Uint8Array of palette indices).
   * @param {HTMLImageElement} img
   * @param {number} w @param {number} h
   * @param {object} opts { fit, brightness, contrast, dither, allowed }
   *   fit: 'contain' | 'cover' | 'stretch' | 'pixel'
   *   brightness: -100..100   contrast: -100..100
   *   dither: boolean (Floyd-Steinberg)
   *   allowed: optional array of palette indices to restrict to
   * @returns {Uint8Array}
   */
  function convert(img, w, h, opts) {
    opts = opts || {};
    const fit = opts.fit || 'contain';
    const data = rasterise(img, w, h, fit).data;

    // Pre-adjust brightness/contrast into a float working buffer.
    const b = (opts.brightness || 0) * 2.55;
    const cFactor =
      (259 * ((opts.contrast || 0) + 255)) / (255 * (259 - (opts.contrast || 0)));
    const px = new Float32Array(w * h * 3);
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      alpha[i] = data[i * 4 + 3];
      for (let c = 0; c < 3; c++) {
        let v = data[i * 4 + c];
        v = cFactor * (v - 128) + 128 + b;
        px[i * 3 + c] = clamp255(v);
      }
    }

    const out = new Uint8Array(w * h);
    const allowed = opts.allowed && opts.allowed.length ? opts.allowed : null;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] < 128) {
          out[i] = T;
          continue;
        }
        const r = px[i * 3];
        const g = px[i * 3 + 1];
        const bl = px[i * 3 + 2];
        const idx = Palette.nearest(r, g, bl, allowed);
        out[i] = idx;

        if (opts.dither) {
          // Floyd-Steinberg: push the quantisation error onto neighbours.
          const pr = Palette.rgbOf(idx);
          const er = r - pr[0];
          const eg = g - pr[1];
          const eb = bl - pr[2];
          diffuse(px, w, h, x + 1, y, er, eg, eb, 7 / 16);
          diffuse(px, w, h, x - 1, y + 1, er, eg, eb, 3 / 16);
          diffuse(px, w, h, x, y + 1, er, eg, eb, 5 / 16);
          diffuse(px, w, h, x + 1, y + 1, er, eg, eb, 1 / 16);
        }
      }
    }
    return out;
  }

  function diffuse(px, w, h, x, y, er, eg, eb, f) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 3;
    px[i] = clamp255(px[i] + er * f);
    px[i + 1] = clamp255(px[i + 1] + eg * f);
    px[i + 2] = clamp255(px[i + 2] + eb * f);
  }

  // Load a File/Blob into an HTMLImageElement (returns a Promise).
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  global.Importer = { convert, loadImage, rasterise };
})(window);
