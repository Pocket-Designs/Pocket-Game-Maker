/* Asset Library window: browse the free pixel-art library and add it to the project. */
(function () {
  'use strict';
  const { h, clear } = UI;
  const KINDS = [['tilesets', 'Tilesets'], ['characters', 'Characters'], ['monsters', 'Monsters'], ['battlebacks', 'Battle backgrounds'], ['pictures', 'Pictures'], ['decorations', 'Decorations'], ['music', 'Music'], ['sounds', 'Sound effects'], ['movies', 'Movies']];

  const AssetLib = window.AssetLib = {
    tab: 'tilesets', selected: new Set(), lib: null,

    async open() {
      if (!App.proj) return UI.toast('Open or create a project first');
      const body = h('div', { class: 'lib' });
      AssetLib.root = body;
      AssetLib.selected = new Set();
      await AssetLib.reload();
      UI.modal({ title: 'Asset Library', size: 'full', body, buttons: [{ label: 'Close', primary: true, value: true }],
        onClose: () => { MapEditor.loadTileset().then(() => { MapEditor.render(); MapEditor.renderPalette(); }); App.renderInspector(); } });
    },
    async reload() {
      AssetLib.lib = await window.api.libraryList();
      await UI.refreshAssets();
      AssetLib.draw();
    },
    inProject(item) { return item.files.every(rel => (App.assets[item.kind] || []).includes(rel)); },
    tilesetFor(item) { return App.proj.tilesets.find(t => t.image === item.files[0]); },

    draw() {
      const root = clear(AssetLib.root);
      const items = AssetLib.lib.items.filter(i => i.kind === AssetLib.tab);
      const tabs = h('div', { class: 'db-tabs' }, KINDS.map(([k, n]) => {
        const count = AssetLib.lib.items.filter(i => i.kind === k).length;
        return h('div', { class: 'db-tab' + (AssetLib.tab === k ? ' sel' : ''), onclick: () => { AssetLib.tab = k; AssetLib.selected.clear(); AssetLib.draw(); } }, n, h('span', { class: 'muted', style: { marginLeft: '6px' } }, String(count)));
      }),
      h('div', { class: 'lib-side' },
        h('button', { class: 'small', onclick: () => window.api.libraryOpen() }, 'Open library folder'),
        h('button', { class: 'small', onclick: async () => { const n = await window.api.libraryRestore(); UI.toast(n ? 'Restored ' + n + ' missing file' + (n > 1 ? 's' : '') : 'Nothing was missing'); AssetLib.reload(); } }, 'Restore missing files'),
        h('button', { class: 'small', onclick: () => AssetLib.reload() }, 'Refresh'),
        h('button', { class: 'small', title: 'Copy your own images, music or sounds into this project', onclick: async () => { const kind = { sounds: 'sounds', music: 'music' }[AssetLib.tab] || AssetLib.tab; await Importer.importKind(kind); AssetLib.reload(); } }, 'Import your own…'),
        h('p', { class: 'muted' }, 'Free pixel art, music and sound effects (CC0). Use them in any game, free or paid, with no credit needed.'),
        h('p', { class: 'muted', style: { wordBreak: 'break-all' } }, 'Library folder: ', AssetLib.lib.path)));

      const sel = AssetLib.selected;
      const anySel = items.some(i => sel.has(i.key));
      const bar = h('div', { class: 'lib-bar' },
        h('button', { onclick: () => { items.forEach(i => sel.add(i.key)); AssetLib.draw(); } }, 'Select all'),
        h('button', { disabled: !anySel, onclick: () => { sel.clear(); AssetLib.draw(); } }, 'Clear selection'),
        h('span', { class: 'tb-spacer' }),
        h('button', { class: 'primary', disabled: !anySel, onclick: () => AssetLib.add(items.filter(i => sel.has(i.key)), false) }, 'Add selected to project'),
        h('button', { disabled: !anySel, title: 'Replace the project\'s copies with the library versions', onclick: () => AssetLib.add(items.filter(i => sel.has(i.key)), true) }, 'Update selected in project'));

      const grid = h('div', { class: 'lib-grid' });
      const isAudio = AssetLib.tab === 'music' || AssetLib.tab === 'sounds';
      if (!items.length) grid.appendChild(h('p', { class: 'muted' }, 'Nothing here. Put ' + (isAudio ? 'MP3 or FLAC' : 'image') + ' files in the library folder\'s ' + AssetLib.tab + ' folder, then click Refresh.'));
      items.forEach(item => {
        const inProj = AssetLib.inProject(item);
        const card = h('div', { class: 'lib-card' + (sel.has(item.key) ? ' sel' : ''), title: item.description, onclick: () => { sel.has(item.key) ? sel.delete(item.key) : sel.add(item.key); AssetLib.draw(); } },
          h('div', { class: 'lib-thumb ' + item.kind }, AssetLib.thumb(item)),
          h('div', { class: 'lib-name' }, h('input', { type: 'checkbox', checked: sel.has(item.key), onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? sel.add(item.key) : sel.delete(item.key); AssetLib.draw(); } }), ' ', item.name),
          h('div', { class: 'lib-meta muted' }, item.kind === 'tilesets' ? (item.mapping ? item.mapping.tiles.length + ' tiles, mapped' : 'No mapping file yet') : item.audio ? (item.description || item.files[0].split('/').pop()) : item.files.map(f => f.split('/').pop()).join(' + ')),
          AssetLib.creditLine(item),
          inProj ? h('span', { class: 'lib-badge' }, 'In project') : null);
        grid.appendChild(card);
      });
      root.append(tabs, h('div', { class: 'lib-main' }, bar, grid));
    },

    creditLine(item) {
      const c = item.credit;
      const edit = h('button', { class: 'small', onclick: e => { e.stopPropagation(); AssetLib.editCredit(item); } }, 'Edit credits');
      if (!c) return h('div', { class: 'lib-credit missing' }, h('span', null, 'No origin or licence recorded'), edit);
      return h('div', { class: 'lib-credit', title: c.origin }, h('span', { class: 'lib-status s-' + (c.status || '').toLowerCase().replace(/[^a-z]/g, '') }, c.status || 'Unknown'), h('span', { class: 'muted' }, c.licence || 'Licence not set'), edit);
    },
    async editCredit(item) {
      const c = Object.assign({ origin: '', author: '', licence: '', status: 'Custom' }, item.credit || {});
      App._suppressDirty = true;
      const ok = await UI.modal({ title: 'Credits: ' + item.name, body: AssetLib.creditForm(c), buttons: [{ label: 'Cancel', value: false }, { label: 'Save', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      await window.api.librarySetCredit(item.kind, item.key, c);
      UI.toast('Credits saved to the library (CREDITS.md and credits.csv updated)');
      AssetLib.reload();
    },
    creditForm(c) {
      const { field, row } = UI;
      const lic = h('input', { type: 'text', value: c.licence || '', list: 'licence-list', placeholder: 'e.g. CC0 1.0, CC BY 4.0, or bought from…' });
      lic.addEventListener('input', () => { c.licence = lic.value; });
      return h('div', null,
        row(field('Status', c, 'status', { type: 'select', options: [['Placeholder', 'Placeholder (built-in art to replace later)'], ['Custom', 'Custom (made by you or for you)'], ['Third-party', 'Third-party (from another artist or pack)']] }), field('Author / artist', c, 'author')),
        field('Origin: where it came from (website, pack name, artist, or "drawn by me")', c, 'origin', { type: 'textarea', rows: 3 }),
        h('label', { class: 'field' }, h('span', null, 'Licence'), lic),
        h('datalist', { id: 'licence-list' }, ['CC0 1.0 (public domain)', 'CC BY 4.0 (credit required)', 'CC BY-SA 4.0 (credit, share alike)', 'OGA-BY 3.0 (credit required)', 'Royalty-free (purchased)', 'All rights reserved (my own work)', 'Not set'].map(v => h('option', { value: v }))),
        h('p', { class: 'muted' }, 'If a licence asks for credit, put the exact credit line the artist wants in Origin.'));
    },

    thumb(item) {
      const url = window.api.fileUrl(item.preview) + '?v=' + Date.now();
      if (item.audio) {
        const b = UI.audioButton(() => window.api.fileUrl(item.preview));
        b.addEventListener('click', e => e.stopPropagation());
        return h('div', { class: 'lib-audio' }, h('span', { class: 'lib-note' }, item.kind === 'music' ? '♫' : '♪'), b, item.loop ? h('span', { class: 'muted' }, 'loops') : null);
      }
      if (item.kind === 'movies') { // first frame; plays (silently) while the mouse is over it
        const v = h('video', { src: url, muted: true, loop: true, preload: 'metadata', class: 'lib-movie' });
        v.addEventListener('mouseenter', () => { v.play().catch(() => {}); });
        v.addEventListener('mouseleave', () => { v.pause(); });
        return v;
      }
      if (item.kind === 'characters') {
        const c = h('canvas', { width: 48, height: 16 });
        const img = new Image();
        img.onload = () => { const g = c.getContext('2d'); g.imageSmoothingEnabled = false; const fw = img.width / 3, fh = img.height / 4; [0, 1, 3].forEach((row, k) => g.drawImage(img, fw, row * fh, fw, fh, k * 16, 0, 16, 16)); };
        img.src = url;
        return c;
      }
      return h('img', { src: url, loading: 'lazy' });
    },

    async add(items, overwrite) {
      if (!items.length) return;
      const ids = App.proj.tilesets.map(t => t.id);
      const r = await window.api.libraryAdd(App.proj.path, items.map(i => i.key), overwrite, ids);
      let newTs = 0, updTs = 0;
      for (const ts of r.tilesets) {
        const existing = App.proj.tilesets.find(t => t.image === ts.image);
        if (!existing) { App.proj.tilesets.push(ts); newTs++; }
        else if (overwrite) { existing.flags = ts.flags; existing.names = ts.names; existing.tileSize = ts.tileSize; existing.library = ts.library; if (ts.animSpeed) existing.animSpeed = ts.animSpeed; updTs++; }
      }
      App.proj.credits = Object.assign(App.proj.credits || {}, r.credits || {});
      App.assetVersion = Date.now();
      MapEditor.sprites = {};
      if (r.copied.length || newTs || updTs) App.markDirty();
      const parts = [];
      if (r.copied.length) parts.push((overwrite ? 'Updated ' : 'Added ') + r.copied.length + ' file' + (r.copied.length > 1 ? 's' : ''));
      if (newTs) parts.push(newTs + ' new tileset' + (newTs > 1 ? 's' : '') + ' (choose one for a map in the inspector)');
      if (r.skipped.length && !overwrite) parts.push(r.skipped.length + ' already in the project (use Update to replace)');
      UI.toast(parts.join(' · ') || 'Nothing to add');
      AssetLib.selected.clear();
      await AssetLib.reload();
    },

    // Used by Database → Tilesets
    async applyMapping(ts) {
      const m = await window.api.libraryMapping(ts.library || ts.image);
      if (!m) { UI.alert('No library settings', 'The library has no saved settings for this tileset yet. Use "Save to library" first.'); return false; }
      ts.flags = m.tiles.map(t => MF.Tiles.flagFromMapping(t)); if (m.animSpeed) ts.animSpeed = m.animSpeed;
      ts.names = m.tiles.map(t => t.name || '');
      if (m.tileSize) ts.tileSize = m.tileSize;
      App.markDirty();
      UI.toast('Loaded ' + m.tiles.length + ' tile settings from the library');
      return true;
    },
    async saveMapping(ts) {
      await window.api.librarySaveMapping(App.proj.path, ts);
      if (!ts.library) { ts.library = ts.image; App.markDirty(); }
      UI.toast('Saved this tileset\'s settings to the library');
    }
  };
})();
