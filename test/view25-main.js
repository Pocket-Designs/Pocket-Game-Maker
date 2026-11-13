// Electron test for 0.9.7, 2.5D: Height mode in the editor (levels, tools, dragging shapes onto the map, undo,
// resizing, the 2.5D view settings), and in a playtest of the sample's Hilltop Trail: the tilted camera, cliffs that
// block, stairs, a ledge jump, talking to someone on the lookout, the top-down camera, and the debugger's checks.
// Run: xvfb-run -a npx electron --no-sandbox test/view25-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('view25-main.js') ? 'view25-out' : process.argv[process.argv.length - 1]);
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
async function key(w, k, times = 1, gap = 330) { for (let i = 0; i < times; i++) { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); await sleep(40); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(gap); } }
const playWin = ed => BrowserWindow.getAllWindows().find(w => w !== ed);
const confirmPlay = ed => js(ed, `(() => { const b = [...document.querySelectorAll('.modal-foot button')].find(b => /anyway/.test(b.textContent)); if (b) b.click(); })(); 0`);
const where = w => js(w, `G.player.x + ',' + G.player.y + ' h' + MF.Heights.get(G.map, G.player.x, G.player.y)`);
const check = (name, ok) => { if (!ok) { console.log('CHECK FAILED:', name); process.exitCode = 1; } return ok; };

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0]; ed.setSize(1440, 900);
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  const out = {};

  /* ---------- editor: Height mode ---------- */
  await js(ed, `App.selectMap('map005'); App.setZoom(2); 0`); await sleep(400);
  await js(ed, `document.querySelector('[data-mode="height"]').click(); 0`); await sleep(400);
  out.panel = await js(ed, `'levels ' + document.querySelectorAll('.ht-level').length + ' · tools ' + document.querySelectorAll('.ht-tools button').length + ' · shapes ' + [...document.querySelectorAll('.ht-shape-name')].map(e => e.textContent).join(', ')`);
  out.viewSection = await js(ed, `[...document.querySelectorAll('.insp-section[data-key="view25"] .field > span')].map(s => s.textContent).join(' | ')`);
  await shot(ed, 'V1-height-mode');
  // a flat map: Route 1. Paint level 2 with a 3x3 brush, then raise one square, then stairs.
  await js(ed, `App.selectMap('map002'); App.setMode('height'); HeightTools.level = 2; HeightTools.tool = 'set'; HeightTools.size = 3; HeightTools.down({ x: 5, y: 14 }, { button: 0 }); HeightTools.paint(6, 14); MapEditor.onUp({}); 0`); await sleep(200);
  out.painted = await js(ed, `(() => { const m = App.map(); return [MF.Heights.get(m, 4, 13), MF.Heights.get(m, 5, 14), MF.Heights.get(m, 7, 15), MF.Heights.get(m, 8, 14), MF.Heights.get(m, 3, 14)].join(','); })()`);
  check('painted 3x3 at level 2', out.painted === '2,2,2,0,0');
  await js(ed, `HeightTools.tool = 'raise'; HeightTools.size = 1; HeightTools.down({ x: 5, y: 14 }, { button: 0 }); HeightTools.paint(5, 14); MapEditor.onUp({}); HeightTools.tool = 'stairs'; HeightTools.down({ x: 5, y: 16 }, { button: 0 }); MapEditor.onUp({}); 0`);
  out.raised = await js(ed, `(() => { const m = App.map(); return MF.Heights.get(m, 5, 14) + ' stairs ' + MF.Heights.isStairs(m, 5, 16); })()`);
  check('raise once per stroke and stairs', out.raised === '3 stairs true');
  // drag a shape onto the map, the way the mouse does it
  await js(ed, `(() => {
    const chip = [...document.querySelectorAll('.ht-shape')].find(c => c.textContent.includes('Small hill'));
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const r = MapEditor.canvas.getBoundingClientRect(), S = MapEditor.ts * App.zoom;
    const at = { clientX: r.left + 13 * S + S / 2, clientY: r.top + 13 * S + S / 2, dataTransfer: dt, bubbles: true, cancelable: true };
    MapEditor.canvas.dispatchEvent(new DragEvent('dragover', at));
    MapEditor.canvas.dispatchEvent(new DragEvent('drop', at));
  })(); 0`); await sleep(300);
  out.dropped = await js(ed, `(() => { const m = App.map(); return [MF.Heights.get(m, 13, 13), MF.Heights.get(m, 15, 15), MF.Heights.isStairs(m, 14, 15), MF.Heights.get(m, 16, 13)].join(','); })()`);
  check('small hill dropped', out.dropped === '1,1,true,0');
  await shot(ed, 'V2-painted-and-dropped');
  // undo the drop, then redo it
  await js(ed, `MapEditor.undo(); 0`); await sleep(150);
  out.undo = await js(ed, `MF.Heights.get(App.map(), 13, 13)`);
  await js(ed, `MapEditor.redo(); 0`); await sleep(150);
  out.redo = await js(ed, `MF.Heights.get(App.map(), 13, 13)`);
  check('undo / redo heights', out.undo === 0 && out.redo === 1);
  // making the map wider on the left moves the heights with the tiles
  await js(ed, `App.resizeMap(App.map(), 22, 20, 1, 0); 0`); await sleep(200);
  out.resized = await js(ed, `(() => { const m = App.map(); return m.heights.length + ' · hill now at ' + MF.Heights.get(m, 15, 13); })()`);
  check('resize keeps heights', out.resized === '440 · hill now at 1');
  await js(ed, `MapEditor.undo(); 0`);
  // map mode shows the cliff edges only; the 2.5D view settings
  await js(ed, `App.setMode('map'); 0`); await sleep(200);
  await shot(ed, 'V3-map-mode-edges');
  await js(ed, `App.selectMap('map005'); App.setMode('map'); App.inspAll(true); 0`); await sleep(300);
  await js(ed, `(() => { const s = document.querySelector('.insp-section[data-key="view25"]'); s.scrollIntoView(); })(); 0`); await sleep(200);
  await shot(ed, 'V4-view-settings');

  /* ---------- playtest: Hilltop Trail ---------- */
  await js(ed, `App.playtest({ mapId: 'map005', x: 2, y: 11, dir: 'right' }); 0`); await sleep(400); await confirmPlay(ed);
  await sleep(2500);
  const play = playWin(ed);
  out.v25 = await js(play, `JSON.stringify({ on: G.v25.on, hasH: G.v25.hasH, tilted: G.v25.tilted, maxH: G.v25.maxH, L: G.v25.L })`);
  await shot(play, 'V5-tilted-start');
  // walk to the plateau's stairs and climb: (2,11) → right to (5,11)? the stairs are at (5,9) and (6,9)
  await js(play, `G.enterMap('map005', 5, 10, 'up'); 0`); await sleep(900);
  await key(play, 'Up', 2);
  out.climbed = await where(play);
  check('climbed the stairs onto the plateau', out.climbed === '5,8 h1');
  // a cliff blocks: from the ground below the plateau, walking up does nothing
  await js(play, `G.enterMap('map005', 3, 9, 'up'); 0`); await sleep(900);
  await key(play, 'Up', 2);
  out.cliffBlocks = await where(play);
  check('cliff blocks', out.cliffBlocks === '3,9 h0');
  // jump down the ledge from the plateau
  await js(play, `G.enterMap('map005', 4, 8, 'down'); 0`); await sleep(900);
  play.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); await sleep(60); play.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
  await sleep(90); await shot(play, 'V6-ledge-jump'); await sleep(500);
  out.jumped = await where(play);
  check('jumped down the ledge', out.jumped === '4,9 h0');
  await key(play, 'Up', 1);
  out.cantClimbBack = await where(play);
  check('can\'t climb back up the ledge', out.cantClimbBack === '4,9 h0');
  // climb the east hill to the lookout and talk to the hiker
  await js(play, `G.enterMap('map005', 17, 11, 'up'); 0`); await sleep(900);
  await key(play, 'Up', 7);
  out.summit = await where(play);
  check('reached the lookout', out.summit === '17,4 h3');
  await shot(play, 'V7-lookout');
  await key(play, 'Z', 1, 800);
  out.hiker = await js(play, `(document.querySelector('#ui .msg, #ui .message, .msgbox') || {}).textContent || ''`);
  check('talked to the hiker', /view/.test(out.hiker));
  await shot(play, 'V8-hiker');
  await key(play, 'Z', 2, 400);
  // the top-down camera with heights
  await js(play, `G.map.view.camera = 'top'; G.enterMap('map005', 12, 11, 'up'); 0`); await sleep(900);
  await shot(play, 'V9-top-down');
  out.screenPos = await js(play, `(() => { const at = G.toScreen(G.player.px * 16, G.player.py * 16); return Math.round(at.x) + ',' + Math.round(at.y); })()`);
  // the debugger's project check finds nothing wrong with the 2.5D map; and finds an unreachable event
  out.check = await js(play, `Debug.entries.filter(e => e.group === 'check' && /Hilltop/.test(e.where || '')).map(e => e.level + ': ' + e.msg).join(' | ') || 'none'`);
  check('no problems on Hilltop Trail', out.check === 'none');
  play.close(); await sleep(400);
  await js(ed, `(() => { const m = App.proj.maps.map005; m.events.push({ id: 900, name: 'Stranded', x: 18, y: 4, pages: [{ condition: { switchId: 0, selfSwitch: false }, sprite: 'characters/villager.png', dir: 'down', trigger: 'action', move: 'fixed', through: false, commands: [{ cmd: 'text', text: 'Hi' }] }] }); m.heights[4 * 24 + 18] = 4; m.heights[3 * 24 + 18] = 0; m.heights[5 * 24 + 18] = 0; })(); 0`);
  await js(ed, `App.playtest({ mapId: 'map005', x: 2, y: 11, dir: 'right' }); 0`); await sleep(400); await confirmPlay(ed); await sleep(2500);
  const play2 = playWin(ed);
  out.unreachable = await js(play2, `Debug.entries.filter(e => e.group === 'check' && /Stranded/.test(e.msg)).map(e => e.level + ': ' + e.msg).join(' | ') || 'none'`);
  check('debugger finds the unreachable event', /can't be reached/.test(out.unreachable));
  play2.close(); await sleep(300);
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  if (errors.length) process.exitCode = 1;
  app.exit(process.exitCode || 0);
});
