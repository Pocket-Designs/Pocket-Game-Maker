/* Pocket-Game-Maker runtime: title, map exploration, events, encounters, battles, saves. */
(function () {
  'use strict';
  const { el, esc, wait, message, closeMessage, choose } = RUI;
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  // Event movement speeds: walk = squares per second, pause = seconds between wandering steps, route = pause between route steps.
  const SPEEDS = { slow: { walk: 1.6, pause: 2.2, route: 0.6 }, normal: { walk: 2.5, pause: 1.5, route: 0.3 }, fast: { walk: 4, pause: 0.8, route: 0.12 } };
  const TINTS = { none: null, dawn: 'rgba(255,170,120,.18)', dusk: 'rgba(255,120,60,.25)', night: 'rgba(20,30,90,.45)', sepia: 'rgba(140,100,40,.35)', grey: 'rgba(90,90,90,.45)' };
  class Abort extends Error {}

  const G = window.G = {
    images: {},
    scene: 'boot', busy: false, map: null, evs: [], player: null, erased: new Set(),

    async boot() {
      Input.init();
      const pd = await window.api.getPlaytestData();
      if (!pd) { document.body.textContent = 'No playtest data.'; return; }
      const d = pd.data;
      G.projectPath = pd.projectPath;
      G.db = new MF.Database({ system: d.system, types: d.types, moves: d.moves, monsters: d.monsters, items: d.items, tilesets: d.tilesets, maps: d.maps });
      G.screen = Object.assign({ width: 320, height: 240, scale: 2 }, d.system.screen || {});
      G.audioCfg = MF.Audio.withDefaults(d.system.audio);
      G.cfg = MF.Config.withDefaults(d.system);
      G.terms = G.cfg.terms;
      G.creditsData = d.credits || {};
      if (window.TouchControls) TouchControls.init(G.cfg.touchControls);
      // F12 in a playtest saves a 1920×1080 screenshot (for store pages) into the project's screenshots folder.
      if (window.api.saveScreenshot) window.addEventListener('keydown', e => { if (e.key === 'F12') { e.preventDefault(); G.screenshot(); } });
      GameAudio.init(pd.projectPath, G.audioCfg);
      GameAudio.preload(Object.values(G.audioCfg.sfx || {}));
      document.title = (d.system.title || 'Game') + ' — Playtest';
      const stage = document.getElementById('stage');
      stage.style.width = G.screen.width + 'px'; stage.style.height = G.screen.height + 'px';
      const cv = document.getElementById('screen');
      cv.width = G.screen.width; cv.height = G.screen.height;
      G.ctx = cv.getContext('2d'); G.ctx.imageSmoothingEnabled = false;
      const fit = () => {
        const s = Math.min(innerWidth / G.screen.width, innerHeight / G.screen.height);
        stage.style.transform = 'scale(' + s + ')';
        stage.style.left = ((innerWidth - G.screen.width * s) / 2) + 'px';
        stage.style.top = ((innerHeight - G.screen.height * s) / 2) + 'px';
      };
      window.addEventListener('resize', fit); fit();
      Input.onFree = a => G.onKey(a);
      let last = performance.now();
      const loop = t => { const dt = Math.min(0.05, (t - last) / 1000); last = t; G.update(dt); G.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      if (pd.start) { G.newGame(); await G.enterMap(pd.start.mapId, pd.start.x, pd.start.y, 'down'); G.afterArrive(); }
      else G.title();
    },

    /* ---------- assets ---------- */
    asset(rel) { return rel ? window.api.assetUrl(G.projectPath, rel) : ''; },
    img(rel) {
      if (!rel) return null;
      let e = G.images[rel];
      if (!e) { e = G.images[rel] = { img: new Image(), ok: false }; e.img.onload = () => { e.ok = true; }; e.img.src = G.asset(rel); }
      return e.ok ? e.img : null;
    },
    loadImg(rel) {
      return new Promise(res => { if (!rel) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = G.asset(rel); });
    },

    /* ---------- state ---------- */
    newGame() {
      const sys = G.db.system;
      G.state = {
        playerName: (sys.player && sys.player.name) || 'Player',
        party: [], storage: [], bag: Object.assign({}, sys.startingItems || {}), money: sys.startMoney || 0,
        switches: [], selfSwitches: {}, dex: { seen: {}, caught: {} }, playTime: 0, steps: 0,
        decor: {}, wear: Object.assign({}, (G.cfg.wardrobe || {}).start || {})
      };
      Object.values(G.state.wear).forEach(id => { if (id && !G.state.bag[id]) G.state.bag[id] = 1; }); // starting clothes are owned
      (sys.startingParty || []).forEach(p => { if (G.db.species(p.speciesId)) G.addMonster(MF.createMonster(G.db, p.speciesId, p.level, { ot: G.state.playerName })); });
    },
    addMonster(mon) {
      G.caught(mon.speciesId);
      if (G.state.party.length < G.db.battleSettings().maxParty) { G.state.party.push(mon); return 'party'; }
      MF.healMonster(G.db, mon); G.state.storage.push(mon); return 'storage';
    },
    seen(id) { G.state.dex.seen[id] = true; },
    caught(id) { G.state.dex.seen[id] = true; G.state.dex.caught[id] = true; },
    healthy() { return G.state.party.some(m => m.hp > 0); },
    makeSave() {
      const t = Math.floor(G.state.playTime);
      const p = G.player;
      G.state.pos = { mapId: G.map.id, x: p.x, y: p.y, dir: p.dir };
      return { meta: { mapName: G.map.name, party: G.state.party.length, time: Math.floor(t / 3600) + ':' + String(Math.floor(t / 60) % 60).padStart(2, '0') }, state: JSON.parse(JSON.stringify(G.state)) };
    },

    /* ---------- title ---------- */
    async title() {
      G.scene = 'title';
      const sys = G.db.system, T = G.cfg.titleScreen;
      const t = el('div', 'title-screen' + (T.background ? ' has-bg' : ''), '');
      if (T.background) { const bg = el('img', 'title-bg'); bg.src = G.asset(T.background); t.appendChild(bg); }
      if (T.showTitle !== false) t.appendChild(el('h1', null, esc(sys.title || 'Monster Game')));
      if (T.subtitle) t.appendChild(el('div', 'sub', esc(T.subtitle)));
      t.style.color = T.textColour || '#fff';
      document.getElementById('ui').appendChild(t);
      GameAudio.playBgm(G.audioCfg.title);
      const saves = await window.api.listSaves(G.projectPath);
      const any = saves.some(s => s.meta);
      const entries = T.menu.filter(e => e.on);
      if (!entries.length) entries.push({ id: 'new', label: 'New Game' });
      const W = G.screen.width, H = G.screen.height, w = Math.max(90, 16 + 7 * Math.max(...entries.map(e => (e.label || '').length)));
      const pos = T.menuPosition === 'left' ? { x: 14, y: H * 0.55 } : T.menuPosition === 'bottom' ? { x: W / 2 - w / 2, y: H - 14 - entries.length * 15 } : { x: W / 2 - w / 2, y: H * 0.58 };
      let idx = Math.max(0, entries.findIndex(e => e.id === 'continue' && any));
      for (;;) {
        const c = await choose({ items: entries.map(e => ({ label: e.label, disabled: e.id === 'continue' && !any })), parent: t, cancel: false, index: idx, x: pos.x, y: pos.y, w });
        idx = c;
        const id = entries[c] && entries[c].id;
        if (id === 'new') {
          t.remove(); G.newGame();
          const s = sys.start || {};
          await G.enterMap(s.mapId, s.x || 0, s.y || 0, s.dir || 'down');
          G.afterArrive(); return;
        }
        if (id === 'continue') {
          const slot = await Menus.slotPicker(G, 'Load which save?', true);
          if (slot < 0) continue;
          const save = await window.api.loadGame(G.projectPath, slot + 1);
          if (!save) continue;
          t.remove();
          G.state = save.state;
          G.fixState();
          const p = G.state.pos;
          await G.enterMap(p.mapId, p.x, p.y, p.dir);
          G.afterArrive(); return;
        }
        if (id === 'credits') await Menus.textScreen(G, T.credits.heading || 'Credits', await G.creditsText());
        if (id === 'licence') await Menus.textScreen(G, T.licence.heading || 'Licence', await G.readText(T.licence.file) || 'No licence file has been chosen for this game yet.');
        if (id === 'quit') { await RUI.fade(true, 300); window.api.quitGame(); return; }
      }
    },
    async screenshot() {
      const src = document.getElementById('screen'), W = 1920, H = 1080;
      const k = Math.max(1, Math.floor(Math.min(W / src.width, H / src.height)));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.imageSmoothingEnabled = false;
      g.drawImage(src, (W - src.width * k) / 2, (H - src.height * k) / 2, src.width * k, src.height * k);
      const rel = await window.api.saveScreenshot(G.projectPath, c.toDataURL('image/png'));
      RUI.toast('Screenshot saved: ' + rel);
    },
    async readText(rel) {
      if (!rel) return '';
      const bytes = await window.api.readAsset(G.projectPath, rel);
      return bytes ? new TextDecoder('utf-8').decode(bytes) : '';
    },
    // Credits come from a text file the game maker chose, or are built from the project's asset credits list.
    async creditsText() {
      const c = G.cfg.titleScreen.credits;
      if (c.source === 'file' && c.file) return await G.readText(c.file) || 'The credits file could not be read.';
      const rows = Object.entries(G.creditsData || {});
      const sys = G.db.system;
      const out = ['# ' + (sys.title || 'Game'), ''];
      const groups = {};
      rows.forEach(([file, e]) => { const k = file.split('/')[0]; (groups[k] = groups[k] || []).push([file, e]); });
      const names = { tilesets: 'Tilesets', characters: 'Characters', monsters: 'Monsters', battlebacks: 'Battle backgrounds', pictures: 'Pictures', music: 'Music', sounds: 'Sound effects' };
      Object.keys(groups).forEach(k => {
        out.push('## ' + (names[k] || k));
        groups[k].forEach(([file, e]) => out.push('- ' + (e.name || file.split('/').pop()) + (e.author ? ' by ' + e.author : '') + (e.licence ? ' (' + e.licence + ')' : '')));
        out.push('');
      });
      out.push('Made with Pocket-Game-Maker');
      return out.join('\n');
    },
    // Older saves may miss newer fields.
    fixState() {
      const st = G.state;
      st.switches = st.switches || []; st.selfSwitches = st.selfSwitches || {}; st.dex = st.dex || { seen: {}, caught: {} };
      st.bag = st.bag || {}; st.storage = st.storage || []; st.decor = st.decor || {}; st.wear = st.wear || {};
    },

    /* ---------- maps ---------- */
    async enterMap(mapId, x, y, dir) {
      const m = G.db.maps[mapId];
      if (!m) { await message('Map "' + mapId + '" does not exist.'); return; }
      MF.Layers.migrate(m);
      G.map = m;
      G.erased = new Set();
      G.ts = G.db.tilesets[m.tilesetId] || { tileSize: 16, flags: [] };
      G.tsImg = await G.loadImg(G.ts.image);
      const T = G.tileSize = G.ts.tileSize || 16;
      G.cols = G.tsImg ? Math.floor(G.tsImg.width / T) : 1;
      G.below = document.createElement('canvas'); G.above = document.createElement('canvas');
      G.below.width = G.above.width = m.width * T; G.below.height = G.above.height = m.height * T;
      // Squares with an animated tile are redrawn whenever the animation frame changes.
      G.animCells = [];
      for (let yy = 0; yy < m.height; yy++) for (let xx = 0; xx < m.width; xx++) {
        G.drawCell(xx, yy, 0);
        if (m.layers.some((Ly, L) => !(m.layerInfo[L] || {}).hideInGame && MF.Tiles.animated(G.ts, Ly[yy * m.width + xx]))) G.animCells.push([xx, yy]);
      }
      G.animKey = -1;
      // Map music: '' keeps whatever is playing, 'none' stops it.
      if (m.bgm === 'none') GameAudio.stopBgm(0.5);
      else if (m.bgm) GameAudio.playBgm(m.bgm, { volume: m.bgmVolume });
      G.player = { x, y, dir: dir || 'down', px: x, py: y, moving: false, anim: 0, sprite: (G.db.system.player || {}).sprite };
      G.evs = m.events.map(ev => ({ data: ev, x: ev.x, y: ev.y, px: ev.x, py: ev.y, dir: 'down', moving: false, anim: 0, page: -1, timer: 1 + Math.random() * 2, routeIdx: 0 }));
      G.cam = null;
      if (G.state && G.state.tint) G.overlay('tint', 'tint').style.background = TINTS[G.state.tint] || 'transparent';
      G.refreshPages();
      G.initFollower();
      G.scene = 'map';
    },
    // Draw every layer of one map square onto the below/above canvases (tiles drawn above the player go on top).
    drawCell(xx, yy, timeMs) {
      const m = G.map, T = G.tileSize;
      const bg = G.below.getContext('2d'), ag = G.above.getContext('2d');
      bg.clearRect(xx * T, yy * T, T, T); ag.clearRect(xx * T, yy * T, T, T);
      if (!G.tsImg) return;
      for (let L = 0; L < m.layers.length; L++) {
        if ((m.layerInfo[L] || {}).hideInGame) continue;
        const t = m.layers[L][yy * m.width + xx];
        if (t < 0 || t == null) continue;
        const f = G.ts.flags[t] || {};
        const g = MF.Layers.drawsAbove(m, L, f) ? ag : bg;
        MF.Tiles.drawTile(g, G.tsImg, G.ts, G.cols, T, t, xx * T, yy * T, m.layers[L], m.width, m.height, xx, yy, timeMs);
      }
    },
    animateTiles() {
      if (!G.animCells || !G.animCells.length) return;
      const now = performance.now(), key = Math.floor(now / Math.max(60, G.ts.animSpeed || 300));
      if (key === G.animKey) return;
      G.animKey = key;
      G.animCells.forEach(([x, y]) => G.drawCell(x, y, now));
    },
    pageFor(ev) {
      if (G.erased.has(ev.data.id)) return -1;
      const key = G.map.id + ':' + ev.data.id;
      for (let i = ev.data.pages.length - 1; i >= 0; i--) {
        const c = ev.data.pages[i].condition || {};
        if (c.switchId && !G.state.switches[c.switchId]) continue;
        if (c.switchOffId && G.state.switches[c.switchOffId]) continue;
        if (c.selfSwitch && !G.state.selfSwitches[key]) continue;
        return i;
      }
      return -1;
    },
    refreshPages() {
      G.evs.forEach(ev => {
        const p = G.pageFor(ev);
        if (p !== ev.page) { ev.page = p; ev.routeIdx = 0; if (p >= 0) ev.dir = ev.data.pages[p].dir || 'down'; }
      });
    },
    page(ev) { return ev.page >= 0 ? ev.data.pages[ev.page] : null; },
    flagsAt(x, y) { return MF.Layers.cellFlags(G.map, G.ts, x, y); },
    blockingEventAt(x, y, except) {
      return G.evs.find(e => e !== except && e.page >= 0 && (e.x === x && e.y === y) && !G.page(e).through && G.page(e).sprite);
    },
    canMove(who, x, y) {
      const m = G.map;
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
      if (who === G.player && Input.held.through) return true;
      if (!G.flagsAt(x, y).pass) return false;
      if (G.blockingEventAt(x, y, who)) return false;
      if (window.Home && Home.blockedAt(G, x, y)) return false;
      if (who !== G.player && G.player.x === x && G.player.y === y) return false;
      return true;
    },
    afterArrive() { G.checkAuto(); G.checkSight(); },
    // Touch events fire when the player steps on their square, or anywhere in their area (cut scene triggers).
    touchEventAt(x, y) {
      return G.evs.find(e => {
        const pg = G.page(e); if (!pg || pg.trigger !== 'touch') return false;
        if (pg.area) return x >= e.x && y >= e.y && x < e.x + pg.area.width && y < e.y + pg.area.height;
        return e.x === x && e.y === y;
      });
    },

    /* ---------- following monster ---------- */
    initFollower() {
      if (!G.cfg.follower.enabled || !G.player) { G.follower = null; return; }
      const p = G.player, [dx, dy] = DIRV[OPP[p.dir]];
      let x = p.x + dx, y = p.y + dy;
      if (!G.canMove({}, x, y) || G.flagsAt(x, y).empty) { x = p.x; y = p.y; }
      G.follower = { x, y, px: x, py: y, dir: p.dir, moving: false, anim: 0 };
    },
    followerMon() { const m = G.state && G.state.party[0]; return m && m.hp > 0 ? m : null; },
    // Move the player one square; the following monster steps into the square the player left.
    movePlayerTo(nx, ny) {
      const p = G.player, f = G.follower;
      if (f && (f.x !== p.x || f.y !== p.y)) { f.dir = p.x > f.x ? 'right' : p.x < f.x ? 'left' : p.y > f.y ? 'down' : 'up'; f.x = p.x; f.y = p.y; f.moving = true; }
      else if (f) { f.x = p.x; f.y = p.y; }
      p.x = nx; p.y = ny; p.moving = true;
    },

    /* ---------- update ---------- */
    update(dt) {
      if (!G.state) return;
      G.state.playTime += dt;
      if (G.scene !== 'map' || !G.player) return;
      G.animateTiles();
      const p = G.player;
      const speed = ((G.db.system.player || {}).moveSpeed || 4) * (Input.held.run ? 2 : 1);
      if (p.moving) G.step(p, speed, dt, () => { if (!p.scripted) G.onPlayerStep(); });
      if (G.follower && G.follower.moving) G.step(G.follower, speed, dt, null);
      else if (!G.busy && !Input.busy()) {
        const d = Input.dir();
        if (d) {
          p.dir = d;
          const [dx, dy] = DIRV[d];
          const nx = p.x + dx, ny = p.y + dy, m = G.map;
          const off = nx < 0 || ny < 0 || nx >= m.width || ny >= m.height;
          if (off && (m.edges || {})[d] && G.db.maps[m.edges[d].mapId] && !Input.held.through) G.crossEdge(d);
          else if (G.canMove(p, nx, ny)) G.movePlayerTo(nx, ny);
          else {
            const ev = G.evs.find(e => e.x === nx && e.y === ny && e.page >= 0 && G.page(e).trigger === 'touch' && !G.page(e).area);
            if (ev) G.runEvent(ev);
            else if (!G.lastBump || performance.now() - G.lastBump > 400) { G.lastBump = performance.now(); GameAudio.se('bump', 60); }
          }
        }
      }
      // Event movement: wandering, turning, or walking a set route.
      G.evs.forEach(ev => {
        const pg = G.page(ev);
        const spd = SPEEDS[(pg && pg.speed) || 'normal'] || SPEEDS.normal;
        if (ev.moving) { G.step(ev, ev.scriptSpeed || spd.walk, dt, () => { if (pg && pg.trigger === 'sight' && !G.busy) G.checkSight(); }); return; }
        if (ev.scripted || !pg || G.busy || pg.move === 'fixed' || !pg.move) return;
        ev.timer -= dt;
        if (ev.timer > 0) return;
        if (pg.move === 'route') { G.routeTick(ev, pg, spd); return; }
        ev.timer = spd.pause + Math.random() * spd.pause * 1.6;
        const d = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
        ev.dir = d;
        if (pg.move === 'random') { const [dx, dy] = DIRV[d]; if (G.canMove(ev, ev.x + dx, ev.y + dy)) { ev.x += dx; ev.y += dy; ev.moving = true; } }
      });
    },
    // One step of an event's repeating route. Blocked steps are retried a few times, then skipped.
    routeTick(ev, pg, spd) {
      const steps = (pg.route && pg.route.steps) || [];
      if (!steps.length) { ev.timer = 1; return; }
      if (pg.route.repeat === false && ev.routeIdx >= steps.length) { ev.timer = 1; return; }
      const st = steps[ev.routeIdx % steps.length];
      ev.timer = spd.route;
      if (st === 'wait') { ev.timer = 0.5; ev.routeIdx++; return; }
      if (st.startsWith('face-')) { ev.dir = st.slice(5); ev.routeIdx++; if (pg.trigger === 'sight') G.checkSight(); return; }
      const [dx, dy] = DIRV[st] || [0, 0];
      ev.dir = st;
      if (G.canMove(ev, ev.x + dx, ev.y + dy)) { ev.x += dx; ev.y += dy; ev.moving = true; ev.routeIdx++; ev.blocked = 0; }
      else if (++ev.blocked > 6) { ev.routeIdx++; ev.blocked = 0; } else ev.timer = 0.4;
    },
    // Walking off a map edge that is linked to another map.
    async crossEdge(d) {
      const p = G.player, from = G.map, e = from.edges[d], to = G.db.maps[e.mapId];
      let x = p.x, y = p.y;
      if (d === 'up') { y = to.height - 1; x = p.x + (e.offset || 0); }
      else if (d === 'down') { y = 0; x = p.x + (e.offset || 0); }
      else if (d === 'left') { x = to.width - 1; y = p.y + (e.offset || 0); }
      else { x = 0; y = p.y + (e.offset || 0); }
      x = Math.max(0, Math.min(to.width - 1, x)); y = Math.max(0, Math.min(to.height - 1, y));
      G.busy = true;
      try {
        await RUI.fade(true, 160);
        await G.enterMap(to.id, x, y, d);
        await RUI.fade(false, 160);
      } finally { G.busy = false; }
      G.afterArrive();
    },
    step(c, speed, dt, done) {
      const dx = c.x - c.px, dy = c.y - c.py;
      const dist = Math.abs(dx) + Math.abs(dy);
      const mv = speed * dt;
      c.anim += mv;
      if (dist <= mv) { c.px = c.x; c.py = c.y; c.moving = false; if (done) done(); }
      else { c.px += Math.sign(dx) * mv; c.py += Math.sign(dy) * mv; }
    },
    moveEventStep(ev, d) {
      return new Promise(res => {
        const [dx, dy] = DIRV[d]; ev.dir = d; ev.x += dx; ev.y += dy; ev.moving = true;
        const chk = () => { if (!ev.moving) res(); else setTimeout(chk, 16); };
        chk();
      });
    },

    onPlayerStep() {
      const p = G.player;
      G.state.steps++;
      const here = G.touchEventAt(p.x, p.y);
      if (here) return G.runEvent(here);
      if (G.checkSight()) return;
      G.checkEncounter();
    },
    checkEncounter() {
      if (G.busy || Input.held.through || !G.healthy()) return;
      const p = G.player;
      // An encounter area event covering this square overrides the map's encounter table.
      const zone = G.evs.find(e => { const pg = G.page(e); return pg && pg.trigger === 'encounter' && pg.encounter && MF.Quick.inZone(e, pg.encounter, p.x, p.y); });
      let enc;
      if (zone) { enc = G.page(zone).encounter; if (enc.onlyEncTiles && !G.flagsAt(p.x, p.y).enc) return; }
      else { enc = G.map.encounters || {}; if (!G.flagsAt(p.x, p.y).enc) return; }
      if (!enc.chance || !(enc.list || []).length) return;
      if (Math.random() * 100 >= enc.chance) return;
      const picks = MF.Quick.pick((enc.list || []).filter(e => G.db.species(e.speciesId)), enc.active || G.db.battleSettings().wildActive, Math.random);
      if (!picks.length) return;
      const enemies = picks.map(x => MF.createMonster(G.db, x.speciesId, x.level));
      G.busy = true;
      (async () => {
        if (zone && enc.once) { G.state.selfSwitches[G.map.id + ':' + zone.data.id] = true; }
        if (enc.message) await message(enc.message);
        await G.battle({ enemyParty: enemies, isWild: true, canRun: true, canCapture: true });
        if (G.map) G.refreshPages();
      })().finally(() => { G.busy = false; });
    },
    checkSight() {
      if (G.busy) return false;
      const p = G.player;
      for (const ev of G.evs) {
        const pg = G.page(ev);
        if (!pg || pg.trigger !== 'sight' || ev.moving) continue;
        const [dx, dy] = DIRV[ev.dir];
        const range = pg.sightRange || 4;
        for (let d = 1; d <= range; d++) {
          const x = ev.x + dx * d, y = ev.y + dy * d;
          if (x === p.x && y === p.y) { G.spotted(ev, d); return true; }
          if (!G.flagsAt(x, y).pass || G.blockingEventAt(x, y, ev)) break;
        }
      }
      return false;
    },
    async spotted(ev, dist) {
      G.busy = true;
      const ex = el('div', 'excl', '!');
      G.exclaim = { ev, el: ex };
      document.getElementById('ui').appendChild(ex);
      await wait(650);
      ex.remove(); G.exclaim = null;
      for (let i = 1; i < dist; i++) await G.moveEventStep(ev, ev.dir);
      G.player.dir = OPP[ev.dir];
      G.busy = false;
      await G.runEvent(ev, true);
    },
    checkAuto() {
      if (G.busy) return;
      const ev = G.evs.find(e => e.page >= 0 && G.page(e).trigger === 'auto');
      if (ev) G.runEvent(ev);
    },

    /* ---------- input ---------- */
    onKey(a) {
      if (G.scene !== 'map' || G.busy || G.player.moving) return;
      if (a === 'ok') {
        const p = G.player, [dx, dy] = DIRV[p.dir];
        const front = G.evs.find(e => e.x === p.x + dx && e.y === p.y + dy && e.page >= 0 && (G.page(e).trigger === 'action' || G.page(e).trigger === 'sight'));
        const here = G.evs.find(e => e.x === p.x && e.y === p.y && e.page >= 0 && G.page(e).trigger === 'action');
        // Signs can be marked readable only from the front (player below, facing up).
        const ev = (front && !(G.page(front).frontOnly && p.dir !== 'up')) ? front : here;
        if (ev) G.runEvent(ev, true);
        else if (window.Home && Home.decorOn(G) && Home.at(G, p.x + dx, p.y + dy)) { G.busy = true; Home.interact(G, p.x + dx, p.y + dy).finally(() => { G.busy = false; }); }
        else if (G.follower && G.cfg.follower.talk && G.follower.x === p.x + dx && G.follower.y === p.y + dy && G.followerMon()) G.talkToFollower();
      }
      if (a === 'cancel') { G.busy = true; Menus.main(G).finally(() => { G.busy = false; }); }
    },

    async talkToFollower() {
      const mon = G.followerMon(), name = MF.monName(G.db, mon);
      G.follower.dir = OPP[G.player.dir];
      const pct = mon.hp / mon.stats.hp;
      const lines = pct < 0.3 ? [name + ' looks tired. Maybe it needs a rest.'] : mon.status ? [name + ' doesn\'t look well…'] : [name + ' is happy to be walking with you!', name + ' is sniffing around curiously.', name + ' looks up at you cheerfully.', name + ' is full of energy!'];
      G.busy = true;
      try { await G.balloon(G.follower, pct < 0.3 || mon.status ? '…' : '♥'); await message(lines[Math.floor(Math.random() * lines.length)]); }
      finally { G.busy = false; }
    },

    /* ---------- cut scenes ---------- */
    // Who a cut-scene command acts on: 'player', 'this' (the running event) or another event's name.
    target(t, ev) {
      if (!t || t === 'this') return ev;
      if (t === 'player') return G.player;
      if (t === 'follower') return G.follower;
      return G.evs.find(e => e.data.name === t) || null;
    },
    // Walk a character along a route. Resolves when it's done.
    async runRoute(ch, steps, speedName, through) {
      if (!ch) return;
      const spd = (SPEEDS[speedName] || SPEEDS.normal).walk;
      const isPlayer = ch === G.player;
      if (!isPlayer) { ch.scripted = true; ch.scriptSpeed = spd; }
      else ch.scripted = true;
      const waitStill = () => new Promise(r => { const chk = () => { if (!ch.moving) r(); else setTimeout(chk, 16); }; chk(); });
      try {
        for (const st of steps || []) {
          if (st === 'wait') { await wait(400); continue; }
          if (st.startsWith('face-')) { ch.dir = st.slice(5); await wait(120); continue; }
          const [dx, dy] = DIRV[st] || [0, 0];
          ch.dir = st;
          let tries = 0;
          while (!(through || G.canMove(ch, ch.x + dx, ch.y + dy)) && tries++ < 10) await wait(150);
          if (tries > 10) continue;
          if (isPlayer) G.movePlayerTo(ch.x + dx, ch.y + dy); else { ch.x += dx; ch.y += dy; ch.moving = true; }
          await waitStill();
        }
      } finally { ch.scripted = false; ch.scriptSpeed = 0; }
    },
    // A speech-bubble icon (! ? ♪ ♥ … ✶) above a character for about a second.
    async balloon(ch, icon) {
      if (!ch) return;
      const b = el('div', 'balloon', esc(icon || '!'));
      document.getElementById('ui').appendChild(b);
      G.balloons = (G.balloons || []).concat([{ ch, el: b }]);
      GameAudio.se('cursor');
      await wait(1000);
      b.remove(); G.balloons = G.balloons.filter(x => x.el !== b);
    },
    // Camera: pan to a square (or back to the player) over some frames.
    async pan(toX, toY, frames) {
      const T = G.tileSize, from = G.camCentre();
      const target = toX == null ? { x: G.player.px * T + T / 2, y: G.player.py * T + T / 2 } : { x: toX * T + T / 2, y: toY * T + T / 2 };
      const ms = Math.max(1, frames || 30) * 1000 / 60, t0 = performance.now();
      await new Promise(r => { const tick = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; G.cam = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e }; if (k < 1) requestAnimationFrame(tick); else r(); }; tick(); });
      if (toX == null) G.cam = null;
    },
    camCentre() { const T = G.tileSize; return G.cam ? { x: G.cam.x, y: G.cam.y } : { x: G.player.px * T + T / 2, y: G.player.py * T + T / 2 }; },
    overlay(id, cls) { let o = document.getElementById(id); if (!o) { o = el('div', cls); o.id = id; document.getElementById('ui').appendChild(o); } return o; },
    async screenEffect(c) {
      const ms = Math.max(1, c.frames || 30) * 1000 / 60;
      if (c.effect === 'fadeOut' || c.effect === 'fadeIn') {
        const f = document.getElementById('fade'); f.style.background = c.colour === 'white' ? '#fff' : '#000';
        await RUI.fade(c.effect === 'fadeOut', ms);
        if (c.effect === 'fadeIn') f.style.background = '#000';
      } else if (c.effect === 'flash') {
        const o = G.overlay('flash', 'flash'); o.style.background = c.colour === 'red' ? '#ff4040' : c.colour === 'yellow' ? '#ffe680' : '#fff';
        o.style.transition = 'none'; o.style.opacity = 0.9; await wait(30); o.style.transition = 'opacity ' + ms + 'ms'; o.style.opacity = 0; await wait(ms);
      } else if (c.effect === 'shake') {
        G.shake = { power: c.power || 4, until: performance.now() + ms }; await wait(ms); G.shake = null;
      } else if (c.effect === 'tint') {
        const o = G.overlay('tint', 'tint'); o.style.transition = 'background ' + ms + 'ms'; o.style.background = TINTS[c.tint] || 'transparent';
        G.state.tint = c.tint; await wait(ms);
      }
    },
    picture(c) {
      const id = 'pic' + (c.slot || 1);
      let o = document.getElementById(id);
      if (c.action === 'hide') { if (o) { o.style.opacity = 0; setTimeout(() => o.remove(), Math.max(1, c.frames || 0) * 1000 / 60 + 30); } return wait(Math.max(0, c.frames || 0) * 1000 / 60); }
      if (!o) { o = el('img', 'picture'); o.id = id; document.getElementById('ui').appendChild(o); }
      o.src = G.asset(c.file);
      o.style.zIndex = 30 + (c.slot || 1);
      o.className = 'picture ' + (c.position === 'fill' ? 'fill' : c.position === 'xy' ? 'xy' : 'centre');
      if (c.position === 'xy') { o.style.left = (c.x || 0) + 'px'; o.style.top = (c.y || 0) + 'px'; } else { o.style.left = ''; o.style.top = ''; }
      const ms = Math.max(0, c.frames || 0) * 1000 / 60;
      o.style.transition = 'none'; o.style.opacity = ms ? 0 : (c.opacity ?? 100) / 100;
      if (ms) { void o.offsetWidth; o.style.transition = 'opacity ' + ms + 'ms'; o.style.opacity = (c.opacity ?? 100) / 100; }
      return wait(ms);
    },
    letterbox(on) { const o = G.overlay('letterbox', 'letterbox'); o.classList.toggle('on', !!on); return wait(350); },

    /* ---------- interpreter ---------- */
    async runEvent(ev, face) {
      if (G.busy) return;
      const pg = G.page(ev);
      if (!pg) return;
      G.busy = true;
      if (face && pg.sprite && pg.move !== 'fixed-dir') ev.dir = OPP[G.player.dir];
      const key = G.map.id + ':' + ev.data.id;
      const mapAtStart = G.map;
      try {
        for (const c of pg.commands || []) await G.exec(c, ev, key, mapAtStart);
      } catch (e) {
        if (!(e instanceof Abort)) { console.error(e); await message('Event error: ' + e.message); }
      } finally {
        closeMessage();
        G.busy = false;
        if (G.map) { G.refreshPages(); setTimeout(() => G.checkAuto(), 0); }
      }
    },
    async exec(c, ev, key, mapAtStart) {
      const db = G.db, st = G.state;
      switch (c.cmd) {
        case 'text': await message(c.text || '', { speaker: c.speaker }); break;
        case 'giveMonster': {
          if (!db.species(c.speciesId)) break;
          const mon = MF.createMonster(db, c.speciesId, c.level || 5, { nickname: c.nickname || '', ot: st.playerName });
          const where = G.addMonster(mon);
          GameAudio.playMe(G.audioCfg.monster);
          await message(st.playerName + ' received ' + MF.monName(db, mon) + '!' + (where === 'storage' ? ' Your party is full, so it was sent to storage.' : ''));
          break;
        }
        case 'giveItem': {
          const it = db.item(c.itemId); if (!it) break;
          const n = c.amount || 1;
          st.bag[it.id] = Math.max(0, (st.bag[it.id] || 0) + n);
          if (n > 0) GameAudio.playMe(G.audioCfg.item);
          if (n > 0 && !c.silent) await message(st.playerName + ' obtained ' + (n > 1 ? n + '× ' : '') + it.name + '!');
          break;
        }
        case 'giveMoney':
          if (!c.amount) break;
          st.money = Math.max(0, st.money + c.amount);
          if (!c.silent) await message(c.amount > 0 ? 'Got ' + c.amount + ' ' + (db.system.currency || 'money') + '!' : 'Paid ' + (-c.amount) + ' ' + (db.system.currency || 'money') + '.');
          break;
        case 'heal':
          st.party.forEach(m => MF.healMonster(db, m));
          await RUI.fade(true, 200);
          await Promise.all([GameAudio.playMe(G.audioCfg.heal), wait(250)]);
          await RUI.fade(false, 200);
          break;
        case 'setSwitch': st.switches[c.switchId] = c.value === 'toggle' ? !st.switches[c.switchId] : !!c.value; G.refreshPages(); break;
        case 'moveRoute': {
          const ch = G.target(c.target, ev);
          if (!ch) break;
          const run = G.runRoute(ch, c.steps, c.speed, c.through);
          if (c.wait !== false) await run;
          break;
        }
        case 'balloon': await G.balloon(G.target(c.target, ev), c.icon); break;
        case 'camera': await G.pan(c.mode === 'player' ? null : c.x | 0, c.mode === 'player' ? null : c.y | 0, c.frames); break;
        case 'screen': await G.screenEffect(c); break;
        case 'picture': await G.picture(c); break;
        case 'letterbox': await G.letterbox(c.on); break;
        case 'selfSwitch': if (c.value) st.selfSwitches[key] = true; else delete st.selfSwitches[key]; if (G.map === mapAtStart) G.refreshPages(); break;
        case 'transfer': {
          if (c.sound) GameAudio.se('door');
          const fade = c.fade !== 'none';
          if (fade) await RUI.fade(true, 220);
          await G.enterMap(c.mapId, c.x, c.y, (!c.dir || c.dir === 'keep') ? G.player.dir : c.dir);
          if (fade) await RUI.fade(false, 220);
          break;
        }
        case 'choice': {
          if (c.text) await message(c.text, { speaker: c.speaker, keep: true, auto: 0 });
          const labels = [c.yes || 'Yes', c.no || 'No'];
          const w = Math.max(56, 12 + 7 * Math.max(...labels.map(l => l.length)));
          let r;
          do { r = await choose({ items: labels.map(label => ({ label })), right: 6, bottom: 56, w, cancel: true }); } while (r < 0 && c.cancelIsNo === false);
          closeMessage();
          for (const sub of (r === 0 ? c.yesCmds : c.noCmds) || []) await G.exec(sub, ev, key, mapAtStart);
          break;
        }
        case 'shop': await Shop.open(G, c); break;
        case 'openScreen': if ((c.screen === 'wardrobe' && !Home.wearOn(G)) || (c.screen === 'decorate' && !Home.decorOn(G))) break; await Menus.open(G, c.screen); break;
        case 'playMusic': if (c.file) GameAudio.playBgm(c.file, { volume: c.volume }); else GameAudio.stopBgm(0.6); break;
        case 'playSound':
          if (!c.file) break;
          if (c.wait && c.file.startsWith('music/')) await GameAudio.playMe(c.file);
          else if (c.wait) { GameAudio.se(c.file, c.volume); const b = await GameAudio.load(c.file); await wait(b ? b.duration * 1000 : 0); }
          else GameAudio.se(c.file, c.volume);
          break;
        case 'wait': await wait((c.frames || 30) * 1000 / 60); break;
        case 'erase': G.erased.add(ev.data.id); G.refreshPages(); break;
        case 'trainerBattle': case 'wildBattle': {
          if (!G.healthy()) { await message('You don\'t have any monsters that can fight!'); throw new Abort(); }
          let r;
          if (c.cmd === 'trainerBattle') {
            const party = (c.party || []).filter(p => db.species(p.speciesId)).map(p => MF.createMonster(db, p.speciesId, p.level || 5));
            if (!party.length) break;
            r = await G.battle({ enemyParty: party, isWild: false, trainerName: c.name || 'Trainer', active: c.active || 0, reward: c.reward || 0, winText: c.winText, loseText: c.loseText, battleback: c.battleback, bgm: c.bgm, continueOnLoss: c.continueOnLoss });
          } else {
            if (!db.species(c.speciesId)) break;
            r = await G.battle({ enemyParty: [MF.createMonster(db, c.speciesId, c.level || 5)], isWild: true, canRun: c.canRun !== false, canCapture: c.canCapture !== false, continueOnLoss: c.continueOnLoss });
          }
          if (r === 'lose' && !c.continueOnLoss) throw new Abort();
          break;
        }
        default: break;
      }
    },

    /* ---------- battles ---------- */
    async battle(o) {
      G.scene = 'battle';
      GameAudio.pushBgm();
      if (o.isWild) GameAudio.se('encounter');
      GameAudio.playBgm(o.bgm || (o.isWild ? G.audioCfg.battleWild : G.audioCfg.battleTrainer), { restart: true, fade: 0.1 });
      let r;
      try { r = await BattleScene.run(G, o); }
      finally { GameAudio.popBgm(); }
      const db = G.db;
      if (r.result === 'lose' && !o.continueOnLoss) {
        await G.blackout();
        return 'lose';
      }
      if (r.result === 'lose') G.state.party.forEach(m => MF.healMonster(db, m));
      G.scene = 'map';
      await RUI.fade(false, 300);
      if (r.caught) {
        delete r.caught._faintAnnounced;
        const where = G.addMonster(r.caught);
        if (where === 'storage') await message(MF.monName(db, r.caught) + ' was sent to storage because your party is full.');
        else await message(MF.monName(db, r.caught) + ' joined your party!');
      }
      for (const p of r.post) {
        if (p.kind === 'learnPending') await Menus.learnMove(G, p.mon, p.moveId);
      }
      for (const p of r.post) {
        if (p.kind === 'evolve' && p.mon.hp > 0 && MF.checkEvolution(db, p.mon) === p.into) await Menus.evolve(G, p.mon, p.into);
      }
      closeMessage();
      return r.result;
    },
    async blackout() {
      const db = G.db, rs = db.system.respawn || db.system.start;
      G.state.party.forEach(m => MF.healMonster(db, m));
      G.state.money = Math.floor(G.state.money / 2);
      await G.enterMap(rs.mapId, rs.x, rs.y, rs.dir || 'down');
      await RUI.fade(false, 400);
      await message(rs.message || 'You blacked out!');
    },

    /* ---------- draw ---------- */
    draw() {
      const g = G.ctx, W = G.screen.width, H = G.screen.height;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (!G.map || !G.player || (G.scene !== 'map' && G.scene !== 'battle')) return;
      const T = G.tileSize, p = G.player, m = G.map;
      const centre = G.camCentre();
      let cx = centre.x - W / 2, cy = centre.y - H / 2;
      const mw = m.width * T, mh = m.height * T;
      cx = mw <= W ? (mw - W) / 2 : Math.max(0, Math.min(mw - W, cx));
      cy = mh <= H ? (mh - H) / 2 : Math.max(0, Math.min(mh - H, cy));
      if (G.shake && performance.now() < G.shake.until) { cx += (Math.random() * 2 - 1) * G.shake.power; cy += (Math.random() * 2 - 1) * G.shake.power * 0.5; }
      cx = Math.round(cx); cy = Math.round(cy);
      G.camX = cx; G.camY = cy;
      g.drawImage(G.below, -cx, -cy);
      if (window.Home) Home.drawFloor(G, g, cx, cy);
      const chars = G.evs.filter(e => e.page >= 0 && G.page(e).sprite).map(e => ({ c: e, sprite: G.page(e).sprite }));
      chars.push({ c: p, sprite: p.sprite, sheet: window.Home && Home.playerSheet(G) });
      if (window.Home) chars.push(...Home.sprites(G, cx, cy));
      const fm = G.follower && G.followerMon();
      if (fm) { const sp = G.db.species(fm.speciesId); chars.push({ c: G.follower, sprite: sp && sp.overworld, mon: sp }); }
      chars.sort((a, b) => a.c.py - b.c.py);
      chars.forEach(({ c, sprite, mon, sheet, draw }) => {
        if (draw) return draw(g);
        if (mon && !sprite) { // no walking sprite: draw the monster's front picture, bobbing as it walks
          const img = G.img(mon.front); if (!img) return;
          const S = Math.round(T * 1.15), bob = c.moving ? Math.abs(Math.sin(c.anim * Math.PI)) * 2 : (Math.sin(performance.now() / 300) + 1) * 0.5;
          const dx = Math.round(c.px * T + (T - S) / 2 - cx), dy = Math.round(c.py * T + T - S - cy - bob);
          g.save(); if (c.dir === 'right') { g.translate(dx + S, dy); g.scale(-1, 1); g.drawImage(img, 0, 0, S, S); } else g.drawImage(img, dx, dy, S, S); g.restore();
          return;
        }
        const img = sheet || G.img(sprite);
        if (!img) return;
        const fw = img.width / 3, fh = img.height / 4;
        const frame = c.moving ? [1, 0, 1, 2][Math.floor(c.anim * 4) % 4] : 1;
        const dx = Math.round(c.px * T + (T - fw) / 2 - cx), dy = Math.round(c.py * T + T - fh - cy);
        g.drawImage(img, frame * fw, (DIR_ROW[c.dir] || 0) * fh, fw, fh, dx, dy, fw, fh);
      });
      g.drawImage(G.above, -cx, -cy);
      if (window.Home) Home.drawCursor(G, g, cx, cy);
      if (G.exclaim) {
        const e = G.exclaim.ev;
        Object.assign(G.exclaim.el.style, { left: (e.px * T + T / 2 - cx - 3) + 'px', top: (e.py * T - T - cy) + 'px' });
      }
      (G.balloons || []).forEach(b => Object.assign(b.el.style, { left: (b.ch.px * T + T / 2 - cx - 7) + 'px', top: (b.ch.py * T - T - 4 - cy) + 'px' }));
    }
  };

  window.addEventListener('DOMContentLoaded', () => G.boot());
})();
