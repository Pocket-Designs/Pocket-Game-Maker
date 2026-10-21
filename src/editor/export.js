/* Export Game window: turn the project into games for Windows, Linux, the web and Android,
   with upload scripts and store images for Steam, the Epic Games Store, itch.io, GOG and Google Play.
   Settings are kept in project.json under "export". The building itself happens in lib/exporter.js. */
(function () {
  'use strict';
  const { h, clear, field, row, section } = UI;

  // Store images: [file, width, height, style]. style: 'art' = key art + title, 'plain' = key art only,
  // 'logo' = title on a transparent background, 'icon' = the game icon.
  const ART = [
    ['steam/header_capsule.png', 920, 430, 'art'],
    ['steam/small_capsule.png', 462, 174, 'art'],
    ['steam/main_capsule.png', 1232, 706, 'art'],
    ['steam/vertical_capsule.png', 748, 896, 'art'],
    ['steam/page_background.png', 1438, 810, 'plain'],
    ['steam/library_capsule.png', 600, 900, 'art'],
    ['steam/library_header.png', 920, 430, 'art'],
    ['steam/library_hero.png', 3840, 1240, 'plain'],
    ['steam/library_logo.png', 1280, 720, 'logo'],
    ['steam/shortcut_icon.png', 256, 256, 'icon'],
    ['steam/app_icon.jpg', 184, 184, 'icon'],
    ['epic/landscape_2560x1440.png', 2560, 1440, 'art'],
    ['epic/portrait_1200x1600.png', 1200, 1600, 'art'],
    ['epic/logo.png', 1280, 720, 'logo'],
    ['epic/icon_1024.png', 1024, 1024, 'icon'],
    ['itch/cover_630x500.png', 630, 500, 'art'],
    ['google-play/icon_512.png', 512, 512, 'icon'],
    ['google-play/feature_graphic_1024x500.png', 1024, 500, 'art'],
    ['gog/logo.png', 1280, 720, 'logo'],
    ['icon/icon_1024.png', 1024, 1024, 'icon']
  ];

  const defaults = p => {
    const title = p.system.title || 'My Game';
    const slug = UI.slug ? String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game' : 'game';
    return {
      title, version: '1.0.0', publisher: '', description: '', appId: 'com.' + (slug.replace(/-/g, '') || 'mygame').slice(0, 20) + '.game',
      icon: '', keyArt: (p.system.titleScreen || {}).background || '', outDir: '',
      targets: { windows: true, linux: true, web: true, android: false },
      stores: {
        steam: { on: false, appId: '', depotWindows: '', depotLinux: '' },
        epic: { on: false, organizationId: '', productId: '', artifactId: '', clientId: '' },
        itch: { on: false, user: '', game: slug },
        gog: { on: false }, googlePlay: { on: false }
      }
    };
  };
  function settingsFor(p) {
    const d = defaults(p), s = p.project.export = Object.assign(d, p.project.export || {});
    s.targets = Object.assign(d.targets, (p.project.export || {}).targets);
    Object.keys(defaults(p).stores).forEach(k => { s.stores[k] = Object.assign(defaults(p).stores[k], (s.stores || {})[k]); });
    return s;
  }

  /* ---------- drawing the icon and store images ---------- */
  const imageKinds = ['monsters', 'pictures', 'characters'];
  const loadImg = rel => rel ? UI.loadImage(rel) : Promise.resolve(null);
  // The first frame of a character sheet (3 across, 4 down), or the whole picture.
  function iconSource(img, rel) {
    if (!img) return null;
    if (/^characters\//.test(rel)) return { img, sx: img.width / 3, sy: 0, sw: img.width / 3, sh: img.height / 4 };
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }
  function drawIcon(ctx, size, src, title) {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#3a6ea5'); g.addColorStop(1, '#1d2b53');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    if (src) {
      const pad = size * 0.1, k = Math.min((size - pad * 2) / src.sw, (size - pad * 2) / src.sh);
      const w = src.sw * k, hh = src.sh * k;
      ctx.imageSmoothingEnabled = k < 1;
      ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, (size - w) / 2, (size - hh) / 2, w, hh);
    } else {
      const letters = String(title || 'G').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(size * 0.42) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(letters, size / 2, size / 2 + size * 0.02);
    }
  }
  function cover(ctx, img, w, hh) {
    const k = Math.max(w / img.width, hh / img.height), dw = img.width * k, dh = img.height * k;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (w - dw) / 2, (hh - dh) / 2, dw, dh);
  }
  // The title in big white letters with a dark outline; long titles on narrow images go onto two lines.
  function titleText(ctx, text, w, hh, y, maxH) {
    const fit = lines => { let size = maxH / lines.length; ctx.font = 'bold ' + Math.round(size) + 'px sans-serif';
      while (Math.max(...lines.map(l => ctx.measureText(l).width)) > w * 0.9 && size > 8) { size *= 0.94; ctx.font = 'bold ' + Math.round(size) + 'px sans-serif'; }
      return size; };
    let lines = [text], size = fit(lines);
    const words = text.split(/\s+/);
    if (words.length > 1 && size < maxH * 0.6) {
      let best = null;
      for (let i = 1; i < words.length; i++) { const two = [words.slice(0, i).join(' '), words.slice(i).join(' ')]; const s2 = fit(two); if (!best || s2 > best[1]) best = [two, s2]; }
      if (best[1] > size * 1.15) { lines = best[0]; size = best[1]; }
    }
    ctx.font = 'bold ' + Math.round(size) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.12); ctx.strokeStyle = 'rgba(10,14,30,0.9)'; ctx.fillStyle = '#ffffff';
    lines.forEach((l, i) => { const ly = y + (i - (lines.length - 1) / 2) * size * 1.05; ctx.strokeText(l, w / 2, ly); ctx.fillText(l, w / 2, ly); });
  }
  async function makeArt(s, onEach) {
    const p = App.proj;
    const key = await loadImg(s.keyArt);
    const iconImg = iconSource(await loadImg(s.icon || (p.monsters[0] || {}).front || ''), s.icon || (p.monsters[0] || {}).front || '');
    const monsters = [];
    for (const m of p.monsters.slice(0, 3)) { const im = await loadImg(m.front); if (im) monsters.push(im); }
    const images = {};
    let icon = null;
    for (const [rel, w, hh, style] of ART) {
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const ctx = c.getContext('2d');
      if (style === 'icon') drawIcon(ctx, w, iconImg, s.title);
      else if (style === 'logo') titleText(ctx, s.title, w, hh, hh / 2, hh * 0.4);
      else {
        if (key) cover(ctx, key, w, hh);
        else { const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, '#5aa0d8'); g.addColorStop(1, '#2a3f7a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh); }
        if (style === 'art') {
          // a few of the game's monsters along the bottom, then the title
          const ms = Math.min(hh * 0.38, w / (monsters.length + 1.5));
          ctx.imageSmoothingEnabled = false;
          monsters.forEach((im, i) => { const k = ms / Math.max(im.width, im.height); const x = w / 2 + (i - (monsters.length - 1) / 2) * ms * 1.1 - im.width * k / 2; ctx.drawImage(im, x, hh * 0.94 - im.height * k, im.width * k, im.height * k); });
          const shade = ctx.createLinearGradient(0, 0, 0, hh * 0.55); shade.addColorStop(0, 'rgba(0,0,0,0.45)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = shade; ctx.fillRect(0, 0, w, hh * 0.55);
          titleText(ctx, s.title, w, hh, hh * (monsters.length ? 0.27 : 0.5), hh * (monsters.length ? 0.26 : 0.34));
        }
      }
      const url = /\.jpg$/.test(rel) ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
      images[rel] = url;
      if (rel === 'icon/icon_1024.png') icon = url;
      if (onEach) onEach(rel, c);
    }
    return { images, icon };
  }

  /* ---------- the window ---------- */
  const Export = window.Export = {
    async open() {
      const p = App.proj;
      if (!p) return UI.toast('Open or create a project first');
      await UI.refreshAssets();
      const s = settingsFor(p);
      Export.current = s;
      if (!s.outDir) s.outDir = await window.api.exportDefaultFolder(p.path);
      const body = h('div', { class: 'export' });
      const logBox = h('pre', { class: 'export-log' }, 'Choose what to make, then press Export.');
      const preview = h('div', { class: 'export-preview' });
      const resultBar = h('div', { class: 'row export-result' });
      let busy = false;

      const imagesFrom = kinds => kinds.flatMap(k => App.assets[k] || []);
      const imageSelect = (label, key, kinds, none, help) => {
        const sel = h('select', null, h('option', { value: '' }, none), imagesFrom(kinds).map(a => h('option', { value: a, selected: s[key] === a }, a)));
        sel.addEventListener('change', () => { s[key] = sel.value; App.markDirty(); drawPreview(); });
        return h('label', { class: 'field', title: help }, h('span', null, label), sel);
      };
      async function drawPreview() {
        clear(preview);
        const want = ['icon/icon_1024.png', 'steam/header_capsule.png', 'steam/library_capsule.png', 'itch/cover_630x500.png'];
        await makeArt(s, (rel, c) => { if (want.includes(rel)) { c.className = 'export-thumb'; c.title = rel; preview.appendChild(h('div', { class: 'export-thumb-box' }, c, h('span', { class: 'muted' }, rel.split('/').pop()))); } });
      }
      const tgt = (label, key, help) => field(label, s.targets, key, { type: 'checkbox', help });
      const store = (label, key, help, ...fields) => {
        const extra = h('div', { class: 'export-store-fields' }, fields);
        const chk = field(label, s.stores[key], 'on', { type: 'checkbox', help, onChange: v => { extra.style.display = v ? '' : 'none'; } });
        extra.style.display = s.stores[key].on ? '' : 'none';
        return h('div', { class: 'export-store' }, chk, extra);
      };
      const outLabel = h('span', { class: 'export-path' }, s.outDir);

      body.append(
        h('div', { class: 'export-cols' },
          h('div', null,
            section('Game details',
              row(field('Game title', s, 'title'), field('Version', s, 'version', { width: '110px', help: 'Like 1.0.0. Raise it for every release (stores and Android need a higher number each time).' })),
              row(field('Publisher / your name', s, 'publisher'), field('App ID', s, 'appId', { help: 'A unique name like com.yourname.gamename. Android and Google Play use it to tell games apart, so don\'t change it after release.' })),
              field('Short description', s, 'description', { type: 'textarea', rows: 2 }),
              row(imageSelect('Game icon', 'icon', imageKinds, '(first monster)', 'Square images look best. Pixel art is enlarged without blurring.'),
                imageSelect('Key art (store images)', 'keyArt', ['pictures'], '(plain background)', 'A wide picture behind the title on store images. The title screen picture works well.'))),
            section('Make games for',
              h('div', { class: 'export-targets' },
                tgt('Windows (.exe)', 'windows', 'A folder with your game\'s .exe, plus a zip. Works on Windows 10 and 11.'),
                tgt('Linux and Steam Deck', 'linux', 'A folder with the game program and a .tar.gz.'),
                tgt('Web browser (HTML5)', 'web', 'For itch.io, Newgrounds, your own website, phones and tablets in a browser.'),
                tgt('Android (project)', 'android', 'An Android Studio project. Open it in Android Studio to build the APK, or the .aab bundle for Google Play.')),
              h('p', { class: 'muted' }, 'The first Windows or Linux export on a computer of the other kind downloads that system\'s game runtime (about 100 MB, once).')),
            section('Stores',
              store('Steam', 'steam', 'Writes SteamPipe build scripts for steamcmd.',
                row(field('App ID', s.stores.steam, 'appId', { placeholder: 'from Steamworks' }), field('Windows depot', s.stores.steam, 'depotWindows', { placeholder: 'App ID + 1' }), field('Linux depot', s.stores.steam, 'depotLinux', { placeholder: 'App ID + 2' }))),
              store('Epic Games Store', 'epic', 'Writes an upload script for Epic\'s BuildPatchTool.',
                row(field('Organization ID', s.stores.epic, 'organizationId'), field('Product ID', s.stores.epic, 'productId')),
                row(field('Artifact ID', s.stores.epic, 'artifactId'), field('Client ID', s.stores.epic, 'clientId')),
                h('p', { class: 'muted' }, 'The client secret is never saved. The script asks for it when you run it.')),
              store('itch.io', 'itch', 'Writes a butler upload script for Windows, Linux and web channels.',
                row(field('itch.io user name', s.stores.itch, 'user'), field('Game page name', s.stores.itch, 'game'))),
              store('GOG', 'gog', 'Adds notes for sending your builds to GOG.'),
              store('Google Play', 'googlePlay', 'Adds the steps for building and uploading the Android app bundle. Turn on Android above.'))),
          h('div', null,
            section('Store images and icon', h('p', { class: 'muted' }, 'Made in every size the stores ask for and saved in the store-art folder. You can replace any of them with your own art later.'), preview),
            section('Save to', h('div', { class: 'row' }, outLabel, h('button', { class: 'small', onclick: async () => { const d = await window.api.exportChooseFolder(s.outDir); if (d) { s.outDir = d; outLabel.textContent = d; App.markDirty(); } } }, 'Change…'))),
            section('Progress', logBox, resultBar))));

      const log = m => { logBox.textContent += '\n' + m; logBox.scrollTop = logBox.scrollHeight; };
      async function run() {
        if (busy) return false;
        if (!Object.values(s.targets).some(Boolean)) { UI.toast('Tick at least one kind of game to make'); return false; }
        if (s.stores.googlePlay.on && !s.targets.android) { UI.toast('Google Play needs the Android project. Tick Android too.'); return false; }
        busy = true; logBox.textContent = 'Saving the project…'; clear(resultBar);
        const off = window.api.onExportProgress(log);
        try {
          await App.save();
          log('Drawing the icon and store images…');
          const art = await makeArt(s);
          const r = await window.api.exportGame(p.path, JSON.parse(JSON.stringify(s)), art, s.outDir);
          off(); logBox.textContent = 'Saved the project.\nDrew the icon and store images.\n' + r.log.join('\n'); logBox.scrollTop = logBox.scrollHeight;
          resultBar.append(h('button', { class: 'primary small', onclick: () => window.api.exportOpenFolder(r.out) }, 'Open export folder'));
          if (r.have.android) resultBar.append(h('button', { class: 'small', title: 'Needs the Android SDK and Gradle on this computer', onclick: async () => { const off2 = window.api.onExportProgress(log); log('Building the Android APK…'); try { await window.api.exportAndroidBuild(r.androidDir); } finally { setTimeout(off2, 1000); } } }, 'Try building the APK here'));
          UI.toast('Export finished');
        } catch (err) {
          log('Export failed: ' + String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
        } finally { setTimeout(off, 1000); busy = false; }
        return false;
      }
      UI.modal({ title: 'Export Game', size: 'large', body, dismissable: false,
        buttons: [{ label: 'Close', value: true, onClick: () => busy ? (UI.toast('Please wait for the export to finish'), false) : true }, { label: 'Export', primary: true, onClick: () => { run(); return false; } }],
        onClose: () => !busy });
      drawPreview();
    },
    makeArt, ART
  };
})();
