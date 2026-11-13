/* Height mode (H) in the map editor: paint height levels and stairs, drag ready-made hills and cliffs onto the map,
   and the map's 2.5D view settings. The data and walking rules are in src/shared/heights.js; the game draws them
   in src/runtime/view25.js. */
(function () {
  'use strict';
  const { h, field, row } = UI;
  const HG = MF.Heights;
  const LEVEL_COLOURS = ['rgba(0,0,0,0)', 'rgba(70,160,255,.4)', 'rgba(254,231,97,.45)', 'rgba(247,118,34,.48)', 'rgba(228,59,68,.52)'];
  const TOOLS = [
    ['set', '▤ Set level', 'Paint the chosen level'],
    ['raise', '▲ Raise', 'Raise the ground one level'],
    ['lower', '▼ Lower', 'Lower the ground one level'],
    ['stairs', '☰ Stairs', 'Paint stairs (click stairs again to remove them). Stairs join squares one level apart.'],
    ['flat', '⌫ Flatten', 'Back to level 0, no stairs']
  ];

  const HT = window.HeightTools = {
    tool: 'set', level: 1, size: 1, dragShape: null, dropAt: null,

    /* ---------- painting ---------- */
    down(c, e) {
      const m = App.map();
      if (e.button === 2) { HT.level = HG.get(m, c.x, c.y); HT.tool = 'set'; App.renderInspector(); UI.toast('Level ' + HT.level + ' picked'); return; }
      if (e.button !== 0) return;
      if (HT.armed) { const sh = HT.armed; HT.armed = null; HT.placeShape(sh, c.x, c.y); return; } // a shape chosen by clicking its chip
      MapEditor.pushUndo();
      HG.ensure(m);
      HT.stairsOn = HT.tool === 'stairs' ? !HG.isStairs(m, c.x, c.y) : null; // one stroke either adds or removes stairs
      HT.done = new Set();
      MapEditor.drag = { kind: 'height' };
      HT.paint(c.x, c.y);
    },
    paint(x, y) {
      const m = App.map(), n = HT.size, o = Math.floor((n - 1) / 2);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const cx = x - o + i, cy = y - o + j;
        if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) continue;
        const k = cy * m.width + cx;
        if (HT.done.has(k)) continue; // raise / lower once per square per stroke
        HT.done.add(k);
        const cur = m.heights[k] | 0;
        if (HT.tool === 'set') m.heights[k] = HT.level;
        else if (HT.tool === 'raise') m.heights[k] = Math.min(HG.MAX, cur + 1);
        else if (HT.tool === 'lower') m.heights[k] = Math.max(0, cur - 1);
        else if (HT.tool === 'stairs') m.stairs[k] = HT.stairsOn ? 1 : 0;
        else if (HT.tool === 'flat') { m.heights[k] = 0; m.stairs[k] = 0; }
      }
      App.markDirty(); MapEditor.render();
    },
    up() { const m = App.map(); if (m) HG.tidy(m); App.renderInspector(); },

    /* ---------- drawing on the editor's map ---------- */
    // Height mode: coloured levels, numbers and stairs. Other modes: just the cliff edges, so the shape stays visible.
    drawOverlay(g, m, S) {
      if (!HG.hasHeights(m)) return;
      const full = App.mode === 'height';
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        const hh = HG.get(m, x, y), st = HG.isStairs(m, x, y);
        if (full && hh) { g.fillStyle = LEVEL_COLOURS[hh]; g.fillRect(x * S, y * S, S, S); }
        if (full && st) {
          g.fillStyle = 'rgba(255,255,255,.75)';
          for (let k = 1; k < 4; k++) g.fillRect(x * S + S * 0.2, y * S + S * k / 4 - 1, S * 0.6, Math.max(1, S / 16));
        }
        if (full && (hh || st) && S >= 24) {
          g.font = 'bold ' + Math.round(S * 0.32) + 'px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top';
          g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(String(hh), x * S + S - 2, y * S + 3); g.fillStyle = '#fff'; g.fillText(String(hh), x * S + S - 3, y * S + 2);
        }
        // cliff lines: thick where the ground drops towards the viewer (the cliff face), thin on the other sides
        const edge = (dx, dy) => { const x2 = x + dx, y2 = y + dy; return x2 >= 0 && y2 >= 0 && x2 < m.width && y2 < m.height && HG.get(m, x2, y2) < hh && !(Math.abs(HG.get(m, x2, y2) - hh) === 1 && (st || HG.isStairs(m, x2, y2))); };
        if (!hh) continue;
        g.fillStyle = full ? 'rgba(20,16,30,.85)' : 'rgba(20,16,30,.6)';
        const t = Math.max(2, S / 8), th = Math.max(1, S / 16);
        if (edge(0, 1)) g.fillRect(x * S, y * S + S - t, S, t);
        if (edge(0, -1)) g.fillRect(x * S, y * S, S, th);
        if (edge(-1, 0)) g.fillRect(x * S, y * S, th, S);
        if (edge(1, 0)) g.fillRect(x * S + S - th, y * S, th, S);
      }
    },
    drawCursor(g, m, S, hover) {
      if (HT.dropAt && HT.dragShape) {
        const sh = HT.dragShape, at = HT.dropAt;
        g.fillStyle = 'rgba(89,180,255,.25)'; g.strokeStyle = '#59b4ff'; g.lineWidth = 2;
        sh.rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') g.fillRect((at.x + i) * S, (at.y + j) * S, S, S); }));
        g.strokeRect(at.x * S + 1, at.y * S + 1, sh.w * S - 2, sh.h * S - 2);
        return;
      }
      if (!hover) return;
      if (HT.armed) { HT.dropAt = hover; HT.dragShape = HT.armed; HT.drawCursor(g, m, S, null); HT.dropAt = null; HT.dragShape = null; return; }
      const n = HT.size, o = Math.floor((n - 1) / 2);
      g.strokeStyle = HT.tool === 'flat' ? '#ff5c6c' : '#59b4ff'; g.lineWidth = 2;
      g.strokeRect((hover.x - o) * S + 1, (hover.y - o) * S + 1, n * S - 2, n * S - 2);
    },
    status(m, x, y) { return 'Height ' + HG.get(m, x, y) + (HG.isStairs(m, x, y) ? ' · stairs' : ''); },

    /* ---------- drag and drop ---------- */
    initDrop(canvas) {
      canvas.addEventListener('dragover', e => {
        if (!HT.dragShape) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
        const c = MapEditor.cellAt(e); if (!c) return;
        const at = { x: Math.max(0, c.x), y: Math.max(0, c.y) };
        if (!HT.dropAt || HT.dropAt.x !== at.x || HT.dropAt.y !== at.y) { HT.dropAt = at; MapEditor.render(); }
      });
      canvas.addEventListener('dragleave', () => { HT.dropAt = null; MapEditor.render(); });
      canvas.addEventListener('drop', e => {
        if (!HT.dragShape) return;
        e.preventDefault();
        const c = MapEditor.cellAt(e), sh = HT.dragShape;
        HT.dragShape = null; HT.dropAt = null;
        if (!c || !c.inside) return MapEditor.render();
        HT.placeShape(sh, c.x, c.y);
      });
    },
    placeShape(sh, x, y) {
      const m = App.map(); if (!m) return;
      MapEditor.pushUndo();
      HG.applyShape(m, sh, x, y);
      HG.tidy(m);
      App.markDirty(); MapEditor.render(); App.renderInspector();
      UI.toast(sh.name + ' added. Drag more shapes, or paint with the tools to change it.');
    },

    /* ---------- the inspector panel (Height mode) ---------- */
    panel() {
      const m = App.map();
      const levelBtns = h('div', { class: 'ht-levels' }, Array.from({ length: HG.MAX + 1 }, (_, i) => h('button', {
        class: 'ht-level' + (HT.tool === 'set' && HT.level === i ? ' on' : ''), style: { '--lv': LEVEL_COLOURS[i] }, title: 'Level ' + i + (i ? '' : ' (the ground)'),
        onclick: () => { HT.level = i; HT.tool = 'set'; App.renderInspector(); } }, String(i))));
      const tools = h('div', { class: 'ht-tools' }, TOOLS.map(([id, label, tip]) => h('button', { class: 'small' + (HT.tool === id ? ' primary' : ''), title: tip, onclick: () => { HT.tool = id; App.renderInspector(); } }, label)));
      const size = h('div', { class: 'ht-size' }, h('span', { class: 'muted' }, 'Brush'), [1, 2, 3].map(n => h('button', { class: 'small' + (HT.size === n ? ' primary' : ''), onclick: () => { HT.size = n; App.renderInspector(); } }, n + '×' + n)));
      const shapes = h('div', { class: 'ht-shapes' }, HG.SHAPES.map(sh => {
        const chip = h('div', { class: 'ht-shape', draggable: 'true', title: sh.hint + ' Drag it onto the map, or click it and then click the map.' },
          HT.preview(sh), h('div', { class: 'ht-shape-name' }, sh.icon + ' ' + sh.name));
        if (HT.armed === sh) chip.classList.add('on');
        chip.addEventListener('click', () => { HT.armed = HT.armed === sh ? null : sh; App.renderInspector(); if (HT.armed) UI.toast('Click the map to place the ' + sh.name.toLowerCase() + ' (its top-left corner goes where you click).'); });
        chip.addEventListener('dragstart', e => { HT.dragShape = sh; e.dataTransfer.setData('text/plain', 'pgm-shape:' + sh.id); e.dataTransfer.effectAllowed = 'copy'; });
        chip.addEventListener('dragend', () => { HT.dragShape = null; HT.dropAt = null; MapEditor.render(); });
        return chip;
      }));
      const counts = m ? HT.counts(m) : null;
      return App.inspSection('heights', 'Heights (2.5D)',
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Raise the ground to make hills, cliffs and ledges. Players walk between levels on stairs, and can jump down a ledge by walking down the screen.'),
        h('div', { class: 'field' }, h('span', null, 'Level'), levelBtns), tools, size,
        h('div', { class: 'field' }, h('span', null, 'Shapes: drag onto the map'), shapes),
        counts && counts.raised ? h('p', { class: 'muted' }, counts.raised + ' raised squares, ' + counts.stairs + ' stairs, highest level ' + counts.max + '.') : h('p', { class: 'muted' }, 'This map is flat.'),
        h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => HT.preview25(m) }, '▶ Preview in 2.5D'),
          counts && counts.raised ? h('button', { class: 'small danger', onclick: async () => { if (!await UI.confirm('Flatten the map', 'Set every square back to level 0 and remove all stairs?', 'Flatten', true)) return; MapEditor.pushUndo(); delete m.heights; delete m.stairs; App.markDirty(); MapEditor.render(); App.renderInspector(); } }, 'Flatten all') : null),
        h('p', { class: 'muted', style: { fontSize: '11px' } }, 'Right-click a square to pick its level. Coloured squares: blue 1, yellow 2, orange 3, red 4. Thick dark lines show cliff faces.'));
    },
    counts(m) {
      let raised = 0, stairs = 0, max = 0;
      for (let i = 0; i < m.width * m.height; i++) { const v = (m.heights || [])[i] | 0; if (v) raised++; if ((m.stairs || [])[i]) stairs++; if (v > max) max = v; }
      return { raised, stairs, max };
    },
    // A tiny picture of a shape for its chip.
    preview(sh) {
      const c = document.createElement('canvas'), S = 8;
      c.width = Math.max(sh.w, 3) * S; c.height = Math.max(sh.h, 3) * S; c.className = 'ht-shape-pic';
      const g = c.getContext('2d');
      sh.rows.forEach((r, j) => [...r].forEach((ch, i) => {
        if (ch === '.') return;
        const lv = ch === 's' ? 0 : ch === 'S' ? 1 : +ch;
        g.fillStyle = ['#7b8a6b', '#46a0ff', '#fee761', '#f77622', '#e43b44'][lv]; g.fillRect(i * S, j * S, S - 1, S - 1);
        if (ch === 's' || ch === 'S') { g.fillStyle = '#fff'; g.fillRect(i * S + 1, j * S + 2, S - 3, 1); g.fillRect(i * S + 1, j * S + 5, S - 3, 1); }
      }));
      return c;
    },
    // Playtest this map, starting near the middle on a walkable square, so the 2.5D look can be seen straight away.
    preview25(m) {
      if (!m) return;
      const st = App.proj.system.start;
      if (st && st.mapId === m.id) return App.playtest({ mapId: m.id, x: st.x, y: st.y, dir: st.dir || 'down' });
      const ts = App.tileset(), cx = Math.floor(m.width / 2), cy = Math.floor(m.height / 2);
      let best = null;
      for (let r = 0; r < Math.max(m.width, m.height) && !best; r++) for (let y = cy - r; y <= cy + r && !best; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
        if (MF.Layers.cellFlags(m, ts, x, y).pass && !m.events.some(e => e.x === x && e.y === y)) { best = { x, y }; break; }
      }
      App.playtest({ mapId: m.id, x: (best || { x: cx }).x, y: (best || { y: cy }).y, dir: 'down' });
    },

    // Map properties → 2.5D view (every mode).
    viewSection(m) {
      const v = m.view = Object.assign({}, HG.VIEW_DEFAULTS, m.view || {});
      const redraw = () => App.renderInspector();
      return App.inspSection('view25', '2.5D view',
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'How the game shows this map. Height levels are painted in Height mode (H).'),
        field('Camera', v, 'camera', { type: 'select', options: HG.CAMERAS, onChange: redraw }),
        v.camera === 'tilted' ? row(field('Tilt', v, 'tilt', { type: 'select', options: HG.TILTS, number: true }),
          field('Mist in the distance', v, 'haze', { type: 'select', options: [[0, 'None'], [0.15, 'Light'], [0.3, 'Medium'], [0.5, 'Heavy']], number: true })) : null,
        row(field('Height of each level', v, 'step', { type: 'select', options: HG.STEPS, number: true }),
          field('Cliff faces', v, 'cliff', { type: 'select', options: Object.entries(HG.CLIFFS).map(([k, c]) => [k, c.name]) })),
        field('Beyond the edge of the map', v, 'sky', { type: 'color', width: '120px', help: 'The colour shown past the edges of the map: sky for an outdoor map, black for a cave.' }),
        field('Players can jump down ledges (walking down the screen)', v, 'ledges', { type: 'checkbox' }),
        field('Characters cast shadows', v, 'shadows', { type: 'checkbox' }),
        h('div', { class: 'row' }, h('button', { class: 'small', onclick: () => HT.preview25(m) }, '▶ Preview in 2.5D')));
    }
  };
})();
