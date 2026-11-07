// Electron test for 0.9.6: the Opening & Ending Scenes window, the World map and Menus database tabs, and in a playtest:
// the opening scene, the title menu, autosave, bag pockets, the Options screen, the world map (travel), the bed save
// point, the ending scenes going back to the title, and Continue loading the latest save.
// Run: xvfb-run -a npx electron --no-sandbox test/features-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('features-main.js') ? 'features-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });
const errors = [];
app.on('browser-window-created', (e, win) => win.webContents.on('console-message', (ev, level, msg) => { if (ev && ev.message !== undefined) { level = { error: 3, warning: 2 }[ev.level] || 0; msg = ev.message; } if (level >= 3) errors.push(msg); }));
process.on('unhandledRejection', e => { console.log('FAIL', e && e.message); app.exit(1); });
require('../main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const js = (w, c) => w.webContents.executeJavaScript(c, true).catch(e => { console.log('STEP FAILED:', c.slice(0, 160)); throw e; });
const shot = async (w, n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await w.webContents.capturePage()).toPNG());
async function key(w, k, times = 1, gap = 220) { for (let i = 0; i < times; i++) { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); await sleep(40); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(gap); } }
const playWin = ed => BrowserWindow.getAllWindows().find(w => w !== ed);
const confirmPlay = ed => js(ed, `(() => { const b = [...document.querySelectorAll('.modal-foot button')].find(b => /anyway/.test(b.textContent)); if (b) b.click(); })(); 0`);
const closeModals = ed => js(ed, `document.querySelectorAll('.modal-head .icon-btn').forEach(b => b.click()); 0`);
const ui = w => js(w, `[...document.querySelectorAll('#ui .win .opt')].map(e => e.textContent).join(' | ').slice(0, 300)`);
const waitFor = async (w, cond, ms = 6000) => { for (let t = 0; t < ms; t += 150) { if (await js(w, cond)) return true; await sleep(150); } return false; };

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0]; ed.setSize(1440, 900);
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  const out = {};

  /* ---------- editor ---------- */
  // 1. The Opening & Ending Scenes window (toolbar button)
  await js(ed, `document.querySelector('[data-act="scenes"]').click(); 0`); await sleep(500);
  out.scenesTabs = await js(ed, `[...document.querySelectorAll('.scenes-ed .db-tab')].map(t => t.textContent).join(' / ')`);
  out.openingList = await js(ed, `[...document.querySelectorAll('.scenes-ed .list-item')].map(t => t.textContent).join(' / ')`);
  // add picture slides with the + Add scene menu
  await js(ed, `[...document.querySelectorAll('.scenes-ed button')].find(b => b.textContent === '+ Add scene').click(); 0`); await sleep(200);
  out.addMenu = await js(ed, `[...document.querySelectorAll('.ctx-menu button')].map(b => b.textContent.split(' — ')[0]).join(', ')`);
  await js(ed, `[...document.querySelectorAll('.ctx-menu button')].find(b => b.textContent.includes('Picture slides')).click(); 0`); await sleep(300);
  await js(ed, `[...document.querySelectorAll('.sc-slides > button')][0].click(); 0`); await sleep(200);
  out.slidesAdded = await js(ed, `App.proj.system.scenes.opening.map(s => s.type + (s.slides ? ':' + s.slides.length : '')).join(', ') + ' · slide editors ' + document.querySelectorAll('.sc-slide-ed').length`);
  await js(ed, `[...document.querySelectorAll('.scenes-ed button')].find(b => b.textContent === '▲').click(); 0`); await sleep(200);
  out.reordered = await js(ed, `App.proj.system.scenes.opening.map(s => s.type).join(', ')`);
  await shot(ed, 'F1-scenes-slides');
  await js(ed, `[...document.querySelectorAll('.scenes-ed .list-item')][0].click(); 0`); await sleep(200);
  await js(ed, `[...document.querySelectorAll('.scenes-ed button')].find(b => b.textContent === 'Delete').click(); 0`); await sleep(300);
  await js(ed, `[...document.querySelectorAll('.modal-foot button')].find(b => b.textContent === 'Delete').click(); 0`); await sleep(300);
  out.afterDelete = await js(ed, `App.proj.system.scenes.opening.map(s => s.type).join(', ')`);
  await js(ed, `[...document.querySelectorAll('.scenes-ed .db-tab')][2].click(); 0`); await sleep(300);
  await js(ed, `[...document.querySelectorAll('.scenes-ed .list-item')][1].click(); 0`); await sleep(300);
  out.endingForm = await js(ed, `[...document.querySelectorAll('.scenes-ed .db-form .field > span')].map(s => s.textContent).join(' | ')`);
  await shot(ed, 'F2-scenes-ending');
  await closeModals(ed); await sleep(300);

  // 2. Database: World map tab, and the Menus tab's saving and bag pockets sections
  await js(ed, `DB.open('worldmap'); 0`); await sleep(900);
  out.worldmapTab = await js(ed, `'pins ' + document.querySelectorAll('.wm-ed-pin, .wm-pin').length + ' · defaults ' + [...document.querySelectorAll('.wm-defaults button')].map(b => b.textContent).join(', ')`);
  await shot(ed, 'F3-db-worldmap');
  await js(ed, `DB.tab = 'menus'; DB.draw(); 0`); await sleep(500);
  out.menusSections = await js(ed, `[...document.querySelectorAll('.db-form legend, .db legend')].map(l => l.textContent).join(' | ')`);
  await js(ed, `(() => { const l = [...document.querySelectorAll('legend')].find(l => /pocket/i.test(l.textContent)); if (l) l.scrollIntoView(); })(); 0`); await sleep(200);
  await shot(ed, 'F4-db-pockets');
  await js(ed, `(() => { const l = [...document.querySelectorAll('legend')].find(l => /sav/i.test(l.textContent)); if (l) l.scrollIntoView(); })(); 0`); await sleep(200);
  await shot(ed, 'F5-db-saving');
  await closeModals(ed); await sleep(300);

  /* ---------- playtest from the start ---------- */
  await js(ed, `App.playtest(); 0`); await sleep(400); await confirmPlay(ed);
  await sleep(2000);
  let play = playWin(ed);
  out.opening = await js(play, `document.querySelector('.scene') ? document.querySelector('.scene').textContent.slice(0, 60) : 'no scene'`);
  await shot(play, 'F6-opening');
  await key(play, 'X', 1, 900);
  await waitFor(play, `!!document.querySelector('.title-screen .opt')`);
  out.titleMenu = await js(play, `[...document.querySelectorAll('.title-screen .opt')].map(e => e.textContent + (e.classList.contains('dis') ? '(off)' : '')).join(', ')`);
  await shot(play, 'F7-title');
  await key(play, 'Z', 1, 2500); // New Game
  out.newGame = await js(play, `G.map ? G.map.id : 'no map'`);
  await waitFor(play, `window.api.listSaves(G.projectPath, G.cfg.saving.slots).then(s => !!s[0].meta)`, 5000);
  out.autosave = await js(play, `window.api.listSaves(G.projectPath, G.cfg.saving.slots).then(s => s.length + ' slots; autosave: ' + (s[0].auto && s[0].meta ? s[0].meta.mapName : 'none'))`);

  // bag pockets: ← → change pocket
  await js(play, `G.state.bag.capture_orb = 5; G.state.bag.potion = 3; G.busy = true; window._bag = Menus.bag(G).finally(() => { G.busy = false; }); 0`); await sleep(500);
  out.bag1 = await js(play, `document.querySelector('.bag-tabs').children.length + ' pockets, showing ' + document.querySelector('#ui .win .title, #ui .win h3, #ui .win .head')?.textContent`).catch(() => null);
  out.bagRows1 = await ui(play);
  await key(play, 'Right', 1, 300);
  out.bagRows2 = await ui(play) + ' · pocket ' + await js(play, `G.bagPocket`);
  await shot(play, 'F8-bag-pocket');
  await key(play, 'X', 1, 400);

  // Options: music volume down, text speed faster
  await js(play, `G.busy = true; Menus.options(G).finally(() => { G.busy = false; }); 0`); await sleep(400);
  await key(play, 'Left', 2, 200); await key(play, 'Down', 2, 200); await key(play, 'Right', 1, 200);
  await shot(play, 'F9-options');
  await key(play, 'X', 1, 400);
  out.options = await js(play, `JSON.stringify(G.prefs) + ' stored ' + !!Object.keys(localStorage).find(k => k.startsWith('pgm-options'))`);

  // World map: Lakeside has been visited, so the player can travel there
  await js(play, `G.state.visited.map003 = true; G.busy = true; window._wm = WorldMap.open(G).then(r => { window._wmr = r; }).finally(() => { G.busy = false; }); 0`); await sleep(700);
  out.worldmap = await js(play, `document.querySelectorAll('.wm-pin').length + ' pins; here ' + (document.querySelector('.wm-pin.here') ? 'yes' : 'no')`);
  await key(play, 'Up', 2, 250);
  await shot(play, 'F10-worldmap');
  await key(play, 'Z', 1, 500); await key(play, 'Z', 1, 2500);
  out.travel = await js(play, `(window._wmr || '') + ' → ' + (G.map ? G.map.id + ' ' + G.player.x + ',' + G.player.y : 'none')`);

  // The bed in Your Room: a save point (asks, heals, then the save screen)
  await js(play, `G.busy = true; G.enterMap('map004', 8, 6, 'up').then(() => { G.busy = false; G.player.dir = 'up'; }); 0`); await sleep(1500);
  await key(play, 'Z', 1, 900);
  out.bedAsks = await js(play, `document.querySelector('#ui .msg, #ui .message, .msgbox')?.textContent.slice(0, 60) || ''`);
  await shot(play, 'F11-bed');
  await key(play, 'Z', 1, 700);      // finish the text / choose Yes
  for (let i = 0; i < 3 && !(await js(play, `!!document.querySelector('#ui .win') && /slot/i.test(document.getElementById('ui').textContent)`)); i++) await key(play, 'Z', 1, 600);
  out.saveScreen = await ui(play);
  await shot(play, 'F12-save-slots');
  await key(play, 'Z', 1, 800);      // slot 1
  await key(play, 'Z', 1, 600);      // "Your progress was saved."
  out.saved = await js(play, `window.api.listSaves(G.projectPath, G.cfg.saving.slots).then(s => s.filter(x => x.meta).map(x => (x.auto ? 'auto' : x.slot) + ':' + x.meta.mapName).join(', '))`);

  // The ending: "Play opening / ending scenes" → thank-you page, credits roll, then the title screen
  await js(play, `(async () => { G.busy = true; try { await G.exec({ cmd: 'playScenes', group: 'ending' }, null, 'test', G.map); } catch (e) { window._ab = e.constructor.name; } G.busy = false; })(); 0`);
  await sleep(2500);
  out.ending = await js(play, `document.querySelector('.scene') ? document.querySelector('.scene').textContent.slice(0, 50) : 'no scene'`);
  await shot(play, 'F13-ending');
  await sleep(4000);
  await shot(play, 'F14-credits-roll');
  await key(play, 'X', 1, 800);
  await waitFor(play, `!!document.querySelector('.title-screen .opt')`, 8000);
  out.backToTitle = await js(play, `G.scene + ' ' + !!document.querySelector('.title-screen') + ' aborted ' + window._ab`);
  // Continue → the latest save (slot 1, Your Room)
  out.titleIdx = await js(play, `[...document.querySelectorAll('.title-screen .opt')].findIndex(e => e.classList.contains('sel') || e.classList.contains('on') || e.classList.contains('cur'))`);
  await key(play, 'Z', 1, 2500);
  out.continued = await js(play, `G.map ? G.map.id + ' ' + G.player.x + ',' + G.player.y : 'no map'`);
  out.debuggerProblems = await js(play, `Debug.entries.filter(e => (e.level === 'error' || e.level === 'warning')).map(e => e.msg).join(' | ') || 'none'`);
  play.close(); await sleep(400);
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  app.exit(0);
});
