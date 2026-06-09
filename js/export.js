/*
 * Export: getting your art into a real PICO-8 cart.
 *
 * PICO-8 keeps all sprite art in one 128x128 pixel "spritesheet", divided into
 * 256 sprites of 8x8 each (16 across, 16 down). In a .p8 cart file this sheet is
 * stored as the __gfx__ section: 128 text lines of 128 hex digits, one digit per
 * pixel (the colour index 0-f).
 *
 * This module packs the project's frames into that 128x128 sheet and emits:
 *   - the __gfx__ block to paste straight into a .p8 file
 *   - a 128x128 PNG you can `import` in PICO-8
 *   - per-frame hex (handy for sspr / custom loaders)
 * It also reports which sprite NUMBER each frame lands on, so you can call it
 * from code with spr().
 */
(function (global) {
  'use strict';

  const T = Model.TRANSPARENT;
  const SHEET = 128; // pixels per side
  const CELLS = 16; // 8x8 sprites across/down

  // Pack frames into a 128x128 index grid. Returns {grid, placements}.
  // Each placement: {frame, spriteX, spriteY, spriteNo, wCells, hCells}.
  function buildSheet(project) {
    const grid = new Uint8Array(SHEET * SHEET).fill(project.transparentColor);
    const placements = [];
    let cellX = 0;
    let cellY = 0;
    let rowH = 0;

    project.frames.forEach((frame, fi) => {
      const wCells = Math.ceil(project.w / 8);
      const hCells = Math.ceil(project.h / 8);
      if (cellX + wCells > CELLS) {
        cellX = 0;
        cellY += rowH;
        rowH = 0;
      }
      const ox = cellX * 8;
      const oy = cellY * 8;
      if (oy + project.h <= SHEET) {
        for (let y = 0; y < project.h; y++) {
          for (let x = 0; x < project.w; x++) {
            const v = frame[y * project.w + x];
            grid[(oy + y) * SHEET + (ox + x)] =
              v === T ? project.transparentColor : v;
          }
        }
        placements.push({
          frame: fi,
          spriteX: cellX,
          spriteY: cellY,
          spriteNo: cellY * CELLS + cellX,
          wCells,
          hCells,
        });
      }
      cellX += wCells;
      rowH = Math.max(rowH, hCells);
    });

    return { grid, placements };
  }

  function gridToGfx(grid) {
    const lines = [];
    for (let y = 0; y < SHEET; y++) {
      let row = '';
      for (let x = 0; x < SHEET; x++) row += Palette.toHexDigit(grid[y * SHEET + x]);
      lines.push(row);
    }
    return lines.join('\n');
  }

  // The __gfx__ section, ready to paste into a .p8 cart.
  function gfxSection(project) {
    return '__gfx__\n' + gridToGfx(buildSheet(project).grid);
  }

  // Per-frame hex rows (w-wide, h tall) — transparent shown as the chosen colour.
  function frameHex(project, frameIndex) {
    const f = project.frames[frameIndex];
    const lines = [];
    for (let y = 0; y < project.h; y++) {
      let row = '';
      for (let x = 0; x < project.w; x++) {
        const v = f[y * project.w + x];
        row += Palette.toHexDigit(v === T ? project.transparentColor : v);
      }
      lines.push(row);
    }
    return lines.join('\n');
  }

  // Render the packed sheet to a PNG blob (1px per pixel). PICO-8: `import sheet.png`.
  function sheetPng(project, scale) {
    scale = scale || 1;
    const { grid } = buildSheet(project);
    const cv = document.createElement('canvas');
    cv.width = SHEET * scale;
    cv.height = SHEET * scale;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < SHEET; y++) {
      for (let x = 0; x < SHEET; x++) {
        ctx.fillStyle = Palette.hexOf(grid[y * SHEET + x]);
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  }

  // A human-readable summary of where each frame landed.
  function placementNotes(project) {
    const { placements } = buildSheet(project);
    return placements
      .map(
        (pl) =>
          `frame ${pl.frame + 1} -> sprite #${pl.spriteNo} ` +
          `(call: spr(${pl.spriteNo}, x, y` +
          (pl.wCells > 1 || pl.hCells > 1
            ? `, ${pl.wCells}, ${pl.hCells}`
            : '') +
          `))`
      )
      .join('\n');
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.Exporter = {
    buildSheet,
    gfxSection,
    frameHex,
    sheetPng,
    placementNotes,
    triggerDownload,
  };
})(window);
