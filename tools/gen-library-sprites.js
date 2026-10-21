// Characters, monsters, battle backgrounds, event objects, licence and manifest for the Asset Library.
const fs = require('fs');
const path = require('path');
const P = require('./pixel');
const { Image, px, rect, hline, vline, spr, blob, outline, blit, mirror, scale, speckle, rng } = P;
const { O } = require('./gen-library');
const CR = require('../src/shared/credits');
const credit = extra => Object.assign({ origin: CR.DEFAULT_ORIGIN, author: CR.DEFAULT.author, licence: CR.DEFAULT.licence, status: CR.DEFAULT.status }, extra || {});

const OUT = path.join(__dirname, '..', 'library');
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const manifest = { characters: {}, monsters: {}, battlebacks: {}, pictures: {}, decorations: {} };

/* ======================================================================
   Characters: 3 frames x 4 directions of 16x16, built from templates
   Slots: O outline, H hair, h hair shade, S skin, E eye, C shirt, c shirt shade,
          L legs, F shoes, A hat, a hat shade, Q skirt
   ====================================================================== */
const BODY = {
  down: [
    '................',
    '.....OOOOOO.....',
    '....OHHHHHHO....',
    '...OHHHHHHHHO...',
    '...OHHHHHHHhO...',
    '...OHSSSSSShO...',
    '...OSSESSESSO...',
    '...OSSSSSSSSO...',
    '....OOSSSSOO....',
    '...OCCCCCCCcO...',
    '..OSCCCCCCCcSO..',
    '..OSCCCCCCCcSO..',
    '...OOLLLLLLOO...'],
  up: [
    '................',
    '.....OOOOOO.....',
    '....OHHHHHHO....',
    '...OHHHHHHHHO...',
    '...OHHHHHHHhO...',
    '...OHHHHHHHhO...',
    '...OHHHHHHHhO...',
    '...OhHHHHHHhO...',
    '....OOSSSSOO....',
    '...OCCCCCCCcO...',
    '..OSCCCCCCCcSO..',
    '..OSCCCCCCCcSO..',
    '...OOLLLLLLOO...'],
  left: [
    '................',
    '.....OOOOO......',
    '....OHHHHHO.....',
    '...OHHHHHHHO....',
    '...OHHHHHHhO....',
    '...OSSHHHHhO....',
    '..OSESSHHHhO....',
    '...OSSSSHhO.....',
    '....OOSSOO......',
    '....OCCCCcO.....',
    '....OCCSCcO.....',
    '....OCCSCcO.....',
    '....OLLLLLO.....']
};
const LEGS = {
  front: [
    ['....OLLO.OLLO...', '....OFFO.OFFO...', '.....OO...OO....'],
    ['....OLLO.OFFO...', '....OFFO..OO....', '.....OO.........'],
    ['....OFFO.OLLO...', '.....OO..OFFO...', '..........OO....']],
  side: [
    ['.....OLLLO......', '.....OFFFO......', '......OOO.......'],
    ['....OLO.OLO.....', '...OFFO..OFO....', '...OOO....O.....'],
    ['....OLLLLO......', '...OFO.OFO......', '...OO...OO......']]
};
const HAT = {
  down: ['.....OOOOOO.....', '....OAAAAAAO....', '...OAAAAAAAAO...', '..OaaaaaaaaaaO..'],
  up: ['.....OOOOOO.....', '....OAAAAAAO....', '...OAAAAAAAAO...', '...OaAAAAAAaO...'],
  left: ['.....OOOOO......', '....OAAAAAO.....', '...OAAAAAAAO....', '.OaaaaAAAAAO....']
};

function frame(view, f, o) {
  const img = new Image(16, 16);
  const body = BODY[view === 'right' ? 'left' : view].slice();
  const legs = LEGS[view === 'up' || view === 'down' ? 'front' : 'side'][f];
  const map = Object.assign({ O: 'K', E: 'K', H: 't', h: 'h', S: 'f', C: 'R', c: 'r', L: 'b', F: 'k', A: 'R', a: 'r', Q: 'P' }, o.colours);
  if (o.skirt) map.L = map.S;
  spr(img, 0, 0, body.concat(legs), map);
  const v = view === 'right' ? 'left' : view;
  if (o.hat) spr(img, 0, 0, HAT[v], map);
  if (o.longHair) {
    const rows = v === 'left' ? [[9, 10]] : [[3, 12]];
    for (let y = 6; y <= 10; y++) for (const [a, b] of rows) { px(img, a, y, map.H); px(img, b, y, map.h); }
    for (let y = 6; y <= 10; y++) for (const [a, b] of rows) { if (v !== 'left') px(img, a - 1, y, 'K'); px(img, b + 1, y, 'K'); }
  }
  if (o.skirt) {
    const row = v === 'left' ? '...OQQQQQQO.....' : '..OQQQQQQQQQQO..';
    spr(img, 0, 12, [row], map);
  }
  if (o.coat && v !== 'up') { spr(img, 0, 12, [v === 'left' ? '....OCCCCcO.....' : '...OCCLLLLCcO...'], map); }
  if (o.coat && v === 'up') spr(img, 0, 12, ['...OCCCCCCCcO...'], map);
  if (o.bag && v === 'up') { rect(img, 5, 9, 6, 3, map.A || 'y'); hline(img, 5, 9, 6, 'K'); }
  return view === 'right' ? mirror(img) : img;
}
function character(file, name, o) {
  const sheet = new Image(48, 64);
  ['down', 'left', 'right', 'up'].forEach((view, row) => {
    const order = [1, 0, 2]; // columns: step, stand, other step
    for (let col = 0; col < 3; col++) blit(sheet, frame(view, order[col] === 0 ? 0 : order[col], o), col * 16, row * 16);
  });
  write('characters/' + file, sheet.toPNG());
  manifest.characters['characters/' + file] = credit({ name, description: o.desc || '' });
}
// Static event objects (same picture in every frame)
function object(file, name, img16, desc) {
  const sheet = new Image(48, 64);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) blit(sheet, img16, c * 16, r * 16);
  write('characters/' + file, sheet.toPNG());
  manifest.characters['characters/' + file] = credit({ name, description: desc });
}

character('hero.png', 'Hero', { hat: true, colours: { A: 'R', a: 'r', C: 'R', c: 'r', H: 't', h: 'h', L: 'b' }, bag: true, desc: 'Player character with a red cap.' });
character('heroine.png', 'Heroine', { hat: true, longHair: true, skirt: true, colours: { A: 'W', a: 'S', C: 'B', c: 'b', H: 'T', h: 't', Q: 'R' }, bag: true, desc: 'Player character with a white hat.' });
character('professor.png', 'Professor', { coat: true, colours: { C: 'W', c: 'S', H: 'S', h: 's', L: 'T' }, desc: 'Monster researcher in a lab coat.' });
character('healer.png', 'Healer', { longHair: true, skirt: true, colours: { C: 'W', c: 'S', H: 'P', h: 'p', Q: 'q' }, desc: 'Heals your team.' });
character('shopkeeper.png', 'Shopkeeper', { colours: { C: 'B', c: 'b', H: 'k', h: 'K', L: 'n' }, desc: 'Runs a shop counter.' });
character('rival.png', 'Rival', { colours: { C: 'p', c: 'P', H: 'o', h: 'x', L: 'k' }, desc: 'Your rival.' });
character('youngster.png', 'Youngster', { hat: true, colours: { A: 'Y', a: 'y', C: 'G', c: 'g', H: 't', L: 'b' }, desc: 'Young trainer in a yellow cap.' });
character('lass.png', 'Lass', { longHair: true, skirt: true, colours: { C: 'q', c: 'P', H: 'Y', h: 'y', Q: 'p' }, desc: 'Trainer with long blonde hair.' });
character('hiker.png', 'Hiker', { hat: true, colours: { A: 'T', a: 't', C: 'o', c: 'x', H: 'h', L: 'u' }, desc: 'Mountain trainer.' });
character('old-man.png', 'Old man', { colours: { C: 'T', c: 't', H: 'W', h: 'S', L: 'n' }, desc: 'Elderly villager.' });
character('villager.png', 'Villager', { colours: { C: 'B', c: 'b', H: 'T', h: 't', L: 'n' }, desc: 'Townsperson.' });
character('twin.png', 'Twin', { longHair: true, skirt: true, colours: { C: 'p', c: 'P', H: 'Y', h: 'y', Q: 'p' }, desc: 'One of the twins (use twice for double battles).' });
character('trainer.png', 'Ace trainer', { hat: true, colours: { A: 'g', a: 'd', C: 'G', c: 'g', H: 'k', L: 'n' }, desc: 'Experienced trainer.' });

object('ball.png', 'Capture orb', (() => {
  const o = new Image(16, 16);
  blob(o, 8, 9, 5.5, 5.5, { base: 'W', dark: 'S', light: 'W' });
  const top = new Image(16, 16); blob(top, 8, 9, 5.5, 5.5, { base: 'R', dark: 'r', light: 'q' });
  for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; if (top.data[i + 3]) o.set(x, y, [top.data[i], top.data[i + 1], top.data[i + 2], 255]); }
  hline(o, 3, 9, 11, 'K'); rect(o, 7, 8, 3, 3, 'K'); px(o, 8, 9, 'W'); px(o, 5, 5, 'W');
  outline(o, 'K'); return o;
})(), 'An item lying on the ground. Use for item pickups and starters.');
object('chest.png', 'Treasure chest', (() => {
  const o = new Image(16, 16);
  rect(o, 2, 5, 12, 9, 'T'); rect(o, 2, 3, 12, 4, 'u'); hline(o, 2, 3, 12, 'U'); hline(o, 2, 7, 12, 't');
  for (const x of [4, 11]) vline(o, x, 3, 11, 'y'); rect(o, 7, 7, 2, 3, 'Y'); outline(o, 'K'); return o;
})(), 'Closed chest for item pickups.');
object('chest-open.png', 'Treasure chest (open)', (() => {
  const o = new Image(16, 16);
  rect(o, 2, 8, 12, 6, 'T'); hline(o, 2, 13, 12, 't'); for (const x of [4, 11]) vline(o, x, 8, 6, 'y');
  rect(o, 2, 1, 12, 4, 'u'); hline(o, 2, 1, 12, 'U'); for (const x of [4, 11]) vline(o, x, 1, 4, 'y');
  rect(o, 3, 5, 10, 3, 'h'); rect(o, 4, 6, 8, 2, 'K'); outline(o, 'K'); return o;
})(), 'Open chest: shown after a chest has been opened.');
object('boulder.png', 'Boulder', O.boulder, 'A boulder event, e.g. to block a path until a switch is on.');
object('sign-post.png', 'Sign post', O.sign, 'A sign as an event, so it can be talked to anywhere.');
const lever = on => { const o = new Image(16, 16);
  rect(o, 3, 11, 10, 4, 'm'); hline(o, 3, 11, 10, 'S'); hline(o, 3, 14, 10, 'n'); rect(o, 6, 10, 4, 2, 'n');
  for (let k = 0; k < 7; k++) { const x = on ? 8 + Math.round(k * 0.6) : 7 - Math.round(k * 0.6); px(o, x, 10 - k, 'T'); px(o, x + 1, 10 - k, 't'); }
  blob(o, on ? 12.5 : 3.5, 3.5, 2, 2, { base: on ? 'G' : 'R', dark: on ? 'g' : 'r', light: on ? 'L' : 'q' }); outline(o, 'K'); return o; };
object('lever-off.png', 'Lever (off)', lever(false), 'A switch event in its OFF position (use with the Switch / lever quick event).');
object('lever-on.png', 'Lever (on)', lever(true), 'A switch event in its ON position.');

/* ======================================================================
   Clothing for the Wardrobe.
   outfit-*.png  whole looks: a full character sheet that replaces the player's sprite
   wear-*.png    pieces drawn over the player's sprite (same 3x4 layout, transparent elsewhere):
                 hats recolour the cap, tops the shirt, bottoms the trousers
   ====================================================================== */
function outfit(file, name, o) { character(file, name, o); }
function wearFrame(view, f, part, colours) {
  const img = new Image(16, 16);
  const v = view === 'right' ? 'left' : view;
  const map = Object.assign({ C: 'R', c: 'r', L: 'b', A: 'R', a: 'r' }, colours);
  const keep = { hat: ['A', 'a', 'O'], top: ['C', 'c'], bottom: ['L'] }[part];
  const only = rows => rows.map(r => r.split('').map(ch => keep.includes(ch) ? ch : '.').join(''));
  const m = Object.assign({}, map, { O: 'K' });
  if (part === 'hat') spr(img, 0, 0, HAT[v], m);
  else {
    const body = BODY[v].slice(), legs = LEGS[v === 'up' || v === 'down' ? 'front' : 'side'][f];
    spr(img, 0, 0, only(body.concat(legs)), m);
  }
  return view === 'right' ? mirror(img) : img;
}
function wear(file, name, part, colours, desc) {
  const sheet = new Image(48, 64);
  ['down', 'left', 'right', 'up'].forEach((view, row) => {
    const order = [1, 0, 2];
    for (let col = 0; col < 3; col++) blit(sheet, wearFrame(view, order[col], part, colours), col * 16, row * 16);
  });
  write('characters/' + file, sheet.toPNG());
  manifest.characters['characters/' + file] = credit({ name, description: desc });
}
outfit('outfit-hero-casual.png', 'Outfit: Hero casual', { colours: { C: 'R', c: 'r', H: 't', h: 'h', L: 'b' }, bag: true, desc: 'Wardrobe outfit: the Hero without a cap. Use as a whole look.' });
outfit('outfit-hero-cool.png', 'Outfit: Hero blue jacket', { colours: { C: 'B', c: 'b', H: 't', h: 'h', L: 'k', A: 'Y' }, bag: true, desc: 'Wardrobe outfit: blue jacket and dark trousers.' });
outfit('outfit-hero-explorer.png', 'Outfit: Hero explorer', { hat: true, colours: { A: 'U', a: 'T', C: 'G', c: 'g', H: 't', h: 'h', L: 'u' }, bag: true, desc: 'Wardrobe outfit: explorer hat, green shirt and khaki trousers.' });
outfit('outfit-heroine-casual.png', 'Outfit: Heroine casual', { longHair: true, skirt: true, colours: { C: 'B', c: 'b', H: 'T', h: 't', Q: 'R' }, bag: true, desc: 'Wardrobe outfit: the Heroine without a hat.' });
outfit('outfit-heroine-sporty.png', 'Outfit: Heroine sporty', { hat: true, longHair: true, colours: { A: 'P', a: 'p', C: 'q', c: 'P', H: 'T', h: 't', L: 'k' }, bag: true, desc: 'Wardrobe outfit: pink cap, top and dark leggings.' });
wear('wear-cap-blue.png', 'Cap: blue', 'hat', { A: 'B', a: 'b' }, 'Wardrobe piece (hat): a blue cap, drawn over the player.');
wear('wear-cap-green.png', 'Cap: green', 'hat', { A: 'G', a: 'g' }, 'Wardrobe piece (hat): a green cap.');
wear('wear-cap-yellow.png', 'Cap: yellow', 'hat', { A: 'Y', a: 'y' }, 'Wardrobe piece (hat): a yellow cap.');
wear('wear-cap-black.png', 'Cap: black', 'hat', { A: 'k', a: 'K' }, 'Wardrobe piece (hat): a black cap.');
wear('wear-shirt-blue.png', 'Top: blue', 'top', { C: 'B', c: 'b' }, 'Wardrobe piece (top): a blue shirt, drawn over the player.');
wear('wear-shirt-green.png', 'Top: green', 'top', { C: 'G', c: 'g' }, 'Wardrobe piece (top): a green shirt.');
wear('wear-shirt-yellow.png', 'Top: yellow', 'top', { C: 'Y', c: 'y' }, 'Wardrobe piece (top): a yellow shirt.');
wear('wear-shirt-white.png', 'Top: white', 'top', { C: 'W', c: 'S' }, 'Wardrobe piece (top): a white shirt.');
wear('wear-trousers-black.png', 'Bottoms: black', 'bottom', { L: 'k' }, 'Wardrobe piece (bottoms): black trousers.');
wear('wear-trousers-khaki.png', 'Bottoms: khaki', 'bottom', { L: 'u' }, 'Wardrobe piece (bottoms): khaki trousers.');

/* ======================================================================
   Decorations: furniture players can buy and place in a house.
   One 16x16 tile per square, seen from above at a slight angle.
   ====================================================================== */
function decoration(file, name, w, h, draw, desc) {
  const img = new Image(w * 16, h * 16); draw(img); outline(img, 'K');
  write('decorations/' + file, img.toPNG());
  manifest.decorations['decorations/' + file] = credit({ name, description: desc, size: w + 'x' + h });
}
decoration('bed.png', 'Bed', 1, 2, o => { rect(o, 1, 1, 14, 30, 't'); rect(o, 2, 2, 12, 28, 'T'); rect(o, 3, 3, 10, 6, 'W'); hline(o, 3, 8, 10, 'S'); rect(o, 2, 11, 12, 18, 'R'); for (let y = 12; y < 29; y += 3) hline(o, 2, y, 12, 'r'); hline(o, 2, 11, 12, 'q'); }, 'A single bed, 1x2 squares.');
decoration('table.png', 'Wooden table', 2, 1, o => { rect(o, 1, 2, 30, 10, 'T'); hline(o, 1, 2, 30, 'U'); hline(o, 1, 11, 30, 't'); for (const x of [2, 28]) rect(o, x, 12, 2, 3, 't'); rect(o, 12, 4, 8, 5, 'W'); rect(o, 14, 5, 4, 3, 'G'); }, 'A table with a cloth, 2x1 squares.');
decoration('chair.png', 'Chair', 1, 1, o => { rect(o, 4, 1, 8, 6, 't'); rect(o, 5, 2, 6, 4, 'T'); rect(o, 3, 7, 10, 5, 'T'); hline(o, 3, 7, 10, 'U'); for (const x of [3, 11]) rect(o, x, 12, 2, 3, 't'); }, 'A wooden chair.');
decoration('plant.png', 'Potted plant', 1, 1, o => { blob(o, 8, 6, 6, 5.5, { base: 'G', dark: 'g', light: 'L' }); blob(o, 5, 4, 3, 3, { base: 'L', dark: 'G' }); rect(o, 5, 10, 6, 5, 'O'); hline(o, 4, 10, 8, 'x'); vline(o, 10, 11, 4, 'x'); }, 'A leafy plant in a pot.');
decoration('bookshelf.png', 'Bookshelf', 2, 1, o => { rect(o, 1, 0, 30, 15, 't'); rect(o, 2, 1, 28, 13, 'h'); const cols = 'RBGYPWOq'; for (let sh = 0; sh < 2; sh++) { hline(o, 2, 7 + sh * 7, 28, 't'); for (let x = 3; x < 29; x += 2) rect(o, x, 2 + sh * 7, 2, 5 - (x % 3 === 0 ? 1 : 0), cols[(x + sh * 3) % cols.length]); } }, 'A bookshelf full of books, 2x1 squares.');
decoration('rug.png', 'Round rug', 2, 2, o => { blob(o, 16, 16, 15, 13, { base: 'P', dark: 'p', light: 'q' }); blob(o, 16, 16, 10, 8, { base: 'q', dark: 'P', light: 'W' }); blob(o, 16, 16, 4, 3, { base: 'P', dark: 'p' }); }, 'A round rug, 2x2 squares. Players can walk over it.');
decoration('lamp.png', 'Floor lamp', 1, 1, o => { rect(o, 7, 6, 2, 8, 'm'); rect(o, 5, 13, 6, 2, 'n'); for (let j = 0; j < 5; j++) hline(o, 5 - Math.floor(j / 2), 1 + j, 6 + Math.floor(j / 2) * 2, j < 1 ? 'Y' : 'y'); }, 'A tall lamp.');
decoration('sofa.png', 'Sofa', 2, 1, o => { rect(o, 1, 1, 30, 6, 'b'); rect(o, 1, 6, 30, 7, 'B'); for (const x of [1, 27]) rect(o, x, 3, 4, 10, 'b'); vline(o, 16, 7, 6, 'b'); hline(o, 1, 13, 30, 'n'); }, 'A blue sofa, 2x1 squares.');
decoration('tv.png', 'Television', 1, 1, o => { rect(o, 1, 9, 14, 6, 't'); hline(o, 1, 9, 14, 'T'); rect(o, 2, 1, 12, 8, 'k'); rect(o, 3, 2, 10, 6, 'b'); px(o, 4, 3, 'c'); px(o, 5, 3, 'c'); }, 'A TV on a low cabinet.');
decoration('plush.png', 'Monster plush', 1, 1, o => { blob(o, 8, 9, 5.5, 5, { base: 'O', dark: 'x', light: 'y' }); for (const s of [-1, 1]) blob(o, 8 + s * 4, 4, 2, 2, { base: 'O', dark: 'x' }); rect(o, 6, 8, 1, 2, 'K'); rect(o, 9, 8, 1, 2, 'K'); hline(o, 7, 11, 2, 'K'); }, 'A soft toy of a fire monster.');
decoration('dresser.png', 'Dresser', 1, 1, o => { rect(o, 1, 2, 14, 13, 'T'); hline(o, 1, 2, 14, 'U'); for (const y of [6, 10]) hline(o, 1, y, 14, 't'); for (const y of [4, 8, 12]) rect(o, 7, y, 2, 1, 'Y'); }, 'A chest of drawers.');
decoration('trophy.png', 'Trophy', 1, 1, o => { rect(o, 4, 12, 8, 3, 'h'); rect(o, 7, 9, 2, 3, 'y'); blob(o, 8, 5, 4.5, 4, { base: 'Y', dark: 'y', light: 'W' }); for (const s of [-1, 1]) px(o, 8 + s * 5, 4, 'y'); }, 'A shiny trophy on a stand.');

/* ======================================================================
   Monsters: drawn at 32x32, scaled x2 to 64x64 (front and back)
   ====================================================================== */
function monster(id, name, o) {
  for (const side of ['front', 'back']) {
    const img = new Image(32, 32);
    const cx = 16, cy = o.cy || 19, rx = o.rx || 9, ry = o.ry || 8;
    const col = { base: o.base, dark: o.dark, deep: o.deep || o.dark, light: o.light };
    // behind the body
    if (o.wings) for (const s of [-1, 1]) { blob(img, cx + s * (rx + 3), cy - 3, 5, 6, { base: o.wingC || o.dark, dark: o.deep || o.dark, light: o.base }); }
    if (o.tail) { blob(img, cx + rx + 2, cy + 1, 3.5, 2.5, col); blob(img, cx + rx + 5, cy - 3, 2.8, 3.2, { base: o.tailTip || o.base, dark: o.tailTip || o.dark, light: o.tailTip || o.light }); }
    if (o.zigTail) { for (let k = 0; k < 7; k++) rect(img, cx + rx + (k % 2 ? 2 : 0), cy - k * 2, 3, 2, o.base); }
    if (o.bigTail) { blob(img, cx + rx + 3, cy - 2, 5, 6, col); blob(img, cx + rx + 4, cy - 7, 2.5, 2.5, { base: 'W', dark: 'S' }); }
    if (o.shell) blob(img, cx + 3, cy - 3, 8, 7, { base: 'T', dark: 't', light: 'U', deep: 'h' });
    if (o.ears === 'round') for (const s of [-1, 1]) blob(img, cx + s * (rx - 2), cy - ry, 3, 3, col);
    if (o.ears === 'long') for (const s of [-1, 1]) { rect(img, cx + s * 5 - 1, cy - ry - 8, 3, 9, o.base); rect(img, cx + s * 5 - 1, cy - ry - 8, 3, 3, 'K'); }
    if (o.ears === 'pointy') for (const s of [-1, 1]) for (let k = 0; k < 6; k++) hline(img, cx + s * 6 - Math.floor(k / 2), cy - ry - 5 + k, k + 1, o.base);
    if (o.spikes) for (let k = -2; k <= 2; k++) { const sx = cx + k * 4; for (let j = 0; j < 4; j++) hline(img, sx - Math.floor(j / 2), cy - ry - 3 + j - Math.abs(k), j + 1, o.spikeC || o.dark); }
    if (o.leaf) { blob(img, cx - 3, cy - ry - 3, 2.5, 4, { base: 'G', dark: 'g', light: 'L' }); blob(img, cx + 3, cy - ry - 2, 2.5, 3.5, { base: 'g', dark: 'd', light: 'G' }); vline(img, cx, cy - ry - 1, 3, 'g'); }
    if (o.fin) for (let j = 0; j < 5; j++) hline(img, cx - 2 + j, cy - ry - 4 + j, 5 - j, o.light);
    if (o.claws) for (const s of [-1, 1]) { blob(img, cx + s * (rx + 3), cy - 2, 3.5, 3, col); px(img, cx + s * (rx + 3), cy - 4, 'K'); }
    // body
    if (o.ghost) {
      blob(img, cx, cy - 2, rx, ry, col);
      for (let k = -rx; k <= rx; k += 4) blob(img, cx + k + 1, cy + ry - 3, 2.2, 2.6, col);
    } else blob(img, cx, cy, rx, ry, col);
    if (o.belly && side === 'front') blob(img, cx, cy + 3, rx * 0.55, ry * 0.45, { base: o.belly, dark: o.belly, light: 'W' });
    if (o.spots) for (const [a, b] of [[-4, -3], [3, -4], [5, 2], [-5, 3]]) { px(img, cx + a, cy + b, o.spots); px(img, cx + a + 1, cy + b, o.spots); }
    if (o.cracks) { hline(img, cx - 4, cy - 2, 3, o.deep || o.dark); px(img, cx - 1, cy - 1, o.deep || o.dark); hline(img, cx + 2, cy + 3, 3, o.deep || o.dark); }
    if (!o.ghost && !o.noFeet) for (const s of [-1, 1]) blob(img, cx + s * (rx - 3), cy + ry - 1, 2.8, 1.8, { base: o.dark, dark: o.deep || o.dark });
    if (o.shell && side === 'front') { for (let k = 0; k < 3; k++) px(img, cx + 3 + k - 1, cy - 4 + k, 't'); }
    // face
    if (side === 'front') {
      const ey = cy - (o.eyeY || 2), gap = o.eyeGap || 3;
      for (const s of [-1, 1]) {
        const ex = cx + s * gap + (s < 0 ? -1 : 0);
        rect(img, ex, ey - 1, 2, 3, o.eyeC || 'K'); px(img, ex, ey - 1, 'W');
      }
      if (o.beak) { rect(img, cx - 1, ey + 2, 3, 2, 'y'); px(img, cx, ey + 4, 'O'); }
      else { hline(img, cx - 1, ey + 3, 3, 'K'); if (o.fangs) { px(img, cx - 1, ey + 4, 'W'); px(img, cx + 1, ey + 4, 'W'); } }
      if (o.cheeks) for (const s of [-1, 1]) px(img, cx + s * (gap + 3), ey + 2, o.cheeks);
    } else {
      blob(img, cx, cy - 2, rx * 0.7, ry * 0.45, { base: o.dark, dark: o.dark, light: o.base });
    }
    outline(img, 'K');
    write('monsters/' + id + '_' + side + '.png', scale(img, 2).toPNG());
  }
  manifest.monsters['monsters/' + id] = credit({ name, description: o.desc || '', types: o.types || [] });
}

monster('embercub', 'Embercub', { base: 'o', dark: 'x', deep: 'r', light: 'y', belly: 'Y', ears: 'round', tail: true, tailTip: 'Y', types: ['fire'], desc: 'Fire starter.' });
monster('blazebear', 'Blazebear', { base: 'x', dark: 'r', light: 'o', belly: 'y', ears: 'round', tail: true, tailTip: 'Y', fangs: true, rx: 11, ry: 10, cy: 18, types: ['fire'], desc: 'Evolved fire starter.' });
monster('splashling', 'Splashling', { base: 'B', dark: 'b', light: 'c', belly: 'c', fin: true, rx: 8, ry: 7, cy: 21, types: ['water'], desc: 'Water starter.' });
monster('tidalisk', 'Tidalisk', { base: 'b', dark: 'n', light: 'B', belly: 'c', spikes: true, spikeC: 'c', tail: true, tailTip: 'c', rx: 11, ry: 9, types: ['water'], desc: 'Evolved water starter.' });
monster('sproutle', 'Sproutle', { base: 'G', dark: 'g', deep: 'd', light: 'L', belly: 'L', leaf: true, types: ['grass'], desc: 'Grass starter.' });
monster('thornox', 'Thornox', { base: 'g', dark: 'd', deep: 'D', light: 'G', belly: 'L', spikes: true, spikeC: 'p', fangs: true, rx: 11, ry: 10, cy: 18, types: ['grass', 'poison'], desc: 'Evolved grass starter.' });
monster('zapmouse', 'Zapmouse', { base: 'Y', dark: 'y', light: 'W', ears: 'long', zigTail: true, cheeks: 'R', rx: 8, ry: 7, cy: 21, types: ['electric'], desc: 'Electric mouse.' });
monster('pebblit', 'Pebblit', { base: 's', dark: 'm', deep: 'n', light: 'S', cracks: true, rx: 10, ry: 7, cy: 21, noFeet: true, types: ['rock'], desc: 'Living pebble.' });
monster('fluffkin', 'Fluffkin', { base: 'e', dark: 'U', deep: 'u', light: 'W', belly: 'W', ears: 'round', rx: 10, ry: 9, types: ['normal'], desc: 'Common fluffy monster.' });
monster('toxifrog', 'Toxifrog', { base: 'P', dark: 'p', light: 'q', belly: 'q', spots: 'Y', rx: 10, ry: 6, cy: 22, eyeY: 4, eyeGap: 5, types: ['poison'], desc: 'Poison frog.' });
monster('flitwing', 'Flitwing', { base: 'T', dark: 't', deep: 'h', light: 'U', belly: 'e', wings: true, beak: true, rx: 8, ry: 8, types: ['normal'], desc: 'Small bird. Not in the sample database: add it in Database → Monsters.' });
monster('gloomshade', 'Gloomshade', { base: 'S', dark: 's', deep: 'm', light: 'W', ghost: true, eyeC: 'p', rx: 9, ry: 9, types: [], desc: 'Shy ghost. Not in the sample database.' });
monster('crabble', 'Crabble', { base: 'R', dark: 'r', light: 'q', belly: 'q', claws: true, rx: 9, ry: 6, cy: 22, types: ['water'], desc: 'Beach crab. Not in the sample database.' });
monster('mossnail', 'Mossnail', { base: 'G', dark: 'g', light: 'L', shell: true, rx: 9, ry: 5, cy: 23, eyeY: 1, noFeet: true, types: ['grass'], desc: 'Slow snail with a mossy shell. Not in the sample database.' });
monster('batling', 'Batling', { base: 'n', dark: 'k', light: 'm', wings: true, wingC: 'k', ears: 'pointy', fangs: true, eyeC: 'R', rx: 7, ry: 7, types: ['poison'], desc: 'Cave bat. Not in the sample database.' });
monster('glimmerfox', 'Glimmerfox', { base: 'P', dark: 'p', light: 'q', belly: 'W', ears: 'pointy', bigTail: true, types: [], desc: 'Mystic fox. Not in the sample database.' });

/* ======================================================================
   Battle backgrounds: 160x120 pixel art, scaled x2 to 320x240
   ====================================================================== */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function bands(img, y0, y1, a, b) { // ordered-dither blend from colour a (top) to b (bottom)
  for (let y = y0; y < y1; y++) { const t = (y - y0 + 0.5) / Math.max(1, y1 - y0); for (let x = 0; x < img.w; x++) { const thr = (BAYER[y % 4][x % 4] + 0.5) / 16; px(img, x, y, t > thr ? b : a); } }
}
function hills(img, base, top, amp, freq, phase, seed) {
  for (let x = 0; x < img.w; x++) { const h = Math.round(top + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + seed) * amp * 0.4); for (let y = h; y < img.h; y++) px(img, x, y, base); }
}
function cloud(img, x, y, s) { blob(img, x, y, 6 * s, 3 * s, { base: 'W', dark: 'S', light: 'W' }); blob(img, x - 5 * s, y + s, 4 * s, 2.5 * s, { base: 'W', dark: 'S' }); blob(img, x + 6 * s, y + s, 4 * s, 2.2 * s, { base: 'W', dark: 'S' }); }
function trees(img, y, n, c1, c2, seed) { const r = rng(seed); for (let k = 0; k < n; k++) { const x = Math.floor(r() * img.w), s = 5 + r() * 6; blob(img, x, y - s, s, s * 1.3, { base: c1, dark: c2, light: c1 }); } }
function battleback(file, name, draw, desc) {
  const img = new Image(160, 120); draw(img);
  write('battlebacks/' + file, scale(img, 2).toPNG());
  manifest.battlebacks['battlebacks/' + file] = credit({ name, description: desc });
}
const skyline = img => { bands(img, 0, 44, 'B', 'c'); bands(img, 44, 80, 'c', 'W'); cloud(img, 34, 16, 1.6); cloud(img, 120, 30, 1.2); };
// Pictures: full-screen images for the title screen and cut scenes.
function picture(file, name, draw, desc) {
  const img = new Image(160, 120); draw(img);
  write('pictures/' + file, scale(img, 2).toPNG());
  manifest.pictures['pictures/' + file] = credit({ name, description: desc });
}
picture('title-sunrise.png', 'Title: sunrise', img => {
  bands(img, 0, 50, 'p', 'P'); bands(img, 50, 78, 'P', 'y'); blob(img, 80, 78, 18, 18, { base: 'Y', dark: 'y', light: 'W' });
  hills(img, 'd', 72, 6, 0.045, 1.5, 4); hills(img, 'g', 82, 4, 0.07, 0.3, 5); hills(img, 'G', 94, 3, 0.09, 2, 6); bands(img, 100, 120, 'G', 'g');
  cloud(img, 30, 30, 1.3); cloud(img, 128, 22, 1.1); trees(img, 98, 9, 'd', 'D', 7);
}, 'A sunrise over green hills, for a title screen.');
picture('cutscene-night-sky.png', 'Night sky', img => {
  bands(img, 0, 80, 'K', 'k'); const r = rng(9); for (let k = 0; k < 70; k++) px(img, Math.floor(r() * 160), Math.floor(r() * 80), r() < 0.2 ? 'Y' : 'W');
  blob(img, 124, 24, 9, 9, { base: 'e', dark: 'S', light: 'W' }); hills(img, 'D', 86, 5, 0.05, 0, 8); bands(img, 92, 120, 'D', 'K');
}, 'A starry night with a full moon, for cut scenes.');
battleback('field.png', 'Field', img => { skyline(img); hills(img, 'g', 64, 4, 0.05, 0, 1); hills(img, 'G', 74, 2, 0.08, 1, 2); bands(img, 74, 120, 'G', 'g'); speckle(img, 0, 76, 160, 44, 'L', 40, 3); }, 'Open grassland. Good default.');
battleback('forest.png', 'Forest', img => { bands(img, 0, 80, 'c', 'W'); trees(img, 62, 16, 'g', 'd', 4); trees(img, 70, 12, 'd', 'D', 5); hills(img, 'g', 72, 2, 0.1, 0, 3); bands(img, 72, 120, 'g', 'd'); speckle(img, 0, 74, 160, 46, 'G', 50, 6); }, 'Deep woods.');
battleback('town.png', 'Town', img => {
  skyline(img); const r = rng(7);
  for (let x = 0; x < 160;) { const w = 14 + Math.floor(r() * 12), h = 14 + Math.floor(r() * 16); rect(img, x, 72 - h, w - 2, h, 'S'); rect(img, x - 1, 72 - h - 4, w, 4, 'RBg'[Math.floor(r() * 3)]); for (let wy = 72 - h + 3; wy < 68; wy += 6) for (let wx = x + 2; wx < x + w - 4; wx += 5) rect(img, wx, wy, 2, 3, 'B'); x += w + 2; }
  bands(img, 72, 120, 'U', 'u'); for (let y = 76; y < 120; y += 6) hline(img, 0, y, 160, 'u');
}, 'Streets and houses.');
battleback('beach.png', 'Beach', img => { skyline(img); bands(img, 60, 78, 'B', 'b'); for (let k = 0; k < 20; k++) hline(img, (k * 37) % 150, 62 + (k * 7) % 14, 6, 'c'); bands(img, 78, 120, 'e', 'U'); hline(img, 0, 78, 160, 'W'); speckle(img, 0, 80, 160, 40, 'u', 30, 8); }, 'Sand and sea.');
battleback('cave.png', 'Cave', img => {
  bands(img, 0, 76, 'K', 'k'); for (let x = 0; x < 160; x += 9) { const h = 6 + ((x * 7) % 15); for (let j = 0; j < h; j++) hline(img, x + Math.floor(j / 3), j, Math.max(1, 6 - Math.floor(j / 2)), j % 4 ? 'n' : 'm'); }
  hills(img, 'n', 70, 3, 0.07, 2, 4); bands(img, 74, 120, 'n', 'm'); speckle(img, 0, 76, 160, 44, 's', 30, 9); speckle(img, 0, 20, 160, 40, 'c', 6, 10);
}, 'Dark cave.');
battleback('indoor.png', 'Indoor', img => { rect(img, 0, 0, 160, 70, 'e'); for (let x = 2; x < 160; x += 8) vline(img, x, 0, 66, 'U'); rect(img, 0, 66, 160, 4, 'T'); for (let r = 70; r < 120; r += 6) { rect(img, 0, r, 160, 6, 'u'); hline(img, 0, r + 5, 160, 'T'); for (let x = (r % 12) * 2; x < 160; x += 24) vline(img, x, r, 5, 'T'); } }, 'Inside a building or gym.');

/* ======================================================================
   Manifest, licence, readme
   ====================================================================== */
const tilesets = {};
for (const f of fs.readdirSync(path.join(OUT, 'tilesets')).filter(f => f.endsWith('.tiles.json'))) {
  const m = JSON.parse(fs.readFileSync(path.join(OUT, 'tilesets', f), 'utf8'));
  tilesets['tilesets/' + m.image] = credit({ name: m.name, description: m.description, mapping: 'tilesets/' + f, tiles: m.tiles.length });
}
// Music and sound effects: generated by gen-audio.js (needs ffmpeg). Without ffmpeg the existing files and their saved metadata are kept.
let audio;
try { audio = require('./gen-audio').main(); fs.writeFileSync(path.join(OUT, 'audio-meta.json'), JSON.stringify(audio, null, 2) + '\n'); }
catch (err) {
  console.warn('Audio not regenerated (' + (err.message || err).split('\n')[0] + '); keeping the existing music and sounds.');
  try { audio = JSON.parse(fs.readFileSync(path.join(OUT, 'audio-meta.json'), 'utf8')); } catch (e) { audio = { music: {}, sounds: {} }; }
}
const META = {
  name: 'Pocket-Game-Maker Asset Library', version: 1, author: 'project-tech-me', licence: 'CC0-1.0',
  note: 'Original pixel art, music and sound effects made for Pocket-Game-Maker. Free to use, change and sell in your games, with or without credit.',
  tilesets, characters: manifest.characters, monsters: manifest.monsters, battlebacks: manifest.battlebacks, pictures: manifest.pictures, decorations: manifest.decorations, music: audio.music, sounds: audio.sounds
};
fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify(META, null, 2) + '\n');
const CREDIT_INTRO = 'Every asset in the Pocket-Game-Maker Asset Library, with where it came from and its licence. ' +
  '"Placeholder" means the built-in art that came with Pocket-Game-Maker. When you replace a file with your own art, change its status to Custom ' +
  'and update its origin and licence (in the Asset Library window, click the card, then Edit credits). ' +
  'Pocket-Game-Maker rewrites this file and credits.csv whenever credits change.';
fs.writeFileSync(path.join(OUT, 'CREDITS.md'), CR.toMarkdown('Asset Library credits', CR.fromLibraryMeta(META), CREDIT_INTRO));
fs.writeFileSync(path.join(OUT, 'credits.csv'), CR.toCSV(CR.fromLibraryMeta(META)));

fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), `Pocket-Game-Maker Asset Library
Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>

All images in this library (tilesets, characters, monsters, battle
backgrounds, pictures, decorations and clothing), their .tiles.json mapping files, and all music, jingles and
sound effects (music/ and sounds/) are dedicated to the public domain under
Creative Commons Zero (CC0 1.0 Universal):
https://creativecommons.org/publicdomain/zero/1.0/

You can copy, modify, distribute and use them in free or commercial games
without asking permission and without giving credit. Credit is appreciated
but not required.

The colours come from the Endesga 32 palette, which is also free to use.

The music and sound effects are original compositions by project-tech-me,
synthesised from scratch by Pocket-Game-Maker's audio generator (tools/gen-audio.js).
They contain no samples or recordings from any other source.
`);

fs.writeFileSync(path.join(OUT, 'README.txt'), `Pocket-Game-Maker Asset Library
==========================

This folder is your asset library. Pocket-Game-Maker reads it every time you open
the Asset Library window, so anything you change or add here shows up there.

Folders
  tilesets/     Tileset images, each with a matching .tiles.json mapping file.
  characters/   Character sheets: 3 columns x 4 rows of 16x16 frames
                (rows: down, left, right, up; columns: step, stand, step).
  monsters/     Monster sprites in pairs: name_front.png and name_back.png.
  battlebacks/  Battle backgrounds, 320x240.
  pictures/     Full-screen pictures for the title screen and cut scenes.
  decorations/  Furniture players can buy and place in a house: one 16x16 tile
                per square (a 2x1 table is 32x16). Pictures face down; the game
                turns them for the other directions.
  music/        Background music and short jingles (MP3). Tracks marked
                "loops" repeat seamlessly.
  sounds/       Sound effects (MP3).

Tile mapping files (.tiles.json)
  Each tile in a tileset has an entry with:
    name    what the tile is
    pass    true if the player can walk on it
    enc     true if wild monsters appear on it
    over    true if it is drawn above the player (tree tops, lamp tops)
    layer   which map layer it's meant for: ground, detail or above
    group   for objects made of several tiles, e.g. "Big tree 2x2"
  When you add a tileset to a project, Pocket-Game-Maker copies these settings into
  the project. Change them in Database > Tilesets and click "Save to library"
  to write them back here.

Adding your own art and audio
  Drop PNG files into the right folder, and MP3 or FLAC files into music/ or
  sounds/. For a new tileset, Pocket-Game-Maker creates
  the .tiles.json file the first time you save its settings to the library.

Restoring the original files
  Use "Restore missing files" in the Asset Library window. It puts back any
  original file you deleted and never overwrites your changes.

Licence: CC0 (public domain). See LICENSE.txt.
`);
console.log('Asset library written to', OUT);
