// Electron test for cut scenes: the Cut scene window (steps, triggers, preview), a movie on the sample's TV
// (plays, can be skipped, music carries on afterwards) and a scene started by a switch.
// Run: xvfb-run -a npx electron --no-sandbox test/cutscene-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('cutscene-main.js') ? 'cutscene-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });
const errors = [];
app.on('browser-window-created', (e, win) => win.webContents.on('console-message', (ev, level, msg) => { if (ev && ev.message !== undefined) { level = { error: 3, warning: 2 }[ev.level] || 0; msg = ev.message; } if (level >= 3) errors.push(msg); }));
process.on('unhandledRejection', e => { console.log('FAIL', e && e.message); app.exit(1); });
require('../main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const js = (w, c) => w.webContents.executeJavaScript(c, true).catch(e => { console.log('STEP FAILED:', c.slice(0, 140)); throw e; });
const shot = async (w, n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await w.webContents.capturePage()).toPNG());
async function key(w, k, times = 1, gap = 200) { for (let i = 0; i < times; i++) { w.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); await sleep(40); w.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(gap); } }
const playWin = ed => BrowserWindow.getAllWindows().find(w => w !== ed);
const confirmPlay = ed => js(ed, `(() => { const b = [...document.querySelectorAll('.modal-foot button')].find(b => /anyway/.test(b.textContent)); if (b) b.click(); })(); 0`);

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0]; ed.setSize(1440, 900);
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  const out = {};

  // 1. The Cut scene window: a person you talk to, with steps built from the game
  await js(ed, `App.selectMap('map001'); App.setMode('event'); 0`); await sleep(500);
  await js(ed, `QuickEvent.open('cutscene', 15, 2); 0`); await sleep(600);
  await js(ed, `(() => { const s = [...document.querySelectorAll('.modal select')][0]; s.value = 'action'; s.dispatchEvent(new Event('change')); })(); 0`); await sleep(300);
  out.startOptions = await js(ed, `[...document.querySelectorAll('.modal select')][0].options.length`);
  await js(ed, `(() => { const pick = [...document.querySelectorAll('.modal .asset-picker select')][0]; pick.value = 'characters/professor.png'; pick.dispatchEvent(new Event('change')); })(); 0`); await sleep(300);
  // add steps with the quick buttons
  const addStep = label => js(ed, `[...document.querySelectorAll('.cs-add button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click(); 0`);
  await addStep('Bubble'); await sleep(150); await addStep('Camera'); await sleep(150); await addStep('Fade'); await sleep(150); await addStep('Wait'); await sleep(150);
  out.steps = await js(ed, `[...document.querySelectorAll('.modal .cmd-title')].map(t => t.textContent).join(' | ')`);
  out.addMenuGroups = await js(ed, `[...document.querySelectorAll('.modal .cmd-add optgroup')].map(g => g.label + ' ' + g.children.length).join(', ')`);
  await shot(ed, 'C1-cutscene-window');
  await js(ed, `(() => { const s = [...document.querySelectorAll('.modal .cmd select')].find(s => [...s.options].some(o => o.value === 'fadeOut')); if (s) { s.value = 'flash'; s.dispatchEvent(new Event('change')); } })(); 0`);
  await js(ed, `[...document.querySelectorAll('.modal-foot button')].find(b => b.textContent === 'Create').click(); 0`); await sleep(500);
  const made = await js(ed, `(() => { const e = App.map().events.find(e => e.x === 15 && e.y === 2); return e ? { id: e.id, name: e.name, trig: e.pages[0].trigger, sprite: e.pages[0].sprite, cmds: e.pages[0].commands.map(c => c.cmd).join(','), pages: e.pages.length } : null; })()`);
  out.created = made;

  // 2. Preview it: a playtest that runs the scene straight away
  await js(ed, `QuickEvent.previewScene(App.map().events.find(e => e.id === ${made.id})); 0`); await sleep(400); await confirmPlay(ed);
  await sleep(2200);
  let play = playWin(ed);
  out.previewRunning = await js(play, `G.busy + ' bars ' + !!document.querySelector('.letterbox.on')`);
  await shot(play, 'C2-preview');
  for (let i = 0; i < 25 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 300);
  out.previewDone = await js(play, `!G.busy + ' self switch ' + !!G.state.selfSwitches['map001:${made.id}']`);
  play.close(); await sleep(600);

  // 3. A scene that starts when a switch turns on, and turns another switch on afterwards
  await js(ed, `(() => { const q = { type: 'cutscene', start: 'switch', switchId: 7, afterSwitch: 8, content: 'steps', bars: true, commands: [{ cmd: 'wait', frames: 20 }] };
    QuickEvent.finish(q, null, { v: 'When the bell rings' }, 16, 6); })(); 0`); await sleep(300);

  // 4. Watch the TV in Your Room: the movie plays, the music pauses, Z skips, the music comes back
  await js(ed, `App.playtest({ mapId: 'map004', x: 3, y: 3, dir: 'up' }); 0`); await sleep(400); await confirmPlay(ed);
  await sleep(2200);
  play = playWin(ed);
  await js(play, `GameAudio.playBgm('music/town-sunny-town.mp3'); 0`); await sleep(800);
  out.musicBefore = await js(play, `GameAudio.bgm && GameAudio.bgm.rel`);
  await js(play, `G.player.dir = 'up'; 0`);
  await key(play, 'Z', 1, 1500);
  out.movie = await js(play, `(() => { const v = document.querySelector('.movie video'); return v ? { t: +v.currentTime.toFixed(2), playing: !v.paused, w: v.videoWidth, h: v.videoHeight, music: GameAudio.bgm ? GameAudio.bgm.rel : null, skip: !!document.querySelector('.movie-skip.on') } : null; })()`);
  await shot(play, 'C3-movie');
  await key(play, 'X', 1, 900);
  out.afterSkip = await js(play, `({ overlay: !!document.querySelector('.movie'), busy: G.busy, music: GameAudio.bgm ? GameAudio.bgm.rel : null })`);
  // 5. The switch-started scene: on Starter Town, turning switch 7 on starts it; afterwards switch 8 is on
  await js(play, `G.busy = true; G.enterMap('map001', 16, 8, 'up').then(() => { G.busy = false; }); 0`); await sleep(1500);
  await js(play, `G.state.switches[7] = true; G.refreshPages(); 0`); await sleep(2500);
  out.switchScene = await js(play, `'switch 8 ' + !!G.state.switches[8] + ', busy ' + G.busy`);
  out.debuggerProblems = await js(play, `Debug.entries.filter(e => (e.level === 'error' || e.level === 'warning') && e.group === 'play').map(e => e.msg).join(' | ') || 'none'`);
  play.close(); await sleep(400);
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  app.exit(0);
});
