/* 2.5D: height levels and the map view. Shared by the editor, the game and the tests.
 *
 * Each map can give every square a height level, 0 (the ground) to MAX, and mark squares as stairs:
 *   map.heights  [width * height] numbers 0..MAX (missing = all 0, a flat map)
 *   map.stairs   [width * height] 1 = stairs / a slope (missing = none)
 * Higher ground is drawn raised, with a cliff face on its south side (see src/runtime/view25.js).
 *
 * Walking:
 *   - between squares of the same height: as normal
 *   - up or down one level: only if either square is stairs
 *   - down a ledge (one or more levels) while walking DOWN the screen: a jump, if the map allows ledge jumps
 *   - anything else: blocked, like a wall
 *
 * map.view holds the map's 2.5D settings (defaults below):
 *   camera  'top' (straight down, the classic look) | 'tilted' (the ground leans away, like a 2.5D game)
 *   tilt    0.2 – 1, how far the camera leans (tilted camera only)
 *   step    how far each height level raises the ground, as a fraction of a square (0.25 – 1)
 *   cliff   look of cliff faces: 'rock' | 'earth' | 'stone' | 'wood' | 'grass'
 *   ledges  players can jump down ledges when walking down the screen
 *   sky     colour shown beyond the edges of the map
 *   haze    0 – 0.8, mist over the far part of the map (tilted camera)
 *   shadows characters cast a small shadow (always on when a map has heights or a tilted camera) */
(function (root) {
  'use strict';
  const MAX = 4;
  const VIEW_DEFAULTS = { camera: 'top', tilt: 0.55, step: 0.75, cliff: 'rock', ledges: true, sky: '#0f1424', haze: 0.3, shadows: true };
  const CAMERAS = [['top', 'Top-down (classic)'], ['tilted', 'Tilted 2.5D (the ground leans away)']];
  const TILTS = [[0.3, 'Slight'], [0.55, 'Medium'], [0.8, 'Strong']];
  const STEPS = [[0.25, 'Very low (¼ square)'], [0.5, 'Low (½ square)'], [0.75, 'Normal (¾ square)'], [1, 'Tall (1 square)']];
  // Cliff face colours: [face, darker strata, light lip on the top edge, deep shadow at the foot]
  const CLIFFS = {
    rock: { name: 'Rock', c: ['#8b9bb4', '#5a6988', '#c0cbdc', '#3a4466'] },
    earth: { name: 'Earth', c: ['#b86f50', '#733e39', '#e4a672', '#3e2731'] },
    stone: { name: 'Stone wall', c: ['#a7a3a0', '#6d6a6a', '#dcd6cf', '#3e3b3f'] },
    wood: { name: 'Wood', c: ['#be7e4a', '#8a4836', '#e8b07a', '#4a2a26'] },
    grass: { name: 'Grassy bank', c: ['#3e8948', '#265c42', '#63c74d', '#193c3e'] }
  };

  function view(map) { return Object.assign({}, VIEW_DEFAULTS, (map && map.view) || {}); }
  function idx(map, x, y) { return y * map.width + x; }
  function inside(map, x, y) { return x >= 0 && y >= 0 && x < map.width && y < map.height; }
  function get(map, x, y) {
    if (!map.heights || !inside(map, x, y)) return 0;
    const h = map.heights[idx(map, x, y)] | 0;
    return h < 0 ? 0 : h > MAX ? MAX : h;
  }
  function isStairs(map, x, y) { return !!(map.stairs && inside(map, x, y) && map.stairs[idx(map, x, y)]); }
  function hasHeights(map) { return !!(map.heights && map.heights.some(h => h > 0)) || !!(map.stairs && map.stairs.some(Boolean)); }
  // Is any 2.5D drawing needed for this map? (heights, or the tilted camera)
  function active(map) { return hasHeights(map) || view(map).camera === 'tilted'; }
  function maxHeight(map) { let m = 0; if (map.heights) for (const h of map.heights) if (h > m) m = h; return Math.min(MAX, m); }
  function ensure(map) {
    const n = map.width * map.height;
    if (!Array.isArray(map.heights) || map.heights.length !== n) map.heights = new Array(n).fill(0);
    if (!Array.isArray(map.stairs) || map.stairs.length !== n) map.stairs = new Array(n).fill(0);
    return map;
  }
  // Keep heights and stairs in step when a map is resized; (dx, dy) = where the old map's top-left corner lands.
  function resize(map, ow, oh, w, h, dx, dy) {
    ['heights', 'stairs'].forEach(k => {
      const old = map[k]; if (!Array.isArray(old)) return;
      const out = new Array(w * h).fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = x - dx, sy = y - dy;
        if (sx >= 0 && sy >= 0 && sx < ow && sy < oh) out[y * w + x] = old[sy * ow + sx] || 0;
        else if (k === 'heights') out[y * w + x] = old[Math.max(0, Math.min(oh - 1, sy)) * ow + Math.max(0, Math.min(ow - 1, sx))] || 0; // extend from the nearest edge
      }
      map[k] = out;
    });
  }
  // Remove the arrays when a map is completely flat, so ordinary maps stay small.
  function tidy(map) {
    if (map.heights && !map.heights.some(h => h > 0)) delete map.heights;
    if (map.stairs && !map.stairs.some(Boolean)) delete map.stairs;
  }

  /* Can a character walk from (fx, fy) to the next square (tx, ty)?
     Returns { ok, jump } — jump = a ledge jump down. */
  function step(map, fx, fy, tx, ty) {
    if (!map.heights && !map.stairs) return { ok: true, jump: false };
    if (fx == null || fy == null || !inside(map, fx, fy)) return { ok: true, jump: false };
    const a = get(map, fx, fy), b = get(map, tx, ty);
    if (a === b) return { ok: true, jump: false };
    const stairs = isStairs(map, fx, fy) || isStairs(map, tx, ty);
    if (Math.abs(a - b) === 1 && stairs) return { ok: true, jump: false };
    if (a > b && ty === fy + 1 && tx === fx && view(map).ledges && !stairs) return { ok: true, jump: true };
    return { ok: false, jump: false };
  }
  // Can the player reach an event to talk to it? Same height, or joined by stairs.
  function canReach(map, fx, fy, tx, ty) {
    const a = get(map, fx, fy), b = get(map, tx, ty);
    return a === b || (Math.abs(a - b) === 1 && (isStairs(map, fx, fy) || isStairs(map, tx, ty)));
  }

  /* Ready-made shapes to drag onto a map (editor): each sets heights relative to the square dropped on.
     rows: one string per row — '.' leave alone, '0'–'4' raise by that much, 's' stairs at +0, 'S' stairs at +1.
     Stairs join squares one level apart, so a stair square can sit on either level. */
  const SHAPES = [
    { id: 'hill', name: 'Small hill', icon: '⛰', w: 3, h: 3, rows: ['111', '111', '1S1'], hint: 'A 3×3 hill one level up, with stairs on the front.' },
    { id: 'big-hill', name: 'Big hill', icon: '🏔', w: 5, h: 5, rows: ['11111', '12221', '12221', '1S2S1', '1s1s1'], hint: 'A 5×5 hill two levels high, with stairs to each level.' },
    { id: 'plateau', name: 'Plateau', icon: '▭', w: 6, h: 4, rows: ['111111', '111111', '111111', '11SS11'], hint: 'A wide raised area with a double staircase.' },
    { id: 'cliff', name: 'Cliff wall', icon: '▀', w: 8, h: 2, rows: ['11111111', '11111111'], hint: 'A straight cliff. Paint stairs where you want a way up.' },
    { id: 'ledge', name: 'Jump-down ledge', icon: '⤓', w: 6, h: 1, rows: ['111111'], hint: 'A one-way ledge: players jump down it but cannot climb back up.' },
    { id: 'stairs', name: 'Stairs up', icon: '☰', w: 1, h: 2, rows: ['1', 'S'], hint: 'One square raised, with stairs below it.' },
    { id: 'tower', name: 'Lookout', icon: '▲', w: 3, h: 4, rows: ['222', '222', '1S1', '.S.'], hint: 'A tall lookout two levels up, with a stair path.' }
  ];
  function applyShape(map, shape, x, y) {
    ensure(map);
    const base = get(map, x, y);
    let changed = 0;
    shape.rows.forEach((row, j) => [...row].forEach((ch, i) => {
      const cx = x + i, cy = y + j;
      if (ch === '.' || !inside(map, cx, cy)) return;
      const k = idx(map, cx, cy);
      // '0'–'4': raise by that much · 's': stairs at the dropped-on level · 'S': stairs one level up
      const lift = ch === 's' ? 0 : ch === 'S' ? 1 : +ch;
      map.heights[k] = Math.min(MAX, base + lift);
      map.stairs[k] = ch === 's' || ch === 'S' ? 1 : 0;
      changed++;
    }));
    return changed;
  }

  // A small number from a square's position, so cliff faces look varied but the same every time.
  function hash(x, y) { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

  /* Draw a cliff face (or the front of stairs) into a 2D canvas context.
     (px, py) = top-left on the canvas, w × hgt in pixels; levels = how many levels the face spans. */
  function drawFace(g, px, py, w, hgt, style, x, y, opts) {
    const C = (CLIFFS[style] || CLIFFS.rock).c;
    opts = opts || {};
    if (opts.stairs) {
      const rise = Math.max(2, Math.round(hgt / Math.max(2, Math.round(hgt / 3))));
      for (let yy = 0; yy < hgt; yy += rise) {
        g.fillStyle = C[2]; g.fillRect(px, py + yy, w, 1);
        g.fillStyle = C[0]; g.fillRect(px, py + yy + 1, w, Math.max(1, rise - 2));
        g.fillStyle = C[1]; g.fillRect(px, py + yy + rise - 1, w, 1);
      }
      g.fillStyle = C[3]; g.fillRect(px, py, 1, hgt); g.fillRect(px + w - 1, py, 1, hgt);
      return;
    }
    g.fillStyle = C[0]; g.fillRect(px, py, w, hgt);
    // strata: darker bands every few pixels, shifted per square so a long cliff doesn't look tiled
    const off = Math.floor(hash(x, y) * 4);
    g.fillStyle = C[1];
    for (let yy = 3 + off % 2; yy < hgt - 1; yy += 4) {
      const a = Math.floor(hash(x + yy, y) * w * 0.5), b = Math.floor(w * 0.5 + hash(x, y + yy) * w * 0.5);
      g.fillRect(px, py + yy, a, 1); g.fillRect(px + b, py + yy, w - b, 1);
    }
    // a crack or two
    const cx = px + 2 + Math.floor(hash(x * 3, y * 7) * (w - 4));
    g.fillRect(cx, py + 2, 1, Math.max(1, Math.floor(hgt * 0.6)));
    if (style === 'stone') { g.fillStyle = C[1]; for (let yy = 4; yy < hgt; yy += 4) g.fillRect(px + ((yy / 4) % 2 ? w / 2 : 0), py + yy - 4, 1, 4); }
    if (style === 'grass') { g.fillStyle = C[2]; for (let i = 0; i < w; i += 2) g.fillRect(px + i, py, 1, 1 + Math.floor(hash(x * 9 + i, y) * 3)); }
    // light lip along the top, shadow at the foot
    g.fillStyle = C[2]; g.fillRect(px, py, w, 1);
    g.fillStyle = C[3]; g.fillRect(px, py + hgt - 1, w, 1);
    if (opts.leftEdge) { g.fillStyle = C[3]; g.fillRect(px, py, 1, hgt); }
    if (opts.rightEdge) { g.fillStyle = C[3]; g.fillRect(px + w - 1, py, 1, hgt); }
  }

  const Heights = { MAX, VIEW_DEFAULTS, CAMERAS, TILTS, STEPS, CLIFFS, SHAPES, view, get, isStairs, hasHeights, active, maxHeight, ensure, resize, tidy, step, canReach, applyShape, drawFace, hash };
  if (root.MF) root.MF.Heights = Heights;
  if (typeof module !== 'undefined' && module.exports) module.exports = Heights;
})(typeof window !== 'undefined' ? window : globalThis);
