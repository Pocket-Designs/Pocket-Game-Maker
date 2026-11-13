// Pocket-Game-Maker game exporter: turns a project into games players can run without Pocket-Game-Maker.
//   web/      HTML5 build (browsers, itch.io) — also the heart of every other build
//   windows/  <Game>.exe + Electron runtime, ready to zip or upload
//   linux/    <game> binary + Electron runtime, .desktop file, tar.gz
//   android/  an Android Studio / Gradle project wrapping the web build in a WebView
//   steam/ epic/ itch/ gog/ google-play/  upload scripts and notes for each store
//   store-art/  capsule and banner images in the sizes each store asks for
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFile } = require('child_process');
const yazl = require('yazl');
const yauzl = require('yauzl');

const ROOT = path.join(__dirname, '..');
const RUNTIME_FILES = ['play.css', 'web-api.js', 'ui.js', 'audio.js', 'shop.js', 'battleScene.js', 'menus.js', 'touch.js', 'home.js', 'scenes.js', 'worldmap.js', 'view25.js', 'game.js'];
// The playtest page turned into an exported game's index.html. The playtest debugger is left out of exported games.
function webIndexHtml(html, title) {
  return html.replace(/\n?\s*<script src="debugger\.js"><\/script>/, '')
    .replace(/src="\.\.\/shared\//g, 'src="engine/shared/').replace(/src="(?!engine\/)([\w-]+\.js)"/g, 'src="engine/runtime/$1"').replace('href="play.css"', 'href="engine/runtime/play.css"')
    .replace(/<title>[^<]*<\/title>/, '<title>' + String(title || 'Game').replace(/[<&]/g, '') + '</title>')
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">');
}
const SHARED_FILES = ['core.js', 'battle.js', 'quick.js', 'layers.js', 'tiles.js', 'heights.js', 'audio.js', 'gameconfig.js'];
// Inside an installed Pocket-Game-Maker, files marked "asarUnpack" live next to app.asar; everything else is read from inside it.
const unpacked = p => { const u = p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); return u !== p && fs.existsSync(u) ? u : p; };

/* ---------------- small helpers ---------------- */
const mkdirp = d => fs.mkdirSync(d, { recursive: true });
const writeFile = (f, data) => { mkdirp(path.dirname(f)); fs.writeFileSync(f, data); };
function copyDir(src, dst, skip) {
  mkdirp(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip && skip(e.name, src)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, skip);
    else if (e.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(s), d); } catch (err) { fs.copyFileSync(s, d); } }
    else { fs.copyFileSync(s, d); try { fs.chmodSync(d, fs.statSync(s).mode); } catch (err) { /* windows */ } }
  }
}
function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
const slugify = s => String(s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
const fileSafe = s => String(s || 'Game').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').replace(/\s+/g, ' ').trim() || 'Game';
const dataUrlBuf = u => Buffer.from(String(u || '').split(',')[1] || '', 'base64');

// Zip a folder (yazl). prefix: folder name inside the zip ('' = files at the top level).
function zipDir(dir, outFile, prefix, modes) {
  return new Promise((resolve, reject) => {
    const z = new yazl.ZipFile();
    for (const rel of listFiles(dir)) {
      const full = path.join(dir, rel);
      z.addFile(full, (prefix ? prefix + '/' : '') + rel, { mode: (modes && modes(rel)) || (fs.statSync(full).mode & 0o777) | 0o100000 });
    }
    z.end();
    mkdirp(path.dirname(outFile));
    z.outputStream.pipe(fs.createWriteStream(outFile)).on('close', resolve).on('error', reject);
  });
}
// A .tar.gz that keeps Linux file permissions (so the game binary stays runnable).
function tarGz(dir, outFile, prefix, modeFor) {
  return new Promise((resolve, reject) => {
    mkdirp(path.dirname(outFile));
    const gz = zlib.createGzip({ level: 9 }), out = fs.createWriteStream(outFile);
    gz.pipe(out); out.on('close', resolve); out.on('error', reject);
    const header = (name, size, mode, type) => {
      const h = Buffer.alloc(512);
      let prefixPart = '';
      if (Buffer.byteLength(name) > 100) { const i = name.lastIndexOf('/', name.length - 2); prefixPart = name.slice(0, i); name = name.slice(i + 1); }
      h.write(name, 0, 100); h.write(((mode & 0o7777).toString(8)).padStart(7, '0') + '\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
      h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136);
      h.write('        ', 148); h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263); h.write('root', 265); h.write('root', 297); h.write(prefixPart, 345, 155);
      let sum = 0; for (let i = 0; i < 512; i++) sum += h[i];
      h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
      return h;
    };
    const files = listFiles(dir);
    const dirs = [...new Set(files.map(f => f.split('/').slice(0, -1)).flatMap(parts => parts.map((p, i) => parts.slice(0, i + 1).join('/'))))].filter(Boolean).sort();
    if (prefix) gz.write(header(prefix + '/', 0, 0o755, '5'));
    dirs.forEach(d => gz.write(header((prefix ? prefix + '/' : '') + d + '/', 0, 0o755, '5')));
    (async () => {
      for (const rel of files) {
        const full = path.join(dir, rel), size = fs.statSync(full).size;
        gz.write(header((prefix ? prefix + '/' : '') + rel, size, modeFor(rel), '0'));
        await new Promise((res, rej) => { const rs = fs.createReadStream(full); rs.on('data', c => { if (!gz.write(c)) { rs.pause(); gz.once('drain', () => rs.resume()); } }); rs.on('end', res); rs.on('error', rej); });
        const pad = (512 - (size % 512)) % 512; if (pad) gz.write(Buffer.alloc(pad));
      }
      gz.end(Buffer.alloc(1024));
    })().catch(reject);
  });
}
// A Windows .ico made of PNG images (Windows Vista and later read these directly).
function makeIco(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, png }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head].concat(pngs.map(p => p.png)));
}
function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const get = (u, hops) => https.get(u, { headers: { 'User-Agent': 'Pocket-Game-Maker' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) { res.resume(); return get(new URL(res.headers.location, u).href, hops + 1); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (' + res.statusCode + '): ' + url)); }
      const total = +res.headers['content-length'] || 0; let got = 0;
      mkdirp(path.dirname(dest));
      const out = fs.createWriteStream(dest + '.part');
      res.on('data', c => { got += c.length; if (onProgress && total) onProgress(got / total); });
      res.pipe(out); out.on('finish', () => out.close(() => { fs.renameSync(dest + '.part', dest); resolve(dest); }));
      out.on('error', reject);
    }).on('error', reject);
    get(url, 0);
  });
}
function unzip(zipFile, destDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true }, (err, zf) => {
      if (err) return reject(err);
      zf.readEntry();
      zf.on('entry', entry => {
        const target = path.join(destDir, entry.fileName);
        if (!target.startsWith(path.resolve(destDir))) return reject(new Error('Bad path in zip'));
        const mode = (entry.externalFileAttributes >>> 16) & 0o7777;
        const isLink = ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
        if (/\/$/.test(entry.fileName)) { mkdirp(target); zf.readEntry(); return; }
        zf.openReadStream(entry, (e2, rs) => {
          if (e2) return reject(e2);
          mkdirp(path.dirname(target));
          if (isLink) { const chunks = []; rs.on('data', c => chunks.push(c)); rs.on('end', () => { try { fs.symlinkSync(Buffer.concat(chunks).toString(), target); } catch (e) { /* ignore */ } zf.readEntry(); }); return; }
          const ws = fs.createWriteStream(target, mode ? { mode } : undefined);
          rs.pipe(ws); ws.on('close', () => zf.readEntry()); ws.on('error', reject);
        });
      });
      zf.on('end', resolve); zf.on('error', reject);
    });
  });
}
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/* ---------------- the exported game's own program ---------------- */
// Electron main process for an exported game: one window, saves in the player's app-data folder.
const GAME_MAIN = info => `// ${info.title} — made with Pocket-Game-Maker.
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const INFO = require('./game/info.json');
app.setName(INFO.title);
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
const saveDir = () => path.join(app.getPath('userData'), 'saves');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
ipcMain.handle('game:data', () => readJSON(path.join(__dirname, 'game', 'game.json')));
ipcMain.handle('game:asset', (e, rel) => { const base = path.join(__dirname, 'game', 'assets'); const f = path.resolve(base, rel || ''); return f.startsWith(base + path.sep) && fs.existsSync(f) ? fs.readFileSync(f) : null; });
const slotFile = slot => (+slot === 0 ? 'autosave' : 'slot' + (+slot | 0)) + '.json'; // slot 0 is the Autosave slot
ipcMain.handle('save:write', (e, slot, obj) => { fs.mkdirSync(saveDir(), { recursive: true }); fs.writeFileSync(path.join(saveDir(), slotFile(slot)), JSON.stringify(obj)); return true; });
ipcMain.handle('save:read', (e, slot) => readJSON(path.join(saveDir(), slotFile(slot))));
ipcMain.handle('save:list', (e, count) => {
  const auto = readJSON(path.join(saveDir(), slotFile(0)));
  const out = auto ? [{ slot: 0, auto: true, meta: auto.meta || {} }] : [];
  for (let i = 1; i <= Math.max(1, Math.min(12, count | 0 || 4)); i++) { const s = readJSON(path.join(saveDir(), slotFile(i))); out.push({ slot: i, meta: s ? s.meta || {} : null }); }
  return out;
});
ipcMain.handle('game:quit', () => app.quit());
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({ width: INFO.width * INFO.scale, height: INFO.height * INFO.scale, useContentSize: true, title: INFO.title, backgroundColor: '#000000',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  if (process.env.MF_EXPORT_TEST) setTimeout(async () => { const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.MF_EXPORT_TEST, img.toPNG()); app.quit(); }, 6000);
});
app.on('window-all-closed', () => app.quit());
`;
const GAME_PRELOAD = `const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
contextBridge.exposeInMainWorld('api', {
  getPlaytestData: async () => ({ projectPath: '', data: await ipcRenderer.invoke('game:data'), start: null }),
  assetUrl: (dir, rel) => pathToFileURL(path.join(__dirname, 'game', 'assets', rel)).href,
  readAsset: (dir, rel) => ipcRenderer.invoke('game:asset', rel),
  listSaves: (dir, count) => ipcRenderer.invoke('save:list', count),
  saveGame: (dir, slot, obj) => ipcRenderer.invoke('save:write', slot, obj),
  loadGame: (dir, slot) => ipcRenderer.invoke('save:read', slot),
  quitGame: () => ipcRenderer.invoke('game:quit')
});
`;
const RUNTIME_NOTICE = info => `${info.title} ${info.version}${info.publisher ? ' by ' + info.publisher : ''}

This game was made with Pocket-Game-Maker.
The Pocket-Game-Maker game engine is Copyright (c) 2026 Pocket-Designs <pocket-designs@proton.me>
and is released under the MIT Licence:

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
  associated documentation files (the "Software"), to deal in the Software without restriction,
  including without limitation the rights to use, copy, modify, merge, publish, distribute,
  sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions: The above copyright notice and this
  permission notice shall be included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

The game's own art, music, story and data belong to its author. See CREDITS.md for every asset and its licence.
Desktop builds run on Electron (MIT) and Chromium; their licences are in LICENSE / LICENSE.electron.txt and LICENSES.chromium.html.
`;

/* ---------------- the exporter ---------------- */
function createExporter(electronApp, nativeImage) {
  const cacheDir = () => path.join(electronApp.getPath('userData'), 'export-cache');

  // Where to get Electron for a platform: this computer's own copy, or a download from GitHub (cached).
  async function electronFor(platform, log) {
    const ver = process.versions.electron;
    if (platform === process.platform) {
      const dir = path.dirname(process.execPath);
      return { dir, exe: path.basename(process.execPath), local: true };
    }
    const name = 'electron-v' + ver + '-' + platform + '-x64';
    const dir = path.join(cacheDir(), name);
    const exe = platform === 'win32' ? 'electron.exe' : 'electron';
    if (fs.existsSync(path.join(dir, '.complete'))) return { dir, exe, local: false };
    const base = 'https://github.com/electron/electron/releases/download/v' + ver + '/';
    const zip = path.join(cacheDir(), name + '.zip');
    let last = -1;
    if (!fs.existsSync(zip)) log('Downloading the ' + (platform === 'win32' ? 'Windows' : 'Linux') + ' game runtime (Electron ' + ver + ', about 100 MB, only the first time)…');
    else log('Unpacking the ' + (platform === 'win32' ? 'Windows' : 'Linux') + ' game runtime…');
    if (!fs.existsSync(zip)) await download(base + name + '.zip', zip, p => { const k = Math.floor(p * 10); if (k !== last) { last = k; log('  ' + (k * 10) + '%'); } });
    const sums = path.join(cacheDir(), 'SHASUMS256-' + ver + '.txt');
    if (!fs.existsSync(sums)) await download(base + 'SHASUMS256.txt', sums);
    const line = fs.readFileSync(sums, 'utf8').split('\n').find(l => l.trim().endsWith('*' + name + '.zip') || l.trim().endsWith(' ' + name + '.zip'));
    if (line && line.split(/\s+/)[0] !== sha256(zip)) { fs.unlinkSync(zip); throw new Error('The downloaded runtime was damaged. Please try again.'); }
    // The runtime contains .asar files; Electron would try to open them as folders unless asar support is off while unpacking.
    const noAsar = process.noAsar;
    process.noAsar = true;
    try { fs.rmSync(dir, { recursive: true, force: true }); await unzip(zip, dir); } finally { process.noAsar = noAsar; }
    fs.writeFileSync(path.join(dir, '.complete'), ver);
    return { dir, exe, local: false };
  }

  // Everything needed to play in a browser: index.html, the engine scripts, game.json and the assets.
  function buildWeb(proj, info, dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    const rt = unpacked(path.join(ROOT, 'src', 'runtime')), sh = unpacked(path.join(ROOT, 'src', 'shared'));
    RUNTIME_FILES.forEach(f => writeFile(path.join(dest, 'engine', 'runtime', f), fs.readFileSync(path.join(rt, f))));
    SHARED_FILES.forEach(f => writeFile(path.join(dest, 'engine', 'shared', f), fs.readFileSync(path.join(sh, f))));
    const html = webIndexHtml(fs.readFileSync(path.join(rt, 'play.html'), 'utf8'), info.title);
    writeFile(path.join(dest, 'index.html'), html);
    const data = {
      exportInfo: info, project: proj.project, system: proj.system, types: proj.types, moves: proj.moves, monsters: proj.monsters, items: proj.items,
      tilesets: proj.tilesets, mapInfos: proj.mapInfos, maps: proj.maps, credits: proj.credits || {}
    };
    writeFile(path.join(dest, 'game', 'game.json'), JSON.stringify(data));
    writeFile(path.join(dest, 'game', 'info.json'), JSON.stringify(info, null, 2));
    const assets = path.join(proj.path, 'assets');
    if (fs.existsSync(assets)) copyDir(assets, path.join(dest, 'game', 'assets'));
    if (fs.existsSync(path.join(proj.path, 'CREDITS.md'))) fs.copyFileSync(path.join(proj.path, 'CREDITS.md'), path.join(dest, 'CREDITS.md'));
    writeFile(path.join(dest, 'LICENCES.txt'), RUNTIME_NOTICE(info));
  }

  async function buildDesktop(platform, web, info, iconPng, dest, log) {
    const rt = await electronFor(platform, log);
    fs.rmSync(dest, { recursive: true, force: true });
    const ours = ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.md'];
    copyDir(rt.dir, dest, (name, from) => from === rt.dir && (name === 'resources' || name === rt.exe || name === '.complete' || /^Uninstall /i.test(name) || (rt.local && ours.includes(name))));
    const exeName = platform === 'win32' ? info.fileName + '.exe' : info.slug;
    fs.copyFileSync(path.join(rt.dir, rt.exe), path.join(dest, exeName));
    if (platform !== 'win32') fs.chmodSync(path.join(dest, exeName), 0o755);
    const app = path.join(dest, 'resources', 'app');
    copyDir(web, app);
    writeFile(path.join(app, 'package.json'), JSON.stringify({ name: info.slug, productName: info.title, version: info.version, main: 'main.js', author: info.publisher || undefined }, null, 2));
    writeFile(path.join(app, 'main.js'), GAME_MAIN(info));
    writeFile(path.join(app, 'preload.js'), GAME_PRELOAD);
    writeFile(path.join(app, 'icon.png'), iconPng);
    for (const f of ['CREDITS.md', 'LICENCES.txt']) if (fs.existsSync(path.join(web, f))) fs.copyFileSync(path.join(web, f), path.join(dest, f));
    if (platform === 'win32') {
      const sizes = [16, 24, 32, 48, 64, 128, 256].map(size => ({ size, png: nativeImage.createFromBuffer(iconPng).resize({ width: size, height: size, quality: 'best' }).toPNG() }));
      const ico = path.join(app, 'icon.ico'); fs.writeFileSync(ico, makeIco(sizes));
      await setWindowsDetails(path.join(dest, exeName), ico, info, log);
    } else {
      writeFile(path.join(dest, info.slug + '.png'), iconPng);
      writeFile(path.join(dest, info.slug + '.desktop'), '[Desktop Entry]\nType=Application\nName=' + info.title + '\nComment=' + (info.description || info.title) + '\nExec=' + info.slug + '\nIcon=' + info.slug + '\nCategories=Game;RolePlaying;\nTerminal=false\n');
      writeFile(path.join(dest, 'README.txt'), info.title + ' ' + info.version + '\n\nRun the game with ./' + info.slug + ' (double-click it in most file managers).\nTo add it to your applications menu, edit the Exec= and Icon= lines in ' + info.slug + '.desktop to the full path of this folder and copy the file to ~/.local/share/applications/.\n');
    }
    return exeName;
  }

  // Put the game's name, icon and version into the .exe (Windows computers only; needs rcedit).
  function setWindowsDetails(exe, ico, info, log) {
    return new Promise(resolve => {
      let tool = unpacked(path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'));
      const v4 = (info.version.match(/\d+/g) || ['1']).concat(['0', '0', '0']).slice(0, 4).join('.');
      const args = [exe, '--set-icon', ico, '--set-version-string', 'ProductName', info.title, '--set-version-string', 'FileDescription', info.title,
        '--set-version-string', 'CompanyName', info.publisher || info.title, '--set-version-string', 'LegalCopyright', '© ' + new Date().getFullYear() + ' ' + (info.publisher || ''),
        '--set-version-string', 'OriginalFilename', path.basename(exe), '--set-file-version', v4, '--set-product-version', v4];
      let cmd = tool, cmdArgs = args;
      if (process.platform !== 'win32') { cmd = 'wine'; cmdArgs = [tool].concat(args); }
      if (!fs.existsSync(tool)) { log('  Note: the game icon tool is missing, so the .exe keeps the standard icon.'); return resolve(false); }
      execFile(cmd, cmdArgs, { env: Object.assign({}, process.env, { WINEDEBUG: '-all' }), timeout: 120000 }, err => {
        if (err) log('  Note: could not set the .exe icon and details' + (process.platform !== 'win32' ? ' (export from a Windows computer to include them)' : '') + '. The game still works.');
        resolve(!err);
      });
    });
  }

  /* ---------- Android ---------- */
  function buildAndroid(web, info, iconPng, dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    const pkg = info.appId, pkgPath = pkg.replace(/\./g, '/');
    const vc = Math.max(1, (info.version.match(/\d+/g) || ['1', '0', '0']).slice(0, 3).reduce((a, n, i) => a + (+n) * [10000, 100, 1][i], 0));
    const W = (rel, txt) => writeFile(path.join(dest, rel), txt);
    W('settings.gradle', `pluginManagement {\n    repositories { google(); mavenCentral(); gradlePluginPortal() }\n}\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)\n    repositories { google(); mavenCentral() }\n}\nrootProject.name = "${info.title.replace(/"/g, '')}"\ninclude ':app'\n`);
    W('build.gradle', `plugins {\n    id 'com.android.application' version '8.13.0' apply false\n}\n`);
    W('gradle.properties', 'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nandroid.nonTransitiveRClass=true\n');
    W('gradle/wrapper/gradle-wrapper.properties', 'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n');
    W('app/build.gradle', `plugins {\n    id 'com.android.application'\n}\n\n// Release signing: put your keystore details in keystore.properties (see README.md). Without it you can still build debug APKs.\ndef keystoreFile = rootProject.file('keystore.properties')\ndef ks = new Properties()\nif (keystoreFile.exists()) ks.load(new FileInputStream(keystoreFile))\n\nandroid {\n    namespace '${pkg}'\n    compileSdk 36\n\n    defaultConfig {\n        applicationId '${pkg}'\n        minSdk 24\n        targetSdk 36\n        versionCode ${vc}\n        versionName '${info.version}'\n    }\n    signingConfigs {\n        release {\n            if (keystoreFile.exists()) {\n                storeFile file(ks['storeFile'])\n                storePassword ks['storePassword']\n                keyAlias ks['keyAlias']\n                keyPassword ks['keyPassword']\n            }\n        }\n    }\n    buildTypes {\n        release {\n            minifyEnabled false\n            if (keystoreFile.exists()) signingConfig signingConfigs.release\n        }\n    }\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }\n}\n\ndependencies {\n    implementation 'androidx.webkit:webkit:1.12.1'\n}\n`);
    W('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application\n        android:allowBackup="true"\n        android:icon="@mipmap/ic_launcher"\n        android:label="@string/app_name"\n        android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"\n        android:hardwareAccelerated="true"\n        android:enableOnBackInvokedCallback="true">\n        <activity\n            android:name=".MainActivity"\n            android:exported="true"\n            android:screenOrientation="sensorLandscape"\n            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|keyboard|navigation|uiMode"\n            android:launchMode="singleTask">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n`);
    W('app/src/main/res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${info.title.replace(/[<&]/g, '').replace(/'/g, "\\'")}</string>\n</resources>\n`);
    W('app/src/main/java/' + pkgPath + '/MainActivity.java', `package ${pkg};

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import androidx.webkit.WebViewAssetLoader;

// ${info.title}: the game runs in a full-screen WebView, served from the app's assets folder.
public class MainActivity extends Activity {
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        web.setBackgroundColor(0xFF000000);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidGame");
        setContentView(web);
        hideSystemBars();
        if (Build.VERSION.SDK_INT >= 33) { // Android 13 and newer
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::sendBack);
        }
        web.loadUrl("https://appassets.androidplatform.net/assets/game/index.html");
    }

    // The back button acts like the B / cancel button in the game.
    private void sendBack() {
        web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));", null);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { sendBack(); } // Android 12 and older

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    private class Bridge {
        @JavascriptInterface
        public void quit() { runOnUiThread(() -> finishAndRemoveTask()); }
    }
}
`);
    // launcher icons
    const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    Object.entries(dens).forEach(([d, size]) => writeFile(path.join(dest, 'app/src/main/res/mipmap-' + d + '/ic_launcher.png'), nativeImage.createFromBuffer(iconPng).resize({ width: size, height: size, quality: 'best' }).toPNG()));
    copyDir(web, path.join(dest, 'app/src/main/assets/game'));
    W('.gitignore', '.gradle/\nbuild/\napp/build/\nlocal.properties\nkeystore.properties\n*.jks\n*.keystore\n.idea/\n');
    W('keystore.properties.example', 'storeFile=../my-release-key.jks\nstorePassword=CHANGE_ME\nkeyAlias=game\nkeyPassword=CHANGE_ME\n');
    W('.github/workflows/build-android.yml', `# Builds the game on GitHub (no Android tools needed on your computer).
# Push this folder to a GitHub repository, then open Actions > Build Android > the latest run > Artifacts.
name: Build Android
on: [push, workflow_dispatch]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-java@v6
        with: { distribution: temurin, java-version: '17' }
      - uses: android-actions/setup-android@v4
      - uses: gradle/actions/setup-gradle@v6
        with: { gradle-version: '8.13' }
      - run: gradle assembleDebug bundleRelease
      - uses: actions/upload-artifact@v7
        with:
          name: ${info.slug}-android
          path: |
            app/build/outputs/apk/debug/*.apk
            app/build/outputs/bundle/release/*.aab
`);
    W('README.md', `# ${info.title} for Android

This folder is an Android project for **${info.title}** (package \`${pkg}\`, version ${info.version}). The game runs full screen in landscape, with on-screen controls; the phone's Back button works as the B button.

## Build it with Android Studio (easiest)
1. Install Android Studio from https://developer.android.com/studio and open this folder (**File > Open**). Let it finish syncing; if it offers to update Gradle or the Android Gradle plugin, accept.
2. To try the game: plug in a phone with USB debugging on (or start an emulator) and click **Run ▶**.
3. For Google Play: **Build > Generate Signed App Bundle or APK > Android App Bundle**, create a new key store when asked (keep the file and passwords safe: you need them for every update), and choose **release**. Upload the .aab file in the Google Play Console.

## Build it on GitHub (no Android tools needed)
Push this folder to a GitHub repository. The workflow in \`.github/workflows/build-android.yml\` builds a debug APK and an unsigned release bundle; download them from the run's **Artifacts**. Sign the bundle for Google Play with your key, or let Play App Signing handle it.

## Build it from the command line
With the Android SDK installed (ANDROID_HOME set) and Gradle 8.13+: \`gradle assembleDebug\` (APK in app/build/outputs/apk/debug) or \`gradle bundleRelease\`.
To sign release builds automatically, copy \`keystore.properties.example\` to \`keystore.properties\` and fill it in.

## Updating
Every update must have a higher version: change the version in Pocket-Game-Maker's Export window and export again. Google Play requires apps to target a recent Android version; this project targets API 36 (Android 16), which is what Google Play requires for new apps and updates from 31 August 2026.
`);
  }

  /* ---------- stores ---------- */
  function storePackages(out, info, s, exe, have, log) {
    const W = (rel, txt) => writeFile(path.join(out, rel), txt.replace(/\n/g, rel.endsWith('.bat') ? '\r\n' : '\n'));
    const winDir = 'windows/' + info.fileName, linDir = 'linux/' + info.slug;
    if (s.steam && s.steam.on) {
      const st = s.steam, app = st.appId || '000000', dw = st.depotWindows || String((+app || 0) + 1), dl = st.depotLinux || String((+app || 0) + 2);
      const depots = [];
      if (have.windows) depots.push([dw, winDir]);
      if (have.linux) depots.push([dl, linDir]);
      W('steam/scripts/app_build_' + app + '.vdf', `"AppBuild"\n{\n\t"AppID" "${app}"\n\t"Desc" "${info.title} ${info.version}"\n\t"ContentRoot" "../../"\n\t"BuildOutput" "../output/"\n\t"Depots"\n\t{\n${depots.map(([d]) => `\t\t"${d}" "depot_build_${d}.vdf"`).join('\n')}\n\t}\n}\n`);
      depots.forEach(([d, dir]) => W('steam/scripts/depot_build_' + d + '.vdf', `"DepotBuild"\n{\n\t"DepotID" "${d}"\n\t"FileMapping"\n\t{\n\t\t"LocalPath" "${dir}/*"\n\t\t"DepotPath" "."\n\t\t"Recursive" "1"\n\t}\n}\n`));
      W('steam/upload-to-steam.bat', `@echo off\nrem Uploads ${info.title} ${info.version} to Steam. Needs SteamCMD from the Steamworks SDK (tools\\ContentBuilder\\builder\\steamcmd.exe).\nrem Set STEAMCMD to its path and STEAM_USER to your Steamworks account, or edit the two lines below.\nif "%STEAMCMD%"=="" set STEAMCMD=steamcmd.exe\nif "%STEAM_USER%"=="" set /p STEAM_USER=Steamworks account name: \n"%STEAMCMD%" +login %STEAM_USER% +run_app_build "%~dp0scripts\\app_build_${app}.vdf" +quit\npause\n`);
      W('steam/upload-to-steam.sh', `#!/bin/sh\n# Uploads ${info.title} ${info.version} to Steam with SteamCMD (from the Steamworks SDK).\nSTEAMCMD="\${STEAMCMD:-steamcmd}"\n[ -z "$STEAM_USER" ] && printf 'Steamworks account name: ' && read STEAM_USER\n"$STEAMCMD" +login "$STEAM_USER" +run_app_build "$(cd "$(dirname "$0")" && pwd)/scripts/app_build_${app}.vdf" +quit\n`);
      W('steam/README.md', `# Releasing ${info.title} on Steam

1. Join Steamworks (https://partner.steamgames.com), pay the Steam Direct fee for the game, and note its **App ID**. In **SteamPipe > Depots**, add a depot for each platform. Put the IDs in Pocket-Game-Maker's Export window (now: App ${app}, Windows depot ${have.windows ? dw : '—'}, Linux depot ${have.linux ? dl : '—'}) and export again, or edit the .vdf files in \`scripts\`.
2. In **Installation > General**, add launch options:${have.windows ? `\n   - Windows: executable \`${info.fileName}.exe\`` : ''}${have.linux ? `\n   - Linux / SteamOS: executable \`${info.slug}\`` : ''}
3. Download the Steamworks SDK and run \`upload-to-steam.bat\` (Windows) or \`upload-to-steam.sh\`. It uploads the folders${have.windows ? ' ' + winDir : ''}${have.linux ? ' and ' + linDir : ''}.
4. In **SteamPipe > Builds**, set the new build live on a branch (start with a private beta branch to test).
5. Store and library images in the sizes Steam asks for are in \`store-art/steam\`. You also need at least 5 screenshots at 1920×1080: press **F12** while playtesting in Pocket-Game-Maker to save one to your project's screenshots folder.

Notes: the game doesn't use the Steamworks API (achievements, cloud saves), so it runs without Steam running. Steam Deck: the Linux build runs natively; the Windows build runs through Proton.
`);
      log('Steam: upload scripts written');
    }
    if (s.epic && s.epic.on) {
      const e = s.epic;
      W('epic/upload-to-epic.bat', `@echo off\nrem Uploads the Windows build of ${info.title} ${info.version} to the Epic Games Store with Epic's BuildPatchTool.\nrem Get BuildPatchTool and your IDs from the Epic Developer Portal. Put the client secret in the BPT_CLIENT_SECRET environment variable.\nif "%BPT%"=="" set BPT=BuildPatchTool.exe\nif "%BPT_CLIENT_SECRET%"=="" set /p BPT_CLIENT_SECRET=BuildPatchTool client secret: \n"%BPT%" -OrganizationId="${e.organizationId || 'YOUR_ORGANIZATION_ID'}" -ProductId="${e.productId || 'YOUR_PRODUCT_ID'}" -ArtifactId="${e.artifactId || 'YOUR_ARTIFACT_ID'}" -ClientId="${e.clientId || 'YOUR_BPT_CLIENT_ID'}" -ClientSecret="%BPT_CLIENT_SECRET%" -mode=UploadBinary -BuildRoot="%~dp0..\\windows\\${info.fileName}" -CloudDir="%~dp0cloud" -BuildVersion="${info.version}-windows" -AppLaunch="${info.fileName}.exe" -AppArgs=""\npause\n`);
      W('epic/README.md', `# Releasing ${info.title} on the Epic Games Store

1. Sign up at the Epic Developer Portal (https://dev.epicgames.com/portal), create the product and an artifact for Windows, and create BuildPatchTool credentials (client ID and secret).
2. Put the Organization, Product, Artifact and Client IDs in Pocket-Game-Maker's Export window, or edit \`upload-to-epic.bat\`.
3. Download BuildPatchTool from the portal, set BPT to its path (or copy it here), and run \`upload-to-epic.bat\`. It uploads \`${winDir}\` with \`${info.fileName}.exe\` as the launch file. Each upload needs a new BuildVersion: change the version in the Export window.
4. In the portal, assign the binary to a label (test first) and complete the store page.
5. Key art for the store page is in \`store-art/epic\`.
`);
      log('Epic Games Store: upload script written');
    }
    if (s.itch && s.itch.on) {
      const target = (s.itch.user || 'your-name') + '/' + (s.itch.game || info.slug);
      const lines = [];
      if (have.windows) lines.push(['../' + winDir, 'windows']);
      if (have.linux) lines.push(['../' + linDir, 'linux']);
      if (have.web) lines.push(['../web', 'html5']);
      W('itch/push-to-itch.bat', '@echo off\nrem Uploads ' + info.title + ' to itch.io with butler (https://itch.io/docs/butler/). Run "butler login" once first.\ncd /d "%~dp0"\n' + lines.map(([d, c]) => 'butler push "' + d.replace(/\//g, '\\') + '" ' + target + ':' + c + ' --userversion ' + info.version).join('\n') + '\npause\n');
      W('itch/push-to-itch.sh', '#!/bin/sh\n# Uploads ' + info.title + ' to itch.io with butler. Run "butler login" once first.\ncd "$(dirname "$0")"\n' + lines.map(([d, c]) => 'butler push "' + d + '" ' + target + ':' + c + ' --userversion ' + info.version).join('\n') + '\n');
      W('itch/README.md', `# Releasing ${info.title} on itch.io

The simplest way: create the project at https://itch.io/game/new and upload the zip files from \`zips\`. Tick "This file will be played in the browser" for the HTML5 zip (set the viewport to ${info.width * info.scale}×${info.height * info.scale}), and mark the Windows and Linux zips with their platforms.

For quick updates use butler: install it, run \`butler login\`, then \`push-to-itch.bat\` / \`push-to-itch.sh\` (target \`${target}\`). The cover image (630×500) is in \`store-art/itch\`.
`);
      log('itch.io: upload scripts written');
    }
    if (s.gog && s.gog.on) {
      W('gog/README.md', `# Releasing ${info.title} on GOG

GOG chooses games by submission: apply at https://www.gog.com/indie. Once accepted, GOG gives you access to GOG Galaxy's build tools (Pipeline Builder) and the developer portal.
- Windows build: \`${winDir}\` (launch \`${info.fileName}.exe\`).
- Linux build: \`${linDir}\` (launch \`${info.slug}\`).
GOG games are DRM-free; this game needs no online services, so it qualifies as it is. Store images: use the files in \`store-art/steam\` and \`store-art/epic\` as a starting point and resize to the sizes GOG lists in its portal.
`);
    }
    if (s.googlePlay && s.googlePlay.on) {
      W('google-play/README.md', `# Releasing ${info.title} on Google Play

1. Open \`android/${info.fileName}\` in Android Studio and build a signed **Android App Bundle** (.aab): see that folder's README.md.
2. Create the app in the Google Play Console (https://play.google.com/console), complete the content rating questionnaire, data safety form (this game collects no data and needs no permissions), and target audience.
3. Upload the .aab to a testing track first (internal testing), then to production.
4. Store listing images are in \`store-art/google-play\`: the 512×512 icon and the 1024×500 feature graphic. Add at least 2 phone screenshots (press F12 while playtesting to save screenshots).
The project targets Android 16 (API level 36), which Google Play requires for new apps and updates from 31 August 2026. Package name: \`${info.appId}\` (it can never change after the first upload).
`);
    }
  }

  function checklist(info, s, have) {
    const rows = [];
    rows.push(`# Releasing ${info.title} ${info.version}`, '', 'Made with Pocket-Game-Maker on ' + new Date().toISOString().slice(0, 10) + '.', '', '## What is in this folder', '');
    if (have.windows) rows.push(`- \`windows/${info.fileName}/\`: the Windows game. Players run \`${info.fileName}.exe\`. \`zips/${info.slug}-windows.zip\` is the same folder zipped.`);
    if (have.linux) rows.push(`- \`linux/${info.slug}/\`: the Linux game (also Steam Deck). Players run \`${info.slug}\`. \`zips/${info.slug}-linux.tar.gz\` keeps its permissions.`);
    if (have.web) rows.push(`- \`web/\`: the browser version (HTML5). \`zips/${info.slug}-web.zip\` is ready for itch.io. To try it on your computer, it must be served by a web server (opening index.html directly won't load the game).`);
    if (have.android) rows.push(`- \`android/${info.fileName}/\`: an Android project. Build the APK or the Google Play bundle with Android Studio (see its README).`);
    rows.push('- `store-art/`: images in the sizes each store asks for, made from your key art and title. Replace them with your own art when you can.');
    ['steam', 'epic', 'itch', 'gog', 'googlePlay'].forEach(k => { if (s[k] && s[k].on) rows.push('- `' + (k === 'googlePlay' ? 'google-play' : k) + '/`: upload scripts and steps for ' + ({ steam: 'Steam', epic: 'the Epic Games Store', itch: 'itch.io', gog: 'GOG', googlePlay: 'Google Play' }[k]) + '.'); });
    rows.push('', '## Before you release', '',
      '- [ ] Play the exported game from start to finish on each platform.',
      '- [ ] Check Database → Credits: every asset has an origin and licence you are allowed to use commercially (Placeholder art is CC0 and fine to ship).',
      '- [ ] Replace the Placeholder art and music you don\'t want to ship with.',
      '- [ ] Set your own Licence and Credits screens (Database → Menus & screens).',
      '- [ ] Take screenshots: press F12 while playtesting (saved at 1920×1080 in the project\'s screenshots folder).',
      '- [ ] Write the store description, choose a price, and complete each store\'s age rating questionnaire.',
      '- [ ] Each store has its own sign-up and fees. Check them on the store\'s developer site.',
      '- [ ] Keep this export folder for each version you release.', '');
    return rows.join('\n');
  }

  /* ---------- main entry ---------- */
  async function run(proj, settings, art, outDir, log) {
    const s = settings;
    const info = {
      title: (s.title || proj.system.title || 'Game').trim(), version: (s.version || '1.0.0').trim(), publisher: (s.publisher || '').trim(), description: s.description || '',
      appId: (s.appId || 'com.example.game').trim(), slug: slugify(s.slug || s.title || proj.system.title), id: (s.appId || slugify(s.title)).trim(),
      width: (proj.system.screen || {}).width || 320, height: (proj.system.screen || {}).height || 240, scale: (proj.system.screen || {}).scale || 2
    };
    info.fileName = fileSafe(info.title);
    if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(info.appId)) throw new Error('The app ID "' + info.appId + '" isn\'t valid. Use the form com.yourname.gamename (letters, numbers and dots).');
    const out = path.join(outDir, info.slug + '-' + info.version);
    log('Exporting ' + info.title + ' ' + info.version + ' to ' + out);
    mkdirp(out);
    const iconPng = dataUrlBuf(art.icon);
    const have = {};
    const work = path.join(out, 'web');
    log('Building the game files…');
    buildWeb(proj, info, work);
    if (s.targets.web) { have.web = true; await zipDir(work, path.join(out, 'zips', info.slug + '-web.zip'), ''); log('Web (HTML5): done'); }
    if (s.targets.windows) {
      log('Windows: building…');
      await buildDesktop('win32', work, info, iconPng, path.join(out, 'windows', info.fileName), log);
      await zipDir(path.join(out, 'windows', info.fileName), path.join(out, 'zips', info.slug + '-windows.zip'), info.fileName);
      have.windows = true; log('Windows: done');
    }
    if (s.targets.linux) {
      log('Linux: building…');
      const dir = path.join(out, 'linux', info.slug);
      await buildDesktop('linux', work, info, iconPng, dir, log);
      const exec = new Set([info.slug, 'chrome-sandbox', 'chrome_crashpad_handler']);
      await tarGz(dir, path.join(out, 'zips', info.slug + '-linux.tar.gz'), info.slug, rel => exec.has(rel) || /\.so(\.\d+)*$/.test(rel) ? 0o755 : 0o644);
      have.linux = true; log('Linux: done');
    }
    if (s.targets.android) {
      log('Android: writing the project…');
      buildAndroid(work, info, iconPng, path.join(out, 'android', info.fileName));
      have.android = true; log('Android: done (build it in Android Studio)');
    }
    if (!s.targets.web) fs.rmSync(work, { recursive: true, force: true });
    // store art
    Object.entries(art.images || {}).forEach(([rel, url]) => writeFile(path.join(out, 'store-art', rel), dataUrlBuf(url)));
    storePackages(out, info, s.stores || {}, null, have, log);
    writeFile(path.join(out, 'RELEASE-CHECKLIST.md'), checklist(info, s.stores || {}, have));
    log('Finished.');
    return { out, info, have };
  }

  // Build the Android APK on this computer if Gradle and the Android SDK are installed.
  function androidBuild(projectDir, log) {
    return new Promise(resolve => {
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      if (!sdk) { log('No Android SDK found (ANDROID_HOME is not set). Open the project in Android Studio instead.'); return resolve(false); }
      const p = execFile(process.platform === 'win32' ? 'gradle.bat' : 'gradle', ['assembleDebug', '--console=plain'], { cwd: projectDir, timeout: 30 * 60000, shell: process.platform === 'win32' }, err => {
        if (err) { log('The Android build did not finish: ' + (err.code === 'ENOENT' ? 'Gradle is not installed. Open the project in Android Studio instead.' : err.message.split('\n')[0])); return resolve(false); }
        log('APK built: app/build/outputs/apk/debug'); resolve(true);
      });
      p.stdout && p.stdout.on('data', d => String(d).split('\n').filter(l => /BUILD|FAIL|error/i.test(l)).forEach(l => log('  ' + l.trim())));
    });
  }

  return { run, androidBuild, electronFor };
}

module.exports = { createExporter, makeIco, tarGz, zipDir, unzip, slugify, webIndexHtml, RUNTIME_FILES };
