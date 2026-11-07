// Generates the Pocket-Game-Maker Asset Library (library/): original pixel art, CC0.
// Run: node tools/gen-library.js
const fs = require('fs');
const path = require('path');
const P = require('./pixel');
const { Image, px, rect, hline, vline, spr, blob, outline, blit, mirror, scale, speckle, rng } = P;

const OUT = path.join(__dirname, '..', 'library');
const AUTHOR = 'Pocket-Designs';
const LICENCE = 'CC0-1.0';
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const json = (rel, o) => write(rel, JSON.stringify(o, null, 2) + '\n');
const T = 16;

/* ======================================================================
   Ground textures (fill a whole 16x16 cell)
   ====================================================================== */
const G = {
  grass(img, x, y, v = 0) {
    rect(img, x, y, T, T, 'G');
    const tufts = v ? [[1, 2], [9, 4], [4, 9], [12, 11], [7, 14]] : [[2, 3], [10, 2], [6, 7], [13, 9], [2, 12], [9, 13]];
    tufts.forEach(([a, b]) => { px(img, x + a, y + b, 'g'); px(img, x + a + 2, y + b, 'g'); px(img, x + a + 1, y + b + 1, 'g'); });
    (v ? [[13, 1], [3, 6]] : [[5, 1], [14, 6], [11, 15]]).forEach(([a, b]) => px(img, x + a, y + b, 'L'));
    if (v) { px(img, x + 10, y + 8, 'W'); px(img, x + 2, y + 14, 'Y'); }
  },
  tall(img, x, y, base, blade, shade) {
    rect(img, x, y, T, T, base);
    const clump = [
      '...b....',
      '..bbb..b',
      '.bbsbb.b',
      'bbsbsbbs',
      'bsbbbsbs',
      'sbbsbbss',
      '.ssssss.',
      '........'];
    for (const [ox, oy] of [[0, 0], [8, 0], [4, 8], [-4, 8], [12, 8]])
      clump.forEach((row, j) => { for (let i = 0; i < 8; i++) { const ch = row[i]; const X = ox + i, Y = oy + j; if (ch === '.' || X < 0 || X >= T) continue; px(img, x + X, y + Y, ch === 'b' ? blade : shade); } });
  },
  dirt(img, x, y) { rect(img, x, y, T, T, 'U'); speckle(img, x, y, T, T, 'u', 14, 11); speckle(img, x, y, T, T, 'e', 6, 12); speckle(img, x, y, T, T, 'T', 3, 13); },
  sand(img, x, y) { rect(img, x, y, T, T, 'e'); speckle(img, x, y, T, T, 'U', 12, 21); speckle(img, x, y, T, T, 'W', 3, 22); },
  water(img, x, y, base = 'B', hi = 'c', lo = 'b') {
    rect(img, x, y, T, T, base);
    for (let row = 0; row < 2; row++) {
      const wy = 3 + row * 8, off = row * 4;
      for (let k = 0; k < 2; k++) { const wx = (off + k * 8) % T; hline(img, x + wx, y + wy, 3, hi); hline(img, x + (wx + 1) % T, y + wy + 1, 3, lo); }
    }
    speckle(img, x, y, T, T, lo, 4, 31);
  },
  stone(img, x, y) {
    rect(img, x, y, T, T, 'm');
    for (const [sx, sy, w, h] of [[0, 0, 7, 7], [8, 0, 8, 7], [0, 8, 4, 8], [5, 8, 7, 8], [13, 8, 3, 8]]) {
      rect(img, x + sx + 1, y + sy + 1, w - 1, h - 1, 'S'); hline(img, x + sx + 1, y + sy + h - 1, w - 1, 's'); vline(img, x + sx + w - 1, y + sy + 1, h - 1, 's');
      px(img, x + sx + 1, y + sy + 1, 'W');
    }
  },
  planks(img, x, y, base = 'T', dark = 't', light = 'U') {
    rect(img, x, y, T, T, base);
    for (let r = 0; r < 4; r++) {
      hline(img, x, y + r * 4, T, light); hline(img, x, y + r * 4 + 3, T, dark);
      const j = (r * 5 + 3) % T; vline(img, x + j, y + r * 4, 3, dark);
    }
  },
  caveFloor(img, x, y, rough) {
    rect(img, x, y, T, T, 'n'); speckle(img, x, y, T, T, 'm', rough ? 10 : 7, 41); speckle(img, x, y, T, T, 'k', rough ? 8 : 5, 42);
    if (rough) for (const [a, b] of [[3, 4], [11, 3], [6, 11], [13, 12]]) { rect(img, x + a, y + b, 2, 2, 'm'); px(img, x + a, y + b, 's'); px(img, x + a + 1, y + b + 1, 'k'); }
  },
  wallpaper(img, x, y) {
    rect(img, x, y, T, T, 'e'); for (let i = 1; i < T; i += 4) vline(img, x + i, y, 13, 'U');
    hline(img, x, y + 13, T, 'T'); rect(img, x, y + 14, T, 2, 't');
  },
  wallPlain(img, x, y) {
    rect(img, x, y, T, T, 'e'); for (const r of [3, 7, 11]) hline(img, x, y + r, T, 'U');
    rect(img, x, y + 14, T, 2, 'u');
  }
};

/* ======================================================================
   Objects: drawn on a transparent canvas, outlined, then stamped
   ====================================================================== */
function obj(w, h, fn, line = 'K') { const o = new Image(w, h); fn(o); if (line) outline(o, line); return o; }
const stamp = (img, x, y, o, ox = 0, oy = 0) => blit(img, o, x + ox, y + oy);
// Crop a w*h part of a big object.
function part(o, sx, sy, w = T, h = T) { const out = new Image(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = ((sy + j) * o.w + sx + i) * 4; if (o.data[k + 3]) out.set(i, j, [o.data[k], o.data[k + 1], o.data[k + 2], o.data[k + 3]]); } return out; }

const O = {
  tree: obj(16, 16, o => { blob(o, 8, 6.5, 6.5, 6, { base: 'G', dark: 'g', deep: 'd', light: 'L' }); rect(o, 7, 12, 2, 3, 'T'); px(o, 8, 12, 't'); px(o, 8, 13, 't'); px(o, 8, 14, 't'); }),
  treeTop: obj(16, 16, o => blob(o, 8, 9, 7, 6.5, { base: 'G', dark: 'g', deep: 'd', light: 'L' })),
  bigTree: obj(32, 32, o => {
    blob(o, 16, 12, 14, 11.5, { base: 'G', dark: 'g', deep: 'd', light: 'L' });
    blob(o, 8, 15, 6, 6, { base: 'G', dark: 'g', deep: 'd', light: 'G' });
    blob(o, 24, 15, 6, 6, { base: 'g', dark: 'g', deep: 'd', light: 'G' });
    rect(o, 13, 22, 6, 9, 'T'); vline(o, 17, 22, 9, 't'); vline(o, 18, 22, 9, 't'); vline(o, 14, 24, 4, 'u');
    rect(o, 11, 29, 2, 2, 'T'); rect(o, 19, 29, 2, 2, 't'); hline(o, 13, 22, 6, 'd');
  }),
  rock: obj(16, 16, o => blob(o, 8, 9.5, 6.5, 5, { base: 's', dark: 'm', deep: 'n', light: 'S' })),
  boulder: obj(16, 16, o => { blob(o, 8, 8.5, 7, 6.8, { base: 's', dark: 'm', deep: 'n', light: 'S' }); px(o, 5, 5, 'W'); px(o, 6, 5, 'W'); px(o, 5, 6, 'W'); }),
  bush: obj(16, 16, o => { blob(o, 8, 10, 7, 5.5, { base: 'G', dark: 'g', deep: 'd', light: 'L' }); for (const [a, b] of [[5, 9], [10, 8], [8, 12]]) px(o, a, b, 'R'); }),
  flowers: obj(16, 16, o => {
    for (const [cx, cy, c] of [[3, 3, 'R'], [11, 4, 'Y'], [6, 10, 'W'], [13, 12, 'P'], [2, 13, 'Y']]) {
      px(o, cx, cy - 1, c); px(o, cx - 1, cy, c); px(o, cx + 1, cy, c); px(o, cx, cy + 1, c); px(o, cx, cy, 'y'); px(o, cx, cy + 2, 'g');
    }
  }, null),
  fenceH: obj(16, 16, o => {
    for (const x of [2, 12]) { rect(o, x, 3, 2, 12, 'T'); vline(o, x + 1, 3, 12, 't'); hline(o, x, 3, 2, 'U'); }
    for (const y of [5, 10]) { hline(o, 0, y, 16, 'U'); hline(o, 0, y + 1, 16, 'T'); }
  }),
  fenceV: obj(16, 16, o => {
    rect(o, 6, 0, 2, 16, 'U'); rect(o, 8, 0, 2, 16, 'T'); vline(o, 9, 0, 16, 't');
    for (const y of [1, 9]) { rect(o, 5, y, 6, 3, 'T'); hline(o, 5, y, 6, 'U'); hline(o, 5, y + 2, 6, 't'); }
  }),
  sign: obj(16, 16, o => {
    rect(o, 7, 9, 2, 6, 'T'); vline(o, 8, 9, 6, 't');
    rect(o, 2, 2, 12, 8, 'U'); hline(o, 2, 9, 12, 'T'); vline(o, 13, 2, 8, 'T'); hline(o, 2, 2, 12, 'e');
    hline(o, 4, 4, 8, 't'); hline(o, 4, 6, 6, 't');
  }),
  stump: obj(16, 16, o => {
    rect(o, 3, 8, 10, 6, 'T'); for (const x of [5, 8, 11]) vline(o, x, 9, 5, 't'); rect(o, 2, 13, 2, 1, 'T'); rect(o, 12, 13, 2, 1, 't');
    blob(o, 8, 8, 5, 2.6, { base: 'U', dark: 'u', light: 'e' }); hline(o, 6, 8, 4, 'u'); px(o, 8, 8, 'T');
  }),
  log: obj(16, 16, o => {
    rect(o, 3, 6, 13, 7, 'T'); hline(o, 3, 6, 13, 'u'); hline(o, 3, 12, 13, 't'); for (const x of [7, 11, 14]) vline(o, x, 8, 3, 't');
    blob(o, 3, 9.5, 2.6, 3.6, { base: 'U', dark: 'u', light: 'e' }); px(o, 3, 9, 'T');
  }),
  mushrooms: obj(16, 16, o => {
    for (const [x, y, s] of [[4, 8, 3], [10, 5, 2], [11, 11, 3]]) {
      rect(o, x - 1, y + 1, 2, s, 'e'); blob(o, x, y, s + 0.5, s * 0.7, { base: 'R', dark: 'r', light: 'q' }); px(o, x - 1, y - 1, 'W'); px(o, x + 1, y, 'W');
    }
  }),
  barrel: obj(16, 16, o => {
    blob(o, 8, 8.5, 5.5, 7, { base: 'T', dark: 't', light: 'u', deep: 'h' });
    for (const y of [4, 12]) hline(o, 3, y, 10, 'n'); blob(o, 8, 2.8, 4.2, 1.6, { base: 'u', dark: 'T', light: 'U' });
  }),
  well: obj(16, 16, o => {
    blob(o, 8, 9, 7, 6, { base: 's', dark: 'm', deep: 'n', light: 'S' }); blob(o, 8, 8.5, 4.5, 3.2, { base: 'k', dark: 'K', light: 'b' });
    hline(o, 5, 8, 2, 'B');
  }),
  lampBase: obj(16, 16, o => { rect(o, 7, 0, 2, 13, 'n'); vline(o, 7, 0, 13, 'm'); rect(o, 5, 13, 6, 3, 'n'); hline(o, 5, 13, 6, 'm'); }),
  lampTop: obj(16, 16, o => {
    rect(o, 7, 14, 2, 2, 'n'); rect(o, 4, 6, 8, 2, 'n'); rect(o, 5, 8, 6, 6, 'Y'); rect(o, 6, 9, 2, 3, 'W'); vline(o, 10, 8, 6, 'y');
    hline(o, 5, 13, 6, 'n'); px(o, 8, 5, 'n');
  }),
  mailbox: obj(16, 16, o => { rect(o, 7, 9, 2, 6, 'T'); rect(o, 4, 3, 8, 6, 'R'); hline(o, 4, 3, 8, 'q'); hline(o, 4, 8, 8, 'r'); rect(o, 11, 2, 1, 4, 'y'); hline(o, 5, 6, 3, 'r'); }),
  table: obj(16, 16, o => {
    rect(o, 0, 3, 16, 6, 'U'); hline(o, 0, 3, 16, 'e'); rect(o, 0, 9, 16, 3, 'T'); hline(o, 0, 11, 16, 't');
    for (const x of [1, 13]) { rect(o, x, 12, 2, 4, 'T'); vline(o, x + 1, 12, 4, 't'); }
  })
};
O.bigParts = [part(O.bigTree, 0, 0), part(O.bigTree, 16, 0), part(O.bigTree, 0, 16), part(O.bigTree, 16, 16)];

/* ======================================================================
   Tileset builder
   ====================================================================== */
const t = (name, flags, draw, extra) => Object.assign({ name, pass: flags.includes('P'), enc: flags.includes('E'), over: flags.includes('A'), draw }, extra || {});
// flags: P = walkable, E = wild encounters, A = drawn above the player. Blocked tiles: ''.

function buildTileset(id, name, description, cols, defs) {
  const rows = Math.ceil(defs.length / cols);
  const img = new Image(cols * T, rows * T);
  defs.forEach((d, i) => d.draw(img, (i % cols) * T, Math.floor(i / cols) * T));
  write('tilesets/' + id + '.png', img.toPNG());
  json('tilesets/' + id + '.tiles.json', {
    name, description, image: id + '.png', tileSize: T, columns: cols, author: AUTHOR, licence: LICENCE,
    legend: { pass: 'player can walk on it', enc: 'wild monsters can appear here', over: 'drawn above the player', layer: 'suggested layer: ground, detail or above',
      auto: 'autotile: this tile starts a 2x3 block that joins up with its neighbours', anim: 'number of animation frames, placed side by side to the right', part: 'part of an autotile block or an animation frame (not painted directly)' },
    animSpeed: 300,
    tiles: defs.map((d, i) => {
      const o = { id: i, name: d.name, pass: d.pass, enc: d.enc, over: d.over, layer: d.layer || (d.over ? 'above' : 'ground') };
      if (d.group) o.group = d.group;
      if (d.auto) o.auto = true;
      if (d.anim) o.anim = d.anim;
      if (d.part) o.part = true;
      return o;
    })
  });
  return img;
}

/* ---------------- Autotiles (2x3 tile blocks, RPG Maker A2 layout) ---------------- */
// Patterns repeat every 16 px so quarter-tiles taken from anywhere in the block join seamlessly.
const hash = (x, y, s) => { let v = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; v = (v ^ (v >>> 13)) * 1274126177; return ((v ^ (v >>> 16)) >>> 0) / 4294967295; };
const waterPx = f => (x, y) => {
  const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
  for (const [row, off] of [[3, 2], [11, 10]]) {
    const s1 = (off + f * 2) % 16, s2 = (off + 8 + f * 2) % 16;
    const inSeg = (a, st) => ((a - st + 16) % 16) < 3;
    if (Y === row && (inSeg(X, s1) || inSeg(X, s2))) return 'c';
    if (Y === row + 1 && (inSeg(X - 1, s1) || inSeg(X - 1, s2))) return 'b';
  }
  return hash(X, Y, 31 + f) < 0.03 ? 'b' : 'B';
};
const dirtPx = (x, y) => { const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16, r = hash(X, Y, 11); return r < 0.06 ? 'u' : r < 0.09 ? 'e' : r < 0.1 ? 'T' : 'U'; };
// edge(d) gives the colour for a pixel d pixels in from the outside edge, or null for the body.
const sandEdge = (d, x, y) => d < 2 ? (hash(x & 15, y & 15, 5) < 0.2 ? 'U' : 'e') : d === 2 ? 'W' : null;
const grassEdge = (d, x, y) => d < 2 ? (hash(x & 15, y & 15, 7) < 0.25 ? 'g' : 'G') : d === 2 ? 'u' : null;
function autoBlock(body, edge) {
  const img = new Image(32, 48);
  const put = (x, y, d, gx, gy) => { const c = edge(d, gx, gy); px(img, x, y, c || body(gx, gy)); };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, Math.min(x, 15 - x, y, 15 - y), x, y); // preview: an island
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { // inner corners: edge only in the four corners
    const cx = Math.min(x, 15 - x), cy = Math.min(y, 15 - y);
    put(16 + x, y, Math.max(cx, cy), x, y);
  }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) put(x, 16 + y, Math.min(x, 31 - x, y, 31 - y), x, y); // the 2x2 block
  return img;
}
// Returns the tile defs for rows of 8 columns holding autotile blocks side by side (each block is 2 wide, 3 tall).
function autotileRows(blocks) {
  const defs = [];
  for (let r = 0; r < 3; r++) blocks.forEach(b => { for (let c = 0; c < 2; c++) {
    const piece = part(b.img, c * 16, r * 16);
    const anchor = r === 0 && c === 0 && b.anchor;
    defs.push(t(anchor ? b.name : b.name + ' (part)', b.flags, (i, x, y) => stamp(i, x, y, piece), Object.assign({ layer: b.layer || 'ground' }, anchor ? b.extra : { part: true })));
  } });
  return defs;
}
const waterFrames = [0, 1, 2].map(f => autoBlock(waterPx(f), sandEdge));
const pathBlock = autoBlock(dirtPx, grassEdge);

/* ---------------- Outdoor (first 16 tiles keep the sample project's layout) ---------------- */
const on = (base, o, ox, oy) => (img, x, y) => { if (base) base(img, x, y); stamp(img, x, y, o, ox, oy); };
const det = { layer: 'detail' };
const outdoor = [
  t('Grass', 'P', (i, x, y) => G.grass(i, x, y)),
  t('Tall grass', 'PE', (i, x, y) => G.tall(i, x, y, 'g', 'G', 'd')),
  t('Dirt path', 'P', G.dirt),
  t('Water', '', (i, x, y) => G.water(i, x, y)),
  t('Tree', '', on(null, O.tree), det),
  t('Rock', '', on(null, O.rock), det),
  t('Flowers', 'P', on(null, O.flowers), det),
  t('Fence', '', on(null, O.fenceH), det),
  t('Roof (red)', '', (i, x, y) => roof(i, x, y, 'R', 'r', 'q', 'M')),
  t('House wall with windows', '', (i, x, y) => { G.wallPlain(i, x, y); win(i, x + 2, y + 4); win(i, x + 9, y + 4); }),
  t('House door', 'P', (i, x, y) => { G.wallPlain(i, x, y); door(i, x, y, 'T', 't'); }),
  t('Wooden floor', 'P', (i, x, y) => G.planks(i, x, y)),
  t('Sand', 'P', G.sand),
  t('Sign', '', on(null, O.sign), det),
  t('Tree top', 'PA', on(null, O.treeTop), { layer: 'above' }),
  t('Table', '', on(null, O.table), det),
  // row 2
  t('Grass (variant)', 'P', (i, x, y) => G.grass(i, x, y, 1)),
  t('Tall grass (dark)', 'PE', (i, x, y) => G.tall(i, x, y, 'd', 'g', 'D')),
  t('Stone path', 'P', G.stone),
  t('Shore (top)', '', (i, x, y) => { G.water(i, x, y); G.sand(i, x, y); rect(i, x, y + 5, T, 11, 'B'); G.water(i, x, y + 0); rect(i, x, y, T, 5, 'e'); speckle(i, x, y, T, 5, 'U', 5, 51); hline(i, x, y + 5, T, 'W'); for (let k = 0; k < T; k += 3) px(i, x + k, y + 6, 'c'); }),
  t('Big tree (top left)', 'PA', on(null, O.bigParts[0]), { layer: 'above', group: 'Big tree 2x2' }),
  t('Big tree (top right)', 'PA', on(null, O.bigParts[1]), { layer: 'above', group: 'Big tree 2x2' }),
  t('Bush', '', on(null, O.bush), det),
  t('Tree stump', '', on(null, O.stump), det),
  // row 3
  t('Lily pad', '', (i, x, y) => { G.water(i, x, y); stamp(i, x, y, obj(16, 16, o => { blob(o, 8, 9, 5.5, 4, { base: 'G', dark: 'g', light: 'L' }); px(o, 8, 6, '.'); rect(o, 8, 5, 1, 4, 'B'); px(o, 6, 8, 'P'); px(o, 7, 8, 'q'); }, 'd')); }),
  t('Shore (bottom)', '', (i, x, y) => { G.water(i, x, y); rect(i, x, y + 11, T, 5, 'e'); speckle(i, x, y + 11, T, 5, 'U', 5, 52); hline(i, x, y + 10, T, 'W'); for (let k = 1; k < T; k += 3) px(i, x + k, y + 9, 'c'); }),
  t('Ledge', '', (i, x, y) => { G.grass(i, x, y); rect(i, x, y + 6, T, 10, 'u'); hline(i, x, y + 6, T, 'g'); hline(i, x, y + 7, T, 'T'); for (const r of [10, 13]) for (let k = (r % 3); k < T; k += 5) hline(i, x + k, y + r, 3, 'T'); hline(i, x, y + 15, T, 't'); }),
  t('Boulder', '', on(null, O.boulder), det),
  t('Big tree (bottom left)', '', on(null, O.bigParts[2]), { layer: 'detail', group: 'Big tree 2x2' }),
  t('Big tree (bottom right)', '', on(null, O.bigParts[3]), { layer: 'detail', group: 'Big tree 2x2' }),
  t('Mushrooms', 'P', on(null, O.mushrooms), det),
  t('Log', '', on(null, O.log), det),
  // row 4
  t('Bridge (left-right)', 'P', (i, x, y) => { G.water(i, x, y); rect(i, x, y + 2, T, 12, 'T'); for (let k = 3; k < T; k += 4) vline(i, x + k, y + 2, 12, 't'); hline(i, x, y + 2, T, 'U'); hline(i, x, y + 1, T, 't'); hline(i, x, y + 14, T, 't'); }),
  t('Bridge (up-down)', 'P', (i, x, y) => { G.water(i, x, y); rect(i, x + 2, y, 12, T, 'T'); for (let k = 3; k < T; k += 4) hline(i, x + 2, y + k, 12, 't'); vline(i, x + 2, y, T, 'U'); vline(i, x + 1, y, T, 't'); vline(i, x + 14, y, T, 't'); }),
  t('Fence (up-down)', '', on(null, O.fenceV), det),
  t('Well', '', on(null, O.well), det),
  t('Lamp post (bottom)', '', on(null, O.lampBase), { layer: 'detail', group: 'Lamp post 1x2' }),
  t('Lamp post (top)', 'PA', on(null, O.lampTop), { layer: 'above', group: 'Lamp post 1x2' }),
  t('Mailbox', '', on(null, O.mailbox), det),
  t('Barrel', '', on(null, O.barrel), det),
  // rows 5-7: autotiles. Water (animated, 3 frames side by side) and a dirt path.
  ...autotileRows([
    { img: waterFrames[0], name: 'Water (autotile, animated)', flags: '', anchor: true, extra: { auto: true, anim: 3 } },
    { img: waterFrames[1], name: 'Water frame 2', flags: '' },
    { img: waterFrames[2], name: 'Water frame 3', flags: '' },
    { img: pathBlock, name: 'Dirt path (autotile)', flags: 'P', anchor: true, extra: { auto: true } }
  ])
];

/* ---------------- Building pieces ---------------- */
function roof(img, x, y, base, dark, light, edge, eave) {
  rect(img, x, y, T, T, base);
  for (let b = 0; b < 4; b++) {
    const yy = y + b * 4; hline(img, x, yy, T, light); hline(img, x, yy + 3, T, dark);
    for (let k = (b % 2) * 4; k < T; k += 8) vline(img, x + k, yy + 1, 2, dark);
  }
  if (edge === 'L') { vline(img, x, y, T, 'K'); vline(img, x + 1, y, T, dark); }
  if (edge === 'R') { vline(img, x + 15, y, T, 'K'); vline(img, x + 14, y, T, dark); }
  if (eave) { rect(img, x, y + 12, T, 2, dark); hline(img, x, y + 14, T, 'K'); hline(img, x, y + 15, T, 'k'); }
}
function win(img, x, y, w = 5, h = 5) {
  rect(img, x, y, w, h, 't'); rect(img, x + 1, y + 1, w - 2, h - 2, 'B'); px(img, x + 1, y + 1, 'c'); px(img, x + 2, y + 1, 'c');
  hline(img, x - 1, y + h, w + 2, 'S');
}
function door(img, x, y, base, dark, knob = 'y') {
  rect(img, x + 3, y + 2, 10, 14, 'K'); rect(img, x + 4, y + 3, 8, 13, base); vline(img, x + 8, y + 3, 13, dark);
  rect(img, x + 5, y + 5, 2, 4, dark); rect(img, x + 9, y + 5, 2, 4, dark); px(img, x + 10, y + 11, knob);
}
const icon = (img, x, y, plate, plateDark, rows) => { rect(img, x + 3, y + 2, 10, 9, 'K'); rect(img, x + 4, y + 3, 8, 7, plate); hline(img, x + 4, y + 9, 8, plateDark); spr(img, x + 5, y + 4, rows); };

const town = [
  t('Roof red (left)', '', (i, x, y) => roof(i, x, y, 'R', 'r', 'q', 'L')),
  t('Roof red (middle)', '', (i, x, y) => roof(i, x, y, 'R', 'r', 'q', 'M')),
  t('Roof red (right)', '', (i, x, y) => roof(i, x, y, 'R', 'r', 'q', 'R')),
  t('Roof red (bottom edge)', '', (i, x, y) => roof(i, x, y, 'R', 'r', 'q', 'M', true)),
  t('Roof blue (left)', '', (i, x, y) => roof(i, x, y, 'B', 'b', 'c', 'L')),
  t('Roof blue (middle)', '', (i, x, y) => roof(i, x, y, 'B', 'b', 'c', 'M')),
  t('Roof blue (right)', '', (i, x, y) => roof(i, x, y, 'B', 'b', 'c', 'R')),
  t('Roof blue (bottom edge)', '', (i, x, y) => roof(i, x, y, 'B', 'b', 'c', 'M', true)),
  t('Roof green (left)', '', (i, x, y) => roof(i, x, y, 'g', 'd', 'G', 'L')),
  t('Roof green (middle)', '', (i, x, y) => roof(i, x, y, 'g', 'd', 'G', 'M')),
  t('Roof green (right)', '', (i, x, y) => roof(i, x, y, 'g', 'd', 'G', 'R')),
  t('Roof green (bottom edge)', '', (i, x, y) => roof(i, x, y, 'g', 'd', 'G', 'M', true)),
  t('Chimney', '', (i, x, y) => { roof(i, x, y, 'R', 'r', 'q', 'M'); rect(i, x + 5, y + 1, 7, 13, 'K'); rect(i, x + 6, y + 2, 5, 11, 'x'); for (const r of [4, 7, 10]) hline(i, x + 6, y + r, 5, 'r'); rect(i, x + 5, y + 1, 7, 2, 'n'); }),
  t('Wall', '', G.wallPlain),
  t('Wall with window', '', (i, x, y) => { G.wallPlain(i, x, y); win(i, x + 5, y + 4, 6, 6); }),
  t('Brick wall', '', (i, x, y) => { rect(i, x, y, T, T, 't'); for (let r = 0; r < 4; r++) for (let k = (r % 2) * 4 - 4; k < T; k += 8) rect(i, x + Math.max(0, k + 1), y + r * 4 + 1, Math.min(7, 7 + Math.min(0, k + 1), T - Math.max(0, k + 1)), 3, 'x'); }),
  t('Door (wood)', 'P', (i, x, y) => { G.wallPlain(i, x, y); door(i, x, y, 'T', 't'); }),
  t('Door (shop)', 'P', (i, x, y) => { G.wallPlain(i, x, y); door(i, x, y, 'B', 'b', 'W'); rect(i, x + 5, y + 4, 6, 3, 'c'); }),
  t('Door (healer)', 'P', (i, x, y) => { G.wallPlain(i, x, y); rect(i, x + 2, y + 2, 12, 14, 'K'); rect(i, x + 3, y + 3, 10, 13, 'c'); vline(i, x + 8, y + 3, 13, 'S'); rect(i, x + 4, y + 4, 2, 5, 'W'); rect(i, x + 9, y + 4, 2, 5, 'W'); }),
  t('Shop sign', '', (i, x, y) => { G.wallPlain(i, x, y); icon(i, x, y, 'B', 'b', ['.W..W.', 'WWWWWW', 'WWWWWW', 'WWWWWW']); }),
  t('Healer sign', '', (i, x, y) => { G.wallPlain(i, x, y); icon(i, x, y, 'R', 'r', ['..WW..', 'WWWWWW', 'WWWWWW', '..WW..', '..WW..'].slice(0, 4)); }),
  t('Big window', '', (i, x, y) => { G.wallPlain(i, x, y); win(i, x + 1, y + 3, 14, 8); vline(i, x + 8, y + 4, 6, 't'); }),
  t('Stone wall', '', (i, x, y) => { G.stone(i, x, y); hline(i, x, y, T, 'S'); hline(i, x, y + 15, T, 'n'); }),
  t('Paving', 'P', (i, x, y) => { rect(i, x, y, T, T, 'U'); for (let r = 0; r < 4; r++) { hline(i, x, y + r * 4 + 3, T, 'u'); for (let k = (r % 2) * 4; k < T; k += 8) vline(i, x + k, y + r * 4, 3, 'u'); } }),
  t('Hedge', '', (i, x, y) => { rect(i, x, y + 3, T, 13, 'g'); blob(i, x + 4, y + 7, 5, 5, { base: 'G', dark: 'g', light: 'L' }); blob(i, x + 12, y + 7, 5, 5, { base: 'G', dark: 'g', light: 'L' }); hline(i, x, y + 15, T, 'd'); }, det),
  t('Flower bed', '', (i, x, y) => { rect(i, x, y + 4, T, 12, 'T'); rect(i, x + 1, y + 5, 14, 9, 't'); stamp(i, x, y + 1, O.flowers); hline(i, x, y + 15, T, 'h'); }, det),
  t('Bench', '', on(null, obj(16, 16, o => { rect(o, 1, 5, 14, 3, 'T'); hline(o, 1, 5, 14, 'U'); rect(o, 1, 9, 14, 3, 'T'); hline(o, 1, 9, 14, 'U'); for (const x of [2, 12]) rect(o, x, 12, 2, 3, 'n'); })), det),
  t('Crates', '', on(null, obj(16, 16, o => { for (const [a, b] of [[0, 6], [8, 6], [4, 0]]) { rect(o, a + 1, b + 1, 7, 7, 'U'); rect(o, a + 2, b + 2, 5, 5, 'T'); px(o, a + 2, b + 2, 'U'); px(o, a + 6, b + 6, 'U'); px(o, a + 4, b + 4, 'U'); } })), det),
  t('Flower pot', '', on(null, obj(16, 16, o => { rect(o, 5, 10, 6, 5, 'O'); hline(o, 4, 10, 8, 'x'); blob(o, 8, 6.5, 5, 4.5, { base: 'G', dark: 'g', light: 'L' }); px(o, 6, 5, 'R'); px(o, 10, 7, 'Y'); })), det),
  t('Steps', 'P', (i, x, y) => { for (let r = 0; r < 4; r++) { rect(i, x, y + r * 4, T, 4, r % 2 ? 's' : 'S'); hline(i, x, y + r * 4 + 3, T, 'm'); } }),
  t('Awning (red)', '', (i, x, y) => { for (let k = 0; k < T; k += 4) { rect(i, x + k, y, 2, 12, 'R'); rect(i, x + k + 2, y, 2, 12, 'W'); } for (let k = 0; k < T; k += 4) { px(i, x + k + 1, y + 12, 'R'); px(i, x + k + 3, y + 12, 'W'); } hline(i, x, y, T, 'r'); }, { layer: 'detail' }),
  t('Awning (blue)', '', (i, x, y) => { for (let k = 0; k < T; k += 4) { rect(i, x + k, y, 2, 12, 'B'); rect(i, x + k + 2, y, 2, 12, 'W'); } for (let k = 0; k < T; k += 4) { px(i, x + k + 1, y + 12, 'B'); px(i, x + k + 3, y + 12, 'W'); } hline(i, x, y, T, 'b'); }, { layer: 'detail' })
];

/* ---------------- Interior ---------------- */
const shelf = obj(16, 32, o => {
  rect(o, 0, 0, 16, 32, 'T'); rect(o, 1, 1, 14, 30, 't');
  for (const sy of [2, 10, 18, 26]) {
    hline(o, 1, sy + 6, 14, 'T'); let x = 2; const r = rng(sy);
    while (x < 14) { const w = 1 + Math.floor(r() * 2); const c = 'RBGyPo'[Math.floor(r() * 6)]; rect(o, x, sy + 1 + Math.floor(r() * 2), w, 5, c); x += w + 1; }
  }
});
const bed = obj(16, 32, o => {
  rect(o, 0, 0, 16, 32, 'T'); rect(o, 1, 2, 14, 28, 'W'); rect(o, 2, 3, 12, 6, 'S'); rect(o, 3, 4, 10, 4, 'W');
  rect(o, 1, 10, 14, 20, 'R'); hline(o, 1, 10, 14, 'q'); hline(o, 1, 11, 14, 'W'); for (const y of [16, 22]) hline(o, 2, y, 12, 'r'); vline(o, 14, 12, 18, 'r');
});
const counter = edge => (i, x, y) => {
  rect(i, x, y + 2, T, 4, 'U'); hline(i, x, y + 2, T, 'e'); rect(i, x, y + 6, T, 10, 'T'); hline(i, x, y + 6, T, 't'); hline(i, x, y + 15, T, 'h');
  for (let k = 2; k < T; k += 7) rect(i, x + k, y + 8, 5, 6, 't');
  if (edge === 'L') { vline(i, x, y + 2, 14, 'K'); } if (edge === 'R') { vline(i, x + 15, y + 2, 14, 'K'); }
  hline(i, x, y + 1, T, 'K');
};
const interior = [
  t('Wooden floor', 'P', (i, x, y) => G.planks(i, x, y, 'u', 'T', 'U')),
  t('Tiled floor', 'P', (i, x, y) => { for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) rect(i, x + a * 8, y + b * 8, 8, 8, (a + b) % 2 ? 'S' : 'W'); hline(i, x, y + 7, T, 's'); hline(i, x, y + 15, T, 's'); vline(i, x + 7, y, T, 's'); vline(i, x + 15, y, T, 's'); }),
  t('Carpet (red)', 'P', (i, x, y) => { rect(i, x, y, T, T, 'R'); for (const [a, b] of [[3, 3], [11, 11]]) { px(i, x + a, y + b - 1, 'q'); px(i, x + a - 1, y + b, 'q'); px(i, x + a + 1, y + b, 'q'); px(i, x + a, y + b + 1, 'q'); } speckle(i, x, y, T, T, 'r', 6, 61); }),
  t('Carpet (blue)', 'P', (i, x, y) => { rect(i, x, y, T, T, 'b'); for (const [a, b] of [[3, 3], [11, 11]]) { px(i, x + a, y + b - 1, 'B'); px(i, x + a - 1, y + b, 'B'); px(i, x + a + 1, y + b, 'B'); px(i, x + a, y + b + 1, 'B'); } speckle(i, x, y, T, T, 'n', 6, 62); }),
  t('Wall top', '', (i, x, y) => { rect(i, x, y, T, T, 'n'); hline(i, x, y + 15, T, 'k'); speckle(i, x, y, T, 14, 'm', 5, 63); }),
  t('Wallpaper', '', G.wallpaper),
  t('Wall with window', '', (i, x, y) => { G.wallpaper(i, x, y); rect(i, x + 2, y + 2, 12, 9, 't'); rect(i, x + 3, y + 3, 10, 7, 'B'); blob(i, x + 6, y + 6, 2.5, 1.3, { base: 'W' }); vline(i, x + 8, y + 3, 7, 't'); hline(i, x + 1, y + 11, 14, 'S'); }),
  t('Wall with picture', '', (i, x, y) => { G.wallpaper(i, x, y); rect(i, x + 3, y + 2, 10, 8, 'y'); rect(i, x + 4, y + 3, 8, 6, 'B'); rect(i, x + 4, y + 6, 8, 3, 'G'); px(i, x + 6, y + 4, 'Y'); }),
  t('Bookshelf (top)', '', on(null, part(shelf, 0, 0)), { layer: 'detail', group: 'Bookshelf 1x2' }),
  t('Bookshelf (bottom)', '', on(null, part(shelf, 0, 16)), { layer: 'detail', group: 'Bookshelf 1x2' }),
  t('Bed (top)', '', on(null, part(bed, 0, 0)), { layer: 'detail', group: 'Bed 1x2' }),
  t('Bed (bottom)', '', on(null, part(bed, 0, 16)), { layer: 'detail', group: 'Bed 1x2' }),
  t('Table', '', on(null, O.table), det),
  t('Chair', '', on(null, obj(16, 16, o => { rect(o, 4, 1, 8, 7, 'T'); hline(o, 4, 1, 8, 'U'); rect(o, 3, 8, 10, 3, 'U'); hline(o, 3, 10, 10, 'T'); for (const x of [4, 11]) rect(o, x, 11, 1, 4, 't'); })), det),
  t('House plant', '', on(null, obj(16, 16, o => { rect(o, 5, 10, 6, 5, 'O'); hline(o, 4, 10, 8, 'x'); for (const [a, b, r] of [[8, 5, 4], [5, 7, 3], [11, 7, 3]]) blob(o, a, b, r, r, { base: 'G', dark: 'g', light: 'L' }); })), det),
  t('Television', '', on(null, obj(16, 16, o => { rect(o, 1, 2, 14, 10, 'k'); rect(o, 2, 3, 12, 8, 'b'); px(o, 3, 4, 'c'); px(o, 4, 4, 'c'); px(o, 3, 5, 'c'); rect(o, 6, 12, 4, 2, 'n'); hline(o, 4, 14, 8, 'n'); })), det),
  t('Counter (left)', '', counter('L')),
  t('Counter (middle)', '', counter('M')),
  t('Counter (right)', '', counter('R')),
  t('Healing machine', '', on(null, obj(16, 16, o => { rect(o, 1, 3, 14, 12, 'S'); hline(o, 1, 3, 14, 'W'); hline(o, 1, 14, 14, 's'); for (let k = 0; k < 3; k++) { blob(o, 4 + k * 4, 8, 1.6, 1.6, { base: 'R', light: 'q' }); px(o, 4 + k * 4, 9, 'W'); } rect(o, 3, 12, 10, 1, 'P'); })), det),
  t('Computer', '', on(null, obj(16, 16, o => { rect(o, 3, 1, 10, 8, 'S'); rect(o, 4, 2, 8, 6, 'B'); px(o, 5, 3, 'c'); rect(o, 7, 9, 2, 2, 's'); rect(o, 2, 11, 12, 3, 'S'); for (let k = 3; k < 13; k += 2) px(o, k, 12, 'm'); })), det),
  t('Stairs up', 'P', (i, x, y) => { for (let r = 0; r < 4; r++) { rect(i, x, y + r * 4, T, 4, ['W', 'S', 's', 'm'][r]); hline(i, x, y + r * 4 + 3, T, 'n'); } vline(i, x, y, T, 'K'); vline(i, x + 15, y, T, 'K'); }),
  t('Stairs down', 'P', (i, x, y) => { rect(i, x, y, T, T, 'K'); for (let r = 0; r < 3; r++) { rect(i, x + 2, y + 2 + r * 4, 12, 3, ['s', 'm', 'n'][r]); } vline(i, x + 1, y, T, 'S'); vline(i, x + 14, y, T, 'S'); }),
  t('Door mat', 'P', (i, x, y) => { G.planks(i, x, y, 'u', 'T', 'U'); rect(i, x + 1, y + 4, 14, 9, 'x'); rect(i, x + 2, y + 5, 12, 7, 'O'); for (let k = 3; k < 13; k += 2) vline(i, x + k, y + 6, 5, 'x'); }),
  t('Cupboard', '', on(null, obj(16, 16, o => { rect(o, 1, 1, 14, 14, 'T'); hline(o, 1, 1, 14, 'U'); vline(o, 8, 2, 13, 't'); rect(o, 2, 3, 5, 10, 'u'); rect(o, 9, 3, 5, 10, 'u'); px(o, 6, 8, 'y'); px(o, 10, 8, 'y'); })), det),
  t('Fridge', '', on(null, obj(16, 16, o => { rect(o, 2, 0, 12, 16, 'W'); hline(o, 2, 6, 12, 's'); vline(o, 13, 0, 16, 'S'); rect(o, 11, 2, 1, 3, 'm'); rect(o, 11, 8, 1, 5, 'm'); })), det),
  t('Stove', '', on(null, obj(16, 16, o => { rect(o, 1, 1, 14, 14, 'n'); rect(o, 1, 1, 14, 6, 'm'); for (const a of [4, 11]) blob(o, a, 4, 2, 1.6, { base: 'k', dark: 'K' }); px(o, 4, 4, 'R'); rect(o, 3, 9, 10, 4, 'k'); hline(o, 4, 10, 8, 's'); })), det),
  t('Sink', '', on(null, obj(16, 16, o => { rect(o, 1, 3, 14, 12, 'S'); hline(o, 1, 3, 14, 'W'); rect(o, 3, 5, 10, 5, 's'); rect(o, 4, 6, 8, 3, 'B'); rect(o, 7, 1, 2, 4, 'm'); rect(o, 3, 11, 10, 3, 'T'); })), det),
  t('Crate', '', on(null, obj(16, 16, o => { rect(o, 1, 2, 14, 13, 'U'); rect(o, 2, 3, 12, 11, 'T'); for (let k = 0; k < 11; k++) { px(o, 2 + k, 3 + k, 'U'); px(o, 13 - k, 3 + k, 'U'); } })), det),
  t('Wall clock', '', (i, x, y) => { G.wallpaper(i, x, y); stamp(i, x, y, obj(16, 16, o => { blob(o, 8, 6, 4.5, 4.5, { base: 'W', dark: 'S' }); vline(o, 8, 3, 3, 'K'); hline(o, 8, 6, 3, 'K'); }, 'T')); }),
  t('Floor lamp', '', on(null, obj(16, 16, o => { rect(o, 7, 6, 2, 8, 'n'); hline(o, 5, 14, 6, 'n'); rect(o, 4, 0, 8, 6, 'Y'); hline(o, 4, 5, 8, 'y'); px(o, 5, 1, 'W'); })), det),
  t('Vase', '', on(null, obj(16, 16, o => { blob(o, 8, 11, 3.5, 3.5, { base: 'P', dark: 'p', light: 'q' }); rect(o, 7, 6, 2, 3, 'P'); for (const [a, b, c] of [[5, 3, 'R'], [8, 1, 'Y'], [11, 3, 'W']]) { px(o, a, b, c); px(o, a + 1, b, c); px(o, a, b + 1, c); vline(o, a, b + 2, 3, 'g'); } })), det)
];

/* ---------------- Cave ---------------- */
const crystal = obj(16, 16, o => { for (const [a, h] of [[5, 9], [8, 12], [11, 7]]) { rect(o, a - 1, 15 - h, 3, h, 'B'); vline(o, a - 1, 15 - h, h, 'c'); px(o, a, 14 - h, 'c'); px(o, a - 1, 16 - h, 'W'); } hline(o, 3, 15, 10, 'b'); });
const wallFace = (i, x, y) => { rect(i, x, y, T, T, 'm'); for (const r of [4, 9, 13]) for (let k = (r % 4); k < T; k += 6) hline(i, x + k, y + r, 4, 'n'); speckle(i, x, y, T, T, 's', 6, 71); hline(i, x, y, T, 'k'); hline(i, x, y + 15, T, 'n'); };
const cave = [
  t('Cave floor', 'P', (i, x, y) => G.caveFloor(i, x, y)),
  t('Rough floor', 'PE', (i, x, y) => G.caveFloor(i, x, y, true)),
  t('Cave wall (top)', '', (i, x, y) => { rect(i, x, y, T, T, 'k'); speckle(i, x, y, T, T, 'n', 9, 72); speckle(i, x, y, T, T, 'K', 6, 73); }),
  t('Cave wall (face)', '', wallFace),
  t('Rock', '', on(null, O.rock), det),
  t('Boulder', '', on(null, O.boulder), det),
  t('Crystal', '', on(null, crystal), det),
  t('Stalagmite', '', on(null, obj(16, 16, o => { for (let r = 0; r < 13; r++) { const w = 1 + Math.floor(r / 2); hline(o, 8 - w, 2 + r, w * 2, r % 3 ? 'm' : 's'); px(o, 8 + w - 1, 2 + r, 'n'); } })), det),
  t('Ladder up', 'P', (i, x, y) => { G.caveFloor(i, x, y); rect(i, x + 3, y, 2, 14, 'T'); rect(i, x + 11, y, 2, 14, 'T'); for (let r = 1; r < 14; r += 3) hline(i, x + 5, y + r, 6, 'U'); }),
  t('Hole down', 'P', (i, x, y) => { G.caveFloor(i, x, y); blob(i, x + 8, y + 8, 6.5, 5.5, { base: 'K' }); hline(i, x + 4, y + 4, 8, 'k'); rect(i, x + 5, y + 5, 1, 7, 'T'); rect(i, x + 10, y + 5, 1, 7, 'T'); hline(i, x + 6, y + 7, 4, 'u'); hline(i, x + 6, y + 10, 4, 'u'); }),
  t('Cave water', '', (i, x, y) => G.water(i, x, y, 'b', 'B', 'k')),
  t('Puddle', 'P', (i, x, y) => { G.caveFloor(i, x, y); blob(i, x + 8, y + 9, 5.5, 3.5, { base: 'b', light: 'B' }); px(i, x + 6, y + 8, 'c'); }),
  t('Rubble', 'P', (i, x, y) => { G.caveFloor(i, x, y); for (const [a, b] of [[3, 3], [10, 5], [6, 11], [12, 12], [2, 9]]) { px(i, x + a, y + b, 's'); px(i, x + a + 1, y + b, 'm'); px(i, x + a, y + b + 1, 'n'); } }),
  t('Glowing mushrooms', 'P', on(null, obj(16, 16, o => { for (const [a, b, s] of [[4, 8, 2.5], [10, 5, 2], [11, 11, 2.5]]) { rect(o, a, b + 1, 1, 3, 'S'); blob(o, a, b, s + 0.5, s * 0.7, { base: 'c', dark: 'B', light: 'W' }); } })), det),
  t('Old bones', 'P', on(null, obj(16, 16, o => { hline(o, 3, 9, 9, 'S'); for (const [a, b] of [[2, 8], [2, 10], [12, 8], [12, 10]]) px(o, a, b, 'W'); blob(o, 11, 4, 2.5, 2, { base: 'W', dark: 'S' }); px(o, 10, 4, 'K'); px(o, 12, 4, 'K'); }, 'n')), det),
  t('Cave entrance', 'P', (i, x, y) => { wallFace(i, x, y); blob(i, x + 8, y + 10, 6, 8, { base: 'K' }); rect(i, x + 2, y + 10, 12, 6, 'K'); }),
  t('Cave wall (right half)', '', (i, x, y) => { G.caveFloor(i, x, y); const o = new Image(T, T); wallFace(o, 0, 0); for (let r = 0; r < T; r++) for (let k = 0; k < T; k++) if (k > 7) { const q = (r * T + k) * 4; i.set(x + k, y + r, [o.data[q], o.data[q + 1], o.data[q + 2], 255]); } vline(i, x + 8, y, T, 'k'); }),
  t('Cave wall (left half)', '', (i, x, y) => { G.caveFloor(i, x, y); const o = new Image(T, T); wallFace(o, 0, 0); for (let r = 0; r < T; r++) for (let k = 0; k < T; k++) if (k < 8) { const q = (r * T + k) * 4; i.set(x + k, y + r, [o.data[q], o.data[q + 1], o.data[q + 2], 255]); } vline(i, x + 7, y, T, 'k'); }),
  t('Sand floor', 'P', (i, x, y) => { rect(i, x, y, T, T, 'u'); speckle(i, x, y, T, T, 'T', 12, 81); speckle(i, x, y, T, T, 'U', 5, 82); }),
  t('Rough sand', 'PE', (i, x, y) => { rect(i, x, y, T, T, 'T'); speckle(i, x, y, T, T, 't', 16, 83); speckle(i, x, y, T, T, 'u', 8, 84); for (const [a, b] of [[4, 4], [11, 9]]) { px(i, x + a, y + b, 'U'); px(i, x + a + 1, y + b + 1, 't'); } }),
  t('Gem vein', '', (i, x, y) => { wallFace(i, x, y); for (const [a, b, c] of [[4, 4, 'R'], [10, 7, 'c'], [6, 11, 'P'], [12, 12, 'Y']]) { px(i, x + a, y + b, c); px(i, x + a + 1, y + b, 'W'); px(i, x + a, y + b + 1, c); } }),
  t('Rails (left-right)', 'P', (i, x, y) => { G.caveFloor(i, x, y); for (let k = 1; k < T; k += 4) rect(i, x + k, y + 3, 2, 10, 't'); hline(i, x, y + 5, T, 'S'); hline(i, x, y + 10, T, 'S'); }),
  t('Rails (up-down)', 'P', (i, x, y) => { G.caveFloor(i, x, y); for (let k = 1; k < T; k += 4) rect(i, x + 3, y + k, 10, 2, 't'); vline(i, x + 5, y, T, 'S'); vline(i, x + 10, y, T, 'S'); }),
  t('Lantern', '', on(null, obj(16, 16, o => { rect(o, 7, 9, 2, 6, 'n'); hline(o, 5, 15, 6, 'n'); rect(o, 5, 2, 6, 7, 'n'); rect(o, 6, 3, 4, 5, 'Y'); px(o, 7, 4, 'W'); hline(o, 5, 1, 6, 'k'); })), det)
];

const tilesetIndex = [
  ['outdoor', 'Outdoor', 'Grass, tall grass, paths, water, trees, rocks, fences, bridges and other outdoor pieces, plus an animated water autotile and a dirt path autotile. The first 16 tiles match the sample project.', 8, outdoor],
  ['town', 'Town buildings', 'Roofs in three colours, walls, doors, shop and healer signs, paving, hedges and street furniture.', 8, town],
  ['interior', 'Interior', 'Floors, walls, furniture, counters, a healing machine, stairs and kitchen pieces.', 8, interior],
  ['cave', 'Cave', 'Cave floors and walls, rough floor for encounters, rocks, crystals, ladders, water and mine rails.', 8, cave]
];
const previews = {};
for (const [id, name, desc, cols, defs] of tilesetIndex) previews[id] = buildTileset(id, name, desc, cols, defs);

module.exports = { O, G, previews };
if (require.main === module) require('./gen-library-sprites');
