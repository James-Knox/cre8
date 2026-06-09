/*
 * Project + frame data model.
 *
 * A Project is a stack of animation frames, all sharing the same pixel
 * dimensions (w x h). Each frame is a flat Uint8Array of length w*h where every
 * cell holds a value 0..16:
 *    0..15 = a PICO-8 palette colour index
 *    16    = TRANSPARENT (empty). Exported as the project's transparent colour.
 *
 * Keeping transparency as its own value (rather than overloading colour 0)
 * means we can show a checkerboard while editing and still let the user pick
 * which real colour "transparent" becomes on export.
 */
(function (global) {
  'use strict';

  const TRANSPARENT = 16;

  function makeFrame(w, h, fill) {
    const a = new Uint8Array(w * h);
    a.fill(fill == null ? TRANSPARENT : fill);
    return a;
  }

  function createProject(w, h) {
    return {
      w: w || 8,
      h: h || 8,
      frames: [makeFrame(w || 8, h || 8)],
      active: 0,
      fps: 6,
      transparentColor: 0, // which palette index TRANSPARENT exports to
    };
  }

  function activeFrame(p) {
    return p.frames[p.active];
  }

  function cloneFrame(f) {
    return new Uint8Array(f);
  }

  // Resize every frame, preserving the top-left overlap region.
  function resize(p, nw, nh) {
    p.frames = p.frames.map((f) => {
      const out = makeFrame(nw, nh);
      const cw = Math.min(p.w, nw);
      const ch = Math.min(p.h, nh);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          out[y * nw + x] = f[y * p.w + x];
        }
      }
      return out;
    });
    p.w = nw;
    p.h = nh;
  }

  function addFrame(p, copyActive) {
    const f = copyActive ? cloneFrame(activeFrame(p)) : makeFrame(p.w, p.h);
    p.frames.splice(p.active + 1, 0, f);
    p.active += 1;
  }

  function deleteFrame(p) {
    if (p.frames.length <= 1) return;
    p.frames.splice(p.active, 1);
    if (p.active >= p.frames.length) p.active = p.frames.length - 1;
  }

  function moveFrame(p, from, to) {
    if (to < 0 || to >= p.frames.length) return;
    const [f] = p.frames.splice(from, 1);
    p.frames.splice(to, 0, f);
    p.active = to;
  }

  // Serialise to a plain JSON-friendly object for localStorage / file save.
  function serialize(p) {
    return {
      w: p.w,
      h: p.h,
      active: p.active,
      fps: p.fps,
      transparentColor: p.transparentColor,
      frames: p.frames.map((f) => Array.from(f)),
    };
  }

  function deserialize(obj) {
    const p = createProject(obj.w, obj.h);
    p.active = obj.active || 0;
    p.fps = obj.fps || 6;
    p.transparentColor = obj.transparentColor || 0;
    p.frames = obj.frames.map((arr) => Uint8Array.from(arr));
    if (!p.frames.length) p.frames = [makeFrame(p.w, p.h)];
    if (p.active >= p.frames.length) p.active = 0;
    return p;
  }

  global.Model = {
    TRANSPARENT,
    makeFrame,
    createProject,
    activeFrame,
    cloneFrame,
    resize,
    addFrame,
    deleteFrame,
    moveFrame,
    serialize,
    deserialize,
  };
})(window);
