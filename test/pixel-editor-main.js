// Electron test for the pixel editor: draws with the mouse, uses shapes, fill, selection, layers, undo, then saves
// and reopens the picture. Run: xvfb-run -a npx electron --no-sandbox test/pixel-editor-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('pixel-editor-main.js') ? 'pixel-out' : process.argv[process.argv.length - 1]);
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

app.whenReady().then(async () => {
  await sleep(1500);
  const ed = BrowserWindow.getAllWindows()[0]; ed.setSize(1440, 900); await sleep(300);
  await js(ed, `App.openProject(${JSON.stringify(proj)}); 0`); await sleep(1500);
  const out = {};
  // Screen position of picture pixel (x, y), centre of the pixel.
  const pt = async (x, y) => js(ed, `(() => { const S = PixelEditor.S, r = S.view.getBoundingClientRect(); return { x: Math.round(r.left + S.ox + (${x} + 0.5) * S.zoom), y: Math.round(r.top + S.oy + (${y} + 0.5) * S.zoom) }; })()`);
  const mouse = (type, p, mods) => ed.webContents.sendInputEvent({ type, x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers: mods || [] });
  async function drag(x0, y0, x1, y1, mods, steps = 6) {
    const a = await pt(x0, y0); mouse('mouseDown', a, mods); await sleep(30);
    for (let i = 1; i <= steps; i++) { const p = await pt(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps)); mouse('mouseMove', p, mods); await sleep(15); }
    mouse('mouseUp', await pt(x1, y1), mods); await sleep(60);
  }
  const px = (x, y, layer) => js(ed, `(L => L ? Array.from(L.canvas.getContext('2d').getImageData(${x}, ${y}, 1, 1).data).join(',') : 'no layer')(PixelEditor.S && PixelEditor.S.layers[${layer == null ? 'PixelEditor.S.active' : layer}])`); const pxOld = (x, y, layer) => js(ed, `Array.from(PixelEditor.S.layers[${layer == null ? 'PixelEditor.S.active' : layer}].canvas.getContext('2d').getImageData(${x}, ${y}, 1, 1).data).join(',')`);
  const key = async k => { ed.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); ed.webContents.sendInputEvent({ type: 'char', keyCode: k }); ed.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(80); };

  // 1. New character sheet from the preset (the template shows underneath)
  await js(ed, `PixelEditor.newPicture('characters'); 0`); await sleep(500);
  await shot(ed, 'P0-new-picture');
  await js(ed, `(() => { const s = document.querySelector('.modal .field input[type=text]'); s.value = 'test-hero'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); [...document.querySelectorAll('.modal-foot button')].find(b => /Start/.test(b.textContent)).click(); })(); 0`);
  await sleep(1200);
  out.opened = await js(ed, `PixelEditor.S && (PixelEditor.S.rel + ' ' + PixelEditor.S.w + 'x' + PixelEditor.S.h + ' grid ' + PixelEditor.S.grid + ' template ' + !!PixelEditor.S.guide.img)`);
  // 2. Pencil stroke with a palette colour
  await js(ed, `document.querySelectorAll('.pe-sw')[8].click(); 0`); // red
  await drag(2, 2, 12, 2);
  out.pencil = await px(7, 2);
  // 3. Filled rectangle, ellipse outline, triangle, line (shift = straight)
  await key('U'); await js(ed, `PixelEditor.S.filled = true; 0`);
  await js(ed, `document.querySelectorAll('.pe-sw')[17].click(); 0`); await key('U'); // blue, back to rect (picking a colour switches to pencil)
  await js(ed, `PixelEditor.S.filled = true; 0`);
  await drag(18, 4, 29, 12);
  out.rect = await px(20, 6);
  await key('O'); await js(ed, `PixelEditor.S.filled = false; 0`); await drag(33, 2, 46, 14);
  out.ellipseEdge = await px(39, 2); out.ellipseInside = await px(39, 8);
  await key('T'); await js(ed, `PixelEditor.S.filled = true; document.querySelectorAll('.pe-sw')[12].click(); PixelEditor.setTool('triangle'); PixelEditor.S.filled = true; 0`);
  await drag(2, 18, 13, 30);
  out.triangleTop = await px(7, 18); out.triangleCorner = await px(2, 18);
  await key('L'); await drag(18, 20, 30, 21, ['shift']);
  out.lineStraight = (await px(30, 20)) + ' / ' + (await px(30, 21));
  // 4. Fill an area, eraser
  await key('G'); await js(ed, `document.querySelectorAll('.pe-sw')[10].click(); PixelEditor.setTool('fill'); 0`);
  const f = await pt(40, 8); mouse('mouseDown', f); mouse('mouseUp', f); await sleep(80);
  out.fillInsideEllipse = await px(40, 8);
  await key('E'); await drag(20, 6, 22, 6);
  out.erased = await px(21, 6);
  await shot(ed, 'P1-drawing');
  // 5. Select and move a block, then flip it
  await key('M'); await drag(18, 4, 29, 12);
  out.sel = await js(ed, `JSON.stringify(PixelEditor.S.sel)`);
  await drag(23, 8, 23, 40, [], 8); // move it down 32 pixels
  await js(ed, `PixelEditor.transform('h'); 0`); await sleep(60);
  await key('Return');
  out.moved = (await px(20, 38)) + ' (was at y 6: now ' + (await px(20, 6)) + ')';
  out.afterMove = await js(ed, `!PixelEditor.S.float`);
  // 6. Layers: add, draw on it, hide, opacity, move, merge
  await js(ed, `PixelEditor.layerOp('add'); PixelEditor.S.color = [255, 255, 255, 255]; PixelEditor.setTool('pencil'); 0`);
  await drag(5, 50, 40, 50);
  out.layers = await js(ed, `PixelEditor.S.layers.map(L => L.name).join(', ') + ' active ' + PixelEditor.S.active`);
  out.onLayer2 = await px(10, 50, 1); out.notOnLayer1 = await px(10, 50, 0);
  await js(ed, `PixelEditor.S.layers[1].opacity = 0.5; PixelEditor.renderLayers(); 0`);
  // 7. Undo / redo
  const before = await px(10, 50, 1);
  await js(ed, `PixelEditor.undo(); 0`); await sleep(50);
  out.undo = (await js(ed, `PixelEditor.S.layers[1] ? Array.from(PixelEditor.S.layers[1].canvas.getContext('2d').getImageData(10, 50, 1, 1).data).join(',') : 'no layer'`)) + ' (was ' + before + ')';
  await js(ed, `PixelEditor.redoStep(); 0`); await sleep(50);
  out.redo = await px(10, 50, 1);
  await sleep(300);
  await shot(ed, 'P2-layers-preview');
  // 8. Save, close, reopen: layers come back
  await js(ed, `PixelEditor.save(false); 0`); await sleep(600);
  await js(ed, `(() => { const i = document.querySelector('.modal:last-of-type input[type=text]') || [...document.querySelectorAll('.modal input[type=text]')].pop(); [...document.querySelectorAll('.modal-foot button')].reverse().find(b => b.textContent === 'OK').click(); })(); 0`);
  await sleep(1500);
  const rel = 'characters/test-hero.png';
  out.saved = fs.existsSync(path.join(proj, 'assets', rel)) + ' layers file ' + fs.existsSync(path.join(proj, 'art-src', rel + '.layers.json'));
  out.inAssets = await js(ed, `App.assets.characters.includes('${rel}') + ' credit: ' + (App.proj.credits['${rel}'] || {}).origin`);
  out.dirtyAfterSave = await js(ed, `PixelEditor.S.dirty`);
  await js(ed, `[...document.querySelectorAll('.modal-foot button')].find(b => b.textContent === 'Close').click(); 0`); await sleep(500);
  out.closed = await js(ed, `!PixelEditor.S`);
  await js(ed, `PixelEditor.edit('${rel}'); 0`); await sleep(1500);
  out.reopened = await js(ed, `PixelEditor.S.layers.map(L => L.name + (L.opacity < 1 ? ' ' + L.opacity : '')).join(', ')`);
  out.reopenedPixel = await px(10, 50, 1);
  await js(ed, `PixelEditor.S.closing = true; document.querySelector('.modal-foot button').click(); 0`); await sleep(400);
  // 9. Edit the sample's tileset: grid from the tileset, autotile preview of the water block
  await js(ed, `App.action('pixelTileset'); 0`); await sleep(1500);
  out.tileset = await js(ed, `PixelEditor.S.rel + ' grid ' + PixelEditor.S.grid + ' block ' + PixelEditor.S.block + ' preview ' + !!PixelEditor.S.prevAuto`);
  await sleep(400);
  await shot(ed, 'P3-tileset-autotile');
  await js(ed, `PixelEditor.S.closing = true; document.querySelector('.modal-foot button').click(); 0`); await sleep(400);
  // 10. Asset picker has New and Edit buttons
  await js(ed, `DB.open('monsters'); 0`); await sleep(800);
  out.pickerButtons = await js(ed, `[...document.querySelectorAll('.asset-row button')].map(b => b.textContent).slice(0, 6).join(' | ')`);
  await js(ed, `[...document.querySelectorAll('.modal-foot button')].find(b => b.textContent === 'Done').click(); 0`); await sleep(300);
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  app.exit(0);
});
