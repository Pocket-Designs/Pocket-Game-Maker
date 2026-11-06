// Electron test for the playtest debugger: a copy of the sample project with broken events added on purpose.
// Run: xvfb-run -a npx electron --no-sandbox test/debugger-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('debugger-main.js') ? 'debugger-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });

// Break things on purpose in Starter Town (map001), in the open area at the top right.
const mapFile = path.join(proj, 'data', 'maps', 'map001.json');
const m = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const page = o => Object.assign({ condition: { switchId: 0, selfSwitch: false }, sprite: 'characters/sign-post.png', dir: 'down', trigger: 'action', move: 'fixed', through: false, sightRange: 0, commands: [] }, o);
let id = Math.max(...m.events.map(e => e.id)) + 1;
m.events.push(
  { id: id++, name: 'Locked Gate', x: 16, y: 2, pages: [page({ condition: { switchId: 9, selfSwitch: false }, commands: [{ cmd: 'text', text: 'The gate opens.' }] })] },
  { id: id++, name: 'Bad Gift', x: 14, y: 2, pages: [page({ commands: [{ cmd: 'text', text: 'Here, have this!' }, { cmd: 'giveItem', itemId: 'golden_apple', amount: 1 }, { cmd: 'moveRoute', target: 'Nobody', steps: ['left'] }] })] },
  { id: id++, name: 'Broken Door', x: 18, y: 2, pages: [page({ sprite: 'characters/nope.png', commands: [{ cmd: 'transfer', mapId: 'map999', x: 1, y: 1 }] })] },
  { id: id++, name: 'Floor Pad', x: 2, y: 7, pages: [page({ sprite: '', trigger: 'touch', commands: [{ cmd: 'text', text: 'You stepped on the pad.' }] })] }
);
fs.writeFileSync(mapFile, JSON.stringify(m));
const m3File = path.join(proj, 'data', 'maps', 'map003.json');
const m3 = JSON.parse(fs.readFileSync(m3File, 'utf8'));
m3.events.push({ id: 900, name: 'Endless Intro', x: 1, y: 1, pages: [page({ sprite: '', trigger: 'auto', commands: [{ cmd: 'text', text: 'Welcome!' }] })] });
fs.writeFileSync(m3File, JSON.stringify(m3));

const errors = [];
app.on('browser-window-created', (e, win) => win.webContents.on('console-message', (ev, level, msg, line, src) => { if (ev && ev.message !== undefined) { level = { error: 3, warning: 2 }[ev.level] || 0; msg = ev.message; line = ev.lineNumber; src = ev.sourceId; } if (level >= 3) errors.push(path.basename(src || '') + ':' + line + ' ' + msg); }));
process.on('unhandledRejection', e => { console.log('FAIL', e && e.message); app.exit(1); });
require('../main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const js = (w, c) => w.webContents.executeJavaScript(c, true);
const shot = async (w, n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await w.webContents.capturePage()).toPNG());
async function key(w, k, times = 1, gap = 200) { for (let i = 0; i < times; i++) { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); await sleep(40); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(gap); } }
const idle = async w => { for (let i = 0; i < 40 && await js(w, `G.busy || !!document.querySelector('.msg')`); i++) { await key(w, 'Z', 1, 250); } };
const stand = async (w, x, y, dir) => { await idle(w); return js(w, `G.player.x = G.player.px = ${x}; G.player.y = G.player.py = ${y}; G.player.dir = '${dir}'; G.evs.forEach(e => { e.timer = 99; }); 0`); };
const msgs = w => js(w, `Debug.entries.map(e => e.level + ': ' + e.msg).join('\\n')`);

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0];
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  await js(ed, `App.playtest({ mapId: 'map001', x: 16, y: 3, dir: 'up' }); 0`); await sleep(600);
  await js(ed, `document.querySelector('.modal-foot .primary') && document.querySelector('.modal-foot .primary').click()`);
  await sleep(2500);
  const play = BrowserWindow.getAllWindows().find(w => w !== ed);
  play.setSize(1280, 720); await sleep(500);
  const out = {};
  out.check = await js(play, `Debug.entries.filter(e => e.group === 'check').map(e => e.level + ': ' + e.msg + ' @ ' + e.where).join('\\n')`);
  out.panelOpenedForProblems = await js(play, `Debug.panelOpen`);
  await shot(play, 'D1-project-check');
  // 1. facing an event whose only page can never appear
  await stand(play, 16, 3, 'up'); await sleep(200);
  await key(play, 'Z', 1, 600);
  // 2. an event with a missing item and a move route to nobody
  await stand(play, 14, 3, 'up'); await sleep(200);
  await key(play, 'Z', 1, 900); await key(play, 'Z', 3, 500);
  // 3. a touch event pressed with the action button
  await stand(play, 2, 8, 'up'); await sleep(200);
  await key(play, 'Z', 1, 500);
  // 4. a door to a deleted map
  await stand(play, 18, 3, 'up'); await sleep(200);
  await key(play, 'Z', 1, 900); await key(play, 'Z', 2, 400);
  // 5. nothing in front
  await stand(play, 16, 6, 'down'); await sleep(200);
  await key(play, 'Z', 1, 400);
  out.live = await js(play, `Debug.entries.filter(e => e.group === 'play').map(e => e.level + ': ' + e.msg).join('\\n')`);
  await js(play, `Debug.filter = 'problems'; Debug.toggle(true); 0`); await sleep(400);
  await shot(play, 'D2-problems');
  await js(play, `Debug.filter = 'activity'; Debug.render(); Debug.setOverlay(true); 0`); await sleep(500);
  await stand(play, 16, 4, 'up'); await sleep(400);
  await shot(play, 'D3-activity-overlay');
  out.report = (await js(play, `Debug.report()`)).split('\n').length + ' lines';
  out.badge = await js(play, `document.getElementById('dbg-badge').textContent`);
  console.log(JSON.stringify(out, null, 1));
  console.log('PAGE ERRORS:', errors.length ? errors.join('\n') : 'none');
  app.exit(0);
});
