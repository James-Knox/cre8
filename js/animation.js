/*
 * Animation: a small playback engine plus procedural "suggestions".
 *
 * The suggestions are the help-with-animation feature: instead of drawing every
 * frame by hand, you draw ONE pose and ask for a motion. Each generator returns
 * a fresh list of frames built from your current frame(s) with a classic
 * pixel-art trick applied (bob, sway, a 2-frame leg step, or a ping-pong loop).
 * They're starting points you then tweak by hand.
 */
(function (global) {
  'use strict';

  const T = Model.TRANSPARENT;

  // Return a copy of `frame` shifted by (dx,dy). Exposed cells become transparent.
  function shift(frame, w, h, dx, dy) {
    const out = Model.makeFrame(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = x - dx;
        const sy = y - dy;
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
        out[y * w + x] = frame[sy * w + sx];
      }
    }
    return out;
  }

  // Shift only the rows in [y0,y1) horizontally — used for leg/step motion.
  function shiftBand(frame, w, h, y0, y1, dx) {
    const out = Model.cloneFrame(frame);
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < w; x++) {
        const sx = x - dx;
        out[y * w + x] = sx >= 0 && sx < w ? frame[y * w + sx] : T;
      }
    }
    return out;
  }

  function flipH(frame, w, h) {
    const out = Model.makeFrame(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y * w + x] = frame[y * w + (w - 1 - x)];
    return out;
  }

  const Suggest = {
    // Two-frame vertical bob — reads as idle breathing / floating.
    idleBob(p) {
      const f = Model.activeFrame(p);
      return [Model.cloneFrame(f), shift(f, p.w, p.h, 0, 1)];
    },
    // Four-frame horizontal sway, centre-out-centre-out.
    sway(p) {
      const f = Model.activeFrame(p);
      return [
        Model.cloneFrame(f),
        shift(f, p.w, p.h, -1, 0),
        Model.cloneFrame(f),
        shift(f, p.w, p.h, 1, 0),
      ];
    },
    // Two-frame walk: the bottom third (legs) steps left then right.
    walkStep(p) {
      const f = Model.activeFrame(p);
      const y0 = Math.floor((p.h * 2) / 3);
      return [
        shiftBand(f, p.w, p.h, y0, p.h, -1),
        shiftBand(f, p.w, p.h, y0, p.h, 1),
      ];
    },
    // Ping-pong the existing frames into a smooth back-and-forth loop.
    pingpong(p) {
      const out = p.frames.map(Model.cloneFrame);
      for (let i = p.frames.length - 2; i >= 1; i--) {
        out.push(Model.cloneFrame(p.frames[i]));
      }
      return out;
    },
    // Mirror the current frame — handy for a "facing the other way" pose.
    flip(p) {
      return [flipH(Model.activeFrame(p), p.w, p.h)];
    },
  };

  // Loops the project's frames onto a preview canvas at project.fps.
  function Player(canvas, getProject) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getProject = getProject;
    this.playing = false;
    this.frame = 0;
    this._acc = 0;
    this._last = 0;
    this._raf = null;
  }

  Player.prototype.start = function () {
    if (this.playing) return;
    this.playing = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const p = this.getProject();
      this._acc += now - this._last;
      this._last = now;
      const interval = 1000 / Math.max(1, p.fps);
      while (this._acc >= interval) {
        this._acc -= interval;
        this.frame = (this.frame + 1) % p.frames.length;
      }
      this._paint(p, p.frames[this.frame % p.frames.length]);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  };

  Player.prototype.stop = function () {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  Player.prototype.renderStatic = function () {
    const p = this.getProject();
    this._paint(p, Model.activeFrame(p));
  };

  Player.prototype._paint = function (p, frame) {
    const cv = this.canvas;
    const z = Math.max(1, Math.floor(Math.min(cv.width / p.w, cv.height / p.h)));
    const ox = Math.floor((cv.width - p.w * z) / 2);
    const oy = Math.floor((cv.height - p.h * z) / 2);
    this.ctx.fillStyle = Palette.hexOf(p.transparentColor);
    this.ctx.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const v = frame[y * p.w + x];
        this.ctx.fillStyle = Palette.hexOf(v === T ? p.transparentColor : v);
        this.ctx.fillRect(ox + x * z, oy + y * z, z, z);
      }
    }
  };

  global.Animation = { Suggest, Player, shift, flipH };
})(window);
