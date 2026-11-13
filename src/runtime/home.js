/* Optional player features: decorating a home and changing clothes.
   Both are turned on in Database → Menus & screens → Optional features.

   Decorating: items of the kind "Decoration" can be bought, then placed, turned, moved and put away
   on maps marked "Players can decorate this map". Placed items are saved per map in G.state.decor.
   Wardrobe: items of the kind "Clothing" are either a whole outfit (a full character sheet that replaces
   the player's sprite) or a piece (hat, top, bottoms, extra) drawn over it. The choice is saved in G.state.wear. */
(function () {
  'use strict';
  const { el, esc, message, choose } = RUI;
  const SLOTS = [['outfit', 'Outfit'], ['top', 'Top'], ['bottom', 'Bottoms'], ['hat', 'Hat'], ['extra', 'Extra']];
  const OVERLAY_ORDER = ['bottom', 'top', 'extra', 'hat'];
  const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

  const Home = window.Home = {
    SLOTS,
    /* ================= decorating ================= */
    decorOn(G) { return !!(G.cfg.decorating && G.cfg.decorating.enabled && G.map && G.map.decoratable); },
    placed(G) { const d = G.state.decor = G.state.decor || {}; return (d[G.map.id] = d[G.map.id] || []); },
    info(G, id) { const it = G.db.item(id); return it && it.kind === 'decoration' ? Object.assign({ w: 1, h: 1, blocks: true, turn: 'rotate' }, it.decor || {}, { name: it.name }) : null; },
    // Width and height in squares after turning (a quarter turn swaps them).
    size(d, rot) { return d.turn === 'rotate' && rot % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; },
    covers(e, d, x, y) { const s = Home.size(d, e.rot || 0); return x >= e.x && y >= e.y && x < e.x + s.w && y < e.y + s.h; },
    // The placed item on a square (furniture before rugs).
    at(G, x, y) {
      if (!G.state || !G.map || !G.state.decor) return null;
      const list = (G.state.decor[G.map.id] || []).map(e => ({ e, d: Home.info(G, e.item) })).filter(o => o.d && Home.covers(o.e, o.d, x, y));
      return (list.find(o => o.d.blocks) || list[0]) || null;
    },
    blockedAt(G, x, y) { const o = Home.at(G, x, y); return !!(o && o.d.blocks); },
    // Can this item go here? Every square must be walkable floor with nothing else of the same kind on it.
    canPlace(G, id, x, y, rot, ignore) {
      const d = Home.info(G, id); if (!d) return false;
      const s = Home.size(d, rot), m = G.map;
      const others = Home.placed(G).filter(e => e !== ignore).map(e => ({ e, d: Home.info(G, e.item) })).filter(o => o.d);
      for (let yy = y; yy < y + s.h; yy++) for (let xx = x; xx < x + s.w; xx++) {
        if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height) return false;
        const f = G.flagsAt(xx, yy); if (!f.pass || f.empty) return false;
        if (G.evs.some(e => e.page >= 0 && e.x === xx && e.y === yy)) return false;
        if (d.blocks && ((G.player.x === xx && G.player.y === yy) || (G.follower && G.follower.x === xx && G.follower.y === yy))) return false;
        if (others.some(o => o.d.blocks === d.blocks && Home.covers(o.e, o.d, xx, yy))) return false;
      }
      return true;
    },
    nextRot(d, rot) { return d.turn === 'rotate' ? (rot + 1) % 4 : d.turn === 'mirror' ? (rot + 1) % 2 : 0; },
    // Draw one item, turned. The picture faces down; quarter turns rotate it, 'mirror' flips it.
    drawItem(G, g, d, rot, dx, dy, alpha) {
      const img = G.img(d.image); if (!img) return;
      const T = G.tileSize, s = Home.size(d, rot), W = s.w * T, H = s.h * T;
      g.save(); if (alpha != null) g.globalAlpha = alpha;
      g.translate(dx + W / 2, dy + H / 2);
      if (d.turn === 'rotate') g.rotate(rot * Math.PI / 2); else if (d.turn === 'mirror' && rot) g.scale(-1, 1);
      g.drawImage(img, -d.w * T / 2, -d.h * T / 2, d.w * T, d.h * T);
      g.restore();
    },
    // Rugs and other walk-over items are drawn on the floor; furniture is sorted with the characters.
    // row: only the items whose bottom edge is on that map row (2.5D maps draw the floor one row at a time)
    drawFloor(G, g, cx, cy, row) {
      if (!G.state || !G.state.decor || !G.map) return;
      const T = G.tileSize;
      (G.state.decor[G.map.id] || []).forEach(e => {
        const d = Home.info(G, e.item); if (!d || d.blocks) return;
        if (row != null && e.y + Home.size(d, e.rot || 0).h - 1 !== row) return;
        Home.drawItem(G, g, d, e.rot || 0, e.x * T - cx, e.y * T - cy);
      });
    },
    sprites(G, cx, cy) {
      if (!G.state || !G.state.decor || !G.map) return [];
      const T = G.tileSize;
      return (G.state.decor[G.map.id] || []).map(e => {
        const d = Home.info(G, e.item); if (!d || !d.blocks) return null;
        const s = Home.size(d, e.rot || 0);
        return { c: { py: e.y + s.h - 1 }, draw: g => Home.drawItem(G, g, d, e.rot || 0, e.x * T - cx, e.y * T - cy) };
      }).filter(Boolean);
    },
    drawCursor(G, g, cx, cy) {
      const c = G.decorCursor; if (!c) return;
      const T = G.tileSize;
      const blink = (Math.sin(performance.now() / 180) + 1) / 2;
      if (c.mode === 'place') {
        const d = Home.info(G, c.item), s = Home.size(d, c.rot);
        Home.drawItem(G, g, d, c.rot, c.x * T - cx, c.y * T - cy, 0.55 + blink * 0.25);
        g.strokeStyle = c.valid ? '#63c74d' : '#e43b44'; g.lineWidth = 1;
        g.strokeRect(c.x * T - cx + 0.5, c.y * T - cy + 0.5, s.w * T - 1, s.h * T - 1);
      } else {
        const o = Home.at(G, c.x, c.y);
        const r = o ? (() => { const s = Home.size(o.d, o.e.rot || 0); return [o.e.x, o.e.y, s.w, s.h]; })() : [c.x, c.y, 1, 1];
        g.strokeStyle = o ? '#feae34' : 'rgba(255,255,255,' + (0.5 + blink * 0.5) + ')'; g.lineWidth = 1;
        g.strokeRect(r[0] * T - cx + 0.5, r[1] * T - cy + 0.5, r[2] * T - 1, r[3] * T - 1);
      }
    },
    // Move a cursor around the map. mode 'place' (with an item) resolves {x, y, rot} or null; mode 'pick' resolves a placed entry or null.
    cursor(G, opts) {
      return new Promise(resolve => {
        const p = G.player, [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
        const c = G.decorCursor = { mode: opts.mode, item: opts.item, rot: opts.rot || 0, x: opts.x != null ? opts.x : p.x + dx, y: opts.y != null ? opts.y : p.y + dy, valid: false };
        const ui = document.getElementById('ui'); ui.classList.add('placing');
        const help = el('div', 'place-help', ''); ui.appendChild(help);
        const check = () => {
          c.x = Math.max(0, Math.min(G.map.width - 1, c.x)); c.y = Math.max(0, Math.min(G.map.height - 1, c.y));
          if (c.mode === 'place') c.valid = Home.canPlace(G, c.item, c.x, c.y, c.rot, opts.ignore);
          const T = G.tileSize; G.cam = { x: c.x * T + T / 2, y: c.y * T + T / 2 };
          const d = c.mode === 'place' && Home.info(G, c.item);
          help.innerHTML = c.mode === 'place'
            ? '<b>' + esc(d.name) + '</b> · ' + (c.valid ? 'Z: place' : '<span class="bad">can\'t go here</span>') + (d.turn !== 'none' ? ' · R: turn' : '') + ' · X: cancel'
            : (Home.at(G, c.x, c.y) ? '<b>' + esc(Home.at(G, c.x, c.y).d.name) + '</b> · Z: choose' : 'Move to an item') + ' · X: done';
        };
        let busy = false;
        const finish = v => { pop(); help.remove(); ui.classList.remove('placing'); G.decorCursor = null; G.cam = null; resolve(v); };
        const pop = Input.push(async a => {
          if (busy) return;
          const mv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a];
          if (mv) { c.x += mv[0]; c.y += mv[1]; GameAudio.se('cursor', 40); check(); return; }
          if (a === 'turn' && c.mode === 'place') { const d = Home.info(G, c.item); if (d.turn !== 'none') { c.rot = Home.nextRot(d, c.rot); GameAudio.se('cursor'); check(); } return; }
          if (a === 'cancel') { GameAudio.se('cancel'); return finish(null); }
          if (a !== 'ok') return;
          if (c.mode === 'pick') { const o = Home.at(G, c.x, c.y); if (!o) { GameAudio.se('buzzer'); return; } GameAudio.se('confirm'); return finish(o.e); }
          // Placing: a small menu so touch screens can turn the item too.
          const d = Home.info(G, c.item);
          busy = true;
          const items = [{ label: 'Place here', disabled: !c.valid }];
          if (d.turn !== 'none') items.push({ label: 'Turn ↻' });
          items.push({ label: 'Cancel' });
          ui.classList.remove('placing');
          const k = await choose({ items, right: 6, bottom: 26, w: 84 });
          ui.classList.add('placing');
          busy = false;
          const pick = k < 0 ? 'back' : items[k].label;
          if (pick === 'Place here' && c.valid) { GameAudio.se('confirm'); return finish({ x: c.x, y: c.y, rot: c.rot }); }
          if (pick === 'Turn ↻') { c.rot = Home.nextRot(d, c.rot); check(); }
          if (pick === 'Cancel') return finish(null);
        });
        check();
      });
    },
    // Place an item from the bag.
    async place(G, id) {
      if (!Home.decorOn(G)) return message('You can only decorate inside your home.');
      if (!((G.state.bag[id] || 0) > 0)) return;
      const r = await Home.cursor(G, { mode: 'place', item: id });
      if (!r) return false;
      Home.placed(G).push({ item: id, x: r.x, y: r.y, rot: r.rot });
      G.state.bag[id]--;
      return true;
    },
    // What to do with a placed item: turn it, move it or put it back in the bag.
    async arrangeOne(G, e) {
      const d = Home.info(G, e.item); if (!d) return;
      const items = [];
      if (d.turn !== 'none') items.push({ label: 'Turn ↻', act: 'turn' });
      items.push({ label: 'Move', act: 'move' }, { label: 'Put away', act: 'away' }, { label: 'Cancel', act: '' });
      const k = await choose({ title: d.name, items, right: 6, bottom: 6, w: 96 });
      const act = k < 0 ? '' : items[k].act;
      if (act === 'turn') {
        const rot = Home.nextRot(d, e.rot || 0);
        if (Home.canPlace(G, e.item, e.x, e.y, rot, e)) { e.rot = rot; GameAudio.se('confirm'); }
        else { GameAudio.se('buzzer'); await message('There isn\'t room to turn it here. Move it first.'); }
      }
      if (act === 'move') {
        const r = await Home.cursor(G, { mode: 'place', item: e.item, rot: e.rot || 0, x: e.x, y: e.y, ignore: e });
        if (r) Object.assign(e, r);
      }
      if (act === 'away') {
        const list = Home.placed(G); list.splice(list.indexOf(e), 1);
        G.state.bag[e.item] = (G.state.bag[e.item] || 0) + 1;
        GameAudio.se('confirm');
      }
    },
    // The Decorate menu entry.
    async menu(G) {
      if (!Home.decorOn(G)) return message('You can only decorate inside your home.');
      let idx = 0;
      for (;;) {
        const owned = Object.keys(G.state.bag).filter(id => G.state.bag[id] > 0 && Home.info(G, id));
        const any = Home.placed(G).length > 0;
        const k = await choose({ title: 'Decorate', items: [{ label: 'Place an item', disabled: !owned.length }, { label: 'Arrange', disabled: !any }, { label: 'Done' }], right: 6, top: 6, w: 96, index: idx });
        if (k < 0 || k === 2) return;
        idx = k;
        if (k === 0) {
          const c = await choose({ title: 'Place which?', items: owned.map(id => ({ label: G.db.item(id).name, right: '×' + G.state.bag[id] })), right: 6, top: 6, w: 150, maxH: G.screen.height - 20 });
          if (c >= 0) await Home.place(G, owned[c]);
        }
        if (k === 1) {
          for (;;) { const e = await Home.cursor(G, { mode: 'pick' }); if (!e) break; await Home.arrangeOne(G, e); }
        }
      }
    },
    // Pressing Z while facing a placed item.
    async interact(G, x, y) {
      const o = Home.at(G, x, y); if (!o || !Home.decorOn(G)) return false;
      await Home.arrangeOne(G, o.e);
      return true;
    },

    /* ================= wardrobe ================= */
    wearOn(G) { return !!(G.cfg.wardrobe && G.cfg.wardrobe.enabled); },
    clothing(G, id) { const it = G.db.item(id); return it && it.kind === 'clothing' && it.wear && it.wear.sheet ? it : null; },
    owned(G, slot) { return Object.keys(G.state.bag).filter(id => G.state.bag[id] > 0 && Home.clothing(G, id) && (Home.clothing(G, id).wear.slot || 'outfit') === slot); },
    // The player's sprite sheet with the chosen clothes, or null to draw the normal sprite.
    sheetFor(G, wear, cacheIt) {
      if (!Home.wearOn(G) || !wear) return null;
      const base = (Home.clothing(G, wear.outfit) || { wear: {} }).wear.sheet || (G.db.system.player || {}).sprite;
      const layers = OVERLAY_ORDER.map(s => Home.clothing(G, wear[s])).filter(Boolean).map(it => it.wear.sheet);
      if (!layers.length && !Home.clothing(G, wear.outfit)) return null;
      const key = [base].concat(layers).join('|');
      Home.cache = Home.cache || {};
      if (Home.cache[key]) return Home.cache[key];
      const imgs = [base].concat(layers).map(r => G.img(r));
      if (imgs.some(i => !i)) return null; // still loading
      const cv = document.createElement('canvas'); cv.width = imgs[0].width; cv.height = imgs[0].height;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      imgs.forEach(i => g.drawImage(i, 0, 0, cv.width, cv.height));
      if (cacheIt !== false) Home.cache[key] = cv;
      return cv;
    },
    playerSheet(G) { return G.state ? Home.sheetFor(G, G.state.wear) : null; },
    // The Wardrobe screen: choose an outfit and pieces, with a turning preview of the player.
    wardrobe(G, focusId) {
      if (!Home.wearOn(G)) return Promise.resolve();
      const wear = G.state.wear = G.state.wear || {};
      const slots = SLOTS.filter(([s]) => s === 'outfit' || Home.owned(G, s).length || wear[s]);
      return new Promise(resolve => {
        const panel = el('div', 'win panel-full wardrobe');
        panel.innerHTML = '<div class="wd-title">Wardrobe</div><div class="wd-body"><canvas class="wd-preview" width="48" height="64"></canvas><div class="wd-slots"></div></div><div class="muted wd-help">↑ ↓ choose · ← → change · Z/X done</div>';
        document.getElementById('ui').appendChild(panel);
        const cv = panel.querySelector('canvas'), list = panel.querySelector('.wd-slots');
        let idx = 0;
        if (focusId && Home.clothing(G, focusId)) { const s = Home.clothing(G, focusId).wear.slot || 'outfit'; idx = Math.max(0, slots.findIndex(x => x[0] === s)); wear[s] = focusId; }
        const options = s => [''].concat(Home.owned(G, s));
        const name = (s, id) => id ? G.db.item(id).name : (s === 'outfit' ? 'Usual clothes' : 'None');
        const draw = () => {
          list.innerHTML = slots.map(([s, label], i) => {
            const n = options(s).length - 1;
            return '<div class="wd-row' + (i === idx ? ' sel' : '') + '"><span class="wd-slot">' + esc(label) + '</span><span class="wd-val">' + (n ? '◀ ' : '') + esc(name(s, wear[s])) + (n ? ' ▶' : '') + '</span></div>';
          }).join('') + (slots.length === 1 && !Home.owned(G, 'outfit').length ? '<div class="muted wd-none">You don\'t have any clothes to change into yet.</div>' : '');
        };
        let t0 = performance.now(), raf = 0;
        const anim = () => {
          const sheet = Home.sheetFor(G, wear, false) || G.img((G.db.system.player || {}).sprite);
          const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
          if (sheet) {
            const fw = sheet.width / 3, fh = sheet.height / 4, k = (performance.now() - t0) / 1000;
            const dir = ['down', 'left', 'up', 'right'][Math.floor(k / 1.2) % 4], frame = [1, 0, 1, 2][Math.floor(k * 4) % 4];
            cv.width = fw; cv.height = fh;
            g.imageSmoothingEnabled = false;
            g.drawImage(sheet, frame * fw, DIR_ROW[dir] * fh, fw, fh, 0, 0, fw, fh);
          }
          raf = requestAnimationFrame(anim);
        };
        const close = () => { cancelAnimationFrame(raf); pop(); panel.remove(); resolve(); };
        const pop = Input.push(a => {
          if (a === 'up') idx = (idx - 1 + slots.length) % slots.length;
          else if (a === 'down') idx = (idx + 1) % slots.length;
          else if (a === 'left' || a === 'right') {
            const s = slots[idx][0], opts = options(s);
            if (opts.length > 1) { const i = opts.indexOf(wear[s] || ''); wear[s] = opts[(i + (a === 'right' ? 1 : -1) + opts.length) % opts.length]; if (!wear[s]) delete wear[s]; GameAudio.se('cursor'); }
          } else if (a === 'ok' || a === 'cancel') { GameAudio.se(a === 'ok' ? 'confirm' : 'cancel'); return close(); }
          draw();
        });
        list.addEventListener('click', e => { const r = e.target.closest('.wd-row'); if (r) { idx = [...list.children].indexOf(r); draw(); } });
        draw(); anim();
      });
    }
  };
})();
