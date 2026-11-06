/* Map canvas + tileset palette. */
(function () {
  'use strict';
  const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
  const ME = window.MapEditor = {
    tsImg: null, ts: 16, cols: 8, rows: 0,
    brush: { x: 0, y: 0, w: 1, h: 1 },
    cache: null, cacheMapId: null,
    undoStack: [], redoStack: [],
    sprites: {},
    hover: null, drag: null,

    init() {
      this.canvas = document.getElementById('map-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.pal = document.getElementById('palette');
      this.pctx = this.pal.getContext('2d');
      const c = this.canvas;
      c.addEventListener('mousedown', e => this.onDown(e));
      window.addEventListener('mousemove', e => this.onMove(e));
      window.addEventListener('mouseup', e => this.onUp(e));
      c.addEventListener('dblclick', e => this.onDbl(e));
      c.addEventListener('contextmenu', e => e.preventDefault());
      c.addEventListener('mouseleave', () => { this.hover = null; this.render(); });
      this.pal.addEventListener('mousedown', e => this.palDown(e));
      this.pal.addEventListener('contextmenu', e => e.preventDefault());
      this.pal.addEventListener('mousemove', e => {
        const ts = App.tileset(); if (!ts || !this.tsImg) return;
        const r = this.pal.getBoundingClientRect(), S = this.ts * this.palZ;
        const i = Math.floor((e.clientY - r.top) / S) * this.cols + Math.floor((e.clientX - r.left) / S);
        const own = (this.parts || {})[i]; if (own !== undefined) i = own;
        const f = (ts.flags || [])[i] || {};
        const label = ((ts.names || [])[i] || 'Tile ' + i) + ' · ' + (f.over ? 'above player' : f.pass ? 'walkable' : 'blocked') + (f.enc ? ' · encounters' : '') + (f.auto ? ' · autotile' : '') + (f.anim > 1 ? ' · animated (' + f.anim + ' frames)' : '');
        this.pal.title = label; document.getElementById('palette-hint').textContent = label;
      });
      document.getElementById('map-scroll').addEventListener('wheel', e => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        App.setZoom(App.zoom + (e.deltaY < 0 ? 1 : -1));
      }, { passive: false });
    },

    async loadTileset() {
      const ts = App.tileset();
      this.cacheMapId = null;
      document.getElementById('tileset-name').textContent = ts ? ts.name : '';
      if (!ts) { this.tsImg = null; return; }
      this.ts = ts.tileSize || 16;
      this.tsImg = await UI.loadImage(ts.image);
      this.cacheMapId = null; // the map may have been drawn while the image was still loading
      if (this.tsImg) {
        this.cols = Math.floor(this.tsImg.width / this.ts);
        this.rows = Math.floor(this.tsImg.height / this.ts);
        const n = this.cols * this.rows;
        ts.flags = ts.flags || [];
        while (ts.flags.length < n) ts.flags.push({ pass: true, enc: false, over: false });
      }
      this.brush = { x: 0, y: 0, w: 1, h: 1 };
    },

    /* ---------- tile cache ---------- */
    // One cached canvas per layer, so each layer can be hidden or faded independently.
    cacheKey(m) { return m.id + ':' + m.width + 'x' + m.height + ':' + m.tilesetId + ':' + m.layers.length; },
    rebuildCache() {
      const m = App.map(); if (!m) return;
      MF.Layers.migrate(m);
      this.caches = m.layers.map(() => { const c = document.createElement('canvas'); c.width = m.width * this.ts; c.height = m.height * this.ts; return c; });
      this.cacheMapId = this.cacheKey(m);
      this.redrawTiles(0, 0, m.width, m.height);
    },
    redrawTiles(x0, y0, w, h) {
      const m = App.map(); if (!m || !this.caches) return;
      if (this.cacheMapId !== this.cacheKey(m)) return this.rebuildCache();
      const ts = this.ts, tsd = App.tileset() || { flags: [] };
      // one square of margin: autotiles next to a changed square may change shape too
      const x1 = Math.min(m.width, x0 + w + 1), y1 = Math.min(m.height, y0 + h + 1);
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
      for (let L = 0; L < m.layers.length; L++) {
        const g = this.caches[L].getContext('2d');
        g.clearRect(x0 * ts, y0 * ts, (x1 - x0) * ts, (y1 - y0) * ts);
        if (!this.tsImg) continue;
        const layer = m.layers[L];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const t = layer[y * m.width + x];
          if (t < 0 || t === undefined || t === null) continue;
          MF.Tiles.drawTile(g, this.tsImg, tsd, this.cols, ts, t, x * ts, y * ts, layer, m.width, m.height, x, y, 0);
        }
      }
    },

    sprite(rel) {
      if (!rel) return null;
      if (this.sprites[rel] === undefined) {
        this.sprites[rel] = null;
        UI.loadImage(rel).then(img => { this.sprites[rel] = img || false; this.render(); });
      }
      return this.sprites[rel] || null;
    },

    /* ---------- render ---------- */
    render() {
      const m = App.map(), c = this.canvas, g = this.ctx;
      if (!m) { c.width = c.height = 0; return; }
      if (this.cacheMapId !== this.cacheKey(m)) this.rebuildCache();
      const z = App.zoom, ts = this.ts, S = ts * z;
      c.width = m.width * S; c.height = m.height * S;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      m.layers.forEach((l, L) => {
        const info = m.layerInfo[L] || {};
        if (info.visible === false) return;
        const dim = App.dimOthers && App.mode === 'map' && L !== App.layer ? 0.3 : 1;
        g.globalAlpha = Math.max(0, Math.min(1, info.opacity == null ? 1 : info.opacity)) * dim;
        g.drawImage(this.caches[L], 0, 0, c.width, c.height);
      });
      g.globalAlpha = 1;

      const tsd = App.tileset();
      if (App.showPass && tsd) {
        for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
          const f = this.cellFlags(m, tsd, x, y);
          if (!f.pass) { g.fillStyle = 'rgba(255,60,80,.35)'; g.fillRect(x * S, y * S, S, S); }
          else if (f.enc) { g.fillStyle = 'rgba(80,255,120,.28)'; g.fillRect(x * S, y * S, S, S); }
        }
      }
      if (App.mode === 'map' && (m.layerInfo[App.layer] || {}).above) { g.fillStyle = 'rgba(60,120,255,.08)'; g.fillRect(0, 0, c.width, c.height); }

      if (App.showGrid && z >= 1) {
        g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.beginPath();
        for (let x = 0; x <= m.width; x++) { g.moveTo(x * S + .5, 0); g.lineTo(x * S + .5, c.height); }
        for (let y = 0; y <= m.height; y++) { g.moveTo(0, y * S + .5); g.lineTo(c.width, y * S + .5); }
        g.stroke();
      }

      // map edges that lead to other maps
      Object.entries(m.edges || {}).forEach(([d, e]) => {
        const to = App.proj.maps[e.mapId]; if (!to) return;
        const B = Math.max(4, S * 0.22);
        g.fillStyle = 'rgba(255,200,60,.35)';
        if (d === 'up') g.fillRect(0, 0, c.width, B); else if (d === 'down') g.fillRect(0, c.height - B, c.width, B);
        else if (d === 'left') g.fillRect(0, 0, B, c.height); else g.fillRect(c.width - B, 0, B, c.height);
        const label = { up: '↑ ', down: '↓ ', left: '← ', right: '→ ' }[d] + to.name;
        g.font = 'bold 11px sans-serif'; const tw = g.measureText(label).width + 10;
        let lx = (c.width - tw) / 2, ly = (c.height - 16) / 2;
        if (d === 'up') ly = B + 2; if (d === 'down') ly = c.height - B - 18; if (d === 'left') lx = B + 2; if (d === 'right') lx = c.width - B - tw - 2;
        g.fillStyle = 'rgba(20,16,4,.8)'; g.fillRect(lx, ly, tw, 16); g.fillStyle = '#ffd36b'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(label, lx + 5, ly + 8);
      });

      // monster encounter areas
      const zoneOf = ev => { const pg = (ev.pages || []).find(p => p.trigger === 'encounter' && p.encounter); return pg ? MF.Quick.zoneRect(ev, pg.encounter) : null; };
      const pv = window.QuickEvent && QuickEvent.preview;
      m.events.forEach(ev => {
        let r = zoneOf(ev);
        if (pv && pv.ev === ev && pv.q.type === 'encounter') r = MF.Quick.zoneRect(ev, pv.q);
        if (!r) return;
        if (this.drag && this.drag.kind === 'event' && this.drag.id === ev.id && this.hover) { r.x += this.hover.x - ev.x; r.y += this.hover.y - ev.y; }
        g.fillStyle = App.mode === 'event' ? 'rgba(255,70,160,.20)' : 'rgba(255,70,160,.10)'; g.fillRect(r.x * S, r.y * S, r.w * S, r.h * S);
        g.strokeStyle = '#ff5fb0'; g.setLineDash([6, 4]); g.lineWidth = 2; g.strokeRect(r.x * S + 1, r.y * S + 1, r.w * S - 2, r.h * S - 2); g.setLineDash([]);
        if (App.mode === 'event') { g.fillStyle = '#ff9fd0'; g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('❖ ' + ev.name, r.x * S + 4, r.y * S + 4); }
      });
      if (pv && !pv.ev && pv.q.type === 'encounter') { const r = MF.Quick.zoneRect({ x: pv.x, y: pv.y }, pv.q); g.fillStyle = 'rgba(255,70,160,.25)'; g.fillRect(r.x * S, r.y * S, r.w * S, r.h * S); g.strokeStyle = '#ff5fb0'; g.lineWidth = 2; g.strokeRect(r.x * S + 1, r.y * S + 1, r.w * S - 2, r.h * S - 2); }
      if (App.mode === 'event') {
        let sel = this.area;
        if (this.drag && this.drag.kind === 'area' && this.hover) sel = this.normRect(this.drag.sx, this.drag.sy, this.hover.x, this.hover.y);
        if (sel) { g.fillStyle = 'rgba(89,180,255,.18)'; g.fillRect(sel.x * S, sel.y * S, sel.w * S, sel.h * S); g.strokeStyle = '#59b4ff'; g.setLineDash([5, 3]); g.lineWidth = 2; g.strokeRect(sel.x * S + 1, sel.y * S + 1, sel.w * S - 2, sel.h * S - 2); g.setLineDash([]); }
      }

      // cut-scene trigger areas and the selected event's route
      m.events.forEach(ev => {
        const pg = (ev.pages || []).find(p => p.trigger === 'touch' && p.area);
        if (!pg) return;
        g.fillStyle = 'rgba(120,200,255,.12)'; g.fillRect(ev.x * S, ev.y * S, pg.area.width * S, pg.area.height * S);
        g.strokeStyle = '#7cc8ff'; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.strokeRect(ev.x * S + 1, ev.y * S + 1, pg.area.width * S - 2, pg.area.height * S - 2); g.setLineDash([]);
      });
      const selEv = App.mode === 'event' && App.selectedEvent();
      if (selEv) (selEv.pages || []).forEach(pg => {
        if (pg.move !== 'route' || !pg.route || !(pg.route.steps || []).length) return;
        const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        let x = selEv.x, y = selEv.y;
        g.strokeStyle = 'rgba(255,210,100,.9)'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x * S + S / 2, y * S + S / 2);
        pg.route.steps.forEach(st => { const d = D[st]; if (!d) return; x += d[0]; y += d[1]; g.lineTo(x * S + S / 2, y * S + S / 2); });
        g.stroke(); g.setLineDash([]);
      });

      // events
      const evAlpha = App.mode === 'event' ? 1 : .55;
      m.events.forEach(ev => {
        let ex = ev.x, ey = ev.y;
        if (this.drag && this.drag.kind === 'event' && this.drag.id === ev.id && this.hover) { ex = this.hover.x; ey = this.hover.y; }
        const p = ev.pages[0] || {};
        const img = this.sprite(p.sprite);
        g.globalAlpha = evAlpha;
        if (img) {
          const fw = img.width / 3, fh = img.height / 4;
          const scale = z;
          const dw = fw * scale, dh = fh * scale;
          g.drawImage(img, fw, (DIR_ROW[p.dir] || 0) * fh, fw, fh, ex * S + (S - dw) / 2, ey * S + S - dh, dw, dh);
        }
        g.globalAlpha = 1;
        if (App.mode === 'event') {
          const sel = ev.id === App.selectedEventId;
          g.strokeStyle = sel ? '#ff9f43' : 'rgba(255,255,255,.75)';
          g.lineWidth = sel ? 2 : 1;
          g.strokeRect(ex * S + 1.5, ey * S + 1.5, S - 3, S - 3);
          if (!img) { g.fillStyle = 'rgba(255,159,67,.18)'; g.fillRect(ex * S + 2, ey * S + 2, S - 4, S - 4); }
        }
      });

      // start position
      const st = App.proj.system.start;
      if (st && st.mapId === m.id) {
        g.fillStyle = 'rgba(80,170,255,.35)'; g.fillRect(st.x * S, st.y * S, S, S);
        g.strokeStyle = '#59b4ff'; g.lineWidth = 2; g.strokeRect(st.x * S + 1, st.y * S + 1, S - 2, S - 2);
        g.fillStyle = '#fff'; g.font = 'bold ' + Math.max(9, 7 * z) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('S', st.x * S + S / 2, st.y * S + S / 2);
      }

      // cursor / brush preview
      if (this.hover && App.mode === 'map') {
        if (this.drag && this.drag.kind === 'rect') {
          const r = this.normRect(this.drag.sx, this.drag.sy, this.hover.x, this.hover.y);
          g.strokeStyle = '#ff9f43'; g.lineWidth = 2; g.strokeRect(r.x * S, r.y * S, r.w * S, r.h * S);
        } else {
          const bw = App.tool === 'erase' || App.tool === 'fill' ? 1 : this.brush.w, bh = App.tool === 'erase' || App.tool === 'fill' ? 1 : this.brush.h;
          if (App.tool === 'pencil' && this.tsImg) {
            g.globalAlpha = .55;
            for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
              const t = this.brushTileAt(i, j);
              g.drawImage(this.tsImg, (t % this.cols) * ts, Math.floor(t / this.cols) * ts, ts, ts, (this.hover.x + i) * S, (this.hover.y + j) * S, S, S);
            }
            g.globalAlpha = 1;
          }
          g.strokeStyle = App.tool === 'erase' ? '#ff5c6c' : '#ff9f43'; g.lineWidth = 2;
          g.strokeRect(this.hover.x * S + 1, this.hover.y * S + 1, bw * S - 2, bh * S - 2);
        }
      } else if (this.hover && App.mode === 'event') {
        g.strokeStyle = 'rgba(255,159,67,.8)'; g.setLineDash([4, 3]); g.lineWidth = 1;
        g.strokeRect(this.hover.x * S + .5, this.hover.y * S + .5, S - 1, S - 1); g.setLineDash([]);
      }
    },

    cellFlags(m, tsd, x, y) { return MF.Layers.cellFlags(m, tsd, x, y); },

    renderPalette() {
      const p = this.pal, g = this.pctx;
      if (!this.tsImg) { p.width = 200; p.height = 60; g.fillStyle = '#888'; g.font = '12px sans-serif'; g.fillText('No tileset image', 10, 30); return; }
      const z = Math.max(1, Math.floor(260 / (this.cols * this.ts))) || 1;
      this.palZ = z;
      const S = this.ts * z;
      p.width = this.cols * S; p.height = this.rows * S;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, p.width, p.height);
      g.drawImage(this.tsImg, 0, 0, this.cols * this.ts, this.rows * this.ts, 0, 0, p.width, p.height);
      const tsd = App.tileset();
      // autotile parts and later animation frames are dimmed: paint with the block's first tile
      const parts = tsd ? MF.Tiles.partsOf(tsd, this.cols) : {};
      this.parts = parts;
      Object.keys(parts).forEach(i => { i = +i; g.fillStyle = 'rgba(20,22,28,.62)'; g.fillRect((i % this.cols) * S, Math.floor(i / this.cols) * S, S, S); });
      if (tsd) (tsd.flags || []).forEach((f, i) => {
        if (!f || (!f.auto && !(f.anim > 1))) return;
        const x = (i % this.cols) * S, y = Math.floor(i / this.cols) * S;
        const tag = (f.auto ? 'A' : '') + (f.anim > 1 ? '▶' : '');
        g.font = 'bold 10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
        const tw = g.measureText(tag).width + 4;
        g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x + 1, y + 1, tw, 12); g.fillStyle = '#ffd28a'; g.fillText(tag, x + 3, y + 2);
      });
      if (App.showPass && tsd) {
        g.font = 'bold ' + Math.max(10, S * .45) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i < this.cols * this.rows; i++) {
          const f = tsd.flags[i] || {}; const x = (i % this.cols) * S, y = Math.floor(i / this.cols) * S;
          const mark = f.over ? '☆' : f.pass ? (f.enc ? '♣' : '○') : '×';
          g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, S, S);
          g.fillStyle = f.pass ? (f.enc ? '#7dff9a' : '#cfe3ff') : '#ff6b7a';
          g.fillText(mark, x + S / 2, y + S / 2);
        }
      }
      g.strokeStyle = 'rgba(255,255,255,.06)';
      for (let x = 0; x <= this.cols; x++) { g.beginPath(); g.moveTo(x * S + .5, 0); g.lineTo(x * S + .5, p.height); g.stroke(); }
      for (let y = 0; y <= this.rows; y++) { g.beginPath(); g.moveTo(0, y * S + .5); g.lineTo(p.width, y * S + .5); g.stroke(); }
      const b = this.brush;
      g.strokeStyle = '#ff9f43'; g.lineWidth = 2; g.strokeRect(b.x * S + 1, b.y * S + 1, b.w * S - 2, b.h * S - 2);
    },

    palDown(e) {
      if (!this.tsImg) return;
      const r = this.pal.getBoundingClientRect(), S = this.ts * this.palZ;
      const at = ev => ({ x: Math.max(0, Math.min(this.cols - 1, Math.floor((ev.clientX - r.left) / S))), y: Math.max(0, Math.min(this.rows - 1, Math.floor((ev.clientY - r.top) / S))) });
      let s = at(e);
      const own = (this.parts || {})[s.y * this.cols + s.x];
      if (own !== undefined) { s = { x: own % this.cols, y: Math.floor(own / this.cols) }; } // clicked inside an autotile block: use its first tile
      const set = ev => { const c = own !== undefined ? s : at(ev); this.brush = this.normRect(s.x, s.y, c.x, c.y); this.renderPalette(); };
      set(e);
      const mv = ev => set(ev);
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (App.mode !== 'map') App.setMode('map'); if (App.tool === 'erase') App.setTool('pencil'); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    },

    /* ---------- map mouse ---------- */
    cellAt(e) {
      const m = App.map(); if (!m) return null;
      const r = this.canvas.getBoundingClientRect(), S = this.ts * App.zoom;
      const x = Math.floor((e.clientX - r.left) / S), y = Math.floor((e.clientY - r.top) / S);
      return { x, y, inside: x >= 0 && y >= 0 && x < m.width && y < m.height };
    },
    normRect(ax, ay, bx, by) { return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 }; },
    eventAt(x, y) { const m = App.map(); return m ? m.events.find(e => e.x === x && e.y === y) : null; },

    onDown(e) {
      const c = this.cellAt(e); if (!c || !c.inside) return;
      const m = App.map();
      if (App.mode === 'map') {
        if (e.button === 2) { this.pickTile(c.x, c.y); return; }
        if (e.button !== 0) return;
        const li = m.layerInfo[App.layer] || {};
        if (li.locked) { UI.toast('The layer “' + li.name + '” is locked. Unlock it in the Layers panel to paint on it.'); return; }
        if (li.visible === false) { UI.toast('The layer “' + li.name + '” is hidden. Show it in the Layers panel to paint on it.'); return; }
        if (App.tool === 'pencil' || App.tool === 'erase') { this.pushUndo(); this.drag = { kind: 'paint' }; this.paintAt(c.x, c.y); }
        else if (App.tool === 'rect') { this.drag = { kind: 'rect', sx: c.x, sy: c.y }; }
        else if (App.tool === 'fill') { this.pushUndo(); this.floodFill(c.x, c.y); }
        return;
      }
      // event mode
      const ev = this.eventAt(c.x, c.y);
      if (e.button === 2) {
        if (ev) { App.selectedEventId = ev.id; this.render(); App.renderInspector(); }
        UI.menu(e.clientX, e.clientY, [
          ev && ev.quick ? { label: 'Edit ' + QuickEvent.TYPES[ev.quick.type].label.toLowerCase() + '…', action: () => QuickEvent.edit(ev) } : null,
          ev ? { label: ev.quick ? 'Full event editor…' : 'Edit event…', action: () => EventEditor.open(ev) } : { label: 'New event here…', action: () => EventEditor.open(App.newEvent(c.x, c.y)) },
          ...(ev ? [] : ['-'].concat(QuickEvent.menuItems(c.x, c.y, this.area && c.x >= this.area.x && c.y >= this.area.y && c.x < this.area.x + this.area.w && c.y < this.area.y + this.area.h ? this.area : null))),
          ev ? { label: 'Copy event', action: () => { App.clipboardEvent = JSON.stringify(ev); UI.toast('Event copied'); } } : null,
          !ev ? { label: 'Paste event', disabled: !App.clipboardEvent, action: () => App.pasteEvent(c.x, c.y) } : null,
          ev ? { label: 'Delete event', action: () => App.deleteEvent(ev.id) } : null,
          '-',
          { label: 'Set player start here', action: () => App.setStart(c.x, c.y) },
          { label: 'Playtest from here', action: () => App.playtest({ mapId: m.id, x: c.x, y: c.y }) }
        ]);
        return;
      }
      App.selectedEventId = ev ? ev.id : null;
      if (ev) this.drag = { kind: 'event', id: ev.id, sx: c.x, sy: c.y };
      else { this.area = null; this.drag = { kind: 'area', sx: c.x, sy: c.y }; }
      this.render(); App.renderInspector();
    },
    onMove(e) {
      const c = this.cellAt(e);
      if (!c) return;
      const prev = this.hover;
      if (c.inside) this.hover = { x: c.x, y: c.y };
      const m = App.map();
      if (c.inside) {
        const tsd = App.tileset();
        const t = m.layers[App.layer][c.y * m.width + c.x];
        const f = tsd ? this.cellFlags(m, tsd, c.x, c.y) : {};
        document.getElementById('st-pos').textContent = 'X ' + c.x + '  Y ' + c.y + '   (' + m.name + ')';
        const ev = this.eventAt(c.x, c.y);
        const tname = tsd && tsd.names && t >= 0 && tsd.names[t] ? ' ' + tsd.names[t] : '';
        document.getElementById('st-tile').textContent = 'Layer ' + (App.layer + 1) + ' (' + ((m.layerInfo[App.layer] || {}).name || '') + ') tile ' + (t < 0 ? '—' : t + tname) + '  ·  ' + (f.pass ? 'passable' : 'blocked') + (f.enc ? ' · encounters' : '') + (ev ? '  ·  event: ' + ev.name : '');
      }
      if (this.drag && this.drag.kind === 'paint' && c.inside) this.paintAt(c.x, c.y);
      if (!prev || !this.hover || prev.x !== this.hover.x || prev.y !== this.hover.y || this.drag) this.render();
    },
    onUp(e) {
      const d = this.drag; this.drag = null;
      if (!d) return;
      const m = App.map();
      if (d.kind === 'rect' && this.hover) {
        this.pushUndo();
        const r = this.normRect(d.sx, d.sy, this.hover.x, this.hover.y);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
          this.setTile(x, y, this.brushTileAt(x - r.x, y - r.y));
        }
        this.redrawTiles(r.x, r.y, r.w, r.h); App.markDirty();
      }
      if (d.kind === 'area' && this.hover) {
        const r = this.normRect(d.sx, d.sy, this.hover.x, this.hover.y);
        this.area = (r.w > 1 || r.h > 1) ? r : null;
        if (this.area) UI.toast('Selected ' + r.w + '×' + r.h + ' squares. Right-click inside to make a monster encounter area.');
      }
      if (d.kind === 'event' && this.hover) {
        const ev = m.events.find(x => x.id === d.id);
        const { x, y } = this.hover;
        if (ev && (x !== ev.x || y !== ev.y)) {
          if (this.eventAt(x, y)) UI.toast('There is already an event on that tile');
          else { ev.x = x; ev.y = y; App.markDirty(); App.renderInspector(); }
        }
      }
      this.render();
    },
    onDbl(e) {
      if (App.mode !== 'event') return;
      const c = this.cellAt(e); if (!c || !c.inside) return;
      const ev = this.eventAt(c.x, c.y);
      if (ev && ev.quick) QuickEvent.edit(ev); else EventEditor.open(ev || App.newEvent(c.x, c.y));
    },

    brushTileAt(i, j) {
      const b = this.brush;
      const t = (b.y + (j % b.h)) * this.cols + b.x + (i % b.w);
      const own = (this.parts || {})[t];
      return own !== undefined ? own : t;
    },
    setTile(x, y, t) {
      const m = App.map();
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) return;
      m.layers[App.layer][y * m.width + x] = t;
    },
    paintAt(x, y) {
      if (App.tool === 'erase') { this.setTile(x, y, -1); this.redrawTiles(x, y, 1, 1); App.markDirty(); return; }
      const b = this.brush;
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) this.setTile(x + i, y + j, this.brushTileAt(i, j));
      this.redrawTiles(x, y, b.w, b.h); App.markDirty();
    },
    floodFill(x, y) {
      const m = App.map(), L = m.layers[App.layer], W = m.width;
      const target = L[y * W + x];
      const seen = new Uint8Array(W * m.height);
      const st = [[x, y]];
      while (st.length) {
        const [cx, cy] = st.pop();
        if (cx < 0 || cy < 0 || cx >= W || cy >= m.height) continue;
        const i = cy * W + cx;
        if (seen[i] || L[i] !== target) continue;
        seen[i] = 1;
        L[i] = this.brushTileAt(((cx - x) % this.brush.w + this.brush.w) % this.brush.w, ((cy - y) % this.brush.h + this.brush.h) % this.brush.h);
        st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      this.redrawTiles(0, 0, W, m.height); App.markDirty(); this.render();
    },
    pickTile(x, y) {
      const m = App.map();
      for (let L = App.layer; L >= 0; L--) {
        const t = m.layers[L][y * m.width + x];
        if (t >= 0) { this.brush = { x: t % this.cols, y: Math.floor(t / this.cols), w: 1, h: 1 }; this.renderPalette(); if (App.tool !== 'pencil') App.setTool('pencil'); return; }
      }
    },

    /* ---------- history ---------- */
    snapshot() { const m = App.map(); return m ? { mapId: m.id, w: m.width, h: m.height, layers: m.layers.map(l => l.slice()), info: JSON.stringify(m.layerInfo), events: JSON.stringify(m.events) } : null; },
    restore(s) {
      const m = App.proj.maps[s.mapId]; if (!m) return;
      m.layers = s.layers; m.width = s.w; m.height = s.h; m.events = JSON.parse(s.events); if (s.info) m.layerInfo = JSON.parse(s.info);
      if (App.layer >= m.layers.length) App.layer = m.layers.length - 1;
      if (App.mapId !== s.mapId) App.selectMap(s.mapId);
      this.cacheMapId = null; App.markDirty(); this.render(); App.renderInspector(); App.renderMapList(); if (window.LayersPanel) LayersPanel.render();
    },
    pushUndo() { const s = this.snapshot(); if (!s) return; this.undoStack.push(s); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack = []; },
    undo() {
      const s = this.undoStack.pop(); if (!s) return UI.toast('Nothing to undo');
      const cur = App.proj.maps[s.mapId];
      if (cur) this.redoStack.push({ mapId: s.mapId, w: cur.width, h: cur.height, layers: cur.layers.map(l => l.slice()), info: JSON.stringify(cur.layerInfo), events: JSON.stringify(cur.events) });
      this.restore(s);
    },
    redo() {
      const s = this.redoStack.pop(); if (!s) return UI.toast('Nothing to redo');
      const cur = App.proj.maps[s.mapId];
      if (cur) this.undoStack.push({ mapId: s.mapId, w: cur.width, h: cur.height, layers: cur.layers.map(l => l.slice()), info: JSON.stringify(cur.layerInfo), events: JSON.stringify(cur.events) });
      this.restore(s);
    },
    resetHistory() { this.undoStack = []; this.redoStack = []; this.sprites = {}; }
  };
})();
