// Electron test for the optional Decorating and Wardrobe features, in the sample's "Your Room".
// Run: xvfb-run -a npx electron --no-sandbox test/home-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('home-main.js') ? 'home-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });
const errors = [];
app.on('browser-window-created', (e, win) => win.webContents.on('console-message', (ev, level, msg, line, src) => { if (ev && ev.message !== undefined) { level = { error: 3, warning: 2 }[ev.level] || 0; msg = ev.message; line = ev.lineNumber; src = ev.sourceId; } if (level >= 2) errors.push(path.basename(src || '') + ':' + line + ' ' + msg); }));
require('../main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const js = (w, c) => w.webContents.executeJavaScript(c, true).catch(e => { console.log('STEP FAILED:', c.slice(0, 140)); throw e; });
const shot = async (w, n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await w.webContents.capturePage()).toPNG());
async function key(w, k, times = 1, gap = 160) { for (let i = 0; i < times; i++) { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); await sleep(40); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(gap); } }

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0]; ed.setSize(1440, 900);
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  const out = {};
  // editor: the Items tab shows a decoration and a clothing item; Menus & screens shows the features
  await js(ed, `App.selectMap('map004'); 0`); await sleep(800);
  await shot(ed, 'H0-editor-room');
  await js(ed, `DB.open('items'); DB.sel.items = 'bed'; DB.draw(); 0`); await sleep(900);
  await shot(ed, 'H1-db-decoration');
  await js(ed, `DB.sel.items = 'wear_cap_blue'; DB.draw(); 0`); await sleep(900);
  await shot(ed, 'H2-db-clothing');
  await js(ed, `DB.open('menus'); 0`); await sleep(900);
  await js(ed, `(() => { const b = [...document.querySelectorAll('.db-form legend')].find(l => /Optional/.test(l.textContent)); b && b.scrollIntoView(); })(); 0`); await sleep(400);
  await shot(ed, 'H3-db-features');
  await js(ed, `[...document.querySelectorAll('.modal-foot button')].find(b => b.textContent === 'Done').click(); 0`); await sleep(400);

  // playtest from inside the room
  await js(ed, `App.playtest({ mapId: 'map004', x: 4, y: 5, dir: 'down' }); 0`); await sleep(500);
  await js(ed, `document.querySelector('.modal-foot .primary') && document.querySelector('.modal-foot .primary').click()`);
  await sleep(2000);
  const play = BrowserWindow.getAllWindows().find(w => w !== ed);
  await shot(play, 'H4-room');
  // menu shows Decorate and Wardrobe here
  await key(play, 'X', 1, 600);
  out.menu = await js(play, `[...document.querySelectorAll('.win .item, .win li, .win .opt')].map(e => e.textContent.trim()).filter(Boolean).join(' | ')`);
  await shot(play, 'H5-menu');
  await key(play, 'X', 1, 400);
  // place the bed: cursor starts in front of the player (4,4); move left twice, turn, place
  await js(play, `G.busy = true; G._p = Home.place(G, 'bed').then(r => { G._placed = r; G.busy = false; }); 0`); await sleep(400);
  await key(play, 'Left', 3, 150); await key(play, 'Up', 2, 150);
  await shot(play, 'H6-placing-bed');
  await key(play, 'R', 1, 300);
  await shot(play, 'H7-bed-turned');
  await key(play, 'R', 3, 150); // back to facing down
  await key(play, 'Z', 1, 400);
  await shot(play, 'H8-place-menu');
  await key(play, 'Z', 1, 600);
  out.afterBed = await js(play, `JSON.stringify(G.state.decor.map004) + ' bag bed=' + (G.state.bag.bed || 0)`);
  // rug (walk-over) and plant
  await js(play, `G.busy = true; Home.place(G, 'rug').then(() => { G.busy = false; }); 0`); await sleep(400);
  await key(play, 'Right', 1, 150); await key(play, 'Z', 1, 400); await key(play, 'Z', 1, 600);
  await js(play, `G.busy = true; Home.place(G, 'plant').then(() => { G.busy = false; }); 0`); await sleep(400);
  await key(play, 'Right', 3, 150); await key(play, 'Up', 2, 150); await key(play, 'Z', 1, 400); await key(play, 'Z', 1, 600);
  out.decor = await js(play, `G.state.decor.map004.map(e => e.item + '@' + e.x + ',' + e.y + ' r' + e.rot).join(' ; ')`);
  const bed = await js(play, `G.state.decor.map004.find(e => e.item === 'bed')`);
  out.bedBlocks = await js(play, `!G.canMove(G.player, ${bed.x}, ${bed.y}) && !G.canMove(G.player, ${bed.x}, ${bed.y + 1})`);
  const rug = await js(play, `G.state.decor.map004.find(e => e.item === 'rug')`);
  out.rugWalkable = await js(play, `G.canMove(G.player, ${rug.x}, ${rug.y})`);
  out.cantOverlap = await js(play, `!Home.canPlace(G, 'chair', ${bed.x}, ${bed.y}, 0)`);
  await shot(play, 'H9-room-decorated');
  // face the plant and press Z: arrange menu (turn / move / put away)
  const plant = await js(play, `G.state.decor.map004.find(e => e.item === 'plant')`);
  await js(play, `G.player.x = G.player.px = ${plant.x}; G.player.y = G.player.py = ${plant.y + 1}; G.player.dir = 'up'; 0`); await sleep(200);
  await key(play, 'Z', 1, 500);
  await shot(play, 'H10-arrange-menu');
  out.arrangeMenu = await js(play, `[...document.querySelectorAll('.win')].map(w => w.textContent).join(' / ').slice(-80)`);
  await key(play, 'Down', 2, 150); await key(play, 'Z', 1, 600); // Put away
  out.afterPutAway = await js(play, `G.state.decor.map004.map(e => e.item).join(',') + ' bag plant=' + G.state.bag.plant`);
  // wardrobe: the blue cap is in the bag; pick the Casual outfit? not owned, so cycle hat
  await js(play, `G.busy = true; Home.wardrobe(G).then(() => { G.busy = false; }); 0`); await sleep(600);
  await key(play, 'Down', 1, 200); await key(play, 'Right', 1, 400);
  await shot(play, 'H11-wardrobe');
  out.wardrobe = await js(play, `[...document.querySelectorAll('.wd-row')].map(r => r.textContent).join(' | ')`);
  await key(play, 'Z', 1, 500);
  out.wear = await js(play, `JSON.stringify(G.state.wear)`);
  // buy an outfit at the catalogue (computer at 1,2): give money, run the shop directly
  await js(play, `G.state.money = 5000; G.state.bag.outfit_hero_cool = 1; G.state.wear.outfit = 'outfit_hero_cool'; 0`); await sleep(500);
  await js(play, `G.player.x = G.player.px = 4; G.player.y = G.player.py = 4; G.player.dir = 'down'; 0`); await sleep(300);
  await shot(play, 'H12-new-clothes');
  out.sheet = await js(play, `!!Home.playerSheet(G)`);
  // saving keeps furniture and clothes
  out.save = await js(play, `(() => { const s = G.makeSave().state; return Object.keys(s.decor) + ' ' + s.decor.map004.length + ' items, wear ' + JSON.stringify(s.wear); })()`);
  // the shop refuses a second copy of the same clothes
  out.clothesOnce = await js(play, `G.state.bag.wear_cap_blue`);
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  app.exit(0);
});
