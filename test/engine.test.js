// Run: node test/engine.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const MF = require('../src/shared/core.js');
require('../src/shared/battle.js');

const dir = path.join(__dirname, '..', 'templates', 'sample', 'data');
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const db = new MF.Database({
  system: read('system.json'), types: read('types.json'), moves: read('moves.json'),
  monsters: read('monsters.json'), items: read('items.json'), tilesets: read('tilesets.json')
});

// --- formulas
const m = MF.createMonster(db, 'embercub', 5, { ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
assert.strictEqual(m.stats.hp, Math.floor((90 + 31) * 5 / 100) + 15);
assert.deepStrictEqual(m.moves.map(x => x.id), ['tackle', 'growl', 'ember']);
assert.strictEqual(db.effectiveness('water', ['fire']), 2);
assert.strictEqual(db.effectiveness('grass', ['grass', 'poison']), 0.25);
const evs = MF.gainExp(db, m, MF.expForLevel('medium', 16) - m.exp);
assert.strictEqual(m.level, 16);
assert.ok(evs.some(e => e.type === 'learnedMove' || e.type === 'learnPending'));
assert.strictEqual(MF.checkEvolution(db, m), 'blazebear');

// --- capture: master orb always catches, full-hp low-rate rarely catches
const rng = MF.makeRng(42);
const wild = MF.createMonster(db, 'embercub', 10, { rng });
assert.ok(MF.captureAttempt(db, wild, db.item('master_orb'), rng).caught);
let caught = 0;
for (let i = 0; i < 2000; i++) if (MF.captureAttempt(db, wild, db.item('capture_orb'), rng).caught) caught++;
assert.ok(caught > 0 && caught < 600, 'capture rate plausible: ' + caught);

// --- encounter areas: weighted picking and area bounds
const Quick = require('../src/shared/quick.js');
{
  const r = MF.makeRng(99), counts = { a: 0, b: 0, c: 0 };
  const list = [{ speciesId: 'a', minLevel: 2, maxLevel: 4, weight: 25 }, { speciesId: 'b', minLevel: 7, maxLevel: 7, weight: 10 }, { speciesId: 'c', minLevel: 1, maxLevel: 1, weight: 0 }];
  for (let i = 0; i < 20000; i++) { const p = Quick.pick(list, 1, r)[0]; counts[p.speciesId]++; if (p.speciesId === 'a') assert.ok(p.level >= 2 && p.level <= 4); if (p.speciesId === 'b') assert.strictEqual(p.level, 7); }
  assert.strictEqual(counts.c, 0, 'weight 0 never appears');
  assert.ok(Math.abs(counts.a / 20000 - 25 / 35) < 0.02, 'weights respected: ' + JSON.stringify(counts));
  assert.strictEqual(Quick.pick(list, 3, r).length, 3);
  assert.ok(Quick.inZone({ x: 12, y: 4 }, { width: 5, height: 6 }, 16, 9));
  assert.ok(!Quick.inZone({ x: 12, y: 4 }, { width: 5, height: 6 }, 17, 9));
  const pages = Quick.build({ type: 'encounter', width: 2, height: 2, chance: 10, list, once: true }, {});
  assert.strictEqual(pages.length, 2); assert.strictEqual(pages[0].trigger, 'encounter'); assert.ok(pages[1].condition.selfSwitch);
}

// --- map layers: collision, encounters, drawing order, migration
const Layers = require('../src/shared/layers.js');
{
  const ts = { flags: [{ pass: true }, { pass: true, enc: true }, { pass: false }, { pass: true, over: true }] };
  // Old maps (no layerInfo) keep their previous behaviour: tile settings decide.
  const old = Layers.migrate({ width: 3, height: 1, layers: [[0, 2, 1], [-1, -1, -1], [-1, -1, -1]] });
  assert.strictEqual(old.layerInfo.length, 3);
  assert.ok(!Layers.cellFlags(old, ts, 1, 0).pass, 'legacy: blocked tile on ground blocks');
  assert.ok(Layers.cellFlags(old, ts, 2, 0).enc, 'legacy: encounter tile works');
  // New defaults: Ground walkable, Obstacles block, Layer 3 walkable + above + encounters by tile.
  const m = { width: 4, height: 1, layers: [[2, 0, 0, 0], [-1, 0, -1, -1], [-1, -1, 1, 3]], layerInfo: Layers.defaults() };
  assert.ok(Layers.cellFlags(m, ts, 0, 0).pass, 'ground is always walkable');
  assert.ok(!Layers.cellFlags(m, ts, 1, 0).pass, 'anything on Obstacles blocks');
  assert.ok(Layers.cellFlags(m, ts, 2, 0).pass && Layers.cellFlags(m, ts, 2, 0).enc, 'tall grass on layer 3 is walkable with encounters');
  assert.ok(Layers.drawsAbove(m, 2, ts.flags[3]) && !Layers.drawsAbove(m, 0, ts.flags[0]), 'layer 3 drawn above the player');
  // Extra layers, hidden-in-game collision layer, removing layers.
  m.layers.push([-1, -1, -1, 0]); Layers.migrate(m);
  assert.strictEqual(m.layerInfo.length, 4);
  Object.assign(m.layerInfo[3], { collision: 'block', hideInGame: true });
  assert.ok(!Layers.cellFlags(m, ts, 3, 0).pass, 'hidden blocking layer still blocks');
  m.layerInfo[3].encounters = 'all'; assert.ok(Layers.cellFlags(m, ts, 3, 0).enc);
  const tiny = Layers.migrate({ width: 1, height: 1, layers: [[0]] });
  assert.strictEqual(tiny.layers.length, 3, 'old maps without layer settings keep three layers');
  const one = Layers.migrate({ width: 1, height: 1, layers: [[0]], layerInfo: [Layers.defaults()[0]] });
  assert.strictEqual(one.layers.length, 1, 'a map can be cut down to one layer');
  assert.ok(Layers.cellFlags(one, ts, 0, 0).pass);
}

// --- fuzz battles
const species = Object.keys(db.monsters);
function party(n, lo, hi, r) { return Array.from({ length: n }, () => MF.createMonster(db, species[Math.floor(r() * species.length)], MF.randInt(r, lo, hi), { rng: r })); }
const tally = {};
let turnsMax = 0;
for (let i = 0; i < 3000; i++) {
  const r = MF.makeRng(i + 1);
  const pa = MF.randInt(r, 1, 3), ea = MF.randInt(r, 1, 3);
  const isWild = r() < 0.4;
  const b = new MF.Battle(db, {
    playerParty: party(MF.randInt(r, 1, 6), 3, 20, r), enemyParty: party(isWild ? ea : MF.randInt(r, 1, 6), 3, 20, r),
    playerActive: pa, enemyActive: ea, isWild, trainerName: 'Tester', bag: { capture_orb: 10, potion: 5, revive: 2 }, rng: r
  });
  b.start();
  let turns = 0;
  while (b.state !== 'ended') {
    if (++turns > 500) throw new Error('battle did not end, seed ' + (i + 1));
    if (b.state === 'replace') {
      const map = {}; const bench = b.benchIndices(0);
      b.replaceSlots().forEach((s, k) => { map[s] = bench[k]; });
      b.submitReplacements(map);
      continue;
    }
    const acts = b.inputSlots().map(slot => {
      const roll = r();
      const mon = b.mon(0, slot);
      if (isWild && roll < 0.05) return { slot, kind: 'item', itemId: 'capture_orb', target: { side: 1, slot: 0 } };
      if (roll < 0.08) return { slot, kind: 'item', itemId: 'potion', partyIndex: b.battler(0, slot).partyIndex };
      if (roll < 0.10 && b.benchIndices(0).length) return { slot, kind: 'switch', partyIndex: b.benchIndices(0)[0] };
      if (isWild && roll < 0.11) return { slot, kind: 'run' };
      const tgts = b.aliveSlots(1);
      return { slot, kind: 'move', moveIndex: Math.floor(r() * mon.moves.length), target: { side: 1, slot: tgts[Math.floor(r() * tgts.length)] } };
    });
    b.submit(acts);
    b.sides.forEach(s => s.party.forEach(p => { assert.ok(p.hp >= 0 && p.hp <= p.stats.hp, 'hp in range'); }));
  }
  turnsMax = Math.max(turnsMax, turns);
  tally[b.result] = (tally[b.result] || 0) + 1;
  if (b.result === 'caught') assert.ok(b.caught && b.caught.caughtBall);
}
// --- 0.6: autotiles, animation, audio defaults, shop and exit quick events
{
  const Tiles = require('../src/shared/tiles.js');
  // a lone square: four outer corners
  assert.deepStrictEqual(Tiles.autoQuarters(() => false).map(q => q.slice(2)), [[0, 2], [3, 2], [0, 5], [3, 5]]);
  // surrounded on all sides: interior quarters
  assert.deepStrictEqual(Tiles.autoQuarters(() => true).map(q => q.slice(2)), [[2, 4], [1, 4], [2, 3], [1, 3]]);
  // all neighbours except the diagonals: inner corners from the top-right tile of the block
  assert.deepStrictEqual(Tiles.autoQuarters((x, y) => x === 0 || y === 0).map(q => q.slice(2)), [[2, 0], [3, 0], [2, 1], [3, 1]]);
  // water to the left/right only: top and bottom edges
  assert.deepStrictEqual(Tiles.autoQuarters((x, y) => y === 0).map(q => q.slice(2)), [[2, 2], [1, 2], [2, 5], [1, 5]]);
  const ts = read('tilesets.json')[0];
  const water = ts.flags.findIndex(f => f.auto && f.anim === 3);
  assert.ok(water > 0, 'sample tileset has an animated water autotile');
  const parts = Tiles.partsOf(ts, 8);
  assert.strictEqual(parts[water + 1], water); assert.strictEqual(parts[water + 8], water); assert.strictEqual(parts[water + 2], water, 'frame 2 is a part');
  assert.strictEqual(parts[water], undefined);
  const seq = [0, 300, 600, 900, 1200].map(t => Tiles.frameAt({ animSpeed: 300 }, { anim: 3 }, t));
  assert.deepStrictEqual(seq, [0, 1, 2, 1, 0], 'ping-pong animation');
  const lake = JSON.parse(fs.readFileSync(path.join(dir, 'maps', 'map003.json'), 'utf8'));
  assert.ok(lake.layers[1].includes(water), 'Lakeside uses the water autotile');
  const route = JSON.parse(fs.readFileSync(path.join(dir, 'maps', 'map002.json'), 'utf8'));
  assert.strictEqual(route.edges.up.mapId, 'map003'); assert.strictEqual(lake.edges.down.mapId, 'map002');

  const Audio = require('../src/shared/audio.js');
  const a = Audio.withDefaults({ sfx: { cursor: '' } }, rel => rel !== 'sounds/save.mp3');
  assert.strictEqual(a.sfx.cursor, '', 'an explicitly silent slot stays silent');
  assert.strictEqual(a.sfx.save, '', 'a preset that is not in the project is left empty');
  assert.strictEqual(a.title, 'music/title-dawn-of-adventure.mp3');
  assert.ok(Audio.RE.test('x.FLAC') && Audio.RE.test('y.mp3') && !Audio.RE.test('z.wav'));
  const sys = read('system.json');
  for (const rel of [sys.audio.title, sys.audio.battleWild, sys.audio.sfx.cursor]) assert.ok(fs.existsSync(path.join(dir, '..', 'assets', rel)), rel + ' exists in the sample');

  const Quick = require('../src/shared/quick.js');
  const shop = Quick.build({ type: 'shop', sprite: 's.png', goods: [{ itemId: 'potion', price: null }, { itemId: 'antidote', price: '50' }, { itemId: '' }], sell: true, sellRate: 40 }, {});
  assert.strictEqual(shop[0].commands[0].cmd, 'shop');
  assert.deepStrictEqual(shop[0].commands[0].goods, [{ itemId: 'potion', price: null }, { itemId: 'antidote', price: 50 }]);
  const step = Quick.build({ type: 'exit', how: 'step', mapId: 'map002', x: 3, y: 4, dir: 'keep', sound: true, fade: true }, {});
  assert.strictEqual(step[0].trigger, 'touch'); assert.ok(step[0].through);
  assert.deepStrictEqual(step[0].commands[0], { cmd: 'transfer', mapId: 'map002', x: 3, y: 4, dir: 'keep', sound: true, fade: 'black' });
  const door = Quick.build({ type: 'exit', how: 'door', mapId: 'map002', x: 1, y: 1, sprite: 'd.png', fade: false }, {});
  assert.strictEqual(door[0].trigger, 'action'); assert.strictEqual(door[0].sprite, 'd.png'); assert.strictEqual(door[0].commands[0].fade, 'none');
}

// --- 0.7: menus & terms, NPCs, levers, cut scenes, routes
{
  const C = require('../src/shared/gameconfig.js');
  const d = C.withDefaults({});
  assert.strictEqual(d.terms.dex, 'DB'); assert.strictEqual(d.terms.pp, 'EP'); assert.strictEqual(d.terms.ppLong, 'Energy Points');
  assert.deepStrictEqual(d.titleScreen.menu.filter(e => e.on).map(e => e.id), ['new', 'continue', 'options']);
  assert.deepStrictEqual(d.menus.main.map(e => e.id), ['dex', 'party', 'bag', 'worldmap', 'storage', 'decorate', 'wardrobe', 'save', 'options', 'close']);
  assert.ok(!d.decorating.enabled && !d.wardrobe.enabled, 'optional features start off');
  assert.ok(d.menus.bag.every(e => !e.on), 'bag shortcuts start off');
  // saved order, names and choices are kept
  const kept = C.withDefaults({ menus: { main: [{ id: 'save', label: 'Record', on: true }, { id: 'dex', label: 'Book', on: false }] }, terms: { pp: 'MP' } });
  assert.deepStrictEqual(kept.menus.main.slice(0, 2).map(e => e.id + ':' + e.label + ':' + e.on), ['save:Record:true', 'dex:Book:false']);
  assert.strictEqual(kept.menus.main.length, 10);
  const old = C.withDefaults({ menus: { main: [{ id: 'dex', label: 'DB', on: true }, { id: 'save', label: 'Save', on: true }, { id: 'close', label: 'Close', on: true }] } });
  assert.deepStrictEqual(old.menus.main.map(e => e.id).slice(-1), ['close'], 'new entries go before Close'); assert.strictEqual(kept.terms.pp, 'MP'); assert.strictEqual(kept.terms.dex, 'DB');
  assert.strictEqual(C.word(d.terms, 'Open the {dex}'), 'Open the DB');
  const sys = read('system.json');
  assert.ok(sys.follower.enabled && sys.titleScreen.licence.file === 'text/licence.txt');

  const Q = require('../src/shared/quick.js');
  assert.deepStrictEqual(Q.ROUTES.square(1, true), ['right', 'down', 'left', 'up']);
  const gift = Q.build({ type: 'npc', role: 'gift', sprite: 'a.png', move: 'route', steps: ['left', 'right'], itemId: 'potion', amount: 2, text: 'Here!', afterText: 'Bye' }, {});
  assert.strictEqual(gift.length, 2);
  assert.deepStrictEqual(gift[0].commands.map(c => c.cmd), ['text', 'giveItem', 'selfSwitch']);
  assert.deepStrictEqual(gift[0].route, { steps: ['left', 'right'], repeat: true });
  assert.ok(gift[1].condition.selfSwitch);
  const tr = Q.build({ type: 'npc', role: 'trainer', sight: 3, party: [{ speciesId: 'pebblit', level: 6 }], text: 'Fight!' }, {});
  assert.strictEqual(tr[0].trigger, 'sight'); assert.strictEqual(tr[0].sightRange, 3);
  assert.strictEqual(tr[0].commands[1].cmd, 'trainerBattle');
  assert.strictEqual(Q.build({ type: 'npc', role: 'trainer', sight: 0, party: [] }, {})[0].trigger, 'action', 'sight 0 = battle when spoken to');
  const lev = Q.build({ type: 'lever', switchId: 4, offSprite: 'o.png', onSprite: 'n.png' }, {});
  assert.strictEqual(lev[0].commands.find(c => c.cmd === 'setSwitch').value, true);
  assert.strictEqual(lev[1].condition.switchId, 4); assert.strictEqual(lev[1].commands.find(c => c.cmd === 'setSwitch').value, false);
  const one = Q.build({ type: 'lever', switchId: 4, oneWay: true, doneText: 'Stuck' }, {});
  assert.ok(!one[1].commands.some(c => c.cmd === 'setSwitch'));
  const cs = Q.build({ type: 'cutscene', start: 'step', width: 3, height: 2, text: 'Hi' }, {});
  assert.strictEqual(cs[0].trigger, 'touch'); assert.deepStrictEqual(cs[0].area, { width: 3, height: 2 });
  assert.deepStrictEqual(cs[0].commands.map(c => c.cmd), ['letterbox', 'text', 'letterbox', 'selfSwitch']);
  assert.strictEqual(Q.build({ type: 'cutscene', start: 'map' }, {})[0].trigger, 'auto');
  // Cut scenes: every start, once / every time, movie or built, a switch afterwards
  const cmdsOf = p => p.commands.map(c => c.cmd);
  const act = Q.build({ type: 'cutscene', start: 'action', sprite: 'characters/tv-set.png', repeat: 'always', content: 'movie', movie: 'movies/m.mp4', skippable: false }, {});
  assert.strictEqual(act.length, 1, 'every time: one page');
  assert.strictEqual(act[0].trigger, 'action'); assert.strictEqual(act[0].sprite, 'characters/tv-set.png'); assert.strictEqual(act[0].through, false);
  assert.deepStrictEqual(cmdsOf(act[0]), ['playMovie'], 'a movie has no cinema bars');
  assert.strictEqual(act[0].commands[0].skippable, false);
  const sw = Q.build({ type: 'cutscene', start: 'switch', switchId: 3, afterSwitch: 4, repeat: 'always', commands: [{ cmd: 'text', text: 'x' }] }, {});
  assert.strictEqual(sw[0].trigger, 'auto'); assert.strictEqual(sw[0].condition.switchId, 3);
  assert.deepStrictEqual(cmdsOf(sw[0]), ['letterbox', 'text', 'letterbox', 'setSwitch', 'selfSwitch'], 'autorun scenes always play once');
  assert.strictEqual(sw[0].commands[3].switchId, 4);
  assert.ok(sw[1].condition.selfSwitch);
  const nobars = Q.build({ type: 'cutscene', start: 'action', bars: false, afterText: 'Seen it.', commands: [{ cmd: 'wait', frames: 1 }] }, {});
  assert.deepStrictEqual(cmdsOf(nobars[0]), ['wait', 'selfSwitch']);
  assert.deepStrictEqual(cmdsOf(nobars[1]), ['text'], 'afterwards it says its after text');
  assert.strictEqual(nobars[0].through, true, 'an invisible spot does not block the way');
  const tv = read('maps/map004.json').events.find(e => e.name === 'Television');
  assert.ok(tv && tv.pages[0].commands[0].cmd === 'playMovie' && fs.existsSync(path.join(dir, '..', 'assets', tv.pages[0].commands[0].file)), 'the sample TV plays its movie');
}

// 0.9.6: bag pockets, saving, the world map and opening / ending scenes
{
  const C = require('../src/shared/gameconfig');
  const d = C.withDefaults({});
  assert.ok(d.pockets.enabled && d.pockets.list.length >= 4, 'default pockets');
  assert.strictEqual(d.saving.slots, 4); assert.strictEqual(d.saving.autosave, false);
  assert.deepStrictEqual([d.scenes.opening, d.scenes.newGame, d.scenes.ending], [[], [], []]); assert.strictEqual(d.scenes.endingThen, 'title');
  assert.strictEqual(d.worldMap.enabled, false);
  assert.ok(d.titleScreen.menu.find(e => e.id === 'options').on, 'Options is on the title screen by default');
  assert.ok(!d.titleScreen.menu.find(e => e.id === 'load').on);
  const P = d.pockets;
  assert.strictEqual(C.pocketOf(P, { kind: 'ball' }), 'balls');
  assert.strictEqual(C.pocketOf(P, { kind: 'key' }), 'key');
  assert.strictEqual(C.pocketOf(P, { kind: 'heal' }), P.list.find(p => p.rest).id, 'anything else goes to the "everything else" pocket');
  assert.strictEqual(C.pocketOf(P, { kind: 'ball', pocket: 'key' }), 'key', 'an item can choose its pocket');
  assert.strictEqual(C.pocketOf(P, { kind: 'ball', pocket: 'gone' }), 'balls', 'a deleted pocket falls back to its kind');
  const custom = { list: [{ id: 'potions', kinds: ['heal', 'revive'] }, { id: 'stuff', kinds: [], rest: true }] };
  assert.strictEqual(C.pocketOf(custom, { kind: 'revive' }), 'potions'); assert.strictEqual(C.pocketOf(custom, { kind: 'ball' }), 'stuff');
  assert.strictEqual(C.pocketOf({ list: [] }, { kind: 'ball' }), null, 'no pockets: one list');
  // the save point quick event
  const sp = Quick.build({ type: 'savepoint', text: 'Rest?', heal: true }, {});
  assert.strictEqual(sp[0].trigger, 'action'); assert.strictEqual(sp[0].through, true);
  assert.strictEqual(sp[0].commands[0].cmd, 'choice');
  assert.deepStrictEqual(sp[0].commands[0].yesCmds, [{ cmd: 'saveGame', mode: 'screen', heal: true }]);
  const quiet = Quick.build({ type: 'savepoint', ask: false, mode: 'auto', sprite: 'characters/ball.png' }, {});
  assert.deepStrictEqual(quiet[0].commands.map(c => c.cmd), ['saveGame']); assert.strictEqual(quiet[0].through, false);
  // the sample: a world map with places on real maps, a save point bed, opening and ending scenes
  const sys = read('system.json');
  assert.ok(sys.worldMap.enabled && fs.existsSync(path.join(dir, '..', 'assets', sys.worldMap.image)), 'sample world map picture');
  sys.worldMap.locations.forEach(l => { l.maps.forEach(m => assert.ok(fs.existsSync(path.join(dir, 'maps', m + '.json')), l.name)); });
  assert.ok(read('maps/map004.json').events.some(e => e.quick && e.quick.type === 'savepoint'), 'the bed is a save point');
  assert.ok(sys.scenes.opening.length && sys.scenes.ending.some(s => s.type === 'credits'));
  ['worldmap-island', 'worldmap-continent', 'worldmap-parchment'].forEach(f => assert.ok(fs.existsSync(path.join(__dirname, '..', 'library', 'pictures', f + '.png')), f));
}


// 0.9.7: 2.5D height levels, stairs, ledges and ready-made shapes
{
  const HG = require('../src/shared/heights');
  const m = { width: 5, height: 5 };
  assert.ok(!HG.hasHeights(m) && !HG.active(m), 'a map without heights is flat');
  assert.deepStrictEqual(HG.step(m, 0, 0, 1, 0), { ok: true, jump: false });
  HG.ensure(m);
  m.heights[1 * 5 + 1] = 1; m.heights[1 * 5 + 2] = 2; m.heights[2 * 5 + 1] = 0;
  assert.strictEqual(HG.get(m, 1, 1), 1); assert.strictEqual(HG.get(m, 9, 9), 0, 'outside the map is level 0');
  assert.ok(!HG.step(m, 1, 2, 1, 1).ok, 'can\'t walk up a cliff');
  assert.deepStrictEqual(HG.step(m, 1, 1, 1, 2), { ok: true, jump: true }, 'walking down the screen off a ledge is a jump');
  assert.ok(!HG.step(m, 1, 1, 0, 1).ok, 'no jumping sideways off a ledge');
  assert.ok(!HG.step(m, 1, 1, 2, 1).ok, 'two levels apart, no stairs: blocked');
  m.stairs[2 * 5 + 1] = 1;
  assert.deepStrictEqual(HG.step(m, 1, 2, 1, 1), { ok: true, jump: false }, 'stairs go up one level');
  assert.deepStrictEqual(HG.step(m, 1, 1, 1, 2), { ok: true, jump: false }, 'and down again, without a jump');
  assert.ok(HG.canReach(m, 1, 2, 1, 1) && !HG.canReach(m, 0, 1, 1, 1));
  m.view = { ledges: false }; m.stairs[2 * 5 + 1] = 0;
  assert.ok(!HG.step(m, 1, 1, 1, 2).ok, 'ledge jumps can be turned off');
  // resizing: the map grows by one column on the left
  HG.resize(m, 5, 5, 6, 5, 1, 0);
  assert.strictEqual(m.heights.length, 30); assert.strictEqual(m.heights[1 * 6 + 2], 1, 'heights move with the tiles');
  m.width = 6;
  // shapes: a small hill dropped at (1, 1) on level 0
  const flat = { width: 8, height: 8 };
  HG.applyShape(flat, HG.SHAPES.find(s => s.id === 'hill'), 1, 1);
  assert.strictEqual(HG.get(flat, 2, 2), 1); assert.ok(HG.isStairs(flat, 2, 3) && HG.get(flat, 2, 3) === 1, 'stairs on the front of the hill');
  assert.ok(HG.step(flat, 2, 4, 2, 3).ok && !HG.step(flat, 1, 4, 1, 3).ok, 'the hill is climbed by its stairs only');
  HG.applyShape(flat, HG.SHAPES.find(s => s.id === 'hill'), 0, 6); // partly off the map: no error
  HG.tidy({ width: 2, height: 1, heights: [0, 0], stairs: [0, 0] });
  const tidyMap = { width: 2, height: 1, heights: [0, 0], stairs: [0, 0] }; HG.tidy(tidyMap);
  assert.ok(!tidyMap.heights && !tidyMap.stairs, 'flat maps drop their height lists');
  assert.strictEqual(HG.view({}).camera, 'top'); assert.strictEqual(HG.view({ view: { camera: 'tilted' } }).tilt, 0.55);
  // the sample's Hilltop Trail: tilted camera, three levels, every stair joins two levels
  const m5 = read('maps/map005.json');
  assert.ok(HG.active(m5) && HG.view(m5).camera === 'tilted' && HG.maxHeight(m5) === 3);
  for (let y = 0; y < m5.height; y++) for (let x = 0; x < m5.width; x++) if (HG.isStairs(m5, x, y))
    assert.ok([[0, -1], [0, 1]].some(([dx, dy]) => Math.abs(HG.get(m5, x + dx, y + dy) - HG.get(m5, x, y)) === 1), 'stairs at ' + x + ',' + y + ' join two levels');
  assert.ok(read('maps/map003.json').edges.right.mapId === 'map005', 'Lakeside leads east to Hilltop Trail');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'library', 'sounds', 'jump.mp3')), 'the jump sound is in the library');
}

console.log('All engine tests passed. Outcomes over 3000 battles:', tally, 'longest:', turnsMax, 'turns');
