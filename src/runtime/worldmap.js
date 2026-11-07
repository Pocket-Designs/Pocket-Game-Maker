/* The world map: a picture of the game's world with named places (Database → World map).
   Shows where the player is, the places they have been (and, if allowed, the ones they haven't), and can let them
   travel to a place they have visited. Opened from the menu (Map), a Tool item (a "Town Map") or an event.
   Places are stored with x, y as fractions (0–1) of the picture's width and height. */
(function () {
  'use strict';
  const { el, esc, wait, message } = RUI;

  const WorldMap = window.WorldMap = {
    // The place the player is in now: the first place that lists the current map.
    here(G) { const L = G.cfg.worldMap.locations || []; return G.map ? L.find(l => (l.maps || []).includes(G.map.id)) || null : null; },
    visited(G, loc) { const v = (G.state && G.state.visited) || {}; return (loc.maps || []).some(id => v[id]); },

    open(G) {
      const W = G.cfg.worldMap;
      return new Promise(async resolve => {
        const img = await G.loadImg(W.image);
        if (!img) { await message('The map picture could not be loaded.'); return resolve(); }
        const here = WorldMap.here(G);
        const locs = (W.locations || []).filter(l => W.showUnvisited || WorldMap.visited(G, l) || l === here);
        const panel = el('div', 'worldmap');
        const head = el('div', 'wm-head');
        const area = el('div', 'wm-area');
        const pic = el('img', 'wm-pic'); pic.src = img.src;
        area.appendChild(pic);
        const foot = el('div', 'wm-foot');
        panel.append(head, area, foot);
        document.getElementById('ui').appendChild(panel);
        // Fit the picture into the space under the heading, keeping its shape.
        const SW = G.screen.width, SH = G.screen.height - 30, k = Math.min(SW / img.width, SH / img.height);
        const pw = Math.round(img.width * k), ph = Math.round(img.height * k), ox = Math.round((SW - pw) / 2), oy = 16 + Math.round((SH - ph) / 2);
        Object.assign(pic.style, { left: ox + 'px', top: oy + 'px', width: pw + 'px', height: ph + 'px' });
        const pins = locs.map(l => {
          const p = el('div', 'wm-pin' + (l === here ? ' here' : WorldMap.visited(G, l) ? ' seen' : ' unseen'));
          Object.assign(p.style, { left: (ox + l.x * pw) + 'px', top: (oy + l.y * ph) + 'px' });
          area.appendChild(p);
          return p;
        });
        const you = here ? el('div', 'wm-you') : null;
        if (you) { Object.assign(you.style, { left: (ox + here.x * pw) + 'px', top: (oy + here.y * ph) + 'px' }); area.appendChild(you); }
        let idx = Math.max(0, locs.indexOf(here));
        const canTravel = l => W.travel && l && l !== here && WorldMap.visited(G, l) && l.dest && G.db.maps[l.dest.mapId];
        const draw = () => {
          pins.forEach((p, i) => p.classList.toggle('sel', i === idx));
          const l = locs[idx];
          head.innerHTML = '<b>' + esc(W.title || 'World Map') + '</b>' + (l ? ' · ' + esc(WorldMap.visited(G, l) || l === here ? l.name : '???') + (l === here ? ' <span class="wm-tag">You are here</span>' : '') : '');
          foot.innerHTML = (l && l.description && (WorldMap.visited(G, l) || l === here) ? esc(l.description) + ' · ' : '') + (canTravel(l) ? 'Z: travel here · ' : '') + (locs.length > 1 ? '←↑↓→ choose · ' : '') + 'X: close';
        };
        // Arrow keys jump to the nearest place in that direction.
        const move = dir => {
          const a = locs[idx]; if (!a) return;
          const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
          let best = -1, bestScore = Infinity;
          locs.forEach((b, i) => {
            if (i === idx) return;
            const dx = (b.x - a.x) * pw, dy = (b.y - a.y) * ph, along = dx * v[0] + dy * v[1];
            if (along <= 0) return;
            const across = Math.abs(dx * v[1] - dy * v[0]), score = along + across * 2;
            if (score < bestScore) { bestScore = score; best = i; }
          });
          if (best >= 0) { idx = best; GameAudio.se('cursor'); draw(); }
        };
        const close = v => { pop(); panel.remove(); resolve(v); };
        const onKey = async a => {
          if (a === 'cancel') { GameAudio.se('cancel'); return close(); }
          if (['left', 'right', 'up', 'down'].includes(a)) return move(a);
          if (a === 'ok') {
            const l = locs[idx];
            if (!canTravel(l)) { if (W.travel && l && l !== here) GameAudio.se('buzzer'); return; }
            pop();
            const yes = await RUI.confirm('Travel to ' + l.name + '?');
            if (!yes) { pop = Input.push(onKey); draw(); return; }
            panel.remove();
            await WorldMap.travel(G, l);
            resolve('travel');
          }
        };
        let pop = Input.push(onKey);
        pins.forEach((p, i) => p.addEventListener('click', () => { idx = i; draw(); }));
        draw();
      });
    },

    async travel(G, l) {
      const d = l.dest;
      GameAudio.se('confirm');
      await RUI.fade(true, 300);
      await G.enterMap(d.mapId, d.x | 0, d.y | 0, d.dir || 'down');
      await RUI.fade(false, 300);
      G.afterArrive();
    }
  };
})();
