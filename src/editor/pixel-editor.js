/* Pixel editor: draw and edit tilesets, character sheets, monsters, furniture, clothes and backgrounds
   without leaving Pocket-Game-Maker.

   Tools: pencil, eraser, fill, colour picker, line, rectangle, ellipse, triangle (outline or filled), select
   (move, copy, cut, paste, delete, flip, rotate). Layers (add, duplicate, hide, opacity, reorder, merge, delete),
   a colour palette saved with the project, undo and redo, zoom and pan, a tile or frame grid, and the art
   templates as a guide layer underneath. Previews: actual size, a character sheet walking, an autotile joined up.

   Saving writes the flattened PNG into assets/<kind>/ (what the game uses) and the layers into
   art-src/<kind>/<name>.png.layers.json, so they come back next time. */
(function () {
  'use strict';
  const { h, clear } = UI;

  const ENDESGA = ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761',
    '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
    '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'];
  const KIND_NAME = { tilesets: 'Tileset', characters: 'Character', monsters: 'Monster picture', battlebacks: 'Battle background', pictures: 'Picture', decorations: 'Furniture' };
  const PIXEL_KINDS = Object.keys(KIND_NAME);
  // New-picture presets, matching the art templates (templates/art-templates).
  const PRESETS = [
    { id: 'tileset16', kind: 'tilesets', name: 'Tileset, 16-pixel squares (8 × 8)', w: 128, h: 128, grid: [16, 16], tpl: 'tileset-16px-template.png', preview: 'autotile', block: 40 },
    { id: 'tileset32', kind: 'tilesets', name: 'Tileset, 32-pixel squares (8 × 8)', w: 256, h: 256, grid: [32, 32], tpl: 'tileset-32px-template.png', preview: 'autotile', block: 40 },
    { id: 'autotile', kind: 'tilesets', name: 'One autotile block (2 × 3 squares)', w: 32, h: 48, grid: [16, 16], tpl: 'autotile-16px-template.png', preview: 'autotile', block: 0 },
    { id: 'char16', kind: 'characters', name: 'Character, 16 × 16 frames', w: 48, h: 64, grid: [16, 16], tpl: 'character-16px-template.png', preview: 'walk' },
    { id: 'char1624', kind: 'characters', name: 'Tall character, 16 × 24 frames', w: 48, h: 96, grid: [16, 24], tpl: 'character-16x24px-template.png', preview: 'walk' },
    { id: 'char32', kind: 'characters', name: 'Big character, 32 × 32 frames', w: 96, h: 128, grid: [32, 32], tpl: 'character-32px-template.png', preview: 'walk' },
    { id: 'clothes', kind: 'characters', name: 'Clothes for the Wardrobe (over the hero)', w: 48, h: 64, grid: [16, 16], tpl: 'clothing-overlay-16px-template.png', preview: 'walk', clothes: true },
    { id: 'mon64', kind: 'monsters', name: 'Monster picture, 64 × 64', w: 64, h: 64, tpl: 'monster-64px-template.png' },
    { id: 'mon96', kind: 'monsters', name: 'Monster picture, 96 × 96', w: 96, h: 96, tpl: 'monster-96px-template.png' },
    { id: 'decor1x1', kind: 'decorations', name: 'Furniture, 1 × 1 square', w: 16, h: 16, grid: [16, 16], tpl: 'decoration-1x1-template.png' },
    { id: 'decor2x1', kind: 'decorations', name: 'Furniture, 2 × 1 squares', w: 32, h: 16, grid: [16, 16], tpl: 'decoration-2x1-template.png' },
    { id: 'decor1x2', kind: 'decorations', name: 'Furniture, 1 × 2 squares', w: 16, h: 32, grid: [16, 16], tpl: 'decoration-1x2-template.png' },
    { id: 'decor2x2', kind: 'decorations', name: 'Furniture, 2 × 2 squares', w: 32, h: 32, grid: [16, 16], tpl: 'decoration-2x2-template.png' },
    { id: 'decor3x2', kind: 'decorations', name: 'Furniture, 3 × 2 squares', w: 48, h: 32, grid: [16, 16], tpl: 'decoration-3x2-template.png' },
    { id: 'battleback', kind: 'battlebacks', name: 'Battle background, 320 × 240', w: 320, h: 240, tpl: 'battleback-320x240-template.png' },
    { id: 'picture', kind: 'pictures', name: 'Full-screen picture, 320 × 240', w: 320, h: 240, tpl: 'screen-320x240-template.png' },
    { id: 'custom', kind: null, name: 'Custom size…', w: 32, h: 32 }
  ];
  const TPL_URL = f => '../../templates/art-templates/' + f;
  const TOOLS = [
    ['pencil', '✎', 'Pencil (B)', 'b'], ['eraser', '⌫', 'Eraser (E)', 'e'], ['fill', '▧', 'Fill (G)', 'g'], ['picker', '⊙', 'Colour picker (I, or Alt+click)', 'i'],
    ['line', '╱', 'Line (L)', 'l'], ['rect', '▭', 'Rectangle (U). Shift: square', 'u'], ['ellipse', '◯', 'Circle / ellipse (O). Shift: circle', 'o'],
    ['triangle', '△', 'Triangle (T)', 't'], ['select', '⬚', 'Select (M): drag to select, drag inside to move', 'm']
  ];
  const SHAPES = ['line', 'rect', 'ellipse', 'triangle'];

  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ctxOf = c => c.getContext('2d', { willReadFrequently: true });
  const hex2rgba = (hex, a = 255) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, a]; };
  const rgba2hex = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
  const cloneCanvas = src => { const c = newCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };
  // File names: lower case letters, numbers and hyphens (like the library's sign-post.png).
  const fileSlug = (name, fallback) => String(name || '').toLowerCase().replace(/\.png$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  const loadImg = url => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

  // Pixels of a shape between two corners, as a Uint8Array mask (w*h). Shapes stay inside the picture.
  function shapeMask(type, W, H, x0, y0, x1, y1, filled, thick) {
    const m = new Uint8Array(W * H);
    const set = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1; };
    if (type === 'line') {
      const r = Math.floor((thick - 1) / 2);
      let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, x = x0, y = y0;
      for (;;) {
        for (let a = -r; a < thick - r; a++) for (let b = -r; b < thick - r; b++) set(x + a, y + b);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; }
      }
      return m;
    }
    const lx = Math.min(x0, x1), rx = Math.max(x0, x1), ty = Math.min(y0, y1), by = Math.max(y0, y1);
    const inside = new Uint8Array(W * H);
    const bw = rx - lx + 1, bh = by - ty + 1;
    for (let y = Math.max(0, ty); y <= Math.min(H - 1, by); y++) for (let x = Math.max(0, lx); x <= Math.min(W - 1, rx); x++) {
      let ok = true;
      if (type === 'ellipse') {
        const cx = lx + bw / 2, cy = ty + bh / 2, ex = (x + 0.5 - cx) / (bw / 2), ey = (y + 0.5 - cy) / (bh / 2);
        ok = bw <= 2 || bh <= 2 || ex * ex + ey * ey <= 1.0;
      } else if (type === 'triangle') {
        // Apex on the side the drag started from (drag down for a point at the top).
        const up = y1 >= y0, ax = lx + bw / 2, ay = up ? ty : by + 1, b1y = up ? by + 1 : ty;
        const px = x + 0.5, py = y + 0.5;
        const t = up ? (py - ay) / (b1y - ay) : (ay - py) / (ay - b1y);
        ok = t >= -0.001 && t <= 1.001 && Math.abs(px - ax) <= (bw / 2) * t + 0.35;
      }
      if (ok) inside[y * W + x] = 1;
    }
    if (filled) return inside;
    // Outline: the inside pixels within `thick` of an outside pixel.
    let core = inside;
    for (let k = 0; k < thick; k++) {
      const next = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!core[i]) continue;
        const keep = x > 0 && x < W - 1 && y > 0 && y < H - 1 && core[i - 1] && core[i + 1] && core[i - W] && core[i + W] && x > lx && x < rx && y > ty && y < by;
        if (keep) next[i] = 1;
      }
      core = next;
    }
    for (let i = 0; i < m.length; i++) m[i] = inside[i] && !core[i] ? 1 : 0;
    return m;
  }

  const PE = window.PixelEditor = {
    S: null,

    /* ---------- opening ---------- */
    // A new picture: choose what it is and a name.
    async newPicture(kind) {
      if (!App.proj) return UI.toast('Open or create a project first');
      const list = PRESETS.filter(p => !kind || !p.kind || p.kind === kind);
      const o = { preset: list[0].id, name: '', w: 32, h: 32, kind: kind || 'characters', template: true };
      const body = h('div', { class: 'pe-new' });
      const draw = () => {
        clear(body);
        const pre = PRESETS.find(p => p.id === o.preset);
        body.append(UI.field('What are you drawing?', o, 'preset', { type: 'select', options: list.map(p => [p.id, p.name]), onChange: draw }));
        if (pre.id === 'custom') body.append(UI.row(UI.field('Kind', o, 'kind', { type: 'select', options: PIXEL_KINDS.map(k => [k, KIND_NAME[k]]) }), UI.field('Width (pixels)', o, 'w', { type: 'number', min: 1, max: 1024 }), UI.field('Height (pixels)', o, 'h', { type: 'number', min: 1, max: 1024 })));
        else body.append(h('p', { class: 'muted' }, pre.w + ' × ' + pre.h + ' pixels' + (pre.grid ? ', with a ' + pre.grid[0] + ' × ' + pre.grid[1] + ' grid' : '') + (pre.tpl ? '. The matching art template is shown underneath as a guide (it is not saved in your picture).' : '.')));
        const where = h('p', { class: 'muted pe-small' });
        const setWhere = () => { where.textContent = 'Saved as assets/' + (pre.kind || o.kind) + '/' + fileSlug(o.name, 'picture') + '.png'; };
        const nameField = UI.field('Name', o, 'name', { onChange: setWhere });
        const inp = nameField.querySelector('input'); if (inp) { inp.placeholder = 'e.g. my-hero'; inp.addEventListener('input', () => { o.name = inp.value; setWhere(); }); }
        setWhere();
        body.append(nameField, where);
      };
      draw();
      App._suppressDirty = true; // the form's fields are not project settings
      const ok = await UI.modal({ title: 'New picture', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Start drawing', primary: true, value: true }], enterValue: () => true });
      App._suppressDirty = false;
      if (!ok) return;
      const pre = PRESETS.find(p => p.id === o.preset);
      const k = pre.kind || o.kind, w = pre.id === 'custom' ? Math.max(1, Math.min(1024, +o.w || 32)) : pre.w, hh = pre.id === 'custom' ? Math.max(1, Math.min(1024, +o.h || 32)) : pre.h;
      const name = fileSlug(o.name, 'picture');
      let rel = k + '/' + name + '.png', n = 2;
      while ((App.assets[k] || []).includes(rel)) rel = k + '/' + name + '-' + (n++) + '.png';
      return PE.open({ rel, isNew: true, w, h: hh, kind: k, preset: pre.id === 'custom' ? null : pre });
    },

    // Edit a picture in the project (rel like 'characters/hero.png').
    async edit(rel) {
      if (!App.proj || !rel) return;
      const kind = rel.split('/')[0];
      if (!PIXEL_KINDS.includes(kind)) return UI.toast('Only pictures can be edited here');
      if (!/\.png$/i.test(rel)) {
        const ok = await UI.confirm('Edit as PNG?', rel.split('/').pop() + ' is not a PNG. The pixel editor saves PNG files, so it will save a PNG copy with the same name and switch everything that used the old file over to it.');
        if (!ok) return;
      }
      return PE.open({ rel, kind });
    },

    async editTileset() {
      const ts = App.tileset && App.tileset();
      if (!ts || !ts.image) return UI.toast('This map has no tileset picture to edit');
      return PE.edit(ts.image);
    },

    async open(o) {
      const S = PE.S = {
        rel: o.rel.replace(/\.[^.\/]+$/, '.png'), origRel: o.rel, kind: o.kind, isNew: !!o.isNew, w: o.w || 0, h: o.h || 0,
        layers: [], active: 0, guide: { img: null, show: true, opacity: 0.6 }, grid: null, showGrid: true,
        zoom: 8, ox: 0, oy: 0, tool: 'pencil', size: 1, filled: false, color: hex2rgba('#181425'), recent: [],
        sel: null, float: null, undo: [], redo: [], dirty: !!o.isNew, preset: o.preset || null, block: 0, anim: 0
      };
      // Load the picture (and its layers, if it was saved here before).
      if (!o.isNew) {
        const info = await window.api.pixelLoad(App.proj.path, S.rel).catch(() => null);
        if (info && info.layers && info.layers.layers && info.layers.layers.length) {
          S.w = info.layers.w; S.h = info.layers.h;
          for (const L of info.layers.layers) {
            const img = await loadImg(L.data), c = newCanvas(S.w, S.h);
            if (img) c.getContext('2d').drawImage(img, 0, 0);
            S.layers.push({ name: L.name, visible: L.visible !== false, opacity: L.opacity == null ? 1 : L.opacity, canvas: c });
          }
          S.active = Math.min(info.layers.active || 0, S.layers.length - 1);
        } else {
          const img = await UI.loadImage(o.rel);
          if (!img) return UI.alert('Could not open picture', 'assets/' + o.rel + ' could not be loaded.');
          S.w = img.width; S.h = img.height;
          const c = newCanvas(S.w, S.h); c.getContext('2d').drawImage(img, 0, 0);
          S.layers.push({ name: 'Layer 1', visible: true, opacity: 1, canvas: c });
          if (info && info.stale) S.note = 'The picture was changed outside the pixel editor, so it opens as one layer.';
        }
        if (S.rel !== S.origRel) S.dirty = true;
      } else {
        S.layers.push({ name: 'Layer 1', visible: true, opacity: 1, canvas: newCanvas(S.w, S.h) });
      }
      // Grid, guide template and preview from the preset or the kind of picture.
      const pre = S.preset || PRESETS.find(p => p.kind === S.kind && p.w === S.w && p.h === S.h && p.id !== 'clothes');
      if (S.kind === 'tilesets') {
        const ts = (App.proj.tilesets || []).find(t => t.image === S.origRel);
        const T = (ts && ts.tileSize) || (pre && pre.grid ? pre.grid[0] : 16);
        S.grid = [T, T]; S.preview = 'autotile'; S.tileset = ts || null;
        const autoAt = ts && (ts.flags || []).findIndex(f => f && f.auto);
        S.block = autoAt >= 0 ? autoAt : (pre && pre.block != null && pre.block < (S.w / T) * (S.h / T) ? pre.block : 0);
      } else if (S.kind === 'characters') { S.grid = [S.w / 3, S.h / 4]; S.preview = 'walk'; }
      else if (S.kind === 'decorations') S.grid = [16, 16];
      else if (pre && pre.grid) S.grid = pre.grid;
      S.clothes = !!(o.preset && o.preset.clothes);
      if (pre && pre.tpl) loadImg(TPL_URL(pre.tpl)).then(img => { S.guide.img = img; S.guide.show = !!o.isNew; PE.render(); PE.renderLayers(); });
      if (S.preview === 'walk') { const base = S.clothes && App.proj.system.player && App.proj.system.player.sprite; if (base) UI.loadImage(base).then(i => { S.baseSheet = i; }); }
      S.palette = (App.proj.pixelPalette && App.proj.pixelPalette.length ? App.proj.pixelPalette : ENDESGA).slice();
      PE.checkpointBase();
      return PE.show();
    },

    /* ---------- the window ---------- */
    show() {
      const S = PE.S;
      const toolBtns = TOOLS.map(([id, icon, tip]) => h('button', { class: 'pe-tool', 'data-tool': id, title: tip, onclick: () => PE.setTool(id) }, icon));
      const view = h('canvas', { class: 'pe-canvas' });
      S.view = view;
      const opts = h('div', { class: 'pe-opts' });
      const side = h('div', { class: 'pe-side' });
      const status = h('div', { class: 'pe-status' });
      S.optsEl = opts; S.sideEl = side; S.statusEl = status;
      const body = h('div', { class: 'pe-wrap' },
        h('div', { class: 'pe-tools' }, toolBtns,
          h('div', { class: 'pe-swatch-big', title: 'Current colour' }, h('div', { class: 'pe-swatch-fill', id: 'pe-cur' }))),
        h('div', { class: 'pe-main' }, opts, h('div', { class: 'pe-stage' }, view), status),
        side);
      const modal = UI.modal({
        title: (S.isNew ? 'New ' : 'Edit ') + (KIND_NAME[S.kind] || 'picture').toLowerCase() + ': ' + S.rel, size: 'full pe-modal', body, dismissable: false,
        buttons: [{ label: 'Close', value: 'close' }, { label: 'Save as…', value: false, onClick: () => { PE.save(true); return false; } }, { label: 'Save', primary: true, value: false, onClick: () => { PE.save(false); return false; } }],
        onClose: v => {
          if (S.float || S.sel) { PE.commitFloat(); S.sel = null; PE.render(); if (v === false) return false; }
          if (S.dirty && !S.closing) { PE.askClose(); return false; }
          PE.stop();
        }
      });
      S.modal = modal;
      PE.bind();
      PE.renderOpts(); PE.renderSide(); PE.setTool('pencil');
      requestAnimationFrame(() => { PE.fit(); PE.render(); });
      if (S.note) UI.toast(S.note);
      S.timer = setInterval(() => { S.anim++; PE.renderPreview(); if (S.sel) PE.render(); }, 160);
      return modal;
    },
    async askClose() {
      const S = PE.S;
      const r = await UI.modal({ title: 'Save changes?', size: 'small', body: h('p', null, 'Save your changes to ' + S.rel + ' before closing?'),
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Don\'t save', danger: true, value: 'discard' }, { label: 'Save', primary: true, value: 'save' }] });
      if (r === 'save') { if (await PE.save(false)) { S.closing = true; S.modal.close('close'); } }
      else if (r === 'discard') { S.closing = true; S.modal.close('close'); }
    },
    stop() {
      const S = PE.S; if (!S) return;
      clearInterval(S.timer);
      window.removeEventListener('keydown', S.onKey, true);
      document.removeEventListener('paste', S.onPaste, true);
      window.removeEventListener('resize', S.onResize);
      PE.S = null;
    },

    /* ---------- tool options, side panels ---------- */
    renderOpts() {
      const S = PE.S, el = S.optsEl; clear(el);
      const sizeTools = ['pencil', 'eraser', 'line', 'rect', 'ellipse', 'triangle'];
      if (sizeTools.includes(S.tool)) {
        el.append(h('span', { class: 'muted' }, 'Size'), ...[1, 2, 3, 4].map(n => h('button', { class: 'small' + (S.size === n ? ' on' : ''), title: n + ' pixel' + (n > 1 ? 's' : '') + ' ([ and ] change it)', onclick: () => { S.size = n; PE.renderOpts(); } }, String(n))));
      }
      if (['rect', 'ellipse', 'triangle'].includes(S.tool)) {
        el.append(h('label', { class: 'pe-chk' }, h('input', { type: 'checkbox', checked: S.filled, onchange: e => { S.filled = e.target.checked; } }), 'Filled'));
      }
      if (S.tool === 'select') {
        const b = (label, tip, fn) => h('button', { class: 'small', title: tip, onclick: fn }, label);
        el.append(b('Select all', 'Ctrl+A', () => PE.selectAll()), b('Copy', 'Ctrl+C', () => PE.copy()), b('Cut', 'Ctrl+X', () => PE.cut()), b('Paste', 'Ctrl+V', () => PE.paste()),
          b('Delete', 'Delete', () => PE.del()), b('Flip ↔', 'Flip left to right', () => PE.transform('h')), b('Flip ↕', 'Flip top to bottom', () => PE.transform('v')),
          b('Rotate ↻', 'Quarter turn clockwise', () => PE.transform('r')), b('Deselect', 'Esc', () => { PE.commitFloat(); S.sel = null; PE.render(); }));
      }
      if (S.tool === 'picker') el.append(h('span', { class: 'muted' }, 'Click the picture to take a colour (from all visible layers). Alt+click does this with any tool.'));
      if (S.tool === 'fill') el.append(h('span', { class: 'muted' }, 'Fills touching pixels of the same colour on the current layer.'));
      el.append(h('span', { class: 'tb-spacer' }));
      if (S.grid) el.append(h('label', { class: 'pe-chk', title: 'Grid (#)' }, h('input', { type: 'checkbox', checked: S.showGrid, onchange: e => { S.showGrid = e.target.checked; PE.render(); } }), 'Grid ' + S.grid[0] + '×' + S.grid[1]));
      el.append(h('button', { class: 'small', title: 'Zoom out (−)', onclick: () => PE.zoomBy(-1) }, '−'), h('span', { class: 'pe-zoom' }, S.zoom * 100 + '%'),
        h('button', { class: 'small', title: 'Zoom in (+)', onclick: () => PE.zoomBy(1) }, '+'), h('button', { class: 'small', title: 'Fit to window (0)', onclick: () => { PE.fit(); PE.render(); } }, 'Fit'));
      el.append(h('button', { class: 'small', title: 'Undo (Ctrl+Z)', disabled: S.undo.length < 2, onclick: () => PE.undo() }, '↶ Undo'), h('button', { class: 'small', title: 'Redo (Ctrl+Y)', disabled: !S.redo.length, onclick: () => PE.redoStep() }, '↷ Redo'));
    },

    renderSide() {
      const S = PE.S, el = S.sideEl; clear(el);
      // Colours
      const cur = h('input', { type: 'color', value: rgba2hex(S.color), title: 'Choose any colour', oninput: e => { S.color = hex2rgba(e.target.value, S.color[3]); PE.colorChanged(false); } });
      const alpha = h('input', { type: 'range', min: 0, max: 255, value: S.color[3], title: 'Opacity of the colour (0 = transparent)', oninput: e => { S.color[3] = +e.target.value; PE.colorChanged(false); } });
      const hex = h('input', { type: 'text', value: rgba2hex(S.color), class: 'pe-hex', maxlength: 7, onchange: e => { if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) { S.color = hex2rgba('#' + e.target.value.replace('#', ''), S.color[3]); PE.colorChanged(true); } } });
      S.colorEls = { cur, alpha, hex };
      const pal = h('div', { class: 'pe-pal' }, S.palette.map((c, i) => h('button', { class: 'pe-sw', style: { background: c }, title: c + ' (right-click to remove)', onclick: () => { S.color = hex2rgba(c); PE.colorChanged(true); },
        oncontextmenu: e => { e.preventDefault(); S.palette.splice(i, 1); PE.savePalette(); PE.renderSide(); } })));
      const recent = h('div', { class: 'pe-pal pe-recent' }, S.recent.map(c => h('button', { class: 'pe-sw', style: { background: 'rgba(' + c.join(',').replace(/,(\d+)$/, (m, a) => ',' + (a / 255).toFixed(2)) + ')' }, title: rgba2hex(c), onclick: () => { S.color = c.slice(); PE.colorChanged(true); } })));
      el.append(h('div', { class: 'pe-panel' },
        h('div', { class: 'pe-panel-head' }, 'Colour'),
        h('div', { class: 'pe-color-row' }, cur, hex, h('span', { class: 'muted' }, 'Opacity'), alpha),
        pal,
        h('div', { class: 'pe-pal-btns' },
          h('button', { class: 'small', title: 'Add the current colour to the palette', onclick: () => { const c = rgba2hex(S.color); if (!S.palette.includes(c)) { S.palette.push(c); PE.savePalette(); PE.renderSide(); } } }, '+ Add colour'),
          h('button', { class: 'small', title: 'Put back the 32 starting colours', onclick: () => { S.palette = ENDESGA.slice(); PE.savePalette(); PE.renderSide(); } }, 'Reset palette')),
        S.recent.length ? h('div', { class: 'muted pe-small' }, 'Recently used') : null, S.recent.length ? recent : null));
      // Layers
      const layersEl = h('div', { class: 'pe-panel' }); S.layersEl = layersEl;
      el.append(layersEl);
      // Preview
      const prev = h('div', { class: 'pe-panel' }); S.previewEl = prev;
      el.append(prev);
      PE.renderLayers(); PE.buildPreview(); PE.colorChanged(false);
    },
    savePalette() { App.proj.pixelPalette = PE.S.palette.slice(); App.markDirty(); },
    colorChanged(updateInputs) {
      const S = PE.S, c = S.color, sw = document.getElementById('pe-cur');
      if (sw) sw.style.background = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (c[3] / 255) + ')';
      if (S.colorEls && updateInputs !== false) { S.colorEls.cur.value = rgba2hex(c); S.colorEls.hex.value = rgba2hex(c); S.colorEls.alpha.value = c[3]; }
      else if (S.colorEls) S.colorEls.hex.value = rgba2hex(c);
      if (S.tool === 'eraser' || S.tool === 'picker') PE.setTool('pencil');
    },
    useColor() {
      const S = PE.S, key = S.color.join(',');
      S.recent = [S.color.slice()].concat(S.recent.filter(c => c.join(',') !== key)).slice(0, 12);
    },

    renderLayers() {
      const S = PE.S; if (!S || !S.layersEl) return;
      const el = S.layersEl; clear(el);
      const rows = S.layers.map((L, i) => ({ L, i })).reverse().map(({ L, i }) => h('div', { class: 'pe-layer' + (i === S.active ? ' on' : ''), onclick: () => { PE.commitFloat(); S.active = i; PE.renderLayers(); } },
        h('button', { class: 'pe-eye' + (L.visible ? '' : ' off'), title: L.visible ? 'Hide' : 'Show', onclick: e => { e.stopPropagation(); L.visible = !L.visible; PE.changed(); PE.renderLayers(); } }, L.visible ? '◉' : '○'),
        PE.thumb(h('canvas', { class: 'pe-thumb', width: 32, height: 32 }), L.canvas),
        h('span', { class: 'pe-lname', title: 'Double-click to rename', ondblclick: async e => { e.stopPropagation(); const n = await UI.prompt('Rename layer', L.name, 'Name'); if (n) { PE.checkpoint(); L.name = n; PE.changed(); PE.renderLayers(); } } }, L.name),
        L.opacity < 1 ? h('span', { class: 'muted pe-small' }, Math.round(L.opacity * 100) + '%') : null));
      const A = S.layers[S.active];
      const b = (label, tip, fn, dis) => h('button', { class: 'small', title: tip, disabled: !!dis, onclick: fn }, label);
      el.append(h('div', { class: 'pe-panel-head' }, 'Layers', h('span', { class: 'muted pe-small' }, 'top layer first')),
        h('div', { class: 'pe-layers' }, rows),
        h('div', { class: 'pe-layer-btns' },
          b('+ New', 'Add an empty layer above this one', () => PE.layerOp('add')),
          b('Duplicate', 'Copy this layer', () => PE.layerOp('dup')),
          b('↑', 'Move up', () => PE.layerOp('up'), S.active >= S.layers.length - 1),
          b('↓', 'Move down', () => PE.layerOp('down'), S.active <= 0),
          b('Merge down', 'Merge this layer into the one below', () => PE.layerOp('merge'), S.active <= 0),
          b('Delete', 'Delete this layer', () => PE.layerOp('del'), S.layers.length <= 1)),
        h('div', { class: 'pe-color-row' }, h('span', { class: 'muted' }, 'Layer opacity'),
          h('input', { type: 'range', min: 0, max: 100, value: Math.round(A.opacity * 100), onchange: () => PE.checkpoint(), oninput: e => { A.opacity = +e.target.value / 100; PE.changed(); }, onmouseup: () => PE.renderLayers() })));
      if (S.guide.img) el.append(h('div', { class: 'pe-guide' },
        h('label', { class: 'pe-chk', title: 'The art template, shown under your layers as a guide. It is not saved in the picture.' }, h('input', { type: 'checkbox', checked: S.guide.show, onchange: e => { S.guide.show = e.target.checked; PE.render(); } }), 'Show template'),
        h('input', { type: 'range', min: 10, max: 100, value: Math.round(S.guide.opacity * 100), title: 'Template opacity', oninput: e => { S.guide.opacity = +e.target.value / 100; PE.render(); } })));
    },
    thumb(c, src) {
      const g = c.getContext('2d'), k = Math.min(32 / src.width, 32 / src.height);
      g.clearRect(0, 0, 32, 32); g.imageSmoothingEnabled = false;
      g.drawImage(src, (32 - src.width * k) / 2, (32 - src.height * k) / 2, src.width * k, src.height * k);
      return c;
    },
    layerOp(op) {
      const S = PE.S; PE.commitFloat(); PE.checkpoint();
      const A = S.layers[S.active];
      if (op === 'add') { S.layers.splice(S.active + 1, 0, { name: 'Layer ' + (S.layers.length + 1), visible: true, opacity: 1, canvas: newCanvas(S.w, S.h) }); S.active++; }
      if (op === 'dup') { S.layers.splice(S.active + 1, 0, { name: A.name + ' copy', visible: A.visible, opacity: A.opacity, canvas: cloneCanvas(A.canvas) }); S.active++; }
      if (op === 'up' && S.active < S.layers.length - 1) { S.layers.splice(S.active, 1); S.layers.splice(++S.active, 0, A); }
      if (op === 'down' && S.active > 0) { S.layers.splice(S.active, 1); S.layers.splice(--S.active, 0, A); }
      if (op === 'merge' && S.active > 0) {
        const B = S.layers[S.active - 1], g = B.canvas.getContext('2d');
        g.save(); g.globalAlpha = A.opacity; if (A.visible) g.drawImage(A.canvas, 0, 0); g.restore();
        S.layers.splice(S.active, 1); S.active--;
      }
      if (op === 'del' && S.layers.length > 1) { S.layers.splice(S.active, 1); S.active = Math.max(0, S.active - 1); }
      PE.changed(); PE.renderLayers();
    },

    /* ---------- previews ---------- */
    buildPreview() {
      const S = PE.S, el = S.previewEl; clear(el);
      el.append(h('div', { class: 'pe-panel-head' }, 'Preview'));
      const actual = h('canvas', { class: 'pe-prev-actual', title: 'The whole picture' }); S.prevActual = actual;
      if (S.preview !== 'autotile') el.append(actual);
      if (S.preview === 'walk') {
        S.prevWalk = h('canvas', { class: 'pe-prev-walk' });
        el.append(h('div', { class: 'muted pe-small' }, 'Walking: down, left, right, up' + (S.clothes || S.baseSheet ? ' (over ' + ((App.proj.system.player || {}).name || 'the player') + ')' : '')), S.prevWalk);
        if (!S.clothes) el.append(h('label', { class: 'pe-chk pe-small' }, h('input', { type: 'checkbox', checked: !!S.overPlayer, onchange: e => { S.overPlayer = e.target.checked; if (e.target.checked && !S.baseSheet) { const base = App.proj.system.player && App.proj.system.player.sprite; if (base) UI.loadImage(base).then(i => { S.baseSheet = i; }); } } }), 'Show over the player (for clothes)'));
      }
      if (S.preview === 'autotile') {
        const T = S.grid[0], cols = Math.floor(S.w / T), n = cols * Math.floor(S.h / T);
        S.prevAuto = h('canvas', { class: 'pe-prev-auto' });
        const o = { block: S.block };
        el.append(h('div', { class: 'muted pe-small' }, 'Autotile preview: the 2 × 3 block starting at square'),
          h('div', { class: 'pe-color-row' }, h('input', { type: 'number', min: 0, max: Math.max(0, n - 1), value: S.block, class: 'pe-num', onchange: e => { S.block = Math.max(0, Math.min(n - 1, +e.target.value | 0)); PE.renderPreview(); } }),
            h('span', { class: 'muted pe-small' }, 'The status bar shows the number of the square under the mouse.')),
          S.prevAuto, h('div', { class: 'muted pe-small' }, 'The whole picture'), actual);
      }
      PE.renderPreview();
    },
    composite(includeGuide) {
      const S = PE.S, c = newCanvas(S.w, S.h), g = c.getContext('2d');
      if (includeGuide && S.guide.img && S.guide.show) { g.globalAlpha = S.guide.opacity; g.drawImage(S.guide.img, 0, 0, S.w, S.h); g.globalAlpha = 1; }
      S.layers.forEach((L, i) => {
        if (!L.visible) return;
        g.globalAlpha = L.opacity; g.drawImage(L.canvas, 0, 0);
        if (i === S.active && S.float) g.drawImage(S.float.canvas, S.float.x, S.float.y);
      });
      g.globalAlpha = 1;
      return c;
    },
    renderPreview() {
      const S = PE.S; if (!S || !S.prevActual) return;
      const img = PE.composite(false);
      // actual size and 2×, side by side
      // small pictures: actual size and 2×; bigger ones: scaled to fit the panel
      const a = S.prevActual, maxW = 270, both = S.w * 3 + 8 <= maxW && S.h * 2 <= 200, k = both ? 1 : Math.min(1, maxW / S.w, 200 / S.h);
      a.width = both ? S.w * 3 + 8 : Math.round(S.w * k); a.height = both ? S.h * 2 : Math.round(S.h * k);
      const g = a.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, a.width, a.height);
      if (both) { g.drawImage(img, 0, 0); g.drawImage(img, S.w + 8, 0, S.w * 2, S.h * 2); } else g.drawImage(img, 0, 0, a.width, a.height);
      if (S.prevWalk) {
        const fw = S.w / 3, fh = S.h / 4, K = Math.max(1, Math.floor(56 / Math.max(fw, fh))), frame = [1, 0, 1, 2][S.anim % 4];
        const c = S.prevWalk; c.width = (fw * K + 8) * 4; c.height = fh * K; const w = c.getContext('2d'); w.imageSmoothingEnabled = false;
        for (let d = 0; d < 4; d++) {
          if ((S.clothes || S.overPlayer) && S.baseSheet) w.drawImage(S.baseSheet, frame * S.baseSheet.width / 3, d * S.baseSheet.height / 4, S.baseSheet.width / 3, S.baseSheet.height / 4, d * (fw * K + 8), 0, fw * K, fh * K);
          w.drawImage(img, frame * fw, d * fh, fw, fh, d * (fw * K + 8), 0, fw * K, fh * K);
        }
      }
      if (S.prevAuto) {
        const T = S.grid[0], cols = Math.floor(S.w / T), K = 2, pat = ['.......', '.xxxxx.', '.xx.xx.', '.xxxxx.', '.......'];
        const W = 7, H = 5, layer = []; pat.forEach(r => [...r].forEach(ch => layer.push(ch === 'x' ? S.block : -1)));
        const c = S.prevAuto; c.width = W * T * K; c.height = H * T * K;
        const w = c.getContext('2d'); w.imageSmoothingEnabled = false; w.clearRect(0, 0, c.width, c.height);
        const ts = { flags: [] }; ts.flags[S.block] = { auto: true };
        if (S.tileset && S.tileset.flags && S.tileset.flags[S.block] && S.tileset.flags[S.block].anim > 1) Object.assign(ts.flags[S.block], { anim: S.tileset.flags[S.block].anim }), ts.animSpeed = S.tileset.animSpeed;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (layer[y * W + x] >= 0) MF.Tiles.drawTile(w, img, ts, cols, T, S.block, x * T * K, y * T * K, layer, W, H, x, y, performance.now(), T * K);
      }
    },

    /* ---------- view ---------- */
    fit() {
      const S = PE.S, st = S.view.parentNode, W = st.clientWidth - 24, H = st.clientHeight - 24;
      S.zoom = Math.max(1, Math.min(48, Math.floor(Math.min(W / S.w, H / S.h)) || 1));
      S.ox = Math.round((st.clientWidth - S.w * S.zoom) / 2); S.oy = Math.round((st.clientHeight - S.h * S.zoom) / 2);
      PE.renderOpts();
    },
    zoomBy(d, mx, my) {
      const S = PE.S, st = S.view.parentNode;
      const steps = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48];
      let i = steps.findIndex(z => z >= S.zoom); if (i < 0) i = steps.length - 1;
      const nz = steps[Math.max(0, Math.min(steps.length - 1, i + d))];
      if (mx == null) { mx = st.clientWidth / 2; my = st.clientHeight / 2; }
      const px = (mx - S.ox) / S.zoom, py = (my - S.oy) / S.zoom;
      S.zoom = nz; S.ox = Math.round(mx - px * nz); S.oy = Math.round(my - py * nz);
      PE.renderOpts(); PE.render();
    },
    render() {
      const S = PE.S; if (!S || !S.view) return;
      const v = S.view, st = v.parentNode;
      if (v.width !== st.clientWidth || v.height !== st.clientHeight) { v.width = st.clientWidth; v.height = st.clientHeight; }
      const g = v.getContext('2d'), Z = S.zoom, X = S.ox, Y = S.oy, W = S.w * Z, H = S.h * Z;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, v.width, v.height);
      // transparent checkerboard
      const ck = Math.max(4, Math.min(16, Z * 2));
      g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
      for (let y = 0; y < H; y += ck) for (let x = 0; x < W; x += ck) { g.fillStyle = ((x / ck + y / ck) & 1) ? '#c9ccd6' : '#e6e8ee'; g.fillRect(X + x, Y + y, ck, ck); }
      g.restore();
      const img = PE.composite(true);
      g.drawImage(img, X, Y, W, H);
      // shape preview
      if (S.preview2) {
        const m = S.preview2, c = S.color;
        g.fillStyle = S.tool === 'eraser' ? 'rgba(255,255,255,.7)' : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0.35, c[3] / 255) + ')';
        for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (m[y * S.w + x]) g.fillRect(X + x * Z, Y + y * Z, Z, Z);
      }
      // pixel grid when zoomed right in, then the tile/frame grid
      if (Z >= 12) {
        g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; g.beginPath();
        for (let x = 1; x < S.w; x++) { g.moveTo(X + x * Z + 0.5, Y); g.lineTo(X + x * Z + 0.5, Y + H); }
        for (let y = 1; y < S.h; y++) { g.moveTo(X, Y + y * Z + 0.5); g.lineTo(X + W, Y + y * Z + 0.5); }
        g.stroke();
      }
      if (S.grid && S.showGrid) {
        g.strokeStyle = 'rgba(40,60,140,.55)'; g.lineWidth = 1; g.beginPath();
        for (let x = S.grid[0]; x < S.w; x += S.grid[0]) { g.moveTo(X + x * Z + 0.5, Y); g.lineTo(X + x * Z + 0.5, Y + H); }
        for (let y = S.grid[1]; y < S.h; y += S.grid[1]) { g.moveTo(X, Y + y * Z + 0.5); g.lineTo(X + W, Y + y * Z + 0.5); }
        g.stroke();
      }
      g.strokeStyle = '#3a3f5a'; g.strokeRect(X - 0.5, Y - 0.5, W + 1, H + 1);
      // selection marquee
      const r = S.float ? { x: S.float.x, y: S.float.y, w: S.float.canvas.width, h: S.float.canvas.height } : S.sel;
      if (r) {
        g.save(); g.setLineDash([4, 4]); g.lineDashOffset = -(S.anim % 8); g.lineWidth = 1;
        g.strokeStyle = '#000'; g.strokeRect(X + r.x * Z + 0.5, Y + r.y * Z + 0.5, r.w * Z - 1, r.h * Z - 1);
        g.lineDashOffset = 4 - (S.anim % 8); g.strokeStyle = '#fff'; g.strokeRect(X + r.x * Z + 0.5, Y + r.y * Z + 0.5, r.w * Z - 1, r.h * Z - 1);
        g.restore();
      }
      // cursor
      if (S.hover && !S.drag && S.tool !== 'select') {
        const sz = ['pencil', 'eraser'].includes(S.tool) ? S.size : 1, o = Math.floor((sz - 1) / 2);
        g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeRect(X + (S.hover.x - o) * Z + 0.5, Y + (S.hover.y - o) * Z + 0.5, sz * Z - 1, sz * Z - 1);
        g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeRect(X + (S.hover.x - o) * Z - 0.5, Y + (S.hover.y - o) * Z - 0.5, sz * Z + 1, sz * Z + 1);
      }
      PE.renderStatus();
      if (!S._prevQueued) { S._prevQueued = true; requestAnimationFrame(() => { if (PE.S) { PE.S._prevQueued = false; PE.renderPreview(); } }); }
    },
    renderStatus() {
      const S = PE.S, p = S.hover;
      let t = S.w + ' × ' + S.h + ' px · layer: ' + S.layers[S.active].name;
      if (p) {
        t += ' · pixel (' + p.x + ', ' + p.y + ')';
        if (S.grid) {
          const cx = Math.floor(p.x / S.grid[0]), cy = Math.floor(p.y / S.grid[1]);
          if (S.kind === 'tilesets') t += ' · square ' + (cy * Math.floor(S.w / S.grid[0]) + cx);
          else if (S.kind === 'characters') t += ' · ' + ['facing down', 'facing left', 'facing right', 'facing up'][cy] + ', ' + ['step 1', 'standing', 'step 2'][cx];
          else t += ' · square (' + cx + ', ' + cy + ')';
        }
      }
      const sel = S.float || S.sel ? S.float ? S.float.canvas.width + ' × ' + S.float.canvas.height : S.sel.w + ' × ' + S.sel.h : '';
      if (sel) t += ' · selection ' + sel;
      if (S.dirty) t += ' · unsaved changes';
      S.statusEl.textContent = t;
    },

    /* ---------- input ---------- */
    bind() {
      const S = PE.S, v = S.view;
      const at = e => { const r = v.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; return { mx, my, x: Math.floor((mx - S.ox) / S.zoom), y: Math.floor((my - S.oy) / S.zoom) }; };
      const inImg = p => p.x >= 0 && p.y >= 0 && p.x < S.w && p.y < S.h;
      v.addEventListener('contextmenu', e => e.preventDefault());
      v.addEventListener('wheel', e => { e.preventDefault(); const p = at(e); PE.zoomBy(e.deltaY < 0 ? 1 : -1, p.mx, p.my); }, { passive: false });
      v.addEventListener('mousedown', e => {
        const p = at(e);
        if (e.button === 1 || (e.button === 0 && S.space)) { S.pan = { mx: e.clientX, my: e.clientY, ox: S.ox, oy: S.oy }; e.preventDefault(); return; }
        if (e.button !== 0 && e.button !== 2) return;
        const tool = e.altKey ? 'picker' : e.button === 2 && ['pencil', 'fill'].includes(S.tool) ? 'eraser' : S.tool;
        PE.down(tool, p, e, inImg(p));
      });
      S.onMove = e => {
        if (!PE.S) return;
        if (S.pan) { S.ox = S.pan.ox + e.clientX - S.pan.mx; S.oy = S.pan.oy + e.clientY - S.pan.my; PE.render(); return; }
        const p = at(e);
        const hv = inImg(p) ? { x: p.x, y: p.y } : null;
        if (S.drag) PE.move(p, e);
        if ((hv && (!S.hover || hv.x !== S.hover.x || hv.y !== S.hover.y)) || (!hv && S.hover) || S.drag) { S.hover = hv; PE.render(); }
      };
      S.onUp = e => { if (!PE.S) return; if (S.pan) { S.pan = null; return; } if (S.drag) PE.up(at(e), e); };
      window.addEventListener('mousemove', S.onMove);
      window.addEventListener('mouseup', S.onUp);
      v.addEventListener('mouseleave', () => { S.hover = null; PE.render(); });
      S.onResize = () => PE.render();
      window.addEventListener('resize', S.onResize);
      S.onKey = e => PE.key(e);
      window.addEventListener('keydown', S.onKey, true);
      window.addEventListener('keyup', e => { if (e.key === ' ' && PE.S) PE.S.space = false; });
      S.onPaste = e => PE.pasteEvent(e);
      document.addEventListener('paste', S.onPaste, true);
      const cleanup = PE.stop;
      PE.stop = () => { window.removeEventListener('mousemove', S.onMove); window.removeEventListener('mouseup', S.onUp); PE.stop = cleanup; cleanup(); };
    },
    key(e) {
      const S = PE.S; if (!S) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if ((tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') || tag === 'textarea' || tag === 'select') return;
      if (UI.anyModal() && document.querySelectorAll('.modal').length > 1) return; // a dialog on top of the editor
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      let done = true;
      if (ctrl && k === 'z' && !e.shiftKey) PE.undo();
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) PE.redoStep();
      else if (ctrl && k === 's') PE.save(e.shiftKey);
      else if (ctrl && k === 'c') PE.copy();
      else if (ctrl && k === 'x') PE.cut();
      else if (ctrl && k === 'v') return; // handled by the paste event (images from other programs too)
      else if (ctrl && k === 'a') PE.selectAll();
      else if (ctrl) done = false;
      else if (k === 'delete' || k === 'backspace') PE.del();
      else if (k === 'enter') { PE.commitFloat(); S.sel = null; PE.render(); }
      else if (k === ' ') S.space = true;
      else if (k === '[') { S.size = Math.max(1, S.size - 1); PE.renderOpts(); }
      else if (k === ']') { S.size = Math.min(4, S.size + 1); PE.renderOpts(); }
      else if (k === '+' || k === '=') PE.zoomBy(1);
      else if (k === '-' || k === '_') PE.zoomBy(-1);
      else if (k === '0') { PE.fit(); PE.render(); }
      else if (k === '#') { S.showGrid = !S.showGrid; PE.renderOpts(); PE.render(); }
      else if (k === 'x') { S.filled = !S.filled; PE.renderOpts(); }
      else { const t = TOOLS.find(t => t[3] === k); if (t) PE.setTool(t[0]); else done = false; }
      if (done) { e.preventDefault(); e.stopPropagation(); }
    },
    setTool(id) {
      const S = PE.S; if (id !== 'select') PE.commitFloat();
      S.tool = id;
      document.querySelectorAll('.pe-tool').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
      S.view.style.cursor = id === 'select' ? 'crosshair' : id === 'picker' ? 'copy' : 'none';
      PE.renderOpts(); PE.render();
    },

    down(tool, p, e, inside) {
      const S = PE.S;
      if (tool === 'picker') { if (inside) PE.pick(p); return; }
      if (tool === 'select') {
        const r = S.float ? { x: S.float.x, y: S.float.y, w: S.float.canvas.width, h: S.float.canvas.height } : S.sel;
        if (r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) {
          if (!S.float) PE.lift();
          S.drag = { tool, mode: 'move', sx: p.x, sy: p.y, fx: S.float.x, fy: S.float.y };
        } else {
          PE.commitFloat();
          S.drag = { tool, mode: 'new', sx: clamp(p.x, 0, S.w - 1), sy: clamp(p.y, 0, S.h - 1) };
          S.sel = null;
        }
        return;
      }
      PE.commitFloat();
      const L = S.layers[S.active];
      if (!L.visible) { UI.toast('This layer is hidden: show it to draw on it'); return; }
      if (tool === 'fill') { if (inside) PE.fill(p); return; }
      PE.checkpoint();
      if (tool === 'pencil' || tool === 'eraser') {
        const ctx = ctxOf(L.canvas);
        S.drag = { tool, ctx, data: ctx.getImageData(0, 0, S.w, S.h), last: e.shiftKey && S.lastPt ? S.lastPt : { x: p.x, y: p.y } };
        PE.strokeTo(p);
        return;
      }
      if (SHAPES.includes(tool)) { S.drag = { tool, sx: p.x, sy: p.y }; PE.move(p, e); }
    },
    move(p, e) {
      const S = PE.S, d = S.drag; if (!d) return;
      if (d.tool === 'pencil' || d.tool === 'eraser') { PE.strokeTo(p); return; }
      if (d.tool === 'select') {
        if (d.mode === 'move') { S.float.x = d.fx + p.x - d.sx; S.float.y = d.fy + p.y - d.sy; }
        else { const x = clamp(p.x, 0, S.w - 1), y = clamp(p.y, 0, S.h - 1); S.sel = { x: Math.min(d.sx, x), y: Math.min(d.sy, y), w: Math.abs(x - d.sx) + 1, h: Math.abs(y - d.sy) + 1 }; }
        return;
      }
      let x1 = p.x, y1 = p.y;
      if (e && e.shiftKey) {
        const dx = x1 - d.sx, dy = y1 - d.sy;
        if (d.tool === 'line') { if (Math.abs(dx) > 2 * Math.abs(dy)) y1 = d.sy; else if (Math.abs(dy) > 2 * Math.abs(dx)) x1 = d.sx; else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x1 = d.sx + Math.sign(dx) * m; y1 = d.sy + Math.sign(dy) * m; } }
        else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x1 = d.sx + (Math.sign(dx) || 1) * m; y1 = d.sy + (Math.sign(dy) || 1) * m; }
      }
      d.x1 = x1; d.y1 = y1;
      S.preview2 = PE.clipMask(shapeMask(d.tool, S.w, S.h, d.sx, d.sy, x1, y1, S.filled, S.size));
    },
    up(p, e) {
      const S = PE.S, d = S.drag; S.drag = null;
      if (!d) return;
      if (d.tool === 'pencil' || d.tool === 'eraser') { S.lastPt = { x: p.x, y: p.y }; if (d.tool === 'pencil') PE.useColor(); PE.changed(); PE.renderLayers(); return; }
      if (d.tool === 'select') { if (d.mode === 'new' && S.sel && S.sel.w * S.sel.h <= 1 && p.x === d.sx && p.y === d.sy) S.sel = null; PE.changed(true); return; }
      if (S.preview2) { PE.applyMask(S.preview2, S.color); S.preview2 = null; PE.useColor(); PE.changed(); PE.renderLayers(); }
    },

    /* ---------- drawing ---------- */
    clipMask(m) {
      const S = PE.S, r = S.sel; if (!r) return m;
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) m[y * S.w + x] = 0;
      return m;
    },
    strokeTo(p) {
      const S = PE.S, d = S.drag, data = d.data.data, c = d.tool === 'eraser' ? [0, 0, 0, 0] : S.color, r = S.sel;
      const m = shapeMask('line', S.w, S.h, d.last.x, d.last.y, p.x, p.y, true, S.size);
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        const i = y * S.w + x; if (!m[i]) continue;
        if (r && (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h)) continue;
        data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = c[3];
      }
      d.ctx.putImageData(d.data, 0, 0);
      d.last = { x: p.x, y: p.y };
    },
    applyMask(m, c) {
      const S = PE.S, ctx = ctxOf(S.layers[S.active].canvas), id = ctx.getImageData(0, 0, S.w, S.h), data = id.data;
      for (let i = 0; i < m.length; i++) if (m[i]) { data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = c[3]; }
      ctx.putImageData(id, 0, 0);
    },
    fill(p) {
      const S = PE.S; PE.checkpoint();
      const ctx = ctxOf(S.layers[S.active].canvas), id = ctx.getImageData(0, 0, S.w, S.h), d = id.data, W = S.w, H = S.h, r = S.sel;
      const i0 = (p.y * W + p.x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], c = S.color;
      const same = i => (t[3] === 0 && d[i + 3] === 0) || (d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3]);
      if (t[0] === c[0] && t[1] === c[1] && t[2] === c[2] && t[3] === c[3]) return;
      const seen = new Uint8Array(W * H), stack = [p.x, p.y];
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (r && (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h)) continue;
        const k = y * W + x; if (seen[k]) continue; seen[k] = 1;
        const i = k * 4; if (!same(i)) continue;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
      ctx.putImageData(id, 0, 0);
      PE.useColor(); PE.changed(); PE.renderLayers();
    },
    pick(p) {
      const S = PE.S, img = PE.composite(false), px = img.getContext('2d').getImageData(p.x, p.y, 1, 1).data;
      if (S.preview === 'autotile' && S.grid) { const T = S.grid[0], n = Math.floor(p.y / T) * Math.floor(S.w / T) + Math.floor(p.x / T); S.lastSquare = n; }
      if (px[3] === 0) { UI.toast('That pixel is transparent'); return; }
      S.color = [px[0], px[1], px[2], px[3]];
      PE.colorChanged(true);
      if (S.tool === 'picker') PE.setTool('pencil');
    },

    /* ---------- selection ---------- */
    lift() {
      const S = PE.S; if (!S.sel) return;
      PE.checkpoint();
      const r = S.sel, L = S.layers[S.active], c = newCanvas(r.w, r.h);
      c.getContext('2d').drawImage(L.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      L.canvas.getContext('2d').clearRect(r.x, r.y, r.w, r.h);
      S.float = { canvas: c, x: r.x, y: r.y };
      S.sel = null;
    },
    commitFloat() {
      const S = PE.S; if (!S || !S.float) return;
      const f = S.float;
      S.layers[S.active].canvas.getContext('2d').drawImage(f.canvas, f.x, f.y);
      const x = Math.max(0, f.x), y = Math.max(0, f.y), x2 = Math.min(S.w, f.x + f.canvas.width), y2 = Math.min(S.h, f.y + f.canvas.height);
      S.sel = x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
      S.float = null;
      PE.changed(); PE.renderLayers();
    },
    selectAll() { const S = PE.S; PE.commitFloat(); S.sel = { x: 0, y: 0, w: S.w, h: S.h }; PE.setTool('select'); },
    copy() {
      const S = PE.S, r = S.float ? null : S.sel;
      if (S.float) { PE.clip = cloneCanvas(S.float.canvas); UI.toast('Copied'); return; }
      if (!r) return UI.toast('Select something first (M)');
      const c = newCanvas(r.w, r.h); c.getContext('2d').drawImage(S.layers[S.active].canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      PE.clip = c; UI.toast('Copied ' + r.w + ' × ' + r.h);
    },
    cut() { const S = PE.S; PE.copy(); if (S.float) { PE.checkpoint(); S.float = null; PE.changed(); } else if (S.sel) PE.del(); },
    del() {
      const S = PE.S;
      if (S.float) { S.float = null; PE.changed(); PE.renderLayers(); return; }
      if (!S.sel) return;
      PE.checkpoint(); S.layers[S.active].canvas.getContext('2d').clearRect(S.sel.x, S.sel.y, S.sel.w, S.sel.h); PE.changed(); PE.renderLayers();
    },
    paste(canvas) {
      const S = PE.S, c = canvas || PE.clip;
      if (!c) return UI.toast('Nothing copied yet');
      PE.commitFloat(); PE.checkpoint();
      const x = S.sel ? S.sel.x : S.hover ? S.hover.x : 0, y = S.sel ? S.sel.y : S.hover ? S.hover.y : 0;
      S.float = { canvas: cloneCanvas(c), x: Math.min(x, Math.max(0, S.w - c.width)), y: Math.min(y, Math.max(0, S.h - c.height)) };
      S.sel = null;
      PE.setTool('select'); PE.changed();
    },
    pasteEvent(e) {
      if (!PE.S) return;
      const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea') return;
      const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'));
      e.preventDefault();
      if (!item) return PE.paste();
      const url = URL.createObjectURL(item.getAsFile());
      loadImg(url).then(img => { URL.revokeObjectURL(url); if (!img) return PE.paste(); const c = newCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); PE.paste(c); UI.toast('Pasted a ' + img.width + ' × ' + img.height + ' picture: drag it into place, then press Enter'); });
    },
    transform(t) {
      const S = PE.S;
      if (!S.float && !S.sel) { S.sel = { x: 0, y: 0, w: S.w, h: S.h }; }
      if (!S.float) PE.lift(); else PE.checkpoint();
      const f = S.float, src = f.canvas, W = src.width, H = src.height;
      const c = t === 'r' ? newCanvas(H, W) : newCanvas(W, H), g = c.getContext('2d');
      if (t === 'h') { g.translate(W, 0); g.scale(-1, 1); }
      if (t === 'v') { g.translate(0, H); g.scale(1, -1); }
      if (t === 'r') { g.translate(H, 0); g.rotate(Math.PI / 2); }
      g.drawImage(src, 0, 0);
      if (t === 'r') { f.x += Math.floor((W - H) / 2); f.y += Math.floor((H - W) / 2); }
      f.canvas = c;
      PE.setTool('select'); PE.changed();
    },

    /* ---------- undo ---------- */
    snapshot() {
      const S = PE.S;
      return { active: S.active, layers: S.layers.map(L => ({ name: L.name, visible: L.visible, opacity: L.opacity, canvas: cloneCanvas(L.canvas) })) };
    },
    checkpointBase() { const S = PE.S; S.undo = [PE.snapshot()]; S.redo = []; },
    // Call before a change: keeps the state as it is now.
    checkpoint() {
      const S = PE.S;
      S.undo[S.undo.length - 1] = PE.snapshot(); // the latest state (it may have changed since the last checkpoint)
      S.undo.push(null); // placeholder for the state after this change
      if (S.undo.length > 80) S.undo.shift();
      S.redo = [];
    },
    restore(snap) {
      const S = PE.S;
      S.layers = snap.layers.map(L => ({ name: L.name, visible: L.visible, opacity: L.opacity, canvas: cloneCanvas(L.canvas) }));
      S.active = Math.min(snap.active, S.layers.length - 1);
    },
    undo() {
      const S = PE.S; PE.commitFloatNoUndo();
      if (S.undo.length < 2) return;
      S.redo.push(PE.snapshot());
      S.undo.pop();
      PE.restore(S.undo[S.undo.length - 1]);
      S.sel = null; PE.changed(); PE.renderLayers(); PE.renderOpts();
    },
    redoStep() {
      const S = PE.S; if (!S.redo.length) return;
      const snap = S.redo.pop();
      S.undo[S.undo.length - 1] = PE.snapshot(); S.undo.push(null);
      PE.restore(snap);
      PE.changed(); PE.renderLayers(); PE.renderOpts();
    },
    commitFloatNoUndo() { const S = PE.S; if (S.float) { S.layers[S.active].canvas.getContext('2d').drawImage(S.float.canvas, S.float.x, S.float.y); S.float = null; } },
    changed(selectionOnly) {
      const S = PE.S;
      if (!selectionOnly) S.dirty = true;
      if (S.undo.length && S.undo[S.undo.length - 1] === null) S.undo[S.undo.length - 1] = PE.snapshot();
      PE.render(); PE.renderOpts();
    },

    /* ---------- saving ---------- */
    async save(asNew) {
      const S = PE.S; if (!S) return false;
      PE.commitFloat();
      let rel = S.rel;
      if (asNew || (S.isNew && !S.savedOnce && !S.named)) {
        const base = rel.split('/').pop().replace(/\.png$/i, '');
        const name = await UI.prompt(asNew ? 'Save as' : 'Save picture', base, 'Name (saved in assets/' + S.kind + '/)');
        if (!name) return false;
        rel = S.kind + '/' + fileSlug(name, base) + '.png';
        if (rel !== S.rel && await window.api.pixelExists(App.proj.path, rel)) {
          if (!await UI.confirm('Replace ' + rel.split('/').pop() + '?', 'There is already a picture called ' + rel + ' in this project. Replace it?')) return false;
        }
        S.named = true;
      }
      const flat = PE.composite(false), png = flat.toDataURL('image/png').split(',')[1];
      const layers = { w: S.w, h: S.h, active: S.active, layers: S.layers.map(L => ({ name: L.name, visible: L.visible, opacity: L.opacity, data: L.canvas.toDataURL('image/png') })) };
      try { await window.api.pixelSave(App.proj.path, rel, png, layers); }
      catch (err) { UI.alert('Could not save', String(err.message || err)); return false; }
      const wasNew = !(App.assets[S.kind] || []).includes(rel);
      // A non-PNG picture saved as PNG: switch everything that used the old file over to the new one.
      if (S.origRel !== rel && !asNew && S.origRel.replace(/\.[^.\/]+$/, '.png') === rel) PE.renameRefs(S.origRel, rel);
      if (wasNew) {
        App.proj.credits = App.proj.credits || {};
        if (!App.proj.credits[rel]) App.proj.credits[rel] = { name: rel.split('/').pop().replace(/\.png$/, ''), origin: 'Drawn in the Pocket-Game-Maker pixel editor', author: '', licence: 'Not set', status: 'Custom' };
        App.markDirty();
      }
      S.rel = rel; S.origRel = rel; S.dirty = false; S.savedOnce = true; S.isNew = false;
      if (S.modal && S.modal.box) S.modal.box.querySelector('.modal-head h2').textContent = 'Edit ' + (KIND_NAME[S.kind] || 'picture').toLowerCase() + ': ' + rel;
      // Show the new picture everywhere in the editor.
      App.assetVersion = Date.now();
      await UI.refreshAssets(S.kind);
      if (window.MapEditor) { MapEditor.sprites = {}; if (MapEditor.loadTileset) await MapEditor.loadTileset(); MapEditor.cacheMapId = null; MapEditor.render && MapEditor.render(); MapEditor.renderPalette && MapEditor.renderPalette(); }
      App.renderInspector && App.renderInspector();
      PE.renderStatus();
      UI.toast('Saved assets/' + rel);
      if (wasNew && S.kind === 'tilesets' && window.Importer) Importer.offerTilesets([rel]);
      return true;
    },
    renameRefs(from, to) {
      const walk = o => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if (o[k] === from) o[k] = to; else walk(o[k]); } };
      const P = App.proj; walk(P.system); walk(P.monsters); walk(P.items); walk(P.tilesets); walk(P.maps);
      App.markDirty();
    }
  };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  PE.shapeMask = shapeMask; // for tests
  PE.PRESETS = PRESETS;
})();
