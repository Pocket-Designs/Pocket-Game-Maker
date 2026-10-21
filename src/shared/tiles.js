/* Tile drawing shared by the editor and the game: plain tiles, autotiles and animated tiles.

   Autotile: a 2×3 block of tiles in the tileset, in the RPG Maker "A2" layout. The top-left
   tile of the block is the one you paint with (flags[t].auto = true):
     [preview][inner corners]
     [  2×2 block with its edges and corners  ]
   Each map square is drawn from four quarter-tiles chosen by looking at its eight neighbours,
   so edges, corners and inner corners join up automatically.

   Animated tile: flags[t].anim = number of frames (2–8). Frame k is k tiles to the right
   (2k tiles for an animated autotile). The tileset's animSpeed (ms per frame) sets the pace. */
(function (root) {
  'use strict';

  // Which tiles are internal parts of an autotile block or later animation frames (not painted directly).
  function partsOf(ts, cols) {
    const parts = {};
    const flags = (ts && ts.flags) || [];
    flags.forEach((f, t) => {
      if (!f || (!f.auto && !(f.anim > 1))) return;
      const frames = Math.max(1, f.anim | 0), step = f.auto ? 2 : 1;
      for (let k = 0; k < frames; k++) {
        const a = t + k * step;
        const cells = f.auto ? [a, a + 1, a + cols, a + cols + 1, a + 2 * cols, a + 2 * cols + 1] : [a];
        cells.forEach(c => { if (c !== t) parts[c] = t; });
      }
    });
    return parts;
  }

  const frameCount = f => (f && f.anim > 1 ? Math.min(8, f.anim | 0) : 1);
  function frameAt(ts, f, timeMs) {
    const n = frameCount(f); if (n < 2) return 0;
    const speed = Math.max(60, (ts && ts.animSpeed) || 300);
    const k = Math.floor(timeMs / speed) % (2 * n - 2 || 1);
    return ts && ts.animPingPong === false ? Math.floor(timeMs / speed) % n : (k < n ? k : 2 * n - 2 - k);
  }

  // Quarter sources for an autotile square, in half-tile units relative to the block's top-left.
  function autoQuarters(same) {
    const out = [];
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const sx = qx ? 1 : -1, sy = qy ? 1 : -1;
      const h = same(sx, 0), v = same(0, sy), d = same(sx, sy);
      let bx, by;
      if (h && v && d) { bx = qx ? 1 : 2; by = (qy ? 1 : 2) + 2; }
      else if (h && v) { bx = 2 + qx; by = qy; }
      else if (!h && !v) { bx = qx ? 3 : 0; by = (qy ? 3 : 0) + 2; }
      else if (h) { bx = qx ? 1 : 2; by = (qy ? 3 : 0) + 2; }
      else { bx = qx ? 3 : 0; by = (qy ? 1 : 2) + 2; }
      out.push([qx, qy, bx, by]);
    }
    return out;
  }

  // Draw tile t of a map layer at (dx, dy). layer/w/h/x/y are needed for autotiles; timeMs for animation.
  function drawTile(g, img, ts, cols, T, t, dx, dy, layer, w, h, x, y, timeMs, size) {
    const S = size || T;
    const f = (ts.flags || [])[t] || {};
    const frame = frameAt(ts, f, timeMs || 0);
    if (f.auto) {
      const a = t + frame * 2, ax = (a % cols) * T, ay = Math.floor(a / cols) * T, H = T / 2, HS = S / 2;
      const same = (ox, oy) => {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
        return layer[ny * w + nx] === t;
      };
      autoQuarters(same).forEach(([qx, qy, bx, by]) => g.drawImage(img, ax + bx * H, ay + by * H, H, H, dx + qx * HS, dy + qy * HS, HS, HS));
      return;
    }
    const a = t + frame;
    g.drawImage(img, (a % cols) * T, Math.floor(a / cols) * T, T, T, dx, dy, S, S);
  }

  // Is this tile animated (so the square has to be redrawn as time passes)?
  const animated = (ts, t) => frameCount(((ts && ts.flags) || [])[t]) > 1;

  // Tile settings from a library .tiles.json entry (and back).
  function flagFromMapping(t) { const f = { pass: !!t.pass, enc: !!t.enc, over: !!t.over }; if (t.auto) f.auto = true; if (t.anim > 1) f.anim = t.anim | 0; return f; }
  function flagToMapping(f) { const o = { pass: !!f.pass, enc: !!f.enc, over: !!f.over }; if (f.auto) o.auto = true; if (f.anim > 1) o.anim = f.anim; return o; }

  const api = { flagFromMapping, flagToMapping, partsOf, frameAt, frameCount, autoQuarters, drawTile, animated };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MF = root.MF || {}; root.MF.Tiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
