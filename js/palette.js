/*
 * PICO-8 palette and colour helpers.
 *
 * PICO-8 has a fixed 16-colour palette. Every pixel of art is just an index
 * 0-15 into this palette. That is the single most important fact about PICO-8
 * art: you never store RGB, you store a colour *number*. Export formats are all
 * built on these indices.
 */
(function (global) {
  'use strict';

  // The 16 standard PICO-8 colours, in order (index 0..15).
  // hex is what the colour looks like on screen; name is PICO-8's own label.
  const PICO8 = [
    { i: 0, name: 'black', hex: '#000000' },
    { i: 1, name: 'dark-blue', hex: '#1D2B53' },
    { i: 2, name: 'dark-purple', hex: '#7E2553' },
    { i: 3, name: 'dark-green', hex: '#008751' },
    { i: 4, name: 'brown', hex: '#AB5236' },
    { i: 5, name: 'dark-grey', hex: '#5F574F' },
    { i: 6, name: 'light-grey', hex: '#C2C3C7' },
    { i: 7, name: 'white', hex: '#FFF1E8' },
    { i: 8, name: 'red', hex: '#FF004D' },
    { i: 9, name: 'orange', hex: '#FFA300' },
    { i: 10, name: 'yellow', hex: '#FFEC27' },
    { i: 11, name: 'green', hex: '#00E436' },
    { i: 12, name: 'blue', hex: '#29ADFF' },
    { i: 13, name: 'lavender', hex: '#83769C' },
    { i: 14, name: 'pink', hex: '#FF77A8' },
    { i: 15, name: 'peach', hex: '#FFCCAA' },
  ];

  // PICO-8 writes sprite data as single hex digits 0-f. 10 -> 'a', 15 -> 'f'.
  const HEX = '0123456789abcdef';

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Precompute RGB for fast nearest-colour matching.
  const RGB = PICO8.map((c) => hexToRgb(c.hex));

  /**
   * Find the PICO-8 colour index closest to an arbitrary RGB value.
   * Uses a perceptually weighted distance (eyes are more sensitive to green)
   * which gives noticeably better results than plain Euclidean distance.
   * @param {number} r @param {number} g @param {number} b
   * @param {number[]=} allowed optional subset of indices to choose from
   * @returns {number} palette index 0-15
   */
  function nearest(r, g, b, allowed) {
    let best = 0;
    let bestD = Infinity;
    const pool = allowed && allowed.length ? allowed : null;
    const len = pool ? pool.length : RGB.length;
    for (let k = 0; k < len; k++) {
      const idx = pool ? pool[k] : k;
      const c = RGB[idx];
      const dr = (r - c[0]) * 0.30;
      const dg = (g - c[1]) * 0.59;
      const db = (b - c[2]) * 0.11;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
    return best;
  }

  global.Palette = {
    colors: PICO8,
    rgb: RGB,
    HEX,
    hexToRgb,
    nearest,
    hexOf: (i) => PICO8[i].hex,
    rgbOf: (i) => RGB[i],
    nameOf: (i) => PICO8[i].name,
    toHexDigit: (i) => HEX[i],
    fromHexDigit: (ch) => HEX.indexOf(ch.toLowerCase()),
  };
})(window);
