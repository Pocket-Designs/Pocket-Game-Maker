/* Pocket-Game-Maker editor shell: project lifecycle, toolbar, map list, inspector. */
(function () {
  'use strict';
  const { h, clear, field, row, section } = UI;
  const $ = s => document.querySelector(s);

  const App = window.App = {
    proj: null, dirty: false, assets: {}, assetVersion: 0,
    mapId: null, mode: 'map', tool: 'pencil', layer: 0, zoom: 2,
    showPass: false, showGrid: true, selectedEventId: null, clipboardEvent: null,

    init() {
      document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => App.action(b.dataset.act)));
      document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => App.setMode(b.dataset.mode)));
      document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => App.setTool(b.dataset.tool)));
      $('#chk-dim').addEventListener('change', e => { App.dimOthers = e.target.checked; MapEditor.render(); });
      $('#chk-pass').addEventListener('change', e => { App.showPass = e.target.checked; MapEditor.render(); MapEditor.renderPalette(); });
      $('#chk-grid').addEventListener('change', e => { App.showGrid = e.target.checked; MapEditor.render(); });
      $('#zoom').addEventListener('change', e => { App.zoom = +e.target.value; MapEditor.render(); });
      $('#btn-add-map').addEventListener('click', () => App.addMap());
      $('#btn-del-map').addEventListener('click', () => App.proj && App.deleteMap(App.mapId));
      window.api.onMenu(ch => App.action(ch));
      window.api.onCloseRequest(async () => {
        if (!App.dirty || await UI.confirm('Unsaved changes', 'You have unsaved changes. Quit without saving?', 'Quit without saving', true)) window.api.forceClose();
      });
      window.addEventListener('beforeunload', () => {});
      document.addEventListener('keydown', App.onKey);
      MapEditor.init();
      App.layer = 0; App.setMode('map'); App.setTool('pencil');
      App.showWelcome();
    },

    /* ---------- actions ---------- */
    async action(a) {
      if (a === 'new') return App.newProjectDialog();
      if (a === 'open') return App.openProject();
      if (a === 'about') return UI.alert('About Pocket-Game-Maker', 'Pocket-Game-Maker — a game maker for monster-taming and monster-capturing RPGs.\n\nVersion 0.9.2 · © 2026 project-tech-me\nContact: project-tech-me@protonmail.com\nReleased under the MIT Licence.');
      if (!App.proj) return UI.toast('Open or create a project first');
      if (a === 'save') return App.save();
      if (a === 'playtest') return App.playtest();
      if (a === 'database') return DB.open();
      if (a.startsWith('db:')) return DB.open(a.slice(3));
      if (a === 'import') return Importer.open();
      if (a === 'library') return AssetLib.open();
      if (a === 'export') return Export.open();
      if (a === 'undo') return MapEditor.undo();
      if (a === 'redo') return MapEditor.redo();
      if (a === 'reveal') return window.api.reveal(App.proj.path);
    },
    onKey(e) {
      if (UI.anyModal() || !App.proj) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); MapEditor.undo(); }
        else if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); MapEditor.redo(); }
        else if (e.key === 'c' && App.mode === 'event') { const ev = App.selectedEvent(); if (ev) { App.clipboardEvent = JSON.stringify(ev); UI.toast('Event copied'); } }
        return;
      }
      const k = e.key.toLowerCase();
      const map = { m: () => App.setMode('map'), e: () => App.setMode('event'), b: () => App.setTool('pencil'), r: () => App.setTool('rect'), f: () => App.setTool('fill'), x: () => App.setTool('erase'),
        d: () => { const c = $('#chk-dim'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); }, p: () => { const c = $('#chk-pass'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); } };
      if (/^[1-9]$/.test(k) && App.map() && +k <= App.map().layers.length) { App.setLayer(+k - 1); e.preventDefault(); return; }
      if (map[k]) { map[k](); e.preventDefault(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && App.mode === 'event' && App.selectedEventId) { e.preventDefault(); App.deleteEvent(App.selectedEventId); }
      if (e.key === 'Enter' && App.mode === 'event' && App.selectedEvent()) { e.preventDefault(); const se = App.selectedEvent(); se.quick ? QuickEvent.edit(se) : EventEditor.open(se); }
    },

    setMode(m) {
      App.mode = m;
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
      $('#tool-seg').style.opacity = m === 'map' ? 1 : .35;
      $('#layer-seg').style.opacity = m === 'map' ? 1 : .35;
      if (m === 'map') App.selectedEventId = null;
      MapEditor.render(); App.renderInspector();
    },
    setTool(t) { App.tool = t; App.setMode('map'); document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t)); },
    setLayer(l, keepMode) {
      const m = App.map();
      App.layer = m ? Math.max(0, Math.min(l, m.layers.length - 1)) : l;
      if (!keepMode) App.setMode('map');
      const info = m && m.layerInfo && m.layerInfo[App.layer];
      const t = document.getElementById('tb-layer'); if (t) { t.textContent = info ? 'Painting on: ' + (App.layer + 1) + '. ' + info.name : ''; t.title = t.textContent + ' (change it in the Layers panel or with keys 1–9)'; }
      if (window.LayersPanel) LayersPanel.render();
      MapEditor.render();
    },

    markDirty() {
      App.dirty = true;
      const d = $('#st-dirty'); d.textContent = '● Unsaved changes'; d.className = 'dirty';
    },
    clearDirty() {
      App.dirty = false;
      const d = $('#st-dirty'); d.textContent = 'All changes saved'; d.className = '';
    },

    /* ---------- project lifecycle ---------- */
    async showWelcome() {
      const w = $('#welcome'); clear(w).classList.remove('hidden');
      const recent = await window.api.recent();
      w.appendChild(h('div', { class: 'welcome-card' },
        h('img', { class: 'welcome-logo', src: 'icon.png', alt: '' }),
        h('h1', null, 'Pocket-Game-Maker'),
        h('p', null, 'Build monster-taming and monster-catching RPGs: maps, wild encounters, trainers, capture, parties and turn-based battles of any size.'),
        h('div', { class: 'welcome-actions' },
          h('button', { class: 'primary', onclick: () => App.newProjectDialog() }, 'New project…'),
          h('button', { onclick: () => App.openProject() }, 'Open project…')),
        recent.length ? h('div', { class: 'recent' }, h('h4', null, 'Recent projects'), recent.map(p => h('button', { title: p, onclick: () => App.openProject(p) }, p))) : null));
    },
    async newProjectDialog() {
      if (App.dirty && !await UI.confirm('Unsaved changes', 'Discard unsaved changes to the current project?', 'Discard', true)) return;
      const opts = { name: 'My Monster Game', template: 'sample', includeLibrary: true };
      const cards = h('div', { class: 'choice-cards' });
      const drawCards = () => {
        clear(cards);
        [['sample', 'Sample project', 'Two maps, 10 monsters, starters, trainers (singles and doubles), wild encounters. Swap in your own art.'],
         ['blank', 'Blank project', 'Types, items and the starter tileset only. No monsters, moves or events.']].forEach(([k, t, d]) =>
          cards.appendChild(h('div', { class: 'choice-card' + (opts.template === k ? ' sel' : ''), onclick: () => { opts.template = k; drawCards(); } }, h('b', null, t), h('span', { class: 'muted' }, d))));
      };
      drawCards();
      const body = h('div', null, field('Game title', opts, 'name', { type: 'text' }), h('div', { class: 'field' }, h('span', null, 'Start from'), cards),
        field('Include the free asset library (4 tilesets, 17 characters, 16 monsters, 6 battle backgrounds)', opts, 'includeLibrary', { type: 'checkbox' }),
        h('p', { class: 'muted' }, 'Next you\'ll choose a parent folder; the project is created in a subfolder named after the title.'));
      App._suppressDirty = true;
      const ok = await UI.modal({ title: 'New project', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Choose folder & create', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      try {
        const data = await window.api.newProject(opts);
        if (data) await App.loaded(data);
      } catch (err) { UI.alert('Could not create project', String(err.message || err)); }
    },
    async openProject(dir) {
      if (App.dirty && !await UI.confirm('Unsaved changes', 'Discard unsaved changes to the current project?', 'Discard', true)) return;
      try {
        const data = await window.api.openProject(dir);
        if (data) await App.loaded(data);
      } catch (err) { UI.alert('Could not open project', String(err.message || err)); }
    },
    async loaded(data) {
      App.proj = data;
      App.migrate();
      App.assetVersion = Date.now();
      await UI.refreshAssets();
      // Fill any unset music/sound slots with the presets the project already has (older projects have none).
      const audioFiles = [].concat(App.assets.music || [], App.assets.sounds || []);
      data.system.audio = MF.Audio.withDefaults(data.system.audio, rel => audioFiles.includes(rel));
      $('#welcome').classList.add('hidden');
      $('#proj-name').textContent = '— ' + (data.project.name || data.system.title || '');
      document.title = 'Pocket-Game-Maker — ' + (data.project.name || '');
      MapEditor.resetHistory();
      App.selectMap(data.mapInfos[0] ? data.mapInfos[0].id : null);
      App.clearDirty();
    },
    migrate() { // fill defaults so older/hand-edited projects keep working
      const p = App.proj;
      p.system.battle = Object.assign({ maxParty: 6, wildActive: 1, trainerActive: 1, maxMoves: 4, maxLevel: 100, critChance: 0.0417, critMultiplier: 1.5, stab: 1.5, expMultiplier: 1, trainerExpBonus: 1.5, allowRunFromTrainer: false }, p.system.battle || {});
      p.system.screen = Object.assign({ width: 320, height: 240, scale: 2 }, p.system.screen || {});
      p.system.start = p.system.start || { mapId: (p.mapInfos[0] || {}).id, x: 0, y: 0, dir: 'down' };
      p.system.respawn = p.system.respawn || Object.assign({}, p.system.start);
      p.system.player = p.system.player || { name: 'Player', sprite: '', moveSpeed: 4 };
      p.system.switches = p.system.switches || [''];
      p.system.startingParty = p.system.startingParty || [];
      p.system.startingItems = p.system.startingItems || {};
      p.system.statusImmunity = p.system.statusImmunity || {};
      p.credits = p.credits || {};
      Object.assign(p.system, MF.Config.withDefaults(p.system));
      Object.values(p.maps).forEach(m => MF.Layers.migrate(m));
      Object.values(p.maps).forEach(m => { m.encounters = m.encounters || { chance: 0, list: [] }; m.events = m.events || []; m.edges = m.edges || {}; if (m.bgm === undefined) m.bgm = ''; });
      p.tilesets.forEach(t => { if (!t.animSpeed) t.animSpeed = 300; });
    },
    async save() {
      try {
        await window.api.saveProject(App.proj.path, App.proj);
        App.clearDirty(); UI.toast('Project saved');
      } catch (err) { UI.toast('Save failed: ' + (err.message || err), 'error'); }
    },
    async playtest(start) {
      const problems = App.validate();
      if (problems.length) {
        const go = await UI.modal({ title: 'Check before playtesting', body: h('ul', null, problems.map(p => h('li', null, p))),
          buttons: [{ label: 'Cancel', value: false }, { label: 'Playtest anyway', primary: true, value: true }] });
        if (!go) return;
      }
      await window.api.playtest(App.proj.path, JSON.parse(JSON.stringify(App.proj)), start || null);
    },
    validate() {
      const p = App.proj, out = [];
      const s = p.system.start;
      if (!s || !p.maps[s.mapId]) out.push('The player start position is not on a valid map (System tab, or right-click a tile in Events mode).');
      if (!p.system.player.sprite) out.push('No player sprite is set (Database → System).');
      Object.values(p.maps).forEach(m => {
        if (!p.tilesets.find(t => t.id === m.tilesetId)) out.push('Map "' + m.name + '" has no valid tileset.');
        Object.entries(m.edges || {}).forEach(([d, e]) => { if (e && e.mapId && !p.maps[e.mapId]) out.push('Map "' + m.name + '": its ' + d + ' edge leads to a map that no longer exists.'); });
        (m.encounters.list || []).forEach(e => { if (!p.monsters.find(x => x.id === e.speciesId)) out.push('Map "' + m.name + '" encounter table references a missing monster.'); });
        m.events.forEach(ev => (ev.pages || []).forEach(pg => { if (pg.trigger === 'encounter' && pg.encounter) { if (!(pg.encounter.list || []).length) out.push('Encounter area "' + ev.name + '" on "' + m.name + '" has no monsters.'); (pg.encounter.list || []).forEach(e => { if (!p.monsters.find(x => x.id === e.speciesId)) out.push('Encounter area "' + ev.name + '" on "' + m.name + '" lists a monster that no longer exists.'); }); } }));
      });
      p.monsters.forEach(mo => { if (!mo.front || !mo.back) out.push('Monster "' + mo.name + '" is missing a front or back sprite.'); });
      return out;
    },

    /* ---------- maps ---------- */
    map() { return App.proj && App.mapId ? App.proj.maps[App.mapId] : null; },
    tileset() { const m = App.map(); return m ? App.proj.tilesets.find(t => t.id === m.tilesetId) : null; },
    selectMap(id) {
      if (window.MapEditor) MapEditor.area = null;
      App.mapId = id; App.selectedEventId = null;
      App.renderMapList(); MapEditor.loadTileset().then(() => { MapEditor.render(); MapEditor.renderPalette(); });
      App.setLayer(Math.min(App.layer || 0, ((App.map() || {}).layers || [1]).length - 1), true);
      App.renderInspector();
    },
    renderMapList() {
      const list = clear($('#map-list'));
      if (!App.proj) return;
      App.proj.mapInfos.forEach((info, i) => {
        const m = App.proj.maps[info.id];
        const isStart = App.proj.system.start.mapId === info.id;
        const el = h('div', { class: 'list-item' + (info.id === App.mapId ? ' sel' : ''), onclick: () => App.selectMap(info.id),
          oncontextmenu: e => {
            e.preventDefault();
            UI.menu(e.clientX, e.clientY, [
              { label: 'Rename…', action: async () => { const n = await UI.prompt('Rename map', m.name, 'Name'); if (n) { m.name = n; info.name = n; App.markDirty(); App.renderMapList(); App.renderInspector(); } } },
              { label: 'Change size…', action: () => { if (App.mapId !== info.id) App.selectMap(info.id); App.resizeDialog(m); } },
              { label: 'Duplicate', action: () => App.duplicateMap(info.id) },
              { label: 'Move up', disabled: i === 0, action: () => { const a = App.proj.mapInfos; [a[i - 1], a[i]] = [a[i], a[i - 1]]; App.markDirty(); App.renderMapList(); } },
              { label: 'Move down', disabled: i === App.proj.mapInfos.length - 1, action: () => { const a = App.proj.mapInfos; [a[i + 1], a[i]] = [a[i], a[i + 1]]; App.markDirty(); App.renderMapList(); } },
              '-',
              { label: 'Playtest from start position', action: () => App.playtest() },
              '-',
              { label: 'Delete map…', disabled: App.proj.mapInfos.length <= 1, action: () => App.deleteMap(info.id) }
            ]);
          } }, (isStart ? '★ ' : '') + m.name, h('span', { class: 'muted' }, m.width + '×' + m.height));
        list.appendChild(el);
      });
    },
    nextMapId() {
      let n = 1; while (App.proj.maps['map' + String(n).padStart(3, '0')]) n++;
      return 'map' + String(n).padStart(3, '0');
    },
    // Map size presets shown in the New map and Change size windows.
    SIZES: [['Small', 20, 15, 'a house, a small town'], ['Medium', 30, 20, 'a town or a short route'], ['Large', 40, 30, 'a long route or a forest'], ['Huge', 64, 48, 'a big area or a cave system']],
    sizeChooser(o) {
      const box = h('div');
      const draw = () => {
        clear(box);
        const cards = h('div', { class: 'size-cards' }, App.SIZES.map(([n, w, hh, d]) => h('div', { class: 'size-card' + (o.width === w && o.height === hh ? ' sel' : ''), onclick: () => { o.width = w; o.height = hh; draw(); } },
          h('b', null, n), h('span', null, w + ' × ' + hh), h('span', { class: 'muted' }, d))));
        const custom = !App.SIZES.some(([, w, hh]) => w === o.width && hh === o.height);
        box.append(h('div', { class: 'field' }, h('span', null, 'Size'), cards),
          row(field('Width (squares)', o, 'width', { type: 'number', min: 5, max: 256, onChange: () => sizeNote() }), field('Height (squares)', o, 'height', { type: 'number', min: 5, max: 256, onChange: () => sizeNote() })),
          note);
        sizeNote();
        void custom;
      };
      const note = h('p', { class: 'muted', style: { marginTop: 0 } });
      const sizeNote = () => {
        const ts = App.proj.tilesets.find(t => t.id === o.tilesetId) || App.tileset() || { tileSize: 16 };
        const S = App.proj.system.screen || { width: 320, height: 240 };
        const T = ts.tileSize || 16, sw = Math.floor(S.width / T), sh = Math.floor(S.height / T);
        note.textContent = 'Any size from 5×5 to 256×256 squares. The game screen shows about ' + sw + '×' + sh + ' squares at once' + ((o.width | 0) <= sw && (o.height | 0) <= sh ? ', so this whole map fits on screen.' : '; the view scrolls to follow the player.');
      };
      draw();
      return box;
    },
    async addMap() {
      if (!App.proj) return;
      const o = { name: 'New Map', width: 20, height: 15, tilesetId: (App.tileset() || App.proj.tilesets[0] || {}).id || '', fill: true };
      App._suppressDirty = true;
      const ok = await UI.modal({ title: 'New map', body: h('div', null,
        row(field('Name', o, 'name'), field('Tileset', o, 'tilesetId', { type: 'select', options: App.proj.tilesets.map(t => [t.id, t.name]) })),
        App.sizeChooser(o),
        field('Fill the ground layer with the tileset\'s first tile (e.g. grass)', o, 'fill', { type: 'checkbox' }),
        h('p', { class: 'muted' }, 'You can change the size later with Change size… in the map properties, or by right-clicking the map in the Maps list.')),
        buttons: [{ label: 'Cancel', value: false }, { label: 'Create', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      const w = Math.max(5, Math.min(256, o.width | 0)), hh = Math.max(5, Math.min(256, o.height | 0)), n = w * hh;
      const id = App.nextMapId();
      App.proj.maps[id] = { id, name: o.name || id, width: w, height: hh, tilesetId: o.tilesetId, battleback: '', bgm: '', edges: {}, layers: [new Array(n).fill(o.fill ? 0 : -1), new Array(n).fill(-1), new Array(n).fill(-1)], layerInfo: MF.Layers.defaults(), encounters: { chance: 0, list: [] }, events: [] };
      App.proj.mapInfos.push({ id, name: o.name || id });
      App.markDirty(); App.selectMap(id);
      UI.toast('Created ' + (o.name || id) + ' (' + w + '×' + hh + ')');
    },
    // Change a map's size. The anchor says which part of the map stays put: e.g. top-left adds or removes squares on the right and bottom.
    async resizeDialog(m) {
      const o = { width: m.width, height: m.height, tilesetId: m.tilesetId, ax: 0, ay: 0 };
      const anchorBox = h('div');
      const drawAnchor = () => {
        clear(anchorBox);
        const grid = h('div', { class: 'anchor-grid' });
        for (let ay = 0; ay < 3; ay++) for (let ax = 0; ax < 3; ax++) {
          const on = o.ax === ax / 2 && o.ay === ay / 2;
          grid.appendChild(h('button', { class: on ? 'on' : '', title: ['Top', 'Middle', 'Bottom'][ay] + ' ' + ['left', 'centre', 'right'][ax], onclick: () => { o.ax = ax / 2; o.ay = ay / 2; drawAnchor(); } }, on ? '■' : '·'));
        }
        anchorBox.append(h('div', { class: 'field' }, h('span', null, 'Keep the map pinned to'), grid,
          h('span', { class: 'muted', style: { fontSize: '11px' } }, 'Squares are added or removed on the other sides. Events, the start position and encounter areas move with the map.')));
      };
      drawAnchor();
      App._suppressDirty = true;
      const ok = await UI.modal({ title: 'Change size — ' + m.name + ' (now ' + m.width + '×' + m.height + ')', body: h('div', null, App.sizeChooser(o), anchorBox),
        buttons: [{ label: 'Cancel', value: false }, { label: 'Change size', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      const lost = App.resizeMap(m, o.width, o.height, o.ax, o.ay);
      App.renderInspector();
      UI.toast('Map is now ' + m.width + '×' + m.height + (lost ? ' · ' + lost + ' event' + (lost === 1 ? '' : 's') + ' outside the new size were removed (Ctrl+Z to undo)' : ''));
    },
    duplicateMap(srcId) {
      const id = App.nextMapId();
      const m = JSON.parse(JSON.stringify(App.proj.maps[srcId]));
      m.id = id; m.name += ' (copy)';
      App.proj.maps[id] = m;
      App.proj.mapInfos.push({ id, name: m.name });
      App.markDirty(); App.selectMap(id);
    },
    // Delete a map, after saying what points at it. The start and blackout points move to another map if needed.
    async deleteMap(id) {
      id = id || App.mapId;
      const m = App.proj.maps[id];
      if (!m) return;
      if (App.proj.mapInfos.length <= 1) return UI.alert('Delete map', 'A project needs at least one map. Add another map first, then delete this one.');
      const others = App.proj.mapInfos.filter(i => i.id !== id);
      const links = [];
      Object.values(App.proj.maps).forEach(o => {
        if (o.id === id) return;
        let n = 0;
        (o.events || []).forEach(ev => (ev.pages || []).forEach(pg => { const walk = cs => (cs || []).forEach(c => { if (c.type === 'transfer' && c.mapId === id) n++; ['yesCmds', 'noCmds'].forEach(k => walk(c[k])); }); walk(pg.commands); }));
        if (n) links.push(o.name + ': ' + n + ' transfer' + (n > 1 ? 's' : ''));
        if (Object.values(o.edges || {}).some(e => e.mapId === id)) links.push(o.name + ': a map edge');
      });
      const S = App.proj.system;
      const lines = ['Delete the map "' + m.name + '" and everything on it (' + (m.events || []).length + ' event' + ((m.events || []).length === 1 ? '' : 's') + ')?'];
      if (S.start && S.start.mapId === id) lines.push('', 'The game starts on this map. The start position will move to "' + others[0].name + '".');
      if (S.respawn && S.respawn.mapId === id) lines.push('', 'The blackout point is on this map. It will move to the start position.');
      if (links.length) lines.push('', 'These lead here and will stop working until you point them somewhere else:', ...links.map(l => '  • ' + l));
      lines.push('', 'This can\'t be undone with Ctrl+Z. If you change your mind, close the project without saving.');
      if (!await UI.confirm('Delete map', lines.join('\n'), 'Delete map', true)) return;
      delete App.proj.maps[id];
      App.proj.mapInfos = others;
      Object.values(App.proj.maps).forEach(o => Object.keys(o.edges || {}).forEach(d => { if (o.edges[d].mapId === id) delete o.edges[d]; }));
      if (S.start && S.start.mapId === id) { const t = App.proj.maps[others[0].id]; const p = App.walkableNear(t); S.start = { mapId: t.id, x: p.x, y: p.y, dir: 'down' }; }
      if (S.respawn && S.respawn.mapId === id) S.respawn = Object.assign({}, S.start);
      MapEditor.undoStack = MapEditor.undoStack.filter(u => u.mapId !== id); MapEditor.redoStack = MapEditor.redoStack.filter(u => u.mapId !== id);
      App.markDirty();
      App.selectMap(App.mapId === id ? others[0].id : App.mapId);
      UI.toast('Deleted "' + m.name + '"');
    },
    // The walkable square closest to the middle of a map (for moving the start position).
    walkableNear(map) {
      const ts = App.proj.tilesets.find(t => t.id === map.tilesetId);
      const cx = Math.floor(map.width / 2), cy = Math.floor(map.height / 2);
      for (let r = 0; r < Math.max(map.width, map.height); r++)
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height || (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r)) continue;
          const f = MF.Layers.cellFlags(map, ts, x, y);
          if (f.pass && !f.empty && !(map.events || []).some(e => e.x === x && e.y === y)) return { x, y };
        }
      return { x: cx, y: cy };
    },
    resizeMap(m, w, hh, ax, ay) {
      w = Math.max(5, Math.min(256, w | 0)); hh = Math.max(5, Math.min(256, hh | 0));
      if (w === m.width && hh === m.height) return 0;
      MapEditor.pushUndo();
      const dx = Math.round((w - m.width) * (ax || 0)), dy = Math.round((hh - m.height) * (ay || 0));
      const ow = m.width, oh = m.height;
      m.layers = m.layers.map((L, li) => {
        const out = new Array(w * hh).fill(-1);
        for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
          const sx = x - dx, sy = y - dy;
          if (sx >= 0 && sy >= 0 && sx < ow && sy < oh) out[y * w + x] = L[sy * ow + sx];
          else if (li === 0) out[y * w + x] = L[Math.max(0, Math.min(oh - 1, sy)) * ow + Math.max(0, Math.min(ow - 1, sx))]; // extend the ground from the nearest edge
        }
        return out;
      });
      m.width = w; m.height = hh;
      const before = m.events.length;
      m.events.forEach(e => { e.x += dx; e.y += dy; });
      m.events = m.events.filter(e => e.x >= 0 && e.y >= 0 && e.x < w && e.y < hh);
      const pos = [App.proj.system.start, App.proj.system.respawn];
      pos.forEach(p => { if (p && p.mapId === m.id) { p.x = Math.max(0, Math.min(w - 1, p.x + dx)); p.y = Math.max(0, Math.min(hh - 1, p.y + dy)); } });
      MapEditor.cacheMapId = null;
      App.markDirty(); MapEditor.render(); App.renderMapList();
      return before - m.events.length;
    },

    /* ---------- events ---------- */
    selectedEvent() { const m = App.map(); return m && App.selectedEventId ? m.events.find(e => e.id === App.selectedEventId) : null; },
    newEvent(x, y) {
      const m = App.map();
      const id = m.events.reduce((a, e) => Math.max(a, e.id), 0) + 1;
      const ev = { id, name: 'EV' + String(id).padStart(3, '0'), x, y, pages: [EventEditor.newPage()] };
      m.events.push(ev);
      App.selectedEventId = id; App.markDirty(); MapEditor.render(); App.renderInspector();
      return ev;
    },
    pasteEvent(x, y) {
      if (!App.clipboardEvent) return;
      const m = App.map();
      if (m.events.some(e => e.x === x && e.y === y)) return UI.toast('There is already an event on that tile');
      const ev = JSON.parse(App.clipboardEvent);
      ev.id = m.events.reduce((a, e) => Math.max(a, e.id), 0) + 1; ev.x = x; ev.y = y;
      m.events.push(ev); App.selectedEventId = ev.id; App.markDirty(); MapEditor.render(); App.renderInspector();
    },
    async deleteEvent(id) {
      const m = App.map(); const ev = m.events.find(e => e.id === id);
      if (!ev) return;
      m.events = m.events.filter(e => e.id !== id);
      App.selectedEventId = null; App.markDirty(); MapEditor.render(); App.renderInspector();
      UI.toast('Deleted ' + ev.name);
    },
    setStart(x, y) {
      App.proj.system.start = { mapId: App.mapId, x, y, dir: (App.proj.system.start || {}).dir || 'down' };
      App.markDirty(); MapEditor.render(); App.renderMapList(); UI.toast('Player start set');
    },

    /* ---------- inspector ---------- */
    /* Collapsible inspector sections. "One at a time" keeps a single section open (opening one closes the
       others); otherwise each opens and closes on its own. The choice is remembered between sessions. */
    insp: (() => { let st = null; try { st = JSON.parse(localStorage.getItem('pgm.inspector')); } catch (e) { /* first run */ } return Object.assign({ one: false, closed: {}, current: 'map' }, st || {}); })(),
    saveInsp() { try { localStorage.setItem('pgm.inspector', JSON.stringify(App.insp)); } catch (e) { /* storage unavailable */ } },
    inspOpen(key) { return App.insp.one ? App.insp.current === key : !App.insp.closed[key]; },
    inspKeys() { return [...document.querySelectorAll('#inspector .insp-section[data-key]')].map(s => s.dataset.key); },
    inspApply() {
      document.querySelectorAll('#inspector .insp-section[data-key]').forEach(s => {
        const open = App.inspOpen(s.dataset.key);
        s.classList.toggle('collapsed', !open);
        const b = s.querySelector('.insp-toggle'); if (b) b.setAttribute('aria-expanded', String(open));
      });
      const one = document.querySelector('#insp-one'); if (one) one.checked = App.insp.one;
      App.saveInsp();
    },
    inspToggle(key) {
      const I = App.insp;
      if (I.one) I.current = I.current === key ? null : key; else I.closed[key] = !I.closed[key];
      App.inspApply();
      if (App.inspOpen(key)) { const s = document.querySelector('#inspector .insp-section[data-key="' + key + '"]'); s && s.scrollIntoView({ block: 'nearest' }); }
    },
    inspSetOne(on) {
      const I = App.insp, keys = App.inspKeys();
      if (on && !I.one) I.current = keys.find(k => !I.closed[k] && k !== 'tips') || keys[0];   // keep the first open section open
      if (!on && I.one) { I.closed = {}; keys.forEach(k => { if (k !== I.current) I.closed[k] = true; }); } // nothing jumps open
      I.one = on; App.inspApply();
    },
    inspAll(open) {
      const I = App.insp;
      if (open) { I.one = false; I.closed = {}; }
      else if (I.one) I.current = null;
      else App.inspKeys().forEach(k => { I.closed[k] = true; });
      App.inspApply();
    },
    inspSection(key, title, ...kids) {
      const open = App.inspOpen(key);
      return h('div', { class: 'insp-section' + (open ? '' : ' collapsed'), 'data-key': key },
        h('h3', null, h('button', { class: 'insp-toggle', 'aria-expanded': String(open), title: 'Show or hide this section', onclick: () => App.inspToggle(key) }, h('span', { class: 'insp-chev' }, '▸'), title)),
        h('div', { class: 'insp-body' }, kids));
    },
    inspBar() {
      return h('div', { class: 'insp-bar' },
        h('label', { title: 'Opening a section closes the others' }, h('input', { type: 'checkbox', id: 'insp-one', checked: App.insp.one, onchange: e => App.inspSetOne(e.target.checked) }), 'One at a time'),
        h('span', { class: 'tb-spacer' }),
        h('button', { class: 'small', title: 'Open every section', onclick: () => App.inspAll(true) }, 'Expand all'),
        h('button', { class: 'small', title: 'Close every section', onclick: () => App.inspAll(false) }, 'Collapse all'));
    },

    renderInspector() {
      const box = clear($('#inspector'));
      const m = App.map();
      if (!m) return;
      box.appendChild(App.inspBar());
      const ev = App.mode === 'event' ? App.selectedEvent() : null;
      if (ev) {
        box.appendChild(App.inspSection('event', 'Event',
          field('Name', ev, 'name', { onChange: () => MapEditor.render() }),
          row(h('div', { class: 'field' }, h('span', null, 'Position'), h('div', null, ev.x + ', ' + ev.y)), h('div', { class: 'field' }, h('span', null, 'Pages'), h('div', null, String(ev.pages.length)))),
          ev.quick ? h('div', { class: 'qe-tag' }, (QuickEvent.TYPES[ev.quick.type] || {}).icon + ' Quick event: ' + (QuickEvent.TYPES[ev.quick.type] || {}).label) : null,
          h('div', { class: 'row' }, ev.quick ? h('button', { class: 'primary', onclick: () => QuickEvent.edit(ev) }, 'Edit ' + QuickEvent.TYPES[ev.quick.type].label.toLowerCase() + '…') : null,
            h('button', { class: ev.quick ? '' : 'primary', onclick: () => EventEditor.open(ev) }, ev.quick ? 'Full event editor…' : 'Edit event…'), h('button', { class: 'danger', onclick: () => App.deleteEvent(ev.id) }, 'Delete')),
          h('p', { class: 'muted' }, 'Drag to move. Double-click or Enter to edit. Ctrl+C to copy, right-click a tile to paste.')));
        ev.pages.forEach((pg, i) => box.appendChild(App.inspSection('page' + (i + 1), 'Page ' + (i + 1) + ' · ' + ({ action: 'action button', touch: 'touch', sight: 'trainer sight', auto: 'autorun', encounter: 'monster encounter area' }[pg.trigger] || pg.trigger),
          pg.trigger === 'encounter' && pg.encounter ? h('div', { class: 'muted' }, pg.encounter.width + '×' + pg.encounter.height + ' squares · ' + pg.encounter.chance + '% per step · ' + (pg.encounter.list || []).map(e => (App.proj.monsters.find(m => m.id === e.speciesId) || { name: '?' }).name).join(', ')) :
          pg.commands && pg.commands.length ? h('ol', { style: { paddingLeft: '18px', margin: 0 } }, pg.commands.map(c => h('li', null, EventEditor.summary(c)))) : h('div', { class: 'muted' }, 'No commands'))));
        return;
      }
      const KEY = { 'Map properties': 'map', 'Music': 'music', 'Map edges': 'edges', 'Wild encounters': 'encounters', 'Tips': 'tips' };
      const sec = (title, ...kids) => App.inspSection(KEY[title] || title, title, ...kids);
      box.appendChild(sec('Map properties',
        field('Name', m, 'name', { onChange: v => { const info = App.proj.mapInfos.find(i => i.id === m.id); if (info) info.name = v; App.renderMapList(); } }),
        h('div', { class: 'muted', style: { fontSize: '11px', marginBottom: '8px' } }, 'ID: ' + m.id),
        row(h('div', { class: 'field' }, h('span', null, 'Size'), h('div', { class: 'size-now' }, m.width + ' × ' + m.height + ' squares')),
          h('button', { style: { marginBottom: '8px' }, onclick: () => App.resizeDialog(m) }, 'Change size…')),
        field('Tileset', m, 'tilesetId', { type: 'select', options: App.proj.tilesets.map(t => [t.id, t.name]), onChange: () => App.selectMap(m.id) }),
        UI.assetPicker('Battle background (blank = system default)', m, 'battleback', 'battlebacks'),
        (App.proj.system.decorating || {}).enabled ? field('Players can decorate this map (their home)', m, 'decoratable', { type: 'checkbox' }) : null,
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'danger small', disabled: App.proj.mapInfos.length <= 1, title: App.proj.mapInfos.length <= 1 ? 'A project needs at least one map' : 'Delete this map', onclick: () => App.deleteMap(m.id) }, 'Delete map…'))));

      box.appendChild(sec('Music', UI.audioPicker('Background music', m, 'bgm', 'music', { none: 'Keep the music that\'s playing', specials: [['none', 'Silence (stop the music)']] }),
        h('p', { class: 'muted' }, 'Plays when the player enters this map. Import your own MP3 or FLAC files, or manage music in Database → Music & sounds.')));

      // Map edges: walking off a side of this map takes the player to another map.
      const EDGES = [['up', 'Top edge', '↑'], ['down', 'Bottom edge', '↓'], ['left', 'Left edge', '←'], ['right', 'Right edge', '→']];
      const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
      m.edges = m.edges || {};
      const edgeRows = EDGES.map(([d, label, arrow]) => {
        const e = m.edges[d] || { mapId: '', offset: 0 };
        const sel = h('select', null, h('option', { value: '' }, '— none (a wall) —'), App.proj.mapInfos.filter(i => i.id !== m.id).map(i => h('option', { value: i.id, selected: e.mapId === i.id }, i.name)));
        sel.addEventListener('change', () => {
          if (!sel.value) { delete m.edges[d]; }
          else {
            m.edges[d] = { mapId: sel.value, offset: e.offset || 0 };
            const other = App.proj.maps[sel.value];
            other.edges = other.edges || {};
            if (!other.edges[OPPOSITE[d]]) { other.edges[OPPOSITE[d]] = { mapId: m.id, offset: -(e.offset || 0) }; UI.toast(other.name + '\'s ' + EDGES.find(x => x[0] === OPPOSITE[d])[1].toLowerCase() + ' now leads back here'); }
          }
          App.markDirty(); App.renderInspector(); MapEditor.render();
        });
        const off = h('input', { type: 'number', value: e.offset || 0, style: { width: '58px' }, title: (d === 'up' || d === 'down') ? 'Shift sideways: the player arrives this many squares further right (negative = left) than where they left' : 'Shift up or down: the player arrives this many squares lower (negative = higher) than where they left' });
        off.addEventListener('input', () => { if (m.edges[d]) { m.edges[d].offset = +off.value || 0; App.markDirty(); } });
        return h('div', { class: 'edge-row' }, h('span', { class: 'edge-arrow' }, arrow), h('span', { class: 'edge-label' }, label), sel, m.edges[d] ? off : null);
      });
      box.appendChild(sec('Map edges', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Walk off an edge to go straight to the next map, like routes joining a town. The player keeps their position along the edge (plus the shift). For doors, stairs and caves, use an Exit / door quick event instead.'),
        edgeRows, h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Number = shift in squares. Linking an edge also links the other map back, if its matching edge is free.')));

      const enc = m.encounters;
      const tbl = h('table', { class: 'grid' }, h('tr', null, h('th', null, 'Monster'), h('th', null, 'Lv min'), h('th', null, 'Lv max'), h('th', null, 'Weight'), h('th')));
      const total = () => enc.list.reduce((a, e) => a + (e.weight || 0), 0) || 1;
      enc.list.forEach((e, i) => {
        const num = (k, w) => { const inp = h('input', { type: 'number', value: e[k], min: 0, style: { width: w } }); inp.addEventListener('input', () => { e[k] = +inp.value; App.markDirty(); pct.textContent = Math.round(100 * (e.weight || 0) / total()) + '%'; }); return inp; };
        const sel = h('select', null, App.proj.monsters.map(mo => h('option', { value: mo.id, selected: mo.id === e.speciesId }, mo.name)));
        sel.addEventListener('change', () => { e.speciesId = sel.value; App.markDirty(); });
        const pct = h('div', { class: 'muted', style: { fontSize: '10px' } }, Math.round(100 * (e.weight || 0) / total()) + '%');
        tbl.appendChild(h('tr', null, h('td', null, sel), h('td', null, num('minLevel', '46px')), h('td', null, num('maxLevel', '46px')), h('td', null, num('weight', '46px'), pct),
          h('td', null, h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { enc.list.splice(i, 1); App.markDirty(); App.renderInspector(); } }, '✕'))));
      });
      box.appendChild(sec('Wild encounters',
        field('Encounter chance per step on encounter tiles (%)', enc, 'chance', { type: 'number', min: 0, max: 100 }),
        App.proj.monsters.length ? tbl : h('p', { class: 'muted' }, 'Add monsters in the Database first.'),
        h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'small', disabled: !App.proj.monsters.length, onclick: () => { enc.list.push({ speciesId: App.proj.monsters[0].id, minLevel: 2, maxLevel: 4, weight: 10 }); App.markDirty(); App.renderInspector(); } }, '+ Add monster')),
        h('p', { class: 'muted' }, 'Encounters only happen on tiles flagged as encounter tiles in the tileset (shown with a green tint when Passability is on). Wild battle size comes from Database → System.')));

      box.appendChild(sec('Tips', h('ul', { class: 'muted', style: { paddingLeft: '16px', margin: 0 } },
        h('li', null, 'Right-click on the map picks a tile (Map mode) or opens the event menu (Events mode).'),
        h('li', null, 'Each layer has its own settings (Layers panel, double-click a layer): walkable or blocking, drawn above the player, wild encounters. If any layer blocks a square, it is blocked.'),
        h('li', null, 'Shortcuts: B/R/F/X tools, 1–9 layers, D dim other layers, M/E modes, P passability, Ctrl+Z/Y undo/redo.'),
        h('li', null, 'Events mode: right-click an empty square for quick events (treasure chest, item on the ground, sign, shopkeeper, exit / door, monster encounter area).'),
        h('li', null, 'Need more tiles or sprites? Click Assets (F10) to add free pixel art from the asset library.'))));
    }
  };

  // Field helper marks dirty on change; suppress while editing throwaway dialog objects.
  const md = App.markDirty;
  App.markDirty = function () { if (!App._suppressDirty && App.proj) md(); };
  window.addEventListener('DOMContentLoaded', () => App.init());
})();
