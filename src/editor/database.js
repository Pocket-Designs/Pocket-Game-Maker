/* Database editor: Monsters, Moves, Types, Items, Tilesets, System. */
(function () {
  'use strict';
  const { h, clear, field, row, section } = UI;
  const STAT_LABELS = [['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed']];
  const typeOpts = none => (none ? [['', '(none)']] : []).concat(App.proj.types.types.map(t => [t.id, t.name]));
  const chip = id => { const t = App.proj.types.types.find(x => x.id === id); return t ? h('span', { class: 'type-chip', style: { background: t.color } }, t.name) : null; };

  const T = () => MF.Config.withDefaults(App.proj.system).terms;
  const Home_SLOTS = [['outfit', 'outfit'], ['top', 'top'], ['bottom', 'bottoms'], ['hat', 'hat'], ['extra', 'extra']];
  const DB = window.DB = {
    tab: 'monsters', sel: {},

    TABS: [['monsters', 'Monsters'], ['moves', 'Moves'], ['types', 'Types'], ['items', 'Items'], ['tilesets', 'Tilesets'], ['audio', 'Music & sounds'], ['menus', 'Menus & screens'], ['system', 'System'], ['credits', 'Credits']],
    // tab: open straight to that tab (from the Database menu). If the Database is already open, just switch tab.
    open(tab) {
      if (tab && DB.TABS.some(t => t[0] === tab)) DB.tab = tab;
      if (DB.root && document.body.contains(DB.root)) return DB.draw();
      if (UI.anyModal()) return UI.toast('Close the open window first');
      const body = h('div', { style: { width: '100%', height: '100%', display: 'flex' } });
      DB.root = body;
      DB.draw();
      UI.modal({ title: 'Database', size: 'full', body, buttons: [{ label: 'Done', primary: true, value: true }],
        onClose: () => { App.renderInspector(); App.renderMapList(); MapEditor.loadTileset().then(() => { MapEditor.render(); MapEditor.renderPalette(); }); } });
    },
    draw() {
      const body = clear(DB.root);
      const tabs = DB.TABS;
      const tabEl = h('div', { class: 'db-tabs' }, tabs.map(([k, n]) => h('div', { class: 'db-tab' + (DB.tab === k ? ' sel' : ''), onclick: () => { DB.tab = k; DB.draw(); } }, n)));
      const layout = h('div', { class: 'db' + (DB.tab === 'types' || DB.tab === 'system' || DB.tab === 'credits' || DB.tab === 'audio' || DB.tab === 'menus' ? ' wide' : '') }, tabEl);
      body.appendChild(layout);
      DB['tab_' + DB.tab](layout);
    },

    /* generic list + form tab */
    listTab(layout, o) {
      const items = o.items();
      let cur = items.find(x => x.id === DB.sel[DB.tab]) || items[0];
      DB.sel[DB.tab] = cur && cur.id;
      const form = h('div', { class: 'db-form' });
      const drawForm = () => { clear(form); cur = o.items().find(x => x.id === DB.sel[DB.tab]); if (cur) o.form(form, cur, () => list.redraw()); else form.appendChild(h('p', { class: 'muted' }, o.empty || 'Nothing here yet. Click “+ New”.')); };
      const list = UI.listEditor({
        items: o.items, label: o.label, isSelected: it => it.id === DB.sel[DB.tab],
        onSelect: it => { DB.sel[DB.tab] = it.id; drawForm(); },
        onAdd: () => { const it = o.make(); o.items().push(it); DB.sel[DB.tab] = it.id; App.markDirty(); drawForm(); },
        onDuplicate: () => { if (!cur) return; const c = JSON.parse(JSON.stringify(cur)); c.name += ' copy'; c.id = UI.slug(c.name, o.items().map(x => x.id)); o.items().push(c); DB.sel[DB.tab] = c.id; App.markDirty(); drawForm(); },
        onDelete: async () => {
          if (!cur) return false;
          const refs = o.refs ? o.refs(cur) : 0;
          if (!await UI.confirm('Delete', 'Delete "' + cur.name + '"?' + (refs ? ' It is referenced ' + refs + ' time(s); those references will break.' : ''), 'Delete', true)) return false;
          const arr = o.items(); arr.splice(arr.indexOf(cur), 1);
          DB.sel[DB.tab] = arr[0] && arr[0].id; App.markDirty(); drawForm(); return true;
        }
      });
      layout.append(h('div', { class: 'db-list' }, list), form);
      drawForm();
    },

    /* ---------------- Monsters ---------------- */
    tab_monsters(layout) {
      const P = App.proj;
      DB.listTab(layout, {
        items: () => P.monsters,
        label: (m, i) => String(i + 1).padStart(3, '0') + '  ' + m.name,
        make: () => ({ id: UI.slug('New Monster', P.monsters.map(m => m.id)), name: 'New Monster', types: [P.types.types[0] ? P.types.types[0].id : 'normal'], baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 }, growth: 'medium', catchRate: 45, expYield: 60, front: '', back: '', category: '', description: '', learnset: [], evolution: null }),
        refs: m => {
          let n = 0; const s = JSON.stringify(P.maps) + JSON.stringify(P.system) + JSON.stringify(P.monsters.map(x => x.evolution));
          let i = -1; const needle = '"' + m.id + '"'; while ((i = s.indexOf(needle, i + 1)) >= 0) n++; return n;
        },
        form: (f, m, relist) => {
          m.types = m.types || []; m.learnset = m.learnset || [];
          const bst = h('b');
          const statsBox = h('div');
          const drawStats = () => {
            clear(statsBox);
            const total = STAT_LABELS.reduce((a, [k]) => a + (m.baseStats[k] || 0), 0);
            bst.textContent = String(total);
            const lv50 = STAT_LABELS.map(([k, n]) => n + ' ' + MF.calcStat(k, m.baseStats[k] || 0, 15, 50)).join(' · ');
            statsBox.append(h('div', { class: 'row' }, STAT_LABELS.map(([k, n]) => {
              const bar = h('i', { style: { width: Math.min(100, (m.baseStats[k] || 0) / 1.8) + '%' } });
              const fl = field(n, m.baseStats, k, { type: 'number', min: 1, max: 255, onChange: () => { bar.style.width = Math.min(100, m.baseStats[k] / 1.8) + '%'; bst.textContent = String(STAT_LABELS.reduce((a, [kk]) => a + (m.baseStats[kk] || 0), 0)); } });
              fl.appendChild(h('div', { class: 'stat-bar' }, bar));
              return fl;
            })), h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Total: ', bst, '   ·   At Lv 50 (average IVs): ', lv50));
          };
          drawStats();

          const learn = h('table', { class: 'grid' });
          const drawLearn = () => {
            clear(learn);
            learn.appendChild(h('tr', null, h('th', null, 'Level'), h('th', null, 'Move'), h('th', null, 'Type'), h('th', null, 'Power'), h('th')));
            m.learnset.forEach((l, i) => {
              const lv = h('input', { type: 'number', value: l.level, min: 1, style: { width: '64px' } });
              lv.addEventListener('input', () => { l.level = +lv.value; App.markDirty(); });
              const mv = P.moves.find(x => x.id === l.moveId);
              const sel = h('select', null, P.moves.map(x => h('option', { value: x.id, selected: x.id === l.moveId }, x.name)));
              sel.addEventListener('change', () => { l.moveId = sel.value; App.markDirty(); drawLearn(); });
              learn.appendChild(h('tr', null, h('td', null, lv), h('td', null, sel), h('td', null, mv ? chip(mv.type) : ''), h('td', { class: 'muted' }, mv ? (mv.power || '—') : ''),
                h('td', null, h('button', { class: 'icon-btn', onclick: () => { m.learnset.splice(i, 1); App.markDirty(); drawLearn(); } }, '✕'))));
            });
          };
          drawLearn();

          const evoBox = h('div');
          const drawEvo = () => {
            clear(evoBox);
            const evo = m.evolution || { method: 'none' };
            const proxy = { method: m.evolution ? m.evolution.method : 'none' };
            const fields = [field('Evolves', proxy, 'method', { type: 'select', options: [['none', 'Does not evolve'], ['level', 'At a level'], ['item', 'When an item is used']], onChange: v => {
              m.evolution = v === 'none' ? null : Object.assign({ into: (P.monsters.find(x => x.id !== m.id) || {}).id || '', level: 16, itemId: (P.items.find(i => i.kind === 'evolution') || {}).id || '' }, m.evolution || {}, { method: v });
              drawEvo();
            } })];
            if (m.evolution) {
              fields.push(field('Into', evo, 'into', { type: 'select', options: P.monsters.filter(x => x.id !== m.id).map(x => [x.id, x.name]) }));
              if (evo.method === 'level') fields.push(field('Level', evo, 'level', { type: 'number', min: 2, width: '80px' }));
              if (evo.method === 'item') fields.push(field('Item', evo, 'itemId', { type: 'select', options: P.items.map(i => [i.id, i.name]) }));
            }
            evoBox.appendChild(row(...fields));
          };
          drawEvo();

          const typeProxy = { t1: m.types[0] || '', t2: m.types[1] || '' };
          const syncTypes = () => { m.types = [typeProxy.t1, typeProxy.t2].filter(Boolean); };
          f.append(
            h('h2', null, m.name, ' ', (m.types || []).map(chip)), h('div', { class: 'id-line' }, 'id: ' + m.id),
            section('General',
              row(field('Name', m, 'name', { onChange: relist }), field('Category', m, 'category', { placeholder: 'e.g. Ember Cub' })),
              row(field('Type 1', typeProxy, 't1', { type: 'select', options: typeOpts(false), onChange: syncTypes }), field('Type 2', typeProxy, 't2', { type: 'select', options: typeOpts(true), onChange: syncTypes }),
                field('Growth rate', m, 'growth', { type: 'select', options: [['fast', 'Fast'], ['medium', 'Medium'], ['slow', 'Slow'], ['erratic', 'Erratic']] }),
                field('Catch rate (1–255)', m, 'catchRate', { type: 'number', min: 1, max: 255, help: 'Higher is easier. 255 = very easy, 45 = starter-like, 3 = legendary.' }),
                field('Exp yield', m, 'expYield', { type: 'number', min: 1 })),
              field(T().dex + ' entry (shown in the ' + T().dexLong + ')', m, 'description', { type: 'textarea', rows: 2 })),
            section('Base stats', statsBox),
            section('Sprites',
              row(UI.assetPicker('Front (enemy view)', m, 'front', 'monsters'), UI.assetPicker('Back (player view)', m, 'back', 'monsters')),
              UI.assetPicker('Walking sprite (optional 3×4 character sheet, used when it follows the player; without one the front picture is used)', m, 'overworld', 'characters', { preview: 'charFrame' }),
              h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Any size works; they are drawn bottom-centred on the battle platforms. Square sprites (e.g. 64×64 or 96×96) with transparent backgrounds look best.')),
            section('Learnset', learn, h('div', { class: 'row', style: { marginTop: '6px' } },
              h('button', { class: 'small', disabled: !P.moves.length, onclick: () => { const last = m.learnset[m.learnset.length - 1]; m.learnset.push({ level: last ? last.level + 3 : 1, moveId: P.moves[0].id }); App.markDirty(); drawLearn(); } }, '+ Add move'),
              h('button', { class: 'small', onclick: () => { m.learnset.sort((a, b) => a.level - b.level); App.markDirty(); drawLearn(); } }, 'Sort by level'),
              h('span', { class: 'muted', style: { fontSize: '11px' } }, 'Level-1 moves and the most recent ones up to the move limit are known when a monster is created.'))),
            section('Evolution', evoBox)
          );
        }
      });
    },

    /* ---------------- Moves ---------------- */
    tab_moves(layout) {
      const P = App.proj;
      DB.listTab(layout, {
        items: () => P.moves,
        label: m => m.name + '  ·  ' + (P.types.types.find(t => t.id === m.type) || { name: '?' }).name,
        make: () => ({ id: UI.slug('New Move', P.moves.map(m => m.id)), name: 'New Move', type: (P.types.types[0] || {}).id || 'normal', category: 'physical', power: 40, accuracy: 100, pp: 20, priority: 0, target: 'enemy', effect: { kind: 'none' }, description: '' }),
        refs: m => P.monsters.reduce((a, mo) => a + (mo.learnset || []).filter(l => l.moveId === m.id).length, 0),
        form: (f, m, relist) => {
          m.effect = m.effect || { kind: 'none' };
          const effBox = h('div');
          const drawEff = () => {
            clear(effBox);
            const e = m.effect;
            const kinds = [['none', 'No extra effect'], ['status', 'Inflict status'], ['stat', 'Change a stat stage'], ['heal', 'Heal (% of max HP)'], ['drain', 'Drain (heal % of damage)'], ['recoil', 'Recoil (% of damage)']];
            const r = [field('Effect', e, 'kind', { type: 'select', options: kinds, onChange: drawEff })];
            if (e.kind === 'status') r.push(field('Status', e, 'status', { type: 'select', options: [['psn', 'Poison'], ['brn', 'Burn'], ['par', 'Paralysis'], ['slp', 'Sleep']] }), field('Chance %', e, 'chance', { type: 'number', min: 1, max: 100, width: '90px' }), field('Who', e, 'who', { type: 'select', options: [['target', 'Target'], ['self', 'User']] }));
            if (e.kind === 'stat') r.push(field('Stat', e, 'stat', { type: 'select', options: [['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed'], ['acc', 'Accuracy'], ['eva', 'Evasion']] }), field('Stages (−6…+6)', e, 'stages', { type: 'number', min: -6, max: 6, width: '110px' }), field('Chance %', e, 'chance', { type: 'number', min: 1, max: 100, width: '90px' }), field('Who', e, 'who', { type: 'select', options: [['target', 'Target'], ['self', 'User']] }));
            if (e.kind === 'heal' || e.kind === 'drain' || e.kind === 'recoil') r.push(field('Amount %', e, 'amount', { type: 'number', min: 1, max: 100, width: '100px' }));
            if (e.kind === 'status') { e.status = e.status || 'psn'; e.chance = e.chance || 100; e.who = e.who || 'target'; }
            if (e.kind === 'stat') { e.stat = e.stat || 'atk'; e.stages = e.stages || -1; e.chance = e.chance || 100; e.who = e.who || 'target'; }
            if (e.kind === 'heal' && !e.amount) { e.amount = 50; e.who = 'self'; }
            if ((e.kind === 'drain' || e.kind === 'recoil') && !e.amount) e.amount = e.kind === 'drain' ? 50 : 25;
            effBox.appendChild(row(...r));
            effBox.appendChild(h('div', { class: 'muted', style: { fontSize: '11px' } }, m.category === 'status' ? 'Status moves apply this effect directly.' : 'Damaging moves apply this as a secondary effect after hitting.'));
          };
          drawEff();
          f.append(h('h2', null, m.name, ' ', chip(m.type)), h('div', { class: 'id-line' }, 'id: ' + m.id),
            section('General',
              row(field('Name', m, 'name', { onChange: relist }), field('Type', m, 'type', { type: 'select', options: typeOpts(false), onChange: relist }),
                field('Category', m, 'category', { type: 'select', options: [['physical', 'Physical (Atk vs Def)'], ['special', 'Special (Sp.Atk vs Sp.Def)'], ['status', 'Status (no damage)']] })),
              row(field('Power', m, 'power', { type: 'number', min: 0 }), field('Accuracy % (0 = never misses)', m, 'accuracy', { type: 'number', min: 0, max: 100 }), field(T().pp + ' (' + T().ppLong.toLowerCase() + ')', m, 'pp', { type: 'number', min: 1, help: 'How many times the move can be used before resting or using an item.' }), field('Priority', m, 'priority', { type: 'number', min: -5, max: 5, help: 'Higher priority moves go first regardless of Speed.' })),
              field('Targets', m, 'target', { type: 'select', options: [['enemy', 'One opponent'], ['allEnemies', 'All opponents (75% damage each when more than one)'], ['self', 'User'], ['ally', 'One ally or self']] }),
              field('Description', m, 'description', { type: 'textarea', rows: 2 })),
            section('Effect', effBox));
        }
      });
    },

    /* ---------------- Types ---------------- */
    tab_types(layout) {
      const P = App.proj, T = P.types;
      const f = h('div', { class: 'db-form' });
      const draw = () => {
        clear(f);
        const list = h('table', { class: 'grid', style: { maxWidth: '520px' } }, h('tr', null, h('th', null, 'Name'), h('th', null, 'Colour'), h('th', null, 'ID'), h('th')));
        T.types.forEach((t, i) => list.appendChild(h('tr', null,
          h('td', null, field('', t, 'name', { onChange: () => drawChart() })), h('td', null, field('', t, 'color', { type: 'color', onChange: () => drawChart() })),
          h('td', { class: 'muted' }, t.id),
          h('td', null, h('button', { class: 'icon-btn', title: 'Delete type', onclick: async () => {
            if (!await UI.confirm('Delete type', 'Delete the ' + t.name + ' type? Monsters and moves using it will lose it.', 'Delete', true)) return;
            T.types.splice(i, 1); delete T.chart[t.id]; Object.values(T.chart).forEach(r => delete r[t.id]);
            P.monsters.forEach(m => { m.types = (m.types || []).filter(x => x !== t.id); }); App.markDirty(); draw();
          } }, '✕')))));
        const chartBox = h('div');
        const drawChart = () => {
          clear(chartBox);
          const tbl = h('table', { class: 'grid chart-table' }, h('tr', null, h('th', null, 'ATK ↓ / DEF →'), T.types.map(t => h('th', null, chip(t.id)))));
          T.types.forEach(a => {
            tbl.appendChild(h('tr', null, h('th', null, chip(a.id)), T.types.map(d => {
              const v = (T.chart[a.id] || {})[d.id] ?? 1;
              const cls = v === 2 ? 'x2' : v === 0.5 ? 'x05' : v === 0 ? 'x0' : 'x1';
              const label = v === 1 ? '' : v === 0.5 ? '½' : v === 0 ? '0' : '×2';
              return h('td', null, h('button', { class: 'chart-cell ' + cls, title: a.name + ' → ' + d.name + ': ×' + v, onclick: () => {
                const next = { 1: 2, 2: 0.5, 0.5: 0, 0: 1 }[v];
                T.chart[a.id] = T.chart[a.id] || {};
                if (next === 1) delete T.chart[a.id][d.id]; else T.chart[a.id][d.id] = next;
                App.markDirty(); drawChart();
              } }, label));
            })));
          });
          chartBox.appendChild(tbl);
        };
        drawChart();
        f.append(h('h2', null, 'Types'), h('div', { class: 'id-line' }, 'Type matchups drive damage multipliers. Dual types multiply together.'),
          section('Types', list, h('button', { class: 'small', style: { marginTop: '6px' }, onclick: async () => {
            const n = await UI.prompt('New type', '', 'Type name'); if (!n) return;
            T.types.push({ id: UI.slug(n, T.types.map(t => t.id)), name: n, color: '#888888' }); App.markDirty(); draw();
          } }, '+ Add type')),
          section('Effectiveness chart (click a cell to cycle ×1 → ×2 → ½ → 0)', chartBox));
      };
      draw();
      layout.appendChild(f);
    },

    /* ---------------- Decorations and clothing (optional features) ---------------- */
    decorationFields(box, it) {
      const d = it.decor = Object.assign({ image: '', w: 1, h: 1, blocks: true, turn: 'rotate' }, it.decor || {});
      const sizeNote = h('div', { class: 'muted' });
      const fit = async () => { const img = await UI.loadImage(d.image); if (!img) return; const T = 16; d.w = Math.max(1, Math.round(img.width / T)); d.h = Math.max(1, Math.round(img.height / T)); App.markDirty(); DB.draw(); };
      const note = async () => { const img = await UI.loadImage(d.image); sizeNote.textContent = img ? 'Picture: ' + img.width + '×' + img.height + ' pixels. It is stretched to fill ' + d.w + '×' + d.h + ' squares.' : ''; };
      box.append(
        UI.assetPicker('Picture (facing down)', d, 'image', 'decorations', { onChange: () => fit() }),
        row(field('Width (squares)', d, 'w', { type: 'number', min: 1, max: 8, width: '120px', onChange: note }), field('Height (squares)', d, 'h', { type: 'number', min: 1, max: 8, width: '120px', onChange: note }),
          h('button', { class: 'small', style: { alignSelf: 'flex-end', marginBottom: '8px' }, onclick: fit }, 'Size from picture')),
        sizeNote,
        row(field('Blocks the player (untick for rugs and mats, which can be walked over and have furniture on top)', d, 'blocks', { type: 'checkbox' })),
        field('Turning', d, 'turn', { type: 'select', options: [['rotate', 'Turn in four directions (quarter turns)'], ['mirror', 'Flip left / right only'], ['none', 'Can\'t be turned']] }),
        h('p', { class: 'muted' }, 'Players buy decorations in a shop and place them on maps marked “Players can decorate this map”. Turn the feature on in Menus & screens → Optional features.'));
      note();
    },
    clothingFields(box, it) {
      const w = it.wear = Object.assign({ slot: 'outfit', sheet: '' }, it.wear || {});
      box.append(
        field('Slot', w, 'slot', { type: 'select', options: [['outfit', 'Whole outfit (replaces the player\'s sprite)'], ['top', 'Top (drawn over the player)'], ['bottom', 'Bottoms (drawn over the player)'], ['hat', 'Hat (drawn over the player)'], ['extra', 'Extra (glasses, scarf, backpack… drawn on top)']] }),
        UI.assetPicker('Character sheet (3 frames × 4 directions, like the player\'s sprite)', w, 'sheet', 'characters', { preview: 'charFrame' }),
        h('p', { class: 'muted' }, 'A whole outfit is a complete character sheet. Tops, bottoms, hats and extras are sheets the same size as the player\'s, transparent except for the clothing, and are drawn over the outfit in that order. Players change clothes in the Wardrobe (turn it on in Menus & screens → Optional features). Clothes are kept in the bag and never used up.'));
    },
    // Copy the library's furniture or clothes into the project and make an item for each.
    async addFromLibrary(kind) {
      const P = App.proj, lib = await window.api.libraryList();
      const want = kind === 'decoration' ? lib.items.filter(i => i.kind === 'decorations') : lib.items.filter(i => i.kind === 'characters' && /^characters\/(outfit|wear)-/.test(i.key));
      if (!want.length) return UI.toast('The asset library has none of these. Click Restore missing files in the Asset Library window.');
      const r = await window.api.libraryAdd(P.path, want.map(i => i.key), false, P.tilesets.map(t => t.id));
      P.credits = Object.assign(P.credits || {}, r.credits || {});
      let made = 0;
      for (const i of want) {
        const rel = i.files[0];
        if (P.items.some(x => (x.decor && x.decor.image === rel) || (x.wear && x.wear.sheet === rel))) continue;
        const it = { id: UI.slug(i.name, P.items.map(x => x.id)), name: kind === 'decoration' ? i.name : i.name.replace(/^Outfit: /, '').replace(/^(Cap|Top|Bottoms): (\w+)/, (m, a, c) => c.charAt(0).toUpperCase() + c.slice(1) + ' ' + ({ Cap: 'cap', Top: 'shirt', Bottoms: 'trousers' })[a]), kind, price: kind === 'decoration' ? 800 : 500, battleUsable: false, fieldUsable: true, description: i.description.replace(/^Wardrobe (outfit|piece \(\w+\)): /, '') };
        if (kind === 'decoration') { const [w, hh] = String(i.size || '1x1').split('x').map(Number); it.decor = { image: rel, w: w || 1, h: hh || 1, blocks: !/rug/i.test(rel), turn: 'rotate' }; }
        else it.wear = { slot: /\/outfit-/.test(rel) ? 'outfit' : /cap/.test(rel) ? 'hat' : /shirt/.test(rel) ? 'top' : /trousers/.test(rel) ? 'bottom' : 'extra', sheet: rel };
        P.items.push(it); made++;
      }
      App.assetVersion = Date.now(); await UI.refreshAssets(); App.markDirty();
      UI.toast('Added ' + r.copied.length + ' picture' + (r.copied.length === 1 ? '' : 's') + ' and ' + made + ' item' + (made === 1 ? '' : 's') + '. Sell them in a shop, or give them with an event.');
      DB.draw();
    },

    /* ---------------- Items ---------------- */
    tab_items(layout) {
      const P = App.proj;
      const KINDS = [['ball', 'Capture ball'], ['heal', 'Healing / status cure'], ['revive', 'Revive'], ['pp', T().pp + ' restore'], ['evolution', 'Evolution item'], ['tool', 'Tool (opens a menu, e.g. a storage box)'], ['decoration', 'Decoration (furniture for a home)'], ['clothing', 'Clothing (for the Wardrobe)'], ['key', 'Key item (no effect)']];
      DB.listTab(layout, {
        items: () => P.items,
        label: i => i.name + '  ·  ' + (KINDS.find(k => k[0] === i.kind) || ['', ''])[1],
        make: () => ({ id: UI.slug('New Item', P.items.map(i => i.id)), name: 'New Item', kind: 'heal', healAmount: 20, price: 100, battleUsable: true, fieldUsable: true, description: '' }),
        refs: it => { const s = JSON.stringify(P.maps) + JSON.stringify(P.system); return (s.split('"' + it.id + '"').length - 1); },
        form: (f, it, relist) => {
          const kindBox = h('div');
          const drawKind = () => {
            clear(kindBox);
            const r = [];
            if (it.kind === 'ball') r.push(field('Catch multiplier (255 = always catches)', it, 'catchBonus', { type: 'number', min: 0.1, step: 0.1 }));
            if (it.kind === 'heal') r.push(field('Heal HP (flat)', it, 'healAmount', { type: 'number', min: 0 }), field('Heal % of max HP', it, 'healPercent', { type: 'number', min: 0, max: 100 }),
              field('Cures', it, 'cureStatus', { type: 'select', options: [['', 'Nothing'], ['psn', 'Poison'], ['brn', 'Burn'], ['par', 'Paralysis'], ['slp', 'Sleep'], ['all', 'All status']] }));
            if (it.kind === 'revive') r.push(field('Revive with % HP', it, 'revivePercent', { type: 'number', min: 1, max: 100 }));
            if (it.kind === 'pp') r.push(field(T().pp + ' restored to each move', it, 'ppAmount', { type: 'number', min: 1 }));
            if (it.kind === 'tool') { if (!it.toolAction) it.toolAction = 'storage'; r.push(field('When used from the bag', it, 'toolAction', { type: 'select', options: MF.Config.TOOL_ACTIONS.map(([k, l]) => [k, MF.Config.word(T(), l)]) })); }
            if (it.kind === 'evolution') r.push(h('div', { class: 'muted' }, 'Set the item on the monster\'s Evolution section (method: when an item is used).'));
            if (it.kind === 'decoration') { DB.decorationFields(kindBox, it); return; }
            if (it.kind === 'clothing') { DB.clothingFields(kindBox, it); return; }
            kindBox.appendChild(row(...r));
          };
          drawKind();
          f.append(h('h2', null, it.name), h('div', { class: 'id-line' }, 'id: ' + it.id),
            section('General',
              row(field('Name', it, 'name', { onChange: relist }), field('Kind', it, 'kind', { type: 'select', options: KINDS, onChange: () => { if (it.kind === 'ball' && !it.catchBonus) it.catchBonus = 1; if (it.kind === 'decoration' || it.kind === 'clothing') { it.battleUsable = false; it.fieldUsable = true; DB.draw(); return; } drawKind(); relist(); } }), field('Price', it, 'price', { type: 'number', min: 0 })),
              row(field('Usable in battle', it, 'battleUsable', { type: 'checkbox' }), field('Usable from the field menu', it, 'fieldUsable', { type: 'checkbox' })),
              field('Description', it, 'description', { type: 'textarea', rows: 2 })),
            section('Effect', kindBox));
        }
      });
    },

    /* ---------------- Tilesets ---------------- */
    tab_tilesets(layout) {
      const P = App.proj;
      DB.listTab(layout, {
        items: () => P.tilesets,
        label: t => t.name,
        make: () => ({ id: UI.slug('tileset', P.tilesets.map(t => t.id)), name: 'New Tileset', image: '', tileSize: 16, flags: [] }),
        refs: t => Object.values(P.maps).filter(m => m.tilesetId === t.id).length,
        form: (f, t, relist) => {
          let mode = DB.tileMode || 'pass';
          const cv = h('canvas', { class: 'tile-flags' });
          const modeBox = h('div', { class: 'tb-group seg', style: { margin: '6px 0' } });
          const drawModes = () => {
            clear(modeBox);
            [['pass', 'Passability (○ walk · × block · ☆ over)'], ['enc', 'Encounter tiles (♣)'], ['auto', 'Autotiles & animation'], ['name', 'Tile names']].forEach(([k, n]) => modeBox.appendChild(h('button', { class: mode === k ? 'active' : '', onclick: () => { mode = DB.tileMode = k; drawModes(); paint(); } }, n)));
          };
          let img = null;
          const paint = () => {
            const g = cv.getContext('2d');
            if (!img) { cv.width = 300; cv.height = 40; g.fillStyle = '#888'; g.font = '13px sans-serif'; g.fillText(t.image ? 'Image missing' : 'Choose or import a tileset image', 8, 24); return; }
            const ts = t.tileSize || 16, cols = Math.floor(img.width / ts), rows = Math.floor(img.height / ts);
            const z = Math.max(1, Math.min(4, Math.floor(640 / (cols * ts))));
            cv.width = cols * ts * z; cv.height = rows * ts * z;
            g.imageSmoothingEnabled = false;
            g.drawImage(img, 0, 0, cols * ts, rows * ts, 0, 0, cv.width, cv.height);
            t.flags = t.flags || [];
            while (t.flags.length < cols * rows) t.flags.push({ pass: true, enc: false, over: false });
            const S = ts * z;
            const parts = MF.Tiles.partsOf(t, cols);
            g.font = 'bold ' + Math.max(11, S * .5) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            for (let i = 0; i < cols * rows; i++) {
              const fl = t.flags[i], x = (i % cols) * S, y = Math.floor(i / cols) * S;
              g.fillStyle = parts[i] !== undefined ? 'rgba(10,12,18,.72)' : 'rgba(0,0,0,.4)'; g.fillRect(x, y, S, S);
              let mark, col;
              if (parts[i] !== undefined) { mark = mode === 'auto' ? '·' : ''; col = '#666'; }
              else if (mode === 'pass') { mark = fl.over ? '☆' : fl.pass ? '○' : '×'; col = fl.pass ? '#cfe3ff' : '#ff6b7a'; }
              else if (mode === 'enc') { mark = fl.enc ? '♣' : '·'; col = fl.enc ? '#7dff9a' : '#777'; }
              else if (mode === 'auto') { mark = (fl.auto ? 'A' : '') + (fl.anim > 1 ? '▶' + fl.anim : '') || '·'; col = (fl.auto || fl.anim > 1) ? '#ffd28a' : '#777'; }
              else { mark = (t.names && t.names[i]) ? '✎' : String(i); col = (t.names && t.names[i]) ? '#ffd28a' : '#888'; }
              g.fillStyle = col; g.fillText(mark, x + S / 2, y + S / 2);
              g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(x + .5, y + .5, S - 1, S - 1);
            }
            const at = e => { const r = cv.getBoundingClientRect(); return Math.floor((e.clientY - r.top) / S) * cols + Math.floor((e.clientX - r.left) / S); };
            cv.onmousemove = e => { let i = at(e); if (parts[i] !== undefined) i = parts[i]; const fl = t.flags[i]; if (!fl) return; hover.textContent = 'Tile ' + i + ': ' + ((t.names && t.names[i]) || '(no name)') + ' · ' + (fl.over ? 'walkable, drawn above the player' : fl.pass ? 'walkable' : 'blocked') + (fl.enc ? ' · wild encounters' : '') + (fl.auto ? ' · autotile' : '') + (fl.anim > 1 ? ' · ' + fl.anim + ' animation frames' : ''); };
            cv.onclick = async e => {
              let i = at(e);
              if (parts[i] !== undefined) i = parts[i]; // clicks inside a block act on its first tile
              const fl = t.flags[i]; if (!fl) return;
              if (mode === 'auto') {
                const o = { auto: !!fl.auto, anim: fl.anim > 1 ? fl.anim : 1 };
                App._suppressDirty = true;
                const ok = await UI.modal({ title: 'Tile ' + i + ((t.names && t.names[i]) ? ' · ' + t.names[i] : ''), size: 'small', body: h('div', null,
                  field('Autotile: this tile starts a 2×3 block (RPG Maker A2 layout) that joins up with matching neighbours', o, 'auto', { type: 'checkbox' }),
                  field('Animation frames (1 = not animated). Frames sit side by side to the right; 2 tiles apart for autotiles.', o, 'anim', { type: 'number', min: 1, max: 8 }),
                  h('p', { class: 'muted' }, 'Autotile block: top row = a preview tile and the inner corners; the 2×2 tiles below = the edges and corners of a patch. Paint with the first tile and the edges are worked out for you.')),
                  buttons: [{ label: 'Cancel', value: false }, { label: 'Save', primary: true, value: true }] });
                App._suppressDirty = false;
                if (!ok) return;
                const step = o.auto ? 2 : 1, frames = Math.max(1, Math.min(8, o.anim | 0));
                const needCols = (i % cols) + step * frames, needRows = Math.floor(i / cols) + (o.auto ? 3 : 1);
                if (needCols > cols || needRows > rows) return UI.alert('Not enough room', 'That needs ' + (step * frames) + ' columns and ' + (o.auto ? 3 : 1) + ' rows of tiles from here, which runs past the edge of the image.');
                fl.auto = o.auto || undefined; fl.anim = frames > 1 ? frames : undefined;
                if (!fl.auto) delete fl.auto; if (!fl.anim) delete fl.anim;
                App.markDirty(); return paint();
              }
              if (mode === 'name') { t.names = t.names || []; const n = await UI.prompt('Tile ' + i + ' name', t.names[i] || '', 'Name shown in the editor'); if (n !== null && n !== false) { t.names[i] = n; App.markDirty(); paint(); } return; }
              if (mode === 'pass') { if (fl.over) { fl.over = false; fl.pass = true; } else if (fl.pass) fl.pass = false; else { fl.pass = true; fl.over = true; } }
              else fl.enc = !fl.enc;
              App.markDirty(); paint();
            };
          };
          const reload = () => { UI.loadImage(t.image).then(i => { img = i; paint(); }); };
          drawModes(); reload();
          const hover = h('div', { class: 'muted', style: { minHeight: '18px', margin: '4px 0' } }, 'Point at a tile to see its name and settings.');
          f.append(h('h2', null, t.name), h('div', { class: 'id-line' }, 'id: ' + t.id + (t.library ? '  ·  from the asset library' : '')),
            section('General', row(field('Name', t, 'name', { onChange: relist }), field('Tile size (px)', t, 'tileSize', { type: 'number', min: 8, max: 128, onChange: reload }),
                field('Animation speed (ms per frame)', t, 'animSpeed', { type: 'number', min: 60, max: 2000, width: '200px', help: 'How fast animated tiles change frame. 300 is a gentle ripple.' })),
              UI.assetPicker('Image (a grid of tiles, any number of columns)', t, 'image', 'tilesets', { onChange: reload }),
              h('div', { class: 'row' },
                h('button', { class: 'small', title: 'Replace these tile settings with the ones saved in the asset library', onclick: async () => { if (await AssetLib.applyMapping(t)) paint(); } }, 'Load settings from library'),
                h('button', { class: 'small', title: 'Save these tile names and settings into the asset library so other projects can use them', onclick: () => AssetLib.saveMapping(t) }, 'Save settings to library'))),
            section('Tile flags', modeBox, hover, h('div', { style: { overflow: 'auto', maxHeight: '60vh' } }, cv),
              h('p', { class: 'muted' }, '○ walkable · × blocks movement · ☆ walkable and drawn above the player (tree tops, roofs). ♣ marks tall grass, caves or water where wild monsters appear. A = autotile, ▶ = animated. Darkened tiles are parts of an autotile block or later animation frames.')));
        }
      });
    },

    /* ---------------- Menus & screens ---------------- */
    async tab_menus(layout) {
      const P = App.proj, S = P.system;
      Object.assign(S, MF.Config.withDefaults(S));
      await UI.refreshAssets();
      const f = h('div', { class: 'db-form' });
      layout.appendChild(f);
      // An on/off list of menu entries with editable names and ▲▼ to reorder.
      const entryList = (list, note) => {
        const box = h('div', { class: 'entry-list' });
        const draw = () => {
          clear(box);
          list.forEach((e, i) => {
            const cb = h('input', { type: 'checkbox', checked: !!e.on }); cb.addEventListener('change', () => { e.on = cb.checked; App.markDirty(); });
            const nm = h('input', { type: 'text', value: e.label }); nm.addEventListener('input', () => { e.label = nm.value; App.markDirty(); });
            box.appendChild(h('div', { class: 'entry-row' }, cb, nm, h('span', { class: 'muted entry-id' }, e.id),
              h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; App.markDirty(); draw(); } }, '▲'),
              h('button', { class: 'icon-btn', title: 'Move down', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; App.markDirty(); draw(); } }, '▼')));
          });
          if (note) box.appendChild(h('p', { class: 'muted' }, note));
        };
        draw();
        return box;
      };
      // Pick a text file for credits or a licence: import one, write one here, and preview it.
      const textChooser = (obj, key, defName) => {
        const wrap = h('div');
        const draw = async () => {
          clear(wrap);
          const files = App.assets.text || [];
          const sel = h('select', null, h('option', { value: '' }, '(none)'), files.map(r => h('option', { value: r, selected: obj[key] === r }, r.split('/').pop())));
          sel.addEventListener('change', () => { obj[key] = sel.value; App.markDirty(); draw(); });
          const prev = h('pre', { class: 'text-preview' }, '…');
          wrap.append(h('div', { class: 'asset-row' }, sel,
            h('button', { class: 'small', onclick: async () => { const got = await UI.importAssets('text'); if (got.length) { obj[key] = got[0]; App.markDirty(); draw(); } } }, 'Import .txt / .md…'),
            h('button', { class: 'small', onclick: async () => {
              const bytes = obj[key] ? await window.api.readAsset(P.path, obj[key]) : null;
              const ta = h('textarea', { rows: 16, style: { width: '100%', fontFamily: 'monospace' } }, bytes ? new TextDecoder().decode(bytes) : '');
              const nm = { v: obj[key] ? obj[key].split('/').pop() : defName };
              App._suppressDirty = true;
              const ok = await UI.modal({ title: 'Write ' + defName, body: h('div', null, field('File name', nm, 'v'), ta, h('p', { class: 'muted' }, 'Plain text. Lines starting with # are headings and lines starting with - are list items.')), buttons: [{ label: 'Cancel', value: false }, { label: 'Save', primary: true, value: true }] });
              App._suppressDirty = false;
              if (!ok) return;
              const rel = await window.api.writeText(P.path, nm.v, ta.value);
              await UI.refreshAssets('text');
              obj[key] = rel; P.credits[rel] = P.credits[rel] || { name: nm.v, origin: 'Written in Pocket-Game-Maker', author: '', licence: 'Not set', status: 'Custom' };
              App.markDirty(); draw();
            } }, obj[key] ? 'Edit…' : 'Write one…')), prev);
          if (obj[key]) { const b = await window.api.readAsset(P.path, obj[key]); prev.textContent = b ? new TextDecoder().decode(b).slice(0, 1200) : '(file missing)'; }
          else prev.textContent = '(no file chosen)';
        };
        draw();
        return wrap;
      };
      const t = S.titleScreen, M = S.menus, terms = S.terms;
      const credSrc = h('div');
      const drawCred = () => { clear(credSrc); credSrc.append(field('Credits come from', t.credits, 'source', { type: 'select', options: [['auto', 'Automatic: built from Database → Credits'], ['file', 'My own credits file']], onChange: drawCred }),
        t.credits.source === 'file' ? textChooser(t.credits, 'file', 'credits.txt') : h('p', { class: 'muted' }, 'Lists every image, track and sound with its author and licence, from the Credits tab.')); };
      drawCred();
      f.append(h('h2', null, 'Menus & screens'), h('div', { class: 'id-line' }, 'The title (start) screen, the in-game menu, the bag, and the words your game uses.'),
        section('Title screen',
          row(field('Show the game title', t, 'showTitle', { type: 'checkbox' }), field('Subtitle (blank for none)', t, 'subtitle'), field('Text colour', t, 'textColour', { type: 'color', width: '110px' })),
          row(UI.assetPicker('Background picture (blank = the default glow)', t, 'background', 'pictures'),
            h('div', null, field('Menu position', t, 'menuPosition', { type: 'select', options: [['centre', 'Centre'], ['bottom', 'Bottom'], ['left', 'Left']] }),
              h('p', { class: 'muted' }, 'Title music is set in Music & sounds.'))),
          h('div', { class: 'field' }, h('span', null, 'Start menu (tick to show, rename, ▲▼ to reorder)'), entryList(t.menu, 'Continue is greyed out until there is a save. Quit closes the game window.'))),
        section('Credits screen', field('Heading', t.credits, 'heading'), credSrc),
        section('Licence screen', field('Heading', t.licence, 'heading'), textChooser(t.licence, 'file', 'licence.txt'),
          h('p', { class: 'muted' }, 'Your game\'s licence or terms, shown when the player picks Licence on the start menu. Turn the Licence entry on above.')),
        section('In-game menu (X / Esc while walking)', entryList(M.main, '{dex} is replaced by your word for the monster database below. Close is always available with X.'),
          field('Show money in the menu', M, 'showMoney', { type: 'checkbox' })),
        section('Bag shortcuts', h('p', { class: 'muted', style: { marginTop: 0 } }, 'Ticked shortcuts appear at the top of the bag, so players can open them from there. For example, tick Storage to let players reach monster storage from the bag, and untick Storage in the in-game menu above if it should only be there.'),
          entryList(M.bag), h('p', { class: 'muted' }, 'You can also make an item that opens a screen: in Items, choose the kind “Tool” (for example a “Storage Box” key item).')),
        section('Words used in the game', h('div', { class: 'slot-grid' }, MF.Config.TERMS.map(([k, , help]) => field(help, terms, k)))),
        section('Touch screens', field('On-screen buttons (a direction pad and A / B buttons) for phones and tablets', S, 'touchControls', { type: 'select', options: [['auto', 'Show them on touch screens (recommended)'], ['always', 'Always show them'], ['never', 'Never show them']] })),
        section('Following monster', field('The first monster in the party walks behind the player', S.follower, 'enabled', { type: 'checkbox' }),
          field('The player can talk to it (face it and press the action button)', S.follower, 'talk', { type: 'checkbox' }),
          h('p', { class: 'muted' }, 'Give a monster a walking sprite in Monsters → Sprites to use a proper walking animation; otherwise its front picture hops along behind the player.')),
        DB.optionalFeatures(S));
    },
    optionalFeatures(S) {
      const P = App.proj;
      const decorItems = P.items.filter(i => i.kind === 'decoration'), clothes = P.items.filter(i => i.kind === 'clothing');
      const homes = Object.values(P.maps).filter(m => m.decoratable);
      const slotOpts = slot => [['', slot === 'outfit' ? 'Usual clothes (the player sprite)' : 'None']].concat(clothes.filter(c => (c.wear || {}).slot === slot).map(c => [c.id, c.name]));
      S.wardrobe.start = S.wardrobe.start || {};
      return section('Optional features for players',
        h('div', { class: 'feature-box' },
          field('Decorating: players buy furniture and place it in their home, turning it to face any way', S.decorating, 'enabled', { type: 'checkbox', onChange: () => DB.draw() }),
          S.decorating.enabled ? h('div', { class: 'feature-detail' },
            h('p', { class: 'muted' }, decorItems.length + ' decoration item' + (decorItems.length === 1 ? '' : 's') + ' · ' + (homes.length ? 'players can decorate: ' + homes.map(m => m.name).join(', ') : 'no map is marked for decorating yet: tick “Players can decorate this map” in a map\'s properties')),
            h('p', { class: 'muted' }, 'In the game, Decorate appears in the menu on those maps (rename or reorder it in the in-game menu list above). Players place items from the bag, then face an item and press the action button to turn it, move it or put it away. Placed items are saved with the game.'),
            h('button', { class: 'small', onclick: () => DB.addFromLibrary('decoration') }, 'Add the library\'s furniture as items')) : null),
        h('div', { class: 'feature-box' },
          field('Wardrobe: players change the player character\'s clothes', S.wardrobe, 'enabled', { type: 'checkbox', onChange: () => DB.draw() }),
          S.wardrobe.enabled ? h('div', { class: 'feature-detail' },
            h('p', { class: 'muted' }, clothes.length + ' clothing item' + (clothes.length === 1 ? '' : 's') + '. Players choose what to wear from Wardrobe in the menu, or by using clothes from the bag. Only clothes in the bag can be worn.'),
            h('div', { class: 'slot-grid' }, Home_SLOTS.map(([s, label]) => field('Starts wearing: ' + label, S.wardrobe.start, s, { type: 'select', options: slotOpts(s) }))),
            h('button', { class: 'small', onclick: () => DB.addFromLibrary('clothing') }, 'Add the library\'s clothes as items')) : null));
    },

    /* ---------------- Music & sounds ---------------- */
    async tab_audio(layout) {
      const P = App.proj;
      await UI.refreshAssets();
      P.system.audio = MF.Audio.withDefaults(P.system.audio, rel => [].concat(App.assets.music || [], App.assets.sounds || []).includes(rel));
      const A = P.system.audio;
      const f = h('div', { class: 'db-form' });
      layout.appendChild(f);
      const draw = () => {
        clear(f);
        const fileList = (kind, title) => {
          const files = App.assets[kind] || [];
          const tbl = h('table', { class: 'grid audio-files' }, h('tr', null, h('th'), h('th', null, 'File'), h('th', null, 'Status'), h('th', null, 'Licence')));
          files.forEach(rel => {
            const c = (P.credits || {})[rel];
            tbl.appendChild(h('tr', null, h('td', null, UI.audioButton(() => rel)), h('td', null, rel.split('/').pop()), h('td', null, c ? c.status : h('span', { class: 'muted' }, 'Not recorded')), h('td', null, c ? c.licence : '')));
          });
          if (!files.length) tbl.appendChild(h('tr', null, h('td', { colspan: 4, class: 'muted' }, 'None yet.')));
          return h('div', { class: 'audio-col' }, h('div', { class: 'row', style: { alignItems: 'center' } }, h('h3', { style: { margin: 0, flex: 1 } }, title + ' (' + files.length + ')'),
            h('button', { class: 'small', title: 'Copy MP3 or FLAC files into assets/' + kind, onclick: async () => { const got = await UI.importAssets(kind); if (got.length) draw(); } }, 'Import MP3 / FLAC…')), tbl);
        };
        const slot = (obj, key, label, kind, alsoMusic) => UI.audioPicker(label, obj, key, kind, { alsoMusic, none: '(silent)' });
        const missingPresets = !(App.assets.music || []).length || !(App.assets.sounds || []).length;
        f.append(...[h('h2', null, 'Music & sounds'),
          h('div', { class: 'id-line' }, 'Background music, jingles and sound effects. Import your own as MP3 or FLAC files; they are copied into the project\'s assets/music and assets/sounds folders.'),
          missingPresets ? h('div', { class: 'callout' }, h('span', null, 'This project has no music or sounds yet. Pocket-Game-Maker comes with free presets (CC0) you can use until you have your own.'),
            h('button', { class: 'primary small', onclick: async () => {
              const lib = await window.api.libraryList();
              const keys = lib.items.filter(i => i.kind === 'music' || i.kind === 'sounds').map(i => i.key);
              const r = await window.api.libraryAdd(P.path, keys, false, P.tilesets.map(t => t.id));
              P.credits = Object.assign(P.credits || {}, r.credits || {});
              await UI.refreshAssets();
              const has = rel => [].concat(App.assets.music || [], App.assets.sounds || []).includes(rel);
              MF.Audio.MUSIC_SLOTS.concat(MF.Audio.JINGLE_SLOTS).forEach(([k, , d]) => { if (!A[k] && has(d)) A[k] = d; });
              MF.Audio.SFX_SLOTS.forEach(([k, , d]) => { if (!A.sfx[k] && has(d)) A.sfx[k] = d; });
              App.markDirty(); UI.toast('Added ' + r.copied.length + ' music and sound files'); draw();
            } }, 'Add the free presets')) : null,
          section('Volume', row(field('Music volume %', A, 'bgmVolume', { type: 'number', min: 0, max: 100, width: '160px' }), field('Sound effect volume %', A, 'sfxVolume', { type: 'number', min: 0, max: 100, width: '180px' }))),
          section('Game music', h('div', { class: 'slot-grid' }, MF.Audio.MUSIC_SLOTS.map(([k, label]) => slot(A, k, label, 'music'))),
            h('p', { class: 'muted' }, 'Each map can have its own music too: pick it under Map properties → Music. A trainer battle can override the battle music.')),
          section('Jingles (play once, then the music carries on)', h('div', { class: 'slot-grid' }, MF.Audio.JINGLE_SLOTS.map(([k, label]) => slot(A, k, label, 'music')))),
          section('Sound effects', h('div', { class: 'slot-grid' }, MF.Audio.SFX_SLOTS.map(([k, label]) => slot(A.sfx, k, label, 'sounds')))),
          section('Files in this project', h('div', { class: 'audio-cols' }, fileList('music', 'Music and jingles'), fileList('sounds', 'Sound effects')),
            h('p', { class: 'muted' }, 'Music loops when it is used as background music. Origins and licences are listed in the Credits tab.'))].filter(Boolean));
      };
      draw();
    },

    /* ---------------- Credits ---------------- */
    async tab_credits(layout) {
      const P = App.proj; P.credits = P.credits || {};
      await UI.refreshAssets();
      const f = h('div', { class: 'db-form' });
      layout.appendChild(f);
      let filter = 'all';
      const draw = () => {
        clear(f);
        const files = [...new Set([].concat(...['tilesets', 'characters', 'monsters', 'battlebacks', 'pictures', 'decorations', 'music', 'sounds'].map(k => App.assets[k] || [])))];
        const rowsAll = files.map(rel => ({ rel, c: P.credits[rel] }));
        const counts = { all: rowsAll.length, Placeholder: 0, Custom: 0, 'Third-party': 0, missing: 0 };
        rowsAll.forEach(r => { if (!r.c) counts.missing++; else if (counts[r.c.status] !== undefined) counts[r.c.status]++; });
        const shown = rowsAll.filter(r => filter === 'all' || (filter === 'missing' ? !r.c : r.c && r.c.status === filter));
        const seg = h('div', { class: 'tb-group seg', style: { margin: '6px 0 10px' } }, [['all', 'All'], ['Placeholder', 'Placeholder'], ['Custom', 'Custom'], ['Third-party', 'Third-party'], ['missing', 'Not recorded']].map(([k, n]) =>
          h('button', { class: filter === k ? 'active' : '', onclick: () => { filter = k; draw(); } }, n + ' (' + counts[k] + ')')));
        const tbl = h('table', { class: 'grid credits' }, h('tr', null, h('th', null, ''), h('th', null, 'File'), h('th', null, 'Status'), h('th', null, 'Origin'), h('th', null, 'Author'), h('th', null, 'Licence'), h('th')));
        shown.forEach(({ rel, c }) => {
          const thumb = MF.Audio.RE.test(rel) ? UI.audioButton(() => rel) : h('img', { src: UI.assetUrl(rel), class: 'credit-thumb' });
          if (!c) {
            tbl.appendChild(h('tr', { class: 'missing' }, h('td', null, thumb), h('td', null, rel), h('td', { colspan: 4, class: 'muted' }, 'No origin or licence recorded'),
              h('td', null, h('button', { class: 'small', onclick: () => { P.credits[rel] = { name: rel.split('/').pop().replace(/\.[^.]+$/, ''), origin: '', author: '', licence: 'Not set', status: 'Custom' }; App.markDirty(); draw(); } }, 'Add'))));
            return;
          }
          const inp = (k, w) => { const i = h('input', { type: 'text', value: c[k] || '', style: { width: w } }); i.addEventListener('input', () => { c[k] = i.value; App.markDirty(); }); return i; };
          const st = h('select', null, ['Placeholder', 'Custom', 'Third-party'].map(s => h('option', { value: s, selected: c.status === s }, s)));
          st.addEventListener('change', () => { c.status = st.value; App.markDirty(); draw(); });
          tbl.appendChild(h('tr', null, h('td', null, thumb), h('td', null, rel), h('td', null, st), h('td', null, inp('origin', '100%')), h('td', null, inp('author', '120px')), h('td', null, inp('licence', '150px')),
            h('td', null, h('button', { class: 'icon-btn', title: 'Remove this entry', onclick: () => { delete P.credits[rel]; App.markDirty(); draw(); } }, '✕'))));
        });
        f.append(h('h2', null, 'Credits'),
          h('div', { class: 'id-line' }, 'Where every image, music track and sound in this game came from and its licence. Saved to CREDITS.md in the project folder each time you save.'),
          seg, tbl,
          h('p', { class: 'muted' }, 'Placeholder = built-in Pocket-Game-Maker art or audio (CC0) you plan to replace. When you swap in your own art, set it to Custom; for art from another artist or pack, use Third-party and copy their credit line into Origin.'));
      };
      draw();
    },

    /* ---------------- System ---------------- */
    tab_system(layout) {
      const P = App.proj, S = P.system, B = S.battle;
      const f = h('div', { class: 'db-form' });
      const mapSel = (o) => field('Map', o, 'mapId', { type: 'select', options: P.mapInfos.map(i => [i.id, i.name]) });
      const dirSel = (o) => field('Facing', o, 'dir', { type: 'select', options: [['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up']] });

      const partyBox = h('div');
      const drawParty = () => {
        clear(partyBox);
        S.startingParty.forEach((p, i) => {
          const sel = h('select', null, P.monsters.map(m => h('option', { value: m.id, selected: m.id === p.speciesId }, m.name)));
          sel.addEventListener('change', () => { p.speciesId = sel.value; App.markDirty(); });
          const lv = h('input', { type: 'number', value: p.level, min: 1 }); lv.addEventListener('input', () => { p.level = +lv.value; App.markDirty(); });
          partyBox.appendChild(h('div', { class: 'party-row' }, sel, h('span', { class: 'muted' }, 'Lv'), lv, h('button', { class: 'icon-btn', onclick: () => { S.startingParty.splice(i, 1); App.markDirty(); drawParty(); } }, '✕')));
        });
        partyBox.appendChild(h('button', { class: 'small', disabled: !P.monsters.length, onclick: () => { S.startingParty.push({ speciesId: P.monsters[0].id, level: 5 }); App.markDirty(); drawParty(); } }, '+ Add'));
      };
      drawParty();

      const itemsBox = h('div');
      const drawItems = () => {
        clear(itemsBox);
        Object.keys(S.startingItems).forEach(id => {
          const it = P.items.find(i => i.id === id);
          const n = h('input', { type: 'number', value: S.startingItems[id], min: 0 }); n.addEventListener('input', () => { S.startingItems[id] = +n.value; App.markDirty(); });
          itemsBox.appendChild(h('div', { class: 'party-row' }, h('span', { style: { flex: 1 } }, it ? it.name : id + ' (missing)'), n, h('button', { class: 'icon-btn', onclick: () => { delete S.startingItems[id]; App.markDirty(); drawItems(); } }, '✕')));
        });
        const sel = h('select', null, P.items.filter(i => !(i.id in S.startingItems)).map(i => h('option', { value: i.id }, i.name)));
        itemsBox.appendChild(h('div', { class: 'party-row' }, sel, h('button', { class: 'small', onclick: () => { if (!sel.value) return; S.startingItems[sel.value] = 1; App.markDirty(); drawItems(); } }, '+ Add')));
      };
      drawItems();

      const swBox = h('div');
      const drawSw = () => {
        clear(swBox);
        S.switches.forEach((s, i) => {
          if (i === 0) return;
          const inp = h('input', { type: 'text', value: s }); inp.addEventListener('input', () => { S.switches[i] = inp.value; App.markDirty(); });
          swBox.appendChild(h('div', { class: 'party-row' }, h('span', { class: 'muted', style: { width: '34px' } }, String(i).padStart(3, '0')), inp));
        });
        swBox.appendChild(h('button', { class: 'small', onclick: () => { S.switches.push(''); App.markDirty(); drawSw(); } }, '+ Add switch'));
      };
      drawSw();

      const immBox = h('div', { class: 'row' });
      [['psn', 'Poison'], ['brn', 'Burn'], ['par', 'Paralysis'], ['slp', 'Sleep']].forEach(([k, n]) => {
        const list = S.statusImmunity[k] = S.statusImmunity[k] || [];
        immBox.appendChild(h('div', { class: 'field' }, h('span', null, n + ' immune types'),
          h('div', null, P.types.types.map(t => {
            const cb = h('input', { type: 'checkbox', checked: list.includes(t.id) });
            cb.addEventListener('change', () => { const i = list.indexOf(t.id); if (cb.checked && i < 0) list.push(t.id); if (!cb.checked && i >= 0) list.splice(i, 1); App.markDirty(); });
            return h('label', { style: { display: 'block', fontSize: '12px' } }, cb, ' ', t.name);
          }))));
      });

      f.append(h('h2', null, 'System'), h('div', { class: 'id-line' }, 'Game-wide settings.'),
        section('Game', row(field('Title', S, 'title'), field('Currency name', S, 'currency'), field('Starting money', S, 'startMoney', { type: 'number', min: 0 })),
          row(field('Screen width (px)', S.screen, 'width', { type: 'number', min: 160 }), field('Screen height (px)', S.screen, 'height', { type: 'number', min: 120 }), field('Window scale', S.screen, 'scale', { type: 'number', min: 1, max: 6, help: 'The game renders at width×height and is scaled up by this factor. For 16px tiles, 320×240 at ×2 is a classic handheld look.' }))),
        section('Player', row(field('Default name', S.player, 'name'), field('Walk speed (1–8)', S.player, 'moveSpeed', { type: 'number', min: 1, max: 8 })),
          UI.assetPicker('Player sprite (3×4 character sheet)', S.player, 'sprite', 'characters', { preview: 'charFrame' })),
        section('Start position', row(mapSel(S.start), field('X', S.start, 'x', { type: 'number', width: '70px' }), field('Y', S.start, 'y', { type: 'number', width: '70px' }), dirSel(S.start)),
          h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Tip: in Events mode, right-click a tile and choose “Set player start here”.')),
        section('Blackout (all monsters fainted)', row(mapSel(S.respawn), field('X', S.respawn, 'x', { type: 'number', width: '70px' }), field('Y', S.respawn, 'y', { type: 'number', width: '70px' }), dirSel(S.respawn)),
          field('Message', S.respawn, 'message')),
        section('Starting party & bag', row(h('div', { class: 'field' }, h('span', null, 'Party'), partyBox), h('div', { class: 'field' }, h('span', null, 'Items'), itemsBox))),
        section('Battle rules',
          row(field('Max party size', B, 'maxParty', { type: 'number', min: 1, max: 12 }), field('Moves per monster', B, 'maxMoves', { type: 'number', min: 1, max: 8 }), field('Max level', B, 'maxLevel', { type: 'number', min: 1, max: 999 })),
          row(field('Wild battle size (wild monsters at once)', B, 'wildActive', { type: 'number', min: 1, max: 4, help: '1 = singles. 2+ spawns that many wild monsters at once (hordes); capture is only allowed when one is left.' }),
            field('Trainer battle size (active per side)', B, 'trainerActive', { type: 'number', min: 1, max: 4, help: 'Default for trainer battles. Each Trainer battle command can override it.' })),
          row(field('Critical chance (0–1)', B, 'critChance', { type: 'number', min: 0, max: 1, step: 0.01 }), field('Critical multiplier', B, 'critMultiplier', { type: 'number', min: 1, step: 0.1 }), field('Same-type bonus (STAB)', B, 'stab', { type: 'number', min: 1, step: 0.1 })),
          row(field('Exp multiplier', B, 'expMultiplier', { type: 'number', min: 0, step: 0.1 }), field('Trainer exp bonus', B, 'trainerExpBonus', { type: 'number', min: 1, step: 0.1 }), field('Allow running from trainers', B, 'allowRunFromTrainer', { type: 'checkbox' }))),
        section('Status immunities', immBox),
        section('Default battle background', UI.assetPicker('Used when a map has none', S, 'defaultBattleback', 'battlebacks')),
        section('Switches (global on/off flags for story progress)', swBox));
      layout.appendChild(f);
    }
  };
})();
