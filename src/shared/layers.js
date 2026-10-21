/* Map layers: each map has any number of tile layers (at least one), each with its own properties.
 * New maps start with three (Ground, Obstacles, Grass & overhead); any of them can be removed.
 *   collision:  'walk'  — always walkable (never blocks)
 *               'block' — any tile painted here blocks the player
 *               'tile'  — use each tile's own walkable/blocked setting from the tileset
 *   above:      drawn over the player and characters
 *   encounters: 'none' | 'tile' (where the tile is marked ♣ in the tileset) | 'all' (any tile painted here)
 *   visible / locked / opacity: editor-only display settings
 *   hideInGame: not drawn in the game, but still counts for collision and encounters (invisible walls)
 * Shared by the editor and the runtime. */
(function (root) {
  'use strict';
  const MIN_LAYERS = 1;
  const LEGACY_LAYERS = 3; // maps saved before layer settings existed always had three
  const base = { visible: true, locked: false, opacity: 1, hideInGame: false };
  const DEFAULTS = [
    { name: 'Ground', collision: 'walk', above: false, encounters: 'tile' },
    { name: 'Obstacles', collision: 'block', above: false, encounters: 'none' },
    { name: 'Grass & overhead', collision: 'walk', above: true, encounters: 'tile' }
  ];
  // Maps made before layer settings existed: keep their exact old behaviour.
  const LEGACY = [
    { name: 'Ground', collision: 'tile', above: false, encounters: 'tile' },
    { name: 'Obstacles', collision: 'tile', above: false, encounters: 'tile' },
    { name: 'Above player', collision: 'walk', above: true, encounters: 'none' }
  ];
  const COLLISION = [['walk', 'Always walkable'], ['block', 'Always blocks'], ['tile', 'Use each tile\'s setting']];
  const ENCOUNTERS = [['none', 'Never'], ['tile', 'Where the tile is marked ♣'], ['all', 'On every tile painted here']];

  const make = (o, i) => Object.assign({}, base, { name: 'Layer ' + (i + 1), collision: 'walk', above: false, encounters: 'none' }, o);
  function defaults() { return DEFAULTS.map((d, i) => make(d, i)); }
  function newLayerInfo(i) { return make({ name: 'Layer ' + (i + 1), collision: 'walk', above: true, encounters: 'none' }, i); }

  // Make sure a map has layerInfo matching its layers (and at least MIN_LAYERS of each).
  function migrate(map) {
    const n = map.width * map.height;
    map.layers = map.layers || [];
    let min = MIN_LAYERS;
    if (!Array.isArray(map.layerInfo) || !map.layerInfo.length) {
      min = LEGACY_LAYERS;
      while (map.layers.length < min) map.layers.push(new Array(n).fill(map.layers.length === 0 ? 0 : -1));
      map.layerInfo = map.layers.map((l, i) => make(LEGACY[i] || {}, i));
    }
    while (map.layers.length < Math.max(min, map.layerInfo.length)) map.layers.push(new Array(n).fill(map.layers.length === 0 ? 0 : -1));
    while (map.layerInfo.length < map.layers.length) map.layerInfo.push(newLayerInfo(map.layerInfo.length));
    map.layerInfo = map.layerInfo.map((l, i) => Object.assign({}, base, make({}, i), l));
    return map;
  }

  // Walkable / encounter result for one square, from all layers.
  function cellFlags(map, tileset, x, y) {
    let pass = true, enc = false, any = false;
    const flags = (tileset && tileset.flags) || [];
    for (let L = 0; L < map.layers.length; L++) {
      const t = map.layers[L][y * map.width + x];
      if (t < 0 || t == null) continue;
      any = true;
      const info = (map.layerInfo && map.layerInfo[L]) || LEGACY[L] || DEFAULTS[2];
      const f = flags[t] || { pass: true };
      if (info.collision === 'block') pass = false;
      else if (info.collision === 'tile' && !f.pass && !f.over) pass = false;
      if (info.encounters === 'all' || (info.encounters === 'tile' && f.enc)) enc = true;
    }
    return { pass, enc, empty: !any };
  }
  // Should this layer/tile be drawn over the player?
  function drawsAbove(map, L, tileFlags) {
    const info = map.layerInfo && map.layerInfo[L];
    if (info) return !!info.above || (info.collision === 'tile' && !!(tileFlags && tileFlags.over));
    return L >= 2 || !!(tileFlags && tileFlags.over);
  }

  const Layers = { MIN_LAYERS, DEFAULTS, LEGACY, COLLISION, ENCOUNTERS, defaults, newLayerInfo, migrate, cellFlags, drawsAbove };
  if (root.MF) root.MF.Layers = Layers;
  if (typeof module !== 'undefined' && module.exports) module.exports = Layers;
})(typeof window !== 'undefined' ? window : globalThis);
