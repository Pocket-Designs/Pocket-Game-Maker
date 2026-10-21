// Generates templates/sample: placeholder art (real PNGs) + a small playable database.
// Run: node tools/gen-sample.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'templates', 'sample');
const W = (p, d) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), d); };
const J = (p, o) => W(p, JSON.stringify(o, null, 2));
const hex = h => { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]; };
const shade = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f), c[3]];

/* ---------------- Art comes from the Asset Library (run tools/gen-library.js first) ---------------- */
const LIB = path.join(__dirname, '..', 'library');
if (!fs.existsSync(path.join(LIB, 'library.json'))) throw new Error('Run node tools/gen-library.js first');
fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
const CR = require('../src/shared/credits');
const libCredits = CR.fromLibraryMeta(JSON.parse(fs.readFileSync(path.join(LIB, 'library.json'), 'utf8')));
const sampleCredits = {};
const copyLib = rel => { W('assets/' + rel, fs.readFileSync(path.join(LIB, rel))); if (libCredits[rel]) sampleCredits[rel] = libCredits[rel]; };
copyLib('tilesets/outdoor.png'); copyLib('tilesets/interior.png');
['hero', 'professor', 'healer', 'trainer', 'twin', 'villager', 'youngster', 'shopkeeper', 'old-man', 'hiker', 'lass', 'ball', 'chest', 'chest-open', 'sign-post', 'boulder', 'lever-off', 'lever-on'].forEach(c => copyLib('characters/' + c + '.png'));
for (const kind of ['music', 'sounds']) fs.readdirSync(path.join(LIB, kind)).filter(f => /\.(mp3|flac)$/i.test(f)).forEach(f => copyLib(kind + '/' + f));
['embercub', 'blazebear', 'splashling', 'tidalisk', 'sproutle', 'thornox', 'zapmouse', 'pebblit', 'fluffkin', 'toxifrog'].forEach(m => { copyLib('monsters/' + m + '_front.png'); copyLib('monsters/' + m + '_back.png'); });
['field', 'town'].forEach(b => copyLib('battlebacks/' + b + '.png'));
['title-sunrise', 'cutscene-night-sky'].forEach(b => copyLib('pictures/' + b + '.png'));
// Decorating and Wardrobe (optional features): furniture pictures and clothes.
const FURNITURE = [['bed', 'Bed', 1, 2, true, 1200], ['table', 'Wooden Table', 2, 1, true, 900], ['chair', 'Chair', 1, 1, true, 300], ['plant', 'Potted Plant', 1, 1, true, 400], ['bookshelf', 'Bookshelf', 2, 1, true, 1000],
  ['rug', 'Round Rug', 2, 2, false, 600], ['lamp', 'Floor Lamp', 1, 1, true, 350], ['sofa', 'Sofa', 2, 1, true, 1500], ['tv', 'Television', 1, 1, true, 2000], ['plush', 'Monster Plush', 1, 1, true, 250], ['trophy', 'Trophy', 1, 1, true, 3000]];
FURNITURE.forEach(([f]) => copyLib('decorations/' + f + '.png'));
const CLOTHES = [['outfit-hero-casual', 'Casual Clothes', 'outfit', 0], ['outfit-hero-cool', 'Blue Jacket Outfit', 'outfit', 1200], ['outfit-hero-explorer', 'Explorer Outfit', 'outfit', 1500],
  ['wear-cap-blue', 'Blue Cap', 'hat', 400], ['wear-cap-green', 'Green Cap', 'hat', 400], ['wear-cap-yellow', 'Yellow Cap', 'hat', 400], ['wear-shirt-white', 'White Shirt', 'top', 500], ['wear-shirt-green', 'Green Shirt', 'top', 500], ['wear-trousers-black', 'Black Trousers', 'bottom', 500]];
CLOTHES.forEach(([f]) => copyLib('characters/' + f + '.png'));
W('assets/text/licence.txt', '# Sample Monster Quest licence\n\nThis sample game was made with Pocket-Game-Maker by project-tech-me.\n\n- The art, music and sounds are original and released under CC0 1.0 (public domain).\n- You may copy, change and share this game, for free or for money.\n- Credit is appreciated but not required.\n\nReplace this file with your own game\'s licence in Database > Menus & screens.\n');
sampleCredits['text/licence.txt'] = { name: 'Licence text', origin: 'Written for the sample project', author: 'project-tech-me', licence: 'CC0 1.0 (public domain)', status: 'Placeholder' };
const outdoorMap = JSON.parse(fs.readFileSync(path.join(LIB, 'tilesets', 'outdoor.tiles.json'), 'utf8'));
const interiorMap = JSON.parse(fs.readFileSync(path.join(LIB, 'tilesets', 'interior.tiles.json'), 'utf8'));

/* ---------------- Database ---------------- */
const types = [
  { id: 'normal', name: 'Normal', color: '#a8a77a' },
  { id: 'fire', name: 'Fire', color: '#ee8130' },
  { id: 'water', name: 'Water', color: '#6390f0' },
  { id: 'grass', name: 'Grass', color: '#7ac74c' },
  { id: 'electric', name: 'Electric', color: '#f7d02c' },
  { id: 'rock', name: 'Rock', color: '#b6a136' },
  { id: 'poison', name: 'Poison', color: '#a33ea1' }
];
const chart = {
  normal: { rock: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, rock: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, rock: 2 },
  grass: { fire: 0.5, water: 2, grass: 0.5, rock: 2, poison: 0.5 },
  electric: { water: 2, grass: 0.5, electric: 0.5, rock: 1 },
  rock: { fire: 2 },
  poison: { grass: 2, poison: 0.5, rock: 0.5 }
};
const eff = (kind, extra) => Object.assign({ kind }, extra || {});
const moves = [
  { id: 'tackle', name: 'Tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, priority: 0, target: 'enemy', effect: eff('none'), description: 'A full-body charge.' },
  { id: 'growl', name: 'Growl', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 40, priority: 0, target: 'allEnemies', effect: eff('stat', { stat: 'atk', stages: -1, who: 'target', chance: 100 }), description: 'Lowers foes\' Attack.' },
  { id: 'quick_jab', name: 'Quick Jab', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, target: 'enemy', effect: eff('none'), description: 'Always strikes first.' },
  { id: 'ember', name: 'Ember', type: 'fire', category: 'special', power: 40, accuracy: 100, pp: 25, priority: 0, target: 'enemy', effect: eff('status', { status: 'brn', who: 'target', chance: 10 }), description: 'May burn the target.' },
  { id: 'flame_burst', name: 'Flame Burst', type: 'fire', category: 'special', power: 70, accuracy: 100, pp: 15, priority: 0, target: 'enemy', effect: eff('none'), description: 'A burst of fire.' },
  { id: 'bubble', name: 'Bubble', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 30, priority: 0, target: 'allEnemies', effect: eff('stat', { stat: 'spe', stages: -1, who: 'target', chance: 10 }), description: 'Hits all foes. May lower Speed.' },
  { id: 'water_jet', name: 'Water Jet', type: 'water', category: 'physical', power: 65, accuracy: 100, pp: 20, priority: 0, target: 'enemy', effect: eff('none'), description: 'A pressurised jet.' },
  { id: 'vine_lash', name: 'Vine Lash', type: 'grass', category: 'physical', power: 45, accuracy: 100, pp: 25, priority: 0, target: 'enemy', effect: eff('none'), description: 'Whips with vines.' },
  { id: 'leech_seed', name: 'Leech Bite', type: 'grass', category: 'special', power: 40, accuracy: 100, pp: 15, priority: 0, target: 'enemy', effect: eff('drain', { amount: 50 }), description: 'Restores half the damage dealt.' },
  { id: 'spore', name: 'Sleep Spores', type: 'grass', category: 'status', power: 0, accuracy: 75, pp: 15, priority: 0, target: 'enemy', effect: eff('status', { status: 'slp', who: 'target', chance: 100 }), description: 'Puts the target to sleep.' },
  { id: 'spark', name: 'Spark', type: 'electric', category: 'physical', power: 65, accuracy: 100, pp: 20, priority: 0, target: 'enemy', effect: eff('status', { status: 'par', who: 'target', chance: 30 }), description: 'May paralyze.' },
  { id: 'jolt', name: 'Jolt Wave', type: 'electric', category: 'status', power: 0, accuracy: 90, pp: 20, priority: 0, target: 'enemy', effect: eff('status', { status: 'par', who: 'target', chance: 100 }), description: 'Paralyzes the target.' },
  { id: 'rock_toss', name: 'Rock Toss', type: 'rock', category: 'physical', power: 50, accuracy: 90, pp: 15, priority: 0, target: 'enemy', effect: eff('none'), description: 'Hurls a stone.' },
  { id: 'harden', name: 'Harden', type: 'normal', category: 'status', power: 0, accuracy: 0, pp: 30, priority: 0, target: 'self', effect: eff('stat', { stat: 'def', stages: 1, who: 'self', chance: 100 }), description: 'Raises Defense.' },
  { id: 'toxic_spit', name: 'Toxic Spit', type: 'poison', category: 'special', power: 35, accuracy: 100, pp: 25, priority: 0, target: 'enemy', effect: eff('status', { status: 'psn', who: 'target', chance: 30 }), description: 'May poison.' },
  { id: 'body_slam', name: 'Body Slam', type: 'normal', category: 'physical', power: 85, accuracy: 100, pp: 15, priority: 0, target: 'enemy', effect: eff('recoil', { amount: 25 }), description: 'Hits hard; user takes recoil.' },
  { id: 'rest_up', name: 'Rest Up', type: 'normal', category: 'status', power: 0, accuracy: 0, pp: 10, priority: 0, target: 'self', effect: eff('heal', { amount: 50, who: 'self' }), description: 'Restores half max HP.' }
];
const L = (...pairs) => pairs.map(([level, moveId]) => ({ level, moveId }));
const bs = (hp, atk, def, spa, spd, spe) => ({ hp, atk, def, spa, spd, spe });
const monsters = [
  { id: 'embercub', name: 'Embercub', types: ['fire'], baseStats: bs(45, 55, 40, 60, 45, 60), growth: 'medium', catchRate: 45, expYield: 62, front: 'monsters/embercub_front.png', back: 'monsters/embercub_back.png', category: 'Ember Cub', description: 'Its tail flickers when it is happy.', learnset: L([1, 'tackle'], [1, 'growl'], [5, 'ember'], [12, 'quick_jab'], [18, 'flame_burst']), evolution: { method: 'level', level: 16, into: 'blazebear' } },
  { id: 'blazebear', name: 'Blazebear', types: ['fire'], baseStats: bs(75, 85, 65, 85, 65, 70), growth: 'medium', catchRate: 45, expYield: 142, front: 'monsters/blazebear_front.png', back: 'monsters/blazebear_back.png', category: 'Blaze', description: 'Roars with a heat haze.', learnset: L([1, 'tackle'], [1, 'ember'], [18, 'flame_burst'], [24, 'body_slam']), evolution: null },
  { id: 'splashling', name: 'Splashling', types: ['water'], baseStats: bs(50, 48, 60, 50, 60, 45), growth: 'medium', catchRate: 45, expYield: 63, front: 'monsters/splashling_front.png', back: 'monsters/splashling_back.png', category: 'Puddle', description: 'Sprays bubbles to say hello.', learnset: L([1, 'tackle'], [1, 'growl'], [5, 'bubble'], [10, 'harden'], [16, 'water_jet']), evolution: { method: 'level', level: 16, into: 'tidalisk' } },
  { id: 'tidalisk', name: 'Tidalisk', types: ['water'], baseStats: bs(80, 70, 85, 75, 85, 60), growth: 'medium', catchRate: 45, expYield: 142, front: 'monsters/tidalisk_front.png', back: 'monsters/tidalisk_back.png', category: 'Tide', description: 'Rides its own wake.', learnset: L([1, 'tackle'], [1, 'bubble'], [16, 'water_jet'], [26, 'body_slam']), evolution: null },
  { id: 'sproutle', name: 'Sproutle', types: ['grass'], baseStats: bs(48, 50, 50, 55, 55, 50), growth: 'medium', catchRate: 45, expYield: 62, front: 'monsters/sproutle_front.png', back: 'monsters/sproutle_back.png', category: 'Seedling', description: 'Basks all day in the sun.', learnset: L([1, 'tackle'], [1, 'growl'], [5, 'vine_lash'], [9, 'leech_seed'], [14, 'spore']), evolution: { method: 'level', level: 16, into: 'thornox' } },
  { id: 'thornox', name: 'Thornox', types: ['grass', 'poison'], baseStats: bs(78, 80, 78, 75, 75, 60), growth: 'medium', catchRate: 45, expYield: 142, front: 'monsters/thornox_front.png', back: 'monsters/thornox_back.png', category: 'Thorn', description: 'Its thorns drip with toxin.', learnset: L([1, 'vine_lash'], [1, 'leech_seed'], [16, 'toxic_spit'], [22, 'body_slam']), evolution: null },
  { id: 'zapmouse', name: 'Zapmouse', types: ['electric'], baseStats: bs(38, 50, 35, 55, 45, 85), growth: 'fast', catchRate: 190, expYield: 55, front: 'monsters/zapmouse_front.png', back: 'monsters/zapmouse_back.png', category: 'Static', description: 'Stores static in its cheeks.', learnset: L([1, 'quick_jab'], [3, 'jolt'], [7, 'spark']), evolution: null },
  { id: 'pebblit', name: 'Pebblit', types: ['rock'], baseStats: bs(45, 65, 85, 25, 40, 20), growth: 'slow', catchRate: 190, expYield: 58, front: 'monsters/pebblit_front.png', back: 'monsters/pebblit_back.png', category: 'Pebble', description: 'Often mistaken for a rock.', learnset: L([1, 'tackle'], [1, 'harden'], [6, 'rock_toss']), evolution: null },
  { id: 'fluffkin', name: 'Fluffkin', types: ['normal'], baseStats: bs(55, 45, 40, 35, 40, 55), growth: 'fast', catchRate: 255, expYield: 45, front: 'monsters/fluffkin_front.png', back: 'monsters/fluffkin_back.png', category: 'Fluff', description: 'Soft, friendly, and everywhere.', learnset: L([1, 'tackle'], [1, 'growl'], [8, 'quick_jab'], [14, 'rest_up']), evolution: null },
  { id: 'toxifrog', name: 'Toxifrog', types: ['poison'], baseStats: bs(48, 50, 45, 55, 50, 55), growth: 'medium', catchRate: 150, expYield: 60, front: 'monsters/toxifrog_front.png', back: 'monsters/toxifrog_back.png', category: 'Toad', description: 'Bright colours warn predators.', learnset: L([1, 'tackle'], [3, 'toxic_spit'], [9, 'harden']), evolution: null }
];

const items = [
  { id: 'capture_orb', name: 'Capture Orb', kind: 'ball', catchBonus: 1, price: 200, battleUsable: true, fieldUsable: false, description: 'A device for catching wild monsters.' },
  { id: 'great_orb', name: 'Great Orb', kind: 'ball', catchBonus: 1.5, price: 600, battleUsable: true, fieldUsable: false, description: 'A better catch rate than a Capture Orb.' },
  { id: 'master_orb', name: 'Master Orb', kind: 'ball', catchBonus: 255, price: 0, battleUsable: true, fieldUsable: false, description: 'Catches any wild monster without fail.' },
  { id: 'potion', name: 'Potion', kind: 'heal', healAmount: 20, price: 300, battleUsable: true, fieldUsable: true, description: 'Restores 20 HP.' },
  { id: 'super_potion', name: 'Super Potion', kind: 'heal', healAmount: 50, price: 700, battleUsable: true, fieldUsable: true, description: 'Restores 50 HP.' },
  { id: 'antidote', name: 'Antidote', kind: 'heal', cureStatus: 'psn', price: 100, battleUsable: true, fieldUsable: true, description: 'Cures poison.' },
  { id: 'full_heal', name: 'Full Heal', kind: 'heal', cureStatus: 'all', price: 400, battleUsable: true, fieldUsable: true, description: 'Cures any status problem.' },
  { id: 'revive', name: 'Revive', kind: 'revive', revivePercent: 50, price: 1500, battleUsable: true, fieldUsable: true, description: 'Revives a fainted monster with half HP.' },
  { id: 'ether', name: 'Ether', kind: 'pp', ppAmount: 10, price: 1200, battleUsable: true, fieldUsable: true, description: 'Restores 10 PP to every move.' },
  { id: 'storage_box', name: 'Storage Box', kind: 'tool', toolAction: 'storage', price: 0, battleUsable: false, fieldUsable: true, description: 'A portable box that links to your monster storage. Use it from the bag.' },
  { id: 'fire_stone', name: 'Fire Stone', kind: 'evolution', price: 2100, battleUsable: false, fieldUsable: true, description: 'Makes certain monsters evolve.' }
];
FURNITURE.forEach(([f, name, w, h, blocks, price]) => items.push({ id: f.replace(/-/g, '_'), name, kind: 'decoration', price, battleUsable: false, fieldUsable: true, description: 'Furniture for your room. Place it from the bag or the Decorate menu.', decor: { image: 'decorations/' + f + '.png', w, h, blocks, turn: 'rotate' } }));
CLOTHES.forEach(([f, name, slot, price]) => items.push({ id: f.replace(/-/g, '_'), name, kind: 'clothing', price, battleUsable: false, fieldUsable: true, description: slot === 'outfit' ? 'A whole outfit. Change in the Wardrobe.' : 'Something to wear. Change in the Wardrobe.', wear: { slot, sheet: 'characters/' + f + '.png' } }));

const TILES = require('../src/shared/tiles');
const tilesets = [{ id: 'outdoor', name: outdoorMap.name, image: 'tilesets/outdoor.png', tileSize: 16, library: 'tilesets/outdoor.png', animSpeed: outdoorMap.animSpeed || 300,
  flags: outdoorMap.tiles.map(t => TILES.flagFromMapping(t)), names: outdoorMap.tiles.map(t => t.name) },
  { id: 'interior', name: interiorMap.name, image: 'tilesets/interior.png', tileSize: 16, library: 'tilesets/interior.png', animSpeed: interiorMap.animSpeed || 300,
    flags: interiorMap.tiles.map(t => TILES.flagFromMapping(t)), names: interiorMap.tiles.map(t => t.name) }];
const WATER = outdoorMap.tiles.find(t => t.auto && t.anim).id, PATH = outdoorMap.tiles.find(t => t.auto && !t.anim).id;

const system = {
  title: 'Sample Monster Quest',
  screen: { width: 320, height: 240, scale: 2 },
  start: { mapId: 'map001', x: 9, y: 8, dir: 'up' },
  respawn: { mapId: 'map001', x: 4, y: 11, dir: 'down', message: 'You hurried back to town and your team was healed.' },
  player: { name: 'Red', sprite: 'characters/hero.png', moveSpeed: 4 },
  currency: 'Coins',
  startMoney: 500,
  startingParty: [],
  startingItems: { potion: 2, storage_box: 1, bed: 1, plant: 1, rug: 1, wear_cap_blue: 1 },
  defaultBattleback: 'battlebacks/field.png',
  switches: ['', 'Chose starter', 'Got orbs from Professor', 'Lakeside lever'],
  battle: { maxParty: 6, wildActive: 1, trainerActive: 1, maxMoves: 4, maxLevel: 100, critChance: 0.0417, critMultiplier: 1.5, stab: 1.5, expMultiplier: 1, trainerExpBonus: 1.5, allowRunFromTrainer: false },
  statusImmunity: { brn: ['fire'], psn: ['poison'], par: ['electric'] },
  audio: require('../src/shared/audio').withDefaults(null)
};
Object.assign(system, require('../src/shared/gameconfig').withDefaults(system));
system.titleScreen.background = 'pictures/title-sunrise.png';
system.titleScreen.subtitle = 'A Pocket-Game-Maker sample';
system.titleScreen.menu.forEach(e => { if (e.id === 'credits' || e.id === 'licence') e.on = true; });
system.titleScreen.licence.file = 'text/licence.txt';
system.follower.enabled = true;
system.decorating = { enabled: true };
system.wardrobe = { enabled: true, start: {} };

/* ---------------- Maps ---------------- */
function blankMap(id, name, w, h) {
  const n = w * h;
  return { id, name, width: w, height: h, tilesetId: 'outdoor', battleback: '', bgm: '', edges: {}, layers: [new Array(n).fill(0), new Array(n).fill(-1), new Array(n).fill(-1)], layerInfo: require('../src/shared/layers').defaults(), encounters: { chance: 0, list: [] }, events: [] };
}
const setT = (m, layer, x, y, t) => { if (x >= 0 && y >= 0 && x < m.width && y < m.height) m.layers[layer][y * m.width + x] = t; };
const fillT = (m, layer, x, y, w, h, t) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setT(m, layer, x + i, y + j, t); };
const page = (o) => Object.assign({ condition: { switchId: 0, selfSwitch: false }, sprite: '', dir: 'down', trigger: 'action', move: 'fixed', through: false, sightRange: 0, commands: [] }, o);
let evId = 1;
const ev = (m, name, x, y, pages) => { m.events.push({ id: evId++, name, x, y, pages }); };
// Quick events: settings kept on the event so the editor can reopen them in the quick-event window.
const Quick = require('../src/shared/quick');
const quickCtx = () => ({ items, currency: system.currency });
const qev = (m, name, x, y, q) => { m.events.push({ id: evId++, name, x, y, quick: q, pages: Quick.build(q, quickCtx()) }); };

// Map 1: Starter Town
const m1 = blankMap('map001', 'Starter Town', 20, 15);
m1.battleback = 'battlebacks/town.png';
m1.bgm = 'music/town-sunny-town.mp3';
for (let x = 0; x < 20; x++) { setT(m1, 1, x, 0, 4); setT(m1, 1, x, 14, 4); }
for (let y = 0; y < 15; y++) { setT(m1, 1, 0, y, 4); setT(m1, 1, 19, y, 4); }
setT(m1, 1, 9, 0, -1); setT(m1, 1, 10, 0, -1);
fillT(m1, 0, 9, 0, 2, 9, PATH); fillT(m1, 0, 3, 9, 14, 2, PATH); // dirt path autotile: edges join up by themselves
fillT(m1, 1, 6, 1, 8, 2, 8); fillT(m1, 1, 6, 3, 3, 1, 9); fillT(m1, 1, 11, 3, 3, 1, 9);
fillT(m1, 0, 9, 3, 2, 1, 11); fillT(m1, 0, 6, 4, 8, 2, 11);
fillT(m1, 1, 8, 5, 3, 1, 15);
fillT(m1, 1, 14, 11, 4, 3, WATER); fillT(m1, 0, 13, 11, 1, 3, 12); // pond: animated water autotile on the Obstacles layer
[[3, 3], [4, 4], [15, 5], [16, 4], [5, 13], [8, 12], [12, 13]].forEach(([x, y]) => setT(m1, 2, x, y, 6)); // flowers: walkable, on Layer 3
setT(m1, 1, 12, 8, 13);
// lamp posts (base on Detail, top on Above), mailbox, barrels
for (const lx of [6, 14]) { setT(m1, 1, lx, 8, 36); setT(m1, 2, lx, 7, 37); }
setT(m1, 1, 5, 5, 38); setT(m1, 1, 14, 4, 39);
fillT(m1, 1, 2, 6, 2, 1, 7);
// the player's house (bottom left): roof, wall and a door into Your Room
fillT(m1, 1, 1, 11, 4, 1, 8); fillT(m1, 1, 1, 12, 4, 1, 9); setT(m1, 1, 3, 12, 10);

const starter = (x, species, label) => ev(m1, 'Starter ' + label, x, 5, [
  page({ sprite: 'characters/ball.png', commands: [
    { cmd: 'text', text: 'Inside this orb is ' + label + '. You chose it as your partner!' },
    { cmd: 'giveMonster', speciesId: species, level: 5, nickname: '' },
    { cmd: 'setSwitch', switchId: 1, value: true },
    { cmd: 'selfSwitch', value: true }
  ] }),
  page({ condition: { switchId: 1, selfSwitch: false }, sprite: 'characters/ball.png', commands: [{ cmd: 'text', text: 'You already chose your partner. Let this one find another trainer.' }] }),
  page({ condition: { switchId: 0, selfSwitch: true }, sprite: '', commands: [] })
]);
starter(8, 'embercub', 'Embercub (Fire)');
starter(9, 'splashling', 'Splashling (Water)');
starter(10, 'sproutle', 'Sproutle (Grass)');

ev(m1, 'Professor', 9, 4, [
  page({ sprite: 'characters/professor.png', dir: 'down', commands: [{ cmd: 'text', speaker: 'Professor', text: 'Welcome! Pick one of the three monsters on the table. Face an orb and press Z.' }] }),
  page({ condition: { switchId: 1, selfSwitch: false }, sprite: 'characters/professor.png', commands: [
    { cmd: 'text', speaker: 'Professor', text: 'A fine choice! Take these Capture Orbs. Weaken wild monsters, then throw one!' },
    { cmd: 'giveItem', itemId: 'capture_orb', amount: 5 },
    { cmd: 'setSwitch', switchId: 2, value: true }
  ] }),
  page({ condition: { switchId: 2, selfSwitch: false }, sprite: 'characters/professor.png', commands: [{ cmd: 'text', speaker: 'Professor', text: 'Route 1 is north of town. The tall grass is full of wild monsters!' }] })
]);
ev(m1, 'Healer', 4, 10, [page({ sprite: 'characters/healer.png', commands: [
  { cmd: 'text', speaker: 'Healer', text: 'Let me restore your team to full health.' },
  { cmd: 'heal' },
  { cmd: 'text', speaker: 'Healer', text: 'Your monsters are fighting fit! Come back any time.' }
] })]);
qev(m1, 'Town sign', 12, 8, { type: 'sign', title: 'Starter Town', text: 'North: Route 1', look: 'tile', sprite: 'characters/sign-post.png', frontOnly: true });
qev(m1, 'Treasure chest', 17, 6, { type: 'chest', contents: 'item', itemId: 'super_potion', amount: 2, money: 100, message: '', emptyMessage: 'The chest is empty.', sprite: 'characters/chest.png', openSprite: 'characters/chest-open.png' });
ev(m1, 'Villager', 15, 9, [page({ sprite: 'characters/villager.png', move: 'random', commands: [
  { cmd: 'choice', speaker: 'Villager', text: 'Hello there! Would you like a tip about catching monsters?', yes: 'Yes please', no: 'No thanks', cancelIsNo: true,
    yesCmds: [{ cmd: 'text', speaker: 'Villager', text: 'Monsters in the tall grass get easier to catch when their HP is low. Status problems help too!' }],
    noCmds: [{ cmd: 'text', speaker: 'Villager', text: 'Suit yourself! Enjoy the sunshine.' }] }
] })]);
// People (NPC quick events): a jogger on a set route, and a gardener who gives a present once.
qev(m1, 'Jogger', 2, 2, { type: 'npc', role: 'talk', sprite: 'characters/lass.png', dir: 'right', speaker: 'Jogger', move: 'route', steps: Quick.ROUTES.square(2, true), speed: 'normal', text: 'Two laps around the flowers every morning keeps me fit!' });
qev(m1, 'Gardener', 11, 12, { type: 'npc', role: 'gift', sprite: 'characters/old-man.png', dir: 'up', speaker: 'Gardener', move: 'turn', speed: 'slow', text: 'You look like you\'re setting off on a journey. Take this with you!', itemId: 'super_potion', amount: 1, afterText: 'Mind the tall grass out there.' });
qev(m1, 'Shopkeeper', 6, 12, { type: 'shop', sprite: 'characters/shopkeeper.png', dir: 'up', greeting: 'Welcome to the Starter Town market! What can I do for you?', farewell: 'Please come again!',
  goods: [{ itemId: 'capture_orb', price: null }, { itemId: 'great_orb', price: null }, { itemId: 'potion', price: null }, { itemId: 'antidote', price: null }, { itemId: 'full_heal', price: null }], sell: true, sellRate: 50 });
qev(m1, 'Door to your room', 3, 12, { type: 'exit', how: 'step', mapId: 'map004', x: 4, y: 6, dir: 'up', sound: true, fade: true, sprite: '' });
qev(m1, 'House sign', 2, 13, { type: 'sign', title: 'Your house', text: 'Your room is through this door. Decorate it with furniture from the catalogue!', look: 'tile', sprite: 'characters/sign-post.png', frontOnly: false });
[9, 10].forEach(x => ev(m1, 'North exit', x, 1, [
  page({ trigger: 'touch', through: true, commands: [
    { cmd: 'text', text: 'It\'s dangerous to go into the tall grass without a monster! Visit the Professor first.' },
    { cmd: 'transfer', mapId: 'map001', x, y: 3, dir: 'down' }
  ] }),
  page({ condition: { switchId: 1, selfSwitch: false }, trigger: 'touch', through: true, commands: [{ cmd: 'transfer', mapId: 'map002', x, y: 17, dir: 'up', fade: 'black' }] })
]));

// Map 2: Route 1
const m2 = blankMap('map002', 'Route 1', 20, 20);
m2.bgm = 'music/route-open-road.mp3';
for (let x = 0; x < 20; x++) { setT(m2, 1, x, 0, 4); setT(m2, 1, x, 19, 4); setT(m2, 2, x, 0, -1); }
for (let y = 0; y < 20; y++) { setT(m2, 1, 0, y, 4); setT(m2, 1, 19, y, 4); setT(m2, 1, 1, y, 4); setT(m2, 1, 18, y, 4); }
setT(m2, 1, 9, 19, -1); setT(m2, 1, 10, 19, -1);
setT(m2, 1, 9, 0, -1); setT(m2, 1, 10, 0, -1); // gap in the trees: the top edge leads to Lakeside
fillT(m2, 0, 9, 0, 2, 20, PATH);
fillT(m2, 0, 3, 12, 5, 5, 1); fillT(m2, 0, 12, 4, 5, 6, 1); fillT(m2, 0, 3, 3, 4, 4, 1);
[[7, 9], [12, 14], [14, 15], [4, 9]].forEach(([x, y]) => setT(m2, 1, x, y, 5));
[[5, 8], [15, 12], [16, 16], [3, 17]].forEach(([x, y]) => setT(m2, 2, x, y, 6)); // flowers: walkable, on Layer 3
for (let x = 2; x < 18; x++) if (x !== 9 && x !== 10) setT(m2, 2, x, 0, 14);
setT(m2, 1, 11, 2, 13);
// a big 2x2 tree: top half on Above (walk behind it), bottom half on Detail (blocks)
setT(m2, 2, 15, 2, 20); setT(m2, 2, 16, 2, 21); setT(m2, 1, 15, 3, 28); setT(m2, 1, 16, 3, 29);
setT(m2, 1, 3, 10, 22); setT(m2, 1, 16, 11, 23);
m2.encounters = { chance: 12, list: [
  { speciesId: 'fluffkin', minLevel: 2, maxLevel: 4, weight: 40 },
  { speciesId: 'zapmouse', minLevel: 3, maxLevel: 4, weight: 20 },
  { speciesId: 'pebblit', minLevel: 3, maxLevel: 5, weight: 20 },
  { speciesId: 'toxifrog', minLevel: 3, maxLevel: 4, weight: 20 }
] };
[9, 10].forEach(x => qev(m2, 'South exit', x, 18, { type: 'exit', how: 'step', mapId: 'map001', x, y: 2, dir: 'down', sound: false, fade: true, sprite: '' }));
ev(m2, 'Youngster Joey', 11, 9, [
  page({ sprite: 'characters/youngster.png', dir: 'left', trigger: 'sight', sightRange: 4, commands: [
    { cmd: 'text', speaker: 'Youngster', text: 'Hey! Our eyes met — that means we battle!' },
    { cmd: 'trainerBattle', name: 'Youngster Joey', active: 1, party: [{ speciesId: 'fluffkin', level: 4 }, { speciesId: 'zapmouse', level: 5 }], reward: 120, winText: 'Aww, my monsters!', loseText: 'Better luck next time!' },
    { cmd: 'selfSwitch', value: true }
  ] }),
  page({ condition: { switchId: 0, selfSwitch: true }, sprite: 'characters/youngster.png', dir: 'left', commands: [{ cmd: 'text', speaker: 'Youngster', text: 'My Zapmouse is in the top percentage of Zapmice...' }] })
]);
ev(m2, 'Twins Ann & Ella', 8, 7, [
  page({ sprite: 'characters/twin.png', dir: 'right', trigger: 'sight', sightRange: 1, commands: [
    { cmd: 'text', speaker: 'Twins', text: 'We always fight together! It\'s a double battle!' },
    { cmd: 'trainerBattle', name: 'Twins Ann & Ella', active: 2, party: [{ speciesId: 'toxifrog', level: 5 }, { speciesId: 'pebblit', level: 5 }], reward: 200, winText: 'We lost... together.', loseText: 'Teamwork wins!' },
    { cmd: 'selfSwitch', value: true }
  ] }),
  page({ condition: { switchId: 0, selfSwitch: true }, sprite: 'characters/twin.png', dir: 'right', commands: [{ cmd: 'text', speaker: 'Twins', text: 'Double battles need you to plan for two at once!' }] })
]);
qev(m2, 'Hiker Hugo', 5, 10, { type: 'npc', role: 'trainer', sprite: 'characters/hiker.png', dir: 'right', speaker: 'Hiker', move: 'route', steps: Quick.ROUTES.backAndForth('right', 2), speed: 'slow',
  trainerName: 'Hiker Hugo', sight: 3, active: 0, reward: 150, party: [{ speciesId: 'pebblit', level: 6 }], text: 'I walk this path every day. Let\'s battle!', winText: 'Solid as a rock… but not enough!', loseText: 'Rock steady!', afterText: 'Keep your boots dry near the lake.' });
qev(m2, 'Great Orb on the ground', 4, 2, { type: 'item', itemId: 'great_orb', amount: 1, message: '', look: 'visible', sprite: 'characters/ball.png' });
qev(m2, 'Hidden Potion', 17, 15, { type: 'item', itemId: 'potion', amount: 1, message: '', look: 'hidden', sprite: 'characters/ball.png' });
// A monster encounter area over the north-east tall grass: different monsters from the rest of Route 1.
qev(m2, 'North-east grass', 12, 4, { type: 'encounter', dx: 0, dy: 0, width: 5, height: 6, chance: 15, active: 0, onlyEncTiles: true, once: false, message: '',
  list: [{ speciesId: 'zapmouse', minLevel: 4, maxLevel: 6, weight: 25 }, { speciesId: 'pebblit', minLevel: 4, maxLevel: 6, weight: 25 }, { speciesId: 'sproutle', minLevel: 5, maxLevel: 5, weight: 4 }] });
qev(m2, 'Route sign', 11, 2, { type: 'sign', title: 'Route 1', text: 'North: Lakeside\n\nWild monsters live in the tall grass. Weaken them before throwing an orb!', look: 'tile', sprite: 'characters/sign-post.png', frontOnly: true });

// Map 3: Lakeside, joined to Route 1 by walking off the top of Route 1 (a map edge, no event needed).
const m3 = blankMap('map003', 'Lakeside', 20, 15);
for (let x = 0; x < 20; x++) { setT(m3, 1, x, 0, 4); if (x !== 9 && x !== 10) setT(m3, 1, x, 14, 4); }
for (let y = 0; y < 15; y++) { setT(m3, 1, 0, y, 4); setT(m3, 1, 19, y, 4); }
fillT(m3, 1, 3, 2, 14, 6, WATER); fillT(m3, 1, 5, 8, 10, 2, WATER); // the lake: one water autotile, edges drawn automatically
fillT(m3, 0, 9, 10, 2, 5, PATH);
fillT(m3, 0, 2, 11, 6, 3, 1); fillT(m3, 0, 13, 11, 5, 3, 1);
[[2, 9], [17, 9], [12, 12]].forEach(([x, y]) => setT(m3, 2, x, y, 6));
m3.encounters = { chance: 10, list: [{ speciesId: 'splashling', minLevel: 4, maxLevel: 6, weight: 20 }, { speciesId: 'toxifrog', minLevel: 4, maxLevel: 6, weight: 30 }, { speciesId: 'fluffkin', minLevel: 4, maxLevel: 5, weight: 30 }] };
qev(m3, 'Lake sign', 11, 11, { type: 'sign', title: 'Lakeside', text: 'Please don\'t feed the Splashlings.\n\nSouth: Route 1', look: 'post', sprite: 'characters/sign-post.png', frontOnly: true });
// A lever (switch event) and a boulder that only appears while the lever's switch is OFF.
qev(m3, 'Lever', 7, 11, { type: 'lever', switchId: 3, offSprite: 'characters/lever-off.png', onSprite: 'characters/lever-on.png', oneWay: false, onText: 'You pulled the lever. Something rumbled to the east!', offText: 'You pushed the lever back.', doneText: '', sound: 'sounds/door.mp3' });
ev(m3, 'Boulder', 17, 10, [page({ sprite: 'characters/boulder.png', commands: [{ cmd: 'text', speaker: '', text: 'A huge boulder. Maybe a lever somewhere moves it?' }] }), page({ condition: { switchId: 3, selfSwitch: false }, sprite: '', through: true })]);
// A cut scene that plays the first time the player arrives at Lakeside.
qev(m3, 'Lakeside arrival', 1, 1, { type: 'cutscene', start: 'map', commands: [
  { cmd: 'camera', mode: 'pan', x: 9, y: 4, frames: 70 },
  { cmd: 'text', speaker: '', text: 'A wide, sparkling lake stretches out ahead.' },
  { cmd: 'camera', mode: 'player', frames: 50 },
  { cmd: 'balloon', target: 'player', icon: '!' },
  { cmd: 'text', speaker: '', text: 'Wild monsters must love it here!' }
] });
m2.edges.up = { mapId: 'map003', offset: 0 };
m3.edges.down = { mapId: 'map002', offset: 0 };

// Map 4: Your Room. Players can decorate it (Decorating feature) and change clothes at the wardrobe.
const m4 = blankMap('map004', 'Your Room', 10, 8);
m4.tilesetId = 'interior'; m4.bgm = ''; m4.battleback = 'battlebacks/town.png';
m4.decoratable = true;
fillT(m4, 0, 0, 0, 10, 8, 0); fillT(m4, 1, 0, 0, 10, 1, 4); fillT(m4, 1, 0, 1, 10, 1, 5); setT(m4, 1, 2, 1, 6); setT(m4, 1, 7, 1, 6);
for (let y = 2; y < 8; y++) { setT(m4, 1, 0, y, 4); setT(m4, 1, 9, y, 4); }
setT(m4, 1, 1, 2, 20); setT(m4, 1, 8, 2, 24); setT(m4, 0, 4, 7, 23);
qev(m4, 'Door out', 4, 7, { type: 'exit', how: 'step', mapId: 'map001', x: 3, y: 13, dir: 'down', sound: true, fade: true, sprite: '' });
qev(m4, 'Furniture catalogue', 1, 2, { type: 'shop', sprite: '', dir: 'down', greeting: 'Welcome to the Home & Style catalogue! Furniture for your room, and clothes for you.', farewell: 'Your order will be delivered straight to your bag!',
  goods: FURNITURE.map(([f]) => ({ itemId: f.replace(/-/g, '_'), price: null })).concat(CLOTHES.filter(c => c[3] > 0).map(([f]) => ({ itemId: f.replace(/-/g, '_'), price: null }))), sell: true, sellRate: 50 });
ev(m4, 'Wardrobe', 8, 2, [page({ sprite: '', commands: [{ cmd: 'text', text: 'Your wardrobe. What will you wear today?' }, { cmd: 'openScreen', screen: 'wardrobe' }] })]);
ev(m4, 'Mum\'s note', 6, 2, [page({ sprite: 'characters/sign-post.png', commands: [{ cmd: 'text', speaker: 'Note', text: 'I put a bed, a plant and a rug in your bag. Open the menu (X) and choose Decorate to place them. Face anything you have placed and press Z to turn it, move it or put it away. Love, Mum' }] })]);

const mapInfos = [{ id: 'map001', name: 'Starter Town' }, { id: 'map002', name: 'Route 1' }, { id: 'map003', name: 'Lakeside' }, { id: 'map004', name: 'Your Room' }];

J('project.json', { name: 'Sample Monster Quest', engine: 'Pocket-Game-Maker', formatVersion: 1 });
J('data/system.json', system);
J('data/types.json', { types, chart });
J('data/moves.json', moves);
J('data/monsters.json', monsters);
J('data/items.json', items);
J('data/tilesets.json', tilesets);
J('data/mapinfos.json', mapInfos);
J('data/maps/map001.json', m1);
J('data/maps/map002.json', m2);
J('data/maps/map003.json', m3);
J('data/maps/map004.json', m4);
J('data/credits.json', sampleCredits);
W('CREDITS.md', CR.toMarkdown('Sample Monster Quest asset credits', sampleCredits, 'Every image, music track and sound in this game with where it came from and its licence. Edit this list in Pocket-Game-Maker under Database > Credits.'));
console.log('Sample project written to', OUT);
