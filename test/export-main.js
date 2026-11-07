// Electron export test: opens the sample project, opens Export Game, exports every target and store,
// and screenshots the window. Run: xvfb-run -a npx electron --no-sandbox test/export-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('export-main.js') ? 'export-test-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });
const targets = (process.env.MF_TARGETS || 'windows,linux,web,android').split(',');

const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, win) => {
  win.webContents.on('console-message', (ev, level, msg, line, src) => { if (ev && ev.message !== undefined) { level = { error: 3, warning: 2 }[ev.level] || 0; msg = ev.message; line = ev.lineNumber; src = ev.sourceId; } if (level >= 2) errors.push('[' + path.basename(src || '') + ':' + line + '] ' + msg); });
});
require('../main.js');
const js = (win, code) => win.webContents.executeJavaScript(code, true);
const shot = async (win, name) => fs.writeFileSync(path.join(OUT, name + '.png'), (await win.webContents.capturePage()).toPNG());

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0];
  ed.setSize(1280, 900);
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`);
  await sleep(1500);
  await js(ed, `App.action('export'); 0`);
  await sleep(2000);
  await shot(ed, 'export-01-window');
  // set the test's choices, then reopen the window so its boxes show them
  await js(ed, `(() => {
    const s = App.proj.project.export;
    s.publisher = 'Pocket-Designs'; s.outDir = ${JSON.stringify(OUT)};
    Object.keys(s.targets).forEach(k => s.targets[k] = ${JSON.stringify(targets)}.includes(k));
    Object.keys(s.stores).forEach(k => s.stores[k].on = true);
    s.stores.steam.appId = '480'; s.stores.itch.user = 'Pocket-Designs';
    s.stores.epic.organizationId = 'o-abc'; s.stores.epic.productId = 'p123'; s.stores.epic.artifactId = 'a456'; s.stores.epic.clientId = 'c789';
    s.stores.googlePlay.on = s.targets.android;
    document.querySelector('.modal .modal-foot button').click();
  })(); 0`);
  await sleep(500);
  await js(ed, `App.action('export'); 0`);
  await sleep(2000);
  await js(ed, `document.querySelector('.modal .modal-foot button.primary').click(); 0`);
  const t0 = Date.now();
  let log = '';
  while (Date.now() - t0 < 15 * 60000) {
    await sleep(2000);
    log = await Promise.race([js(ed, `((document.querySelector('.export-log') || {}).textContent || '') + ' [result buttons: ' + document.querySelectorAll('.export-result button').length + ']'`), sleep(5000).then(() => 'POLL TIMEOUT')]);
    console.log('poll', JSON.stringify(log.slice(-80)));
    if (/Finished\.|Export failed|result buttons: [1-9]/.test(log)) break;
  }
  await sleep(500);
  await shot(ed, 'export-02-done');
  console.log(log);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  fs.writeFileSync(path.join(OUT, 'export-log.txt'), log);
  app.exit(/Finished\./.test(log) && !errors.length ? 0 : 1);
});
