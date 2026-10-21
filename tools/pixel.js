// Pixel-art helpers shared by the asset generators. One fixed palette keeps every asset consistent.
const { Image } = require('./png');

// Endesga 32 palette (public domain) + one light green. One letter per colour.
const HEX = {
  K: '#181425', k: '#262b44', n: '#3a4466', m: '#5a6988', s: '#8b9bb4', S: '#c0cbdc', W: '#ffffff',
  L: '#9ad45a', G: '#63c74d', g: '#3e8948', d: '#265c42', D: '#193c3e',
  b: '#124e89', B: '#0099db', c: '#2ce8f5',
  r: '#a22633', R: '#e43b44', o: '#f77622', y: '#feae34', Y: '#fee761',
  h: '#3e2731', t: '#733e39', T: '#b86f50', u: '#c28569', U: '#e4a672', e: '#ead4aa', x: '#be4a2f', O: '#d77643',
  p: '#68386c', P: '#b55088', q: '#f6757a', f: '#e8b796', z: '#ff0044'
};
const PAL = {};
for (const k in HEX) { const v = HEX[k]; PAL[k] = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 255]; }
const C = l => { const c = PAL[l]; if (!c) throw new Error('No palette colour ' + l); return c; };

function px(img, x, y, l) { if (l && l !== '.') img.set(x, y, C(l)); }
function rect(img, x, y, w, h, l) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, x + i, y + j, l); }
function hline(img, x, y, w, l) { rect(img, x, y, w, 1, l); }
function vline(img, x, y, h, l) { rect(img, x, y, 1, h, l); }

// ASCII sprite. map optionally remaps letters (e.g. template slots). '.' = transparent.
function spr(img, x, y, rows, map) {
  const w = rows[0].length;
  rows.forEach((row, j) => {
    if (row.length !== w) throw new Error('Sprite row ' + j + ' has length ' + row.length + ', expected ' + w + ': "' + row + '"');
    for (let i = 0; i < row.length; i++) {
      let ch = row[i];
      if (map && map[ch] !== undefined) ch = map[ch];
      if (ch !== '.') px(img, x + i, y + j, ch);
    }
  });
}

// Shaded ellipse lit from the top-left, with ordered dithering on the shade boundaries.
function blob(img, cx, cy, rx, ry, o) {
  const base = o.base, dark = o.dark || base, light = o.light || base, deep = o.deep || dark;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const d = nx * 0.55 + ny * 0.83;
      const dither = ((x + y) & 1) ? 0.05 : -0.05;
      let l = base;
      if (d + dither > 0.78) l = deep;
      else if (d + dither > 0.38) l = dark;
      else if (d + dither < -0.42) l = light;
      px(img, x, y, l);
    }
}

// 1px outline around opaque pixels (drawn in transparent pixels only).
function outline(img, l) { img.outline(C(l || 'K')); }

// Copy src onto dst (alpha-aware).
function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 4;
    if (src.data[i + 3]) dst.set(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
  }
}
function mirror(src) {
  const out = new Image(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 4, j = (y * src.w + (src.w - 1 - x)) * 4;
    for (let k = 0; k < 4; k++) out.data[j + k] = src.data[i + k];
  }
  return out;
}
function scale(src, k) {
  const out = new Image(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const i = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4, j = (y * out.w + x) * 4;
    for (let c = 0; c < 4; c++) out.data[j + c] = src.data[i + c];
  }
  return out;
}

// Deterministic pseudo-random from integer seed.
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// Scatter n pixels of colour l in a w*h area.
function speckle(img, x, y, w, h, l, n, seed) { const r = rng(seed); for (let i = 0; i < n; i++) px(img, x + Math.floor(r() * w), y + Math.floor(r() * h), l); }

module.exports = { Image, HEX, PAL, C, px, rect, hline, vline, spr, blob, outline, blit, mirror, scale, rng, speckle };
