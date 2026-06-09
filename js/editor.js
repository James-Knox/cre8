/*
 * The pixel editor canvas: rendering + drawing tools.
 *
 * It draws the *active* frame at an integer zoom, with a grid overlay and an
 * optional faint "onion skin" of the previous frame so you can line up
 * animation. Tools operate directly on the frame's Uint8Array.
 */
(function (global) {
  'use strict';

  const T = Model.TRANSPARENT;

  function Editor(canvas, getProject, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getProject = getProject;
    this.onChange = onChange || function () {};

    this.color = 8; // current drawing colour index
    this.tool = 'pencil';
    this.zoom = 24; // screen pixels per art pixel
    this.mirrorX = false; // mirror strokes across the vertical centre line
    this.showGrid = true;
    this.onionSkin = false;

    this._drawing = false;
    this._snapshot = null; // frame backup for shape tools
    this._start = null; // {x,y} where a shape drag began

    this._bind();
  }

  Editor.prototype._bind = function () {
    const self = this;
    const pos = (e) => {
      const r = self.canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) / self.zoom;
      const py = (e.clientY - r.top) / self.zoom;
      return { x: Math.floor(px), y: Math.floor(py) };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      self.canvas.setPointerCapture(e.pointerId);
      self._drawing = true;
      self._snapshot = Model.cloneFrame(Model.activeFrame(self.getProject()));
      const c = pos(e);
      self._start = c;
      self._apply(c, c);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const c = pos(e);
      self._hover = c;
      if (self._drawing) self._apply(self._start, c);
      else self.render();
    });
    const end = (e) => {
      if (!self._drawing) return;
      self._drawing = false;
      self._snapshot = null;
      self.onChange();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('pointerleave', () => {
      self._hover = null;
      if (!self._drawing) self.render();
    });
  };

  // Set a pixel (and its mirror, if enabled). value 0..16.
  Editor.prototype._set = function (frame, x, y, value) {
    const p = this.getProject();
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
    frame[y * p.w + x] = value;
    if (this.mirrorX) {
      const mx = p.w - 1 - x;
      frame[y * p.w + mx] = value;
    }
  };

  Editor.prototype._apply = function (start, end) {
    const p = this.getProject();
    const frame = Model.activeFrame(p);
    const value = this.tool === 'eraser' ? T : this.color;

    switch (this.tool) {
      case 'pencil':
      case 'eraser':
        this._line(frame, start.x, start.y, end.x, end.y, value);
        break;
      case 'eyedropper': {
        const v = frame[end.y * p.w + end.x];
        if (v != null) {
          this.color = v === T ? this.color : v;
          if (this.onPick) this.onPick(this.color);
        }
        this._drawing = false;
        break;
      }
      case 'fill':
        this._flood(frame, end.x, end.y, value);
        break;
      case 'line':
        frame.set(this._snapshot);
        this._line(frame, start.x, start.y, end.x, end.y, value);
        break;
      case 'rect':
      case 'rectfill':
        frame.set(this._snapshot);
        this._rect(frame, start, end, value, this.tool === 'rectfill');
        break;
    }
    this.render();
    // Live-update previews while dragging, cheaply.
    if (this.onLive) this.onLive();
  };

  Editor.prototype._line = function (frame, x0, y0, x1, y1, value) {
    // Bresenham so freehand strokes stay connected at speed.
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this._set(frame, x0, y0, value);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  };

  Editor.prototype._rect = function (frame, a, b, value, fill) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        if (fill || edge) this._set(frame, x, y, value);
      }
    }
  };

  Editor.prototype._flood = function (frame, x, y, value) {
    const p = this.getProject();
    const target = frame[y * p.w + x];
    if (target === value) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= p.w || cy >= p.h) continue;
      if (frame[cy * p.w + cx] !== target) continue;
      frame[cy * p.w + cx] = value;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  };

  Editor.prototype.resizeCanvas = function () {
    const p = this.getProject();
    // Fit the available space while keeping an integer zoom.
    const maxPx = Math.min(this.canvas.parentElement.clientWidth - 24, 640);
    this.zoom = Math.max(2, Math.floor(maxPx / p.w));
    this.canvas.width = p.w * this.zoom;
    this.canvas.height = p.h * this.zoom;
    this.render();
  };

  Editor.prototype.render = function () {
    const p = this.getProject();
    const ctx = this.ctx;
    const z = this.zoom;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Onion skin: previous frame, faint, underneath.
    if (this.onionSkin && p.frames.length > 1) {
      const prev = p.frames[(p.active - 1 + p.frames.length) % p.frames.length];
      ctx.globalAlpha = 0.25;
      this._paintFrame(prev, z, false);
      ctx.globalAlpha = 1;
    }

    this._paintFrame(Model.activeFrame(p), z, true);

    if (this.showGrid && z >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= p.w; x++) {
        // Heavier line on PICO-8 8x8 sprite boundaries.
        const heavy = x % 8 === 0;
        ctx.globalAlpha = heavy ? 0.4 : 0.12;
        ctx.moveTo(x * z + 0.5, 0);
        ctx.lineTo(x * z + 0.5, p.h * z);
        ctx.stroke();
        ctx.beginPath();
      }
      for (let y = 0; y <= p.h; y++) {
        const heavy = y % 8 === 0;
        ctx.globalAlpha = heavy ? 0.4 : 0.12;
        ctx.moveTo(0, y * z + 0.5);
        ctx.lineTo(p.w * z, y * z + 0.5);
        ctx.stroke();
        ctx.beginPath();
      }
      ctx.globalAlpha = 1;
    }

    // Hover cursor.
    if (this._hover && this._hover.x >= 0 && this._hover.x < p.w &&
        this._hover.y >= 0 && this._hover.y < p.h) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(this._hover.x * z + 1, this._hover.y * z + 1, z - 2, z - 2);
    }
  };

  Editor.prototype._paintFrame = function (frame, z, checker) {
    const p = this.getProject();
    const ctx = this.ctx;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const v = frame[y * p.w + x];
        if (v === T) {
          if (checker) {
            const light = (x + y) % 2 === 0;
            ctx.fillStyle = light ? '#2a2a33' : '#1f1f26';
            ctx.fillRect(x * z, y * z, z, z);
          }
          continue;
        }
        ctx.fillStyle = Palette.hexOf(v);
        ctx.fillRect(x * z, y * z, z, z);
      }
    }
  };

  global.Editor = Editor;
})(window);
