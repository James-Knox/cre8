/*
 * ai.js — client side of the generative-AI feature.
 *
 * Talks to the local proxy (server/ai-server.js), which holds the API key and
 * calls the image model. Whatever picture comes back is run through
 * Importer.convert(), so the model's output always ends up as legal PICO-8
 * pixels. If the proxy isn't running (e.g. you opened index.html directly), the
 * status check fails gracefully and the UI explains how to enable it.
 */
(function (global) {
  'use strict';

  const T = Model.TRANSPARENT;

  async function status() {
    try {
      const r = await fetch('/api/ai-status', { cache: 'no-store' });
      if (!r.ok) return { enabled: false };
      return await r.json();
    } catch (e) {
      return { enabled: false, offline: true };
    }
  }

  async function generate(opts) {
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const json = await r.json().catch(() => ({ error: 'Bad response from server.' }));
    if (!r.ok) throw new Error(json.error || `Server error ${r.status}`);
    return json.images || [];
  }

  // Render the active frame to an upscaled PNG data URL, for use as an AI
  // reference image. Transparent pixels stay transparent.
  function frameToPng(project, px) {
    px = px || 512;
    const z = Math.floor(px / Math.max(project.w, project.h));
    const cv = document.createElement('canvas');
    cv.width = project.w * z;
    cv.height = project.h * z;
    const ctx = cv.getContext('2d');
    const f = Model.activeFrame(project);
    for (let y = 0; y < project.h; y++) {
      for (let x = 0; x < project.w; x++) {
        const v = f[y * project.w + x];
        if (v === T) continue;
        ctx.fillStyle = Palette.hexOf(v);
        ctx.fillRect(x * z, y * z, z, z);
      }
    }
    return cv.toDataURL('image/png');
  }

  // Load a data URL into an HTMLImageElement.
  function loadDataUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  global.AI = { status, generate, frameToPng, loadDataUrl };
})(window);
