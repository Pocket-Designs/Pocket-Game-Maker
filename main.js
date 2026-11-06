// Pocket-Game-Maker — Electron main process.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const CR = require('./src/shared/credits');
const LAYERS = require('./src/shared/layers');
const TILES = require('./src/shared/tiles');
const { createExporter } = require('./lib/exporter');

const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;
const ASSET_KINDS = ['tilesets', 'characters', 'monsters', 'battlebacks', 'pictures', 'decorations', 'music', 'sounds', 'text'];
const AUDIO_KINDS = ['music', 'sounds'];
const AUDIO_RE = /\.(mp3|flac)$/i;
const TEXT_RE = /\.(txt|md)$/i;
const kindRe = kind => AUDIO_KINDS.includes(kind) ? AUDIO_RE : kind === 'text' ? TEXT_RE : IMG_RE;
// In packaged builds templates are unpacked next to app.asar so they can be copied as plain files.
const TEMPLATE_DIR = path.join(__dirname, 'templates', 'sample').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const LIBRARY_BUNDLED = path.join(__dirname, 'library').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
let editorWin = null;
const playtestData = new Map(); // webContents id -> {projectPath, data, start}
let allowClose = false;

/* ---------------- helpers ---------------- */
const readJSON = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function addRecent(p) {
  const list = readJSON(recentFile(), []).filter(x => x !== p);
  list.unshift(p);
  writeJSON(recentFile(), list.slice(0, 8));
}

function loadProject(dir) {
  if (!fs.existsSync(path.join(dir, 'project.json'))) throw new Error('No project.json in ' + dir);
  const d = p => path.join(dir, 'data', p);
  const infos = readJSON(d('mapinfos.json'), []);
  const maps = {};
  infos.forEach(i => { const m = readJSON(d('maps/' + i.id + '.json'), null); if (m) maps[i.id] = m; });
  addRecent(dir);
  return {
    path: dir,
    project: readJSON(path.join(dir, 'project.json'), {}),
    system: readJSON(d('system.json'), {}),
    types: readJSON(d('types.json'), { types: [], chart: {} }),
    moves: readJSON(d('moves.json'), []),
    monsters: readJSON(d('monsters.json'), []),
    items: readJSON(d('items.json'), []),
    tilesets: readJSON(d('tilesets.json'), []),
    mapInfos: infos,
    maps,
    credits: readJSON(d('credits.json'), {})
  };
}

function saveProject(dir, data) {
  const d = p => path.join(dir, 'data', p);
  writeJSON(path.join(dir, 'project.json'), data.project);
  writeJSON(d('system.json'), data.system);
  writeJSON(d('types.json'), data.types);
  writeJSON(d('moves.json'), data.moves);
  writeJSON(d('monsters.json'), data.monsters);
  writeJSON(d('items.json'), data.items);
  writeJSON(d('tilesets.json'), data.tilesets);
  writeJSON(d('mapinfos.json'), data.mapInfos);
  writeCredits(dir, data);
  const keep = new Set(data.mapInfos.map(i => i.id + '.json'));
  data.mapInfos.forEach(i => { if (data.maps[i.id]) writeJSON(d('maps/' + i.id + '.json'), data.maps[i.id]); });
  const mapDir = d('maps');
  if (fs.existsSync(mapDir)) fs.readdirSync(mapDir).forEach(f => { if (f.endsWith('.json') && !keep.has(f)) fs.unlinkSync(path.join(mapDir, f)); });
  return true;
}

const CREDIT_INTRO_PROJECT = 'Every image, music track and sound in this game with where it came from and its licence. "Placeholder" means built-in Pocket-Game-Maker art and audio ' +
  'that you plan to replace. Edit this list in Pocket-Game-Maker under Database > Credits; it is rewritten each time you save.';
function writeCredits(dir, data) {
  const credits = data.credits || {};
  writeJSON(path.join(dir, 'data', 'credits.json'), credits);
  fs.writeFileSync(path.join(dir, 'CREDITS.md'), CR.toMarkdown(((data.project && data.project.name) || 'Game') + ' asset credits', credits, CREDIT_INTRO_PROJECT));
}

function makeBlank(dir, name) {
  const d = p => path.join(dir, 'data', p);
  const sys = readJSON(d('system.json'), {});
  sys.title = name; sys.startingParty = []; sys.startingItems = {}; sys.switches = [''];
  sys.start = { mapId: 'map001', x: 5, y: 5, dir: 'down' };
  sys.respawn = Object.assign(sys.respawn || {}, { mapId: 'map001', x: 5, y: 5 });
  writeJSON(d('system.json'), sys);
  writeJSON(d('monsters.json'), []);
  writeJSON(d('moves.json'), []);
  const n = 20 * 15;
  fs.rmSync(d('maps'), { recursive: true, force: true });
  const firstTs = (readJSON(d('tilesets.json'), [])[0] || { id: 'outdoor' }).id;
  writeJSON(d('maps/map001.json'), { id: 'map001', name: 'New Map', width: 20, height: 15, tilesetId: firstTs, battleback: '', layers: [new Array(n).fill(0), new Array(n).fill(-1), new Array(n).fill(-1)], layerInfo: LAYERS.defaults(), encounters: { chance: 0, list: [] }, events: [] });
  writeJSON(d('mapinfos.json'), [{ id: 'map001', name: 'New Map' }]);
  fs.rmSync(path.join(dir, 'assets', 'monsters'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'assets', 'monsters'), { recursive: true });
}

/* ---------------- asset library ---------------- */
// The user's own copy lives in Documents so it can be edited and extended; the bundled copy seeds it.
const libraryDir = () => path.join(app.getPath('documents'), 'Pocket-Game-Maker', 'Asset Library');
function seedLibrary() { // copy any bundled file the user doesn't have; never overwrite
  let added = 0;
  const walk = (src, dst) => {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) walk(s, d);
      else if (!fs.existsSync(d)) { fs.copyFileSync(s, d); added++; }
    }
  };
  walk(LIBRARY_BUNDLED, libraryDir());
  // Merge new bundled entries and missing credit fields into the user's library.json (never overwrite edits).
  try {
    const bundled = readJSON(path.join(LIBRARY_BUNDLED, 'library.json'), null);
    const uf = path.join(libraryDir(), 'library.json');
    const user = readJSON(uf, null);
    if (bundled && user) {
      let changed = false;
      for (const kind of ASSET_KINDS) {
        user[kind] = user[kind] || {};
        for (const [key, b] of Object.entries(bundled[kind] || {})) {
          const u = user[kind][key];
          if (!u) { user[kind][key] = b; changed = true; continue; }
          for (const f of ['origin', 'author', 'licence', 'status']) if (!u[f] && b[f]) { u[f] = b[f]; changed = true; }
        }
      }
      if (changed) { writeJSON(uf, user); writeLibraryCredits(user); }
    }
  } catch (err) { console.error('Library credits merge failed:', err); }
  return added;
}
const pickCredit = m => (m && (m.origin || m.licence || m.status)) ? { origin: m.origin || '', author: m.author || '', licence: m.licence || '', status: m.status || '' } : null;
function writeLibraryCredits(meta) {
  const root = libraryDir();
  const intro = 'Every asset in the Pocket-Game-Maker Asset Library, with where it came from and its licence. "Placeholder" means the built-in art that came with Pocket-Game-Maker. ' +
    'When you replace a file with your own art, change its status to Custom and update its origin and licence (Asset Library window > Edit credits). Pocket-Game-Maker rewrites this file and credits.csv whenever credits change.';
  fs.writeFileSync(path.join(root, 'CREDITS.md'), CR.toMarkdown('Asset Library credits', CR.fromLibraryMeta(meta), intro));
  fs.writeFileSync(path.join(root, 'credits.csv'), CR.toCSV(CR.fromLibraryMeta(meta)));
}
function listLibrary() {
  const root = libraryDir();
  const meta = readJSON(path.join(root, 'library.json'), {});
  const items = [];
  for (const kind of ASSET_KINDS) {
    const dir = path.join(root, kind);
    if (!fs.existsSync(dir)) continue;
    const re = kindRe(kind);
    const files = fs.readdirSync(dir).filter(f => re.test(f)).sort();
    if (kind === 'monsters') {
      const ids = [...new Set(files.map(f => f.replace(/_(front|back)\.[^.]+$/i, '').replace(IMG_RE, '')))];
      for (const id of ids) {
        const front = files.find(f => f.startsWith(id + '_front.')) || files.find(f => f.replace(IMG_RE, '') === id);
        const back = files.find(f => f.startsWith(id + '_back.')) || front;
        const m = (meta.monsters || {})['monsters/' + id] || {};
        items.push({ kind, key: 'monsters/' + id, name: m.name || id, description: m.description || '', credit: pickCredit(m), files: ['monsters/' + front, 'monsters/' + back].filter((v, i, a) => a.indexOf(v) === i), preview: path.join(dir, front) });
      }
      continue;
    }
    for (const f of files) {
      const rel = kind + '/' + f;
      const m = (meta[kind] || {})[rel] || {};
      const item = { kind, key: rel, name: m.name || f.replace(re, ''), description: m.description || '', credit: pickCredit(m), files: [rel], preview: path.join(dir, f) };
      if (AUDIO_KINDS.includes(kind)) { item.audio = true; item.loop = !!m.loop; }
      if (m.size) item.size = m.size;
      if (kind === 'tilesets') {
        const mapFile = path.join(dir, f.replace(IMG_RE, '') + '.tiles.json');
        item.mapping = readJSON(mapFile, null);
        if (item.mapping && item.mapping.name) item.name = item.mapping.name;
        if (item.mapping && item.mapping.description) item.description = item.mapping.description;
      }
      items.push(item);
    }
  }
  return { path: root, items };
}
function tilesetFromMapping(rel, mapping, existingIds) {
  const base = path.basename(rel).replace(IMG_RE, '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'tileset';
  let id = base, n = 2; while (existingIds.includes(id)) id = base + '_' + n++;
  const tiles = (mapping && mapping.tiles) || [];
  return {
    id, name: (mapping && mapping.name) || base, image: rel, tileSize: (mapping && mapping.tileSize) || 16, library: rel, animSpeed: (mapping && mapping.animSpeed) || 300,
    flags: tiles.map(t => TILES.flagFromMapping(t)),
    names: tiles.map(t => t.name || '')
  };
}
// Copy library items into a project. Returns what was copied plus tileset entries ready to add.
function addFromLibrary(projDir, keys, overwrite, existingTilesetIds) {
  const lib = listLibrary();
  const out = { copied: [], skipped: [], tilesets: [], credits: {} };
  const flat = CR.fromLibraryMeta(readJSON(path.join(lib.path, 'library.json'), {}));
  const ids = (existingTilesetIds || []).slice();
  for (const key of keys) {
    const item = lib.items.find(i => i.key === key);
    if (!item) continue;
    for (const rel of item.files) {
      const dst = path.join(projDir, 'assets', rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (fs.existsSync(dst) && !overwrite) { out.skipped.push(rel); continue; }
      fs.copyFileSync(path.join(lib.path, rel), dst);
      out.copied.push(rel);
      out.credits[rel] = Object.assign({ name: item.name }, flat[rel] || { origin: 'Added from your asset library (no credits recorded there yet)', author: '', licence: 'Not set', status: 'Custom' });
    }
    if (item.kind === 'tilesets') { const ts = tilesetFromMapping(item.files[0], item.mapping, ids); ids.push(ts.id); out.tilesets.push(ts); }
  }
  return out;
}

/* ---------------- windows ---------------- */
function createEditor() {
  editorWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Pocket-Game-Maker', backgroundColor: '#14161c', icon: path.join(__dirname, 'src', 'editor', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  editorWin.loadFile(path.join(__dirname, 'src', 'editor', 'index.html'));
  editorWin.on('close', e => {
    if (allowClose) return;
    e.preventDefault();
    editorWin.webContents.send('app:closeRequest');
  });
  editorWin.on('closed', () => { editorWin = null; });
}

function buildMenu() {
  const send = ch => () => editorWin && editorWin.webContents.send('menu', ch);
  const tpl = [
    { label: 'File', submenu: [
      { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: send('new') },
      { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: send('open') },
      { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: send('save') },
      { type: 'separator' },
      { label: 'Open Project Folder', click: send('reveal') },
      { type: 'separator' },
      { label: 'Import Assets…', accelerator: 'CmdOrCtrl+I', click: send('import') },
      { label: 'Export Game…', accelerator: 'CmdOrCtrl+E', click: send('export') },
      { type: 'separator' },
      { role: 'quit' }
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: send('redo') },
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'Database', submenu: [
      { label: 'Open Database', accelerator: 'F9', click: send('database') },
      { type: 'separator' },
      ...[['monsters', 'Monsters'], ['moves', 'Moves'], ['types', 'Types'], ['items', 'Items'], ['tilesets', 'Tilesets'], ['audio', 'Music && Sounds'], ['menus', 'Menus && Screens'], ['system', 'System'], ['credits', 'Credits']]
        .map(([tab, label], i) => ({ label, accelerator: 'CmdOrCtrl+Shift+' + (i + 1), click: send('db:' + tab) }))
    ] },
    { label: 'Tools', submenu: [
      { label: 'Database…', click: send('database') },
      { label: 'Asset Library…', accelerator: 'F10', click: send('library') },
      { label: 'Playtest', accelerator: 'F5', click: send('playtest') }
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'About Pocket-Game-Maker', click: send('about') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------------- IPC ---------------- */
ipcMain.handle('app:forceClose', () => { allowClose = true; if (editorWin) editorWin.close(); });
ipcMain.handle('app:recent', () => readJSON(recentFile(), []).filter(p => fs.existsSync(path.join(p, 'project.json'))));
ipcMain.handle('app:reveal', (e, p) => shell.openPath(p));

ipcMain.handle('project:new', async (e, opts) => {
  const r = await dialog.showOpenDialog(editorWin, { title: 'Choose a parent folder for the new project', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const safe = (opts.name || 'MyMonsterGame').replace(/[^\w\- ]+/g, '').trim() || 'MyMonsterGame';
  const dir = path.join(r.filePaths[0], safe);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error('Folder already exists and is not empty: ' + dir);
  copyDir(TEMPLATE_DIR, dir);
  ASSET_KINDS.forEach(k => fs.mkdirSync(path.join(dir, 'assets', k), { recursive: true }));
  writeJSON(path.join(dir, 'project.json'), { name: opts.name || safe, engine: 'Pocket-Game-Maker', formatVersion: 1 });
  if (opts.template === 'blank') makeBlank(dir, opts.name || safe);
  else { const s = readJSON(path.join(dir, 'data', 'system.json'), {}); s.title = opts.name || s.title; writeJSON(path.join(dir, 'data', 'system.json'), s); }
  if (opts.includeLibrary) {
    try {
      const tsFile = path.join(dir, 'data', 'tilesets.json');
      const existing = readJSON(tsFile, []);
      const have = new Set(existing.map(t => t.image));
      const r = addFromLibrary(dir, listLibrary().items.map(i => i.key), false, existing.map(t => t.id));
      r.tilesets.forEach(t => { if (!have.has(t.image)) existing.push(t); });
      writeJSON(tsFile, existing);
      const cf = path.join(dir, 'data', 'credits.json');
      writeJSON(cf, Object.assign(readJSON(cf, {}), r.credits));
    } catch (err) { console.error('Could not copy the asset library:', err); }
  }
  return loadProject(dir);
});

ipcMain.handle('library:list', () => { seedLibrary(); return listLibrary(); });
ipcMain.handle('library:add', (e, projDir, keys, overwrite, ids) => addFromLibrary(projDir, keys, overwrite, ids));
ipcMain.handle('library:open', () => { seedLibrary(); return shell.openPath(libraryDir()); });
ipcMain.handle('library:restore', () => seedLibrary());
ipcMain.handle('library:setCredit', (e, kind, key, fields) => {
  const f = path.join(libraryDir(), 'library.json');
  const meta = readJSON(f, { name: 'Pocket-Game-Maker Asset Library', version: 1 });
  meta[kind] = meta[kind] || {};
  meta[kind][key] = Object.assign({}, meta[kind][key] || {}, fields);
  writeJSON(f, meta);
  writeLibraryCredits(meta);
  return true;
});
ipcMain.handle('library:mapping', (e, rel) => {
  const f = path.join(libraryDir(), rel.replace(IMG_RE, '') + '.tiles.json');
  return readJSON(f, null);
});
// Write a project tileset's flags back to the library mapping file, keeping names and groups.
ipcMain.handle('library:saveMapping', (e, projDir, tileset) => {
  const rel = tileset.library || tileset.image;
  const libImg = path.join(libraryDir(), rel);
  if (!fs.existsSync(libImg)) { // not in the library yet: copy the image in first
    fs.mkdirSync(path.dirname(libImg), { recursive: true });
    fs.copyFileSync(path.join(projDir, 'assets', tileset.image), libImg);
  }
  const f = libImg.replace(IMG_RE, '') + '.tiles.json';
  const old = readJSON(f, { name: tileset.name, image: path.basename(rel), tileSize: tileset.tileSize || 16, author: '', licence: '', tiles: [] });
  old.name = tileset.name; old.tileSize = tileset.tileSize || 16; old.animSpeed = tileset.animSpeed || 300;
  old.tiles = (tileset.flags || []).map((fl, i) => {
    const prev = old.tiles[i] || {};
    const name = (tileset.names && tileset.names[i]) || prev.name || ('Tile ' + i);
    const o = Object.assign({}, prev, { id: i, name }, TILES.flagToMapping(fl));
    if (!fl.auto) delete o.auto; if (!(fl.anim > 1)) delete o.anim;
    return o;
  });
  writeJSON(f, old);
  return f;
});

ipcMain.handle('project:open', async (e, dir) => {
  if (!dir) {
    const r = await dialog.showOpenDialog(editorWin, { title: 'Open Pocket-Game-Maker project', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
  }
  return loadProject(dir);
});
ipcMain.handle('project:save', (e, dir, data) => saveProject(dir, data));

ipcMain.handle('asset:list', (e, dir, kind) => {
  const p = path.join(dir, 'assets', kind);
  if (!fs.existsSync(p)) return [];
  const re = kindRe(kind);
  return fs.readdirSync(p).filter(f => re.test(f)).sort().map(f => kind + '/' + f);
});
ipcMain.handle('asset:import', async (e, dir, kind) => {
  if (!ASSET_KINDS.includes(kind)) throw new Error('Unknown asset kind');
  const filters = AUDIO_KINDS.includes(kind) ? [{ name: 'Audio (MP3 or FLAC)', extensions: ['mp3', 'flac'] }]
    : kind === 'text' ? [{ name: 'Text files (.txt or .md)', extensions: ['txt', 'md'] }] : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }];
  const r = await dialog.showOpenDialog(editorWin, { title: 'Import ' + (kind === 'sounds' ? 'sound effects' : kind), properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled) return [];
  const out = [];
  fs.mkdirSync(path.join(dir, 'assets', kind), { recursive: true });
  r.filePaths.forEach(src => {
    if (!kindRe(kind).test(src)) return;
    const name = path.basename(src).replace(/[^\w.\-]+/g, '_');
    fs.copyFileSync(src, path.join(dir, 'assets', kind, name));
    out.push(kind + '/' + name);
  });
  return out;
});

// Raw bytes of a project asset (used to decode music and sounds). Only files inside assets/ are readable.
ipcMain.handle('asset:read', (e, dir, rel) => {
  const base = path.resolve(dir, 'assets');
  const f = path.resolve(base, rel || '');
  if (!f.startsWith(base + path.sep) || !fs.existsSync(f)) return null;
  return fs.readFileSync(f);
});

// Which of these asset paths are missing from the project's assets folder (used by the playtest debugger).
ipcMain.handle('asset:missing', (e, dir, rels) => {
  const base = path.resolve(dir, 'assets');
  return (rels || []).filter(rel => { const f = path.resolve(base, String(rel)); return !f.startsWith(base + path.sep) || !fs.existsSync(f); });
});

// Write a small text file into the project's assets/text folder (credits or licence typed in the editor).
ipcMain.handle('asset:writeText', (e, dir, name, text) => {
  const safe = String(name || 'text.txt').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '');
  const rel = 'text/' + (TEXT_RE.test(safe) ? safe : safe + '.txt');
  const f = path.join(dir, 'assets', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, String(text || ''), 'utf8');
  return rel;
});
ipcMain.handle('playtest:screenshot', (e, dir, dataUrl) => {
  const folder = path.join(dir, 'screenshots');
  fs.mkdirSync(folder, { recursive: true });
  const name = 'screenshot-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
  fs.writeFileSync(path.join(folder, name), Buffer.from(String(dataUrl).split(',')[1] || '', 'base64'));
  return 'screenshots/' + name;
});
ipcMain.handle('app:quitGame', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w !== editorWin) w.close(); });

ipcMain.handle('playtest:start', (e, dir, data, start) => {
  const sys = data.system || {};
  const sc = sys.screen || { width: 320, height: 240, scale: 2 };
  const win = new BrowserWindow({
    width: sc.width * sc.scale, height: sc.height * sc.scale, useContentSize: true, resizable: true,
    title: (sys.title || 'Playtest') + ' — Playtest', backgroundColor: '#000000', icon: path.join(__dirname, 'src', 'editor', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  win.setMenuBarVisibility(false);
  playtestData.set(win.webContents.id, { projectPath: dir, data, start: start || null, debug: true }); // debug: the playtest debugger runs
  const id = win.webContents.id;
  win.on('closed', () => playtestData.delete(id));
  win.loadFile(path.join(__dirname, 'src', 'runtime', 'play.html'));
  return true;
});
ipcMain.handle('playtest:getData', e => playtestData.get(e.sender.id) || null);

const saveDir = proj => path.join(proj, 'saves');
ipcMain.handle('save:write', (e, proj, slot, obj) => { writeJSON(path.join(saveDir(proj), 'slot' + slot + '.json'), obj); return true; });
ipcMain.handle('save:read', (e, proj, slot) => readJSON(path.join(saveDir(proj), 'slot' + slot + '.json'), null));
ipcMain.handle('save:list', (e, proj) => {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const s = readJSON(path.join(saveDir(proj), 'slot' + i + '.json'), null);
    out.push(s ? { slot: i, meta: s.meta || {} } : { slot: i, meta: null });
  }
  return out;
});

/* ---------------- export ---------------- */
let exporter = null;
const getExporter = () => exporter || (exporter = createExporter(app, nativeImage));
let exporting = false;
ipcMain.handle('export:run', async (e, dir, settings, art, outDir) => {
  if (exporting) throw new Error('An export is already running.');
  exporting = true;
  const lines = [];
  const log = msg => { lines.push(String(msg)); try { e.sender.send('export:progress', String(msg)); } catch (err) { /* window closed */ } };
  try {
    const proj = loadProject(dir);
    const r = await getExporter().run(proj, settings, art, outDir, log);
    return { out: r.out, have: r.have, log: lines, androidDir: r.have.android ? path.join(r.out, 'android', r.info.fileName) : null };
  } catch (err) { log('Export failed: ' + err.message); throw err; } finally { exporting = false; }
});
ipcMain.handle('export:chooseFolder', async (e, current) => {
  const r = await dialog.showOpenDialog(editorWin, { title: 'Choose where to save exported games', defaultPath: current || undefined, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('export:defaultFolder', (e, dir) => path.join(dir, 'exports'));
ipcMain.handle('export:openFolder', (e, p) => shell.openPath(p));
ipcMain.handle('export:androidBuild', (e, projectDir) => getExporter().androidBuild(projectDir, msg => e.sender.send('export:progress', String(msg))));

/* ---------------- lifecycle ---------------- */
// MonsterForge was renamed Pocket-Game-Maker in 0.8.1: carry over the old asset library folder and recent-projects list once.
function migrateOldName() {
  const OLD = 'Monster' + 'Forge';
  try {
    const oldLib = path.join(app.getPath('documents'), OLD), newLib = path.join(app.getPath('documents'), 'Pocket-Game-Maker');
    if (fs.existsSync(oldLib) && !fs.existsSync(newLib)) {
      try { fs.renameSync(oldLib, newLib); } catch (e) { fs.cpSync(oldLib, newLib, { recursive: true }); }
      // the built-in art's credit lines named the old product
      for (const f of ['library.json', 'CREDITS.md', 'credits.csv', 'README.txt', 'LICENSE.txt', 'audio-meta.json']) {
        const p = path.join(newLib, 'Asset Library', f);
        if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(OLD).join('Pocket-Game-Maker'));
      }
    }
    const oldRecent = path.join(app.getPath('appData'), OLD, 'recent.json');
    if (fs.existsSync(oldRecent) && !fs.existsSync(recentFile())) { fs.mkdirSync(path.dirname(recentFile()), { recursive: true }); fs.copyFileSync(oldRecent, recentFile()); }
  } catch (err) { console.error('Could not carry over settings from the old name:', err); }
}

app.whenReady().then(() => {
  migrateOldName();
  try { seedLibrary(); } catch (err) { console.error('Asset library setup failed:', err); }
  buildMenu();
  createEditor();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createEditor(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
