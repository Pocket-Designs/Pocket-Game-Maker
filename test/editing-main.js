// Electron test for deleting layers and maps, the Database menu and the Import window.
// Run: xvfb-run -a npx electron --no-sandbox test/editing-main.js <outDir>
const { app, BrowserWindow, Menu } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('editing-main.js') ? 'editing-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });
const errors = [];
app.on('browser-window-created', (e, win) => win.webContents.on('console-message', (ev, level, msg, line, src) => { if (level >= 2) errors.push(path.basename(src || '') + ':' + line + ' ' + msg); }));
require('../main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const js = (w, c) => w.webContents.executeJavaScript(c, true);
const shot = async (w, n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await w.webContents.capturePage()).toPNG());
const clickBtn = (w, text) => js(w, `(() => { const b = [...document.querySelectorAll('.modal-foot button')].reverse().find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);
app.whenReady().then(async () => {
  await sleep(1500);
  const w = BrowserWindow.getAllWindows()[0]; w.setSize(1440, 900);
  await js(w, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  const out = {};
  // layers: delete down to one
  out.layersBefore = await js(w, 'App.map().layers.length');
  for (let i = 0; i < 2; i++) { await js(w, 'App.setLayer(App.map().layers.length - 1); LayersPanel.remove(App.layer); 0'); await sleep(300); if (i === 0) await shot(w, 'E1-delete-layer-confirm'); await clickBtn(w, 'Delete'); await sleep(300); }
  out.layersAfter = await js(w, 'App.map().layers.length');
  out.deleteDisabled = await js(w, `[...document.querySelectorAll('#layer-tools button')].find(b => b.textContent === 'Delete').disabled`);
  await js(w, 'MapEditor.undo(); MapEditor.undo(); 0'); await sleep(300);
  out.layersUndo = await js(w, 'App.map().layers.length');
  // maps: delete the start map
  out.mapsBefore = await js(w, 'App.proj.mapInfos.map(i => i.name).join(", ")');
  await js(w, `document.getElementById('btn-del-map').click(); 0`); await sleep(400);
  await shot(w, 'E2-delete-map-confirm');
  await clickBtn(w, 'Delete map'); await sleep(600);
  out.mapsAfter = await js(w, 'App.proj.mapInfos.map(i => i.name).join(", ")');
  out.start = await js(w, 'JSON.stringify(App.proj.system.start) + " respawn " + JSON.stringify(App.proj.system.respawn)');
  out.validStart = await js(w, '!!App.proj.maps[App.proj.system.start.mapId]');
  await shot(w, 'E3-after-delete-map');
  // Database menu
  const menu = Menu.getApplicationMenu();
  const dbMenu = menu.items.find(i => i.label === 'Database');
  out.dbMenu = dbMenu ? dbMenu.submenu.items.map(i => i.label + (i.accelerator ? ' [' + i.accelerator + ']' : '')).filter(Boolean).join(' | ') : 'missing';
  dbMenu.submenu.items.find(i => i.label === 'Items').click(); await sleep(800);
  out.dbTab = await js(w, 'DB.tab');
  dbMenu.submenu.items.find(i => i.label === 'Credits').click(); await sleep(600);
  out.dbTab2 = await js(w, 'DB.tab + " modals=" + document.querySelectorAll(".modal").length');
  await clickBtn(w, 'Done'); await sleep(400);
  // Import window
  const fileMenu = menu.items.find(i => i.label === 'File');
  out.importItem = fileMenu.submenu.items.filter(i => /Import/.test(i.label)).map(i => i.label + ' [' + i.accelerator + ']').join();
  await js(w, `App.action('import'); 0`); await sleep(800);
  await shot(w, 'E4-import-window');
  await clickBtn(w, 'Close'); await sleep(300);
  // tileset offer after an import
  fs.copyFileSync(path.join(proj, 'assets', 'tilesets', 'outdoor.png'), path.join(proj, 'assets', 'tilesets', 'my-forest.png'));
  await js(w, `Importer.offerTilesets(['tilesets/my-forest.png']); 0`); await sleep(500);
  await shot(w, 'E5-add-tileset');
  await clickBtn(w, 'Add to Database'); await sleep(400);
  out.tilesets = await js(w, 'App.proj.tilesets.map(t => t.name + "=" + t.image + "@" + t.tileSize).join(", ")');
  // Asset Library has the import button
  await js(w, `App.action('library'); 0`); await sleep(1200);
  out.libButton = await js(w, `[...document.querySelectorAll('.lib-side button')].map(b => b.textContent).join(' | ')`);
  await shot(w, 'E6-library');
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  app.exit(0);
});
