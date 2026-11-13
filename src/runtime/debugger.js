/* Playtest debugger: finds things in a game that don't work, so they can be tracked down and fixed.
   Only runs in a playtest started from the editor (exported games leave this file out).

   F9   show or hide the debugger panel
   F10  show or hide the map overlay (events outlined by type, blocked squares shaded)

   It does three things:
   1. Project check when the playtest starts: missing maps, items, monsters, pictures, sprites and sounds;
      events that can't be reached or can never appear; autorun events that never stop; broken transfers.
   2. Live log while playing: every map entered and event run, and a warning whenever something should have
      happened but didn't (pressing the action button at an event with no active page, a command that was
      skipped because what it points at is missing, a move route that got stuck, a file that would not load).
   3. Map overlay, to see where events are and which squares block the player. */
(function () {
  'use strict';
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const ASSET_RE = /^(tilesets|characters|monsters|battlebacks|pictures|decorations|music|sounds|movies|text)\/[^\s]+\.[A-Za-z0-9]+$/;
  const ICON = { error: '✖', warning: '⚠', info: 'ℹ', trace: '·' };
  const TRIGGER = { action: 'action button', touch: 'touch', sight: 'trainer sight', auto: 'autorun', encounter: 'encounter area' };
  const CMD = {
    text: 'Show text', giveMonster: 'Give monster', giveItem: 'Give item', giveMoney: 'Give money', heal: 'Heal party', setSwitch: 'Set switch',
    moveRoute: 'Move route', balloon: 'Balloon icon', camera: 'Camera', screen: 'Screen effect', picture: 'Picture', letterbox: 'Letterbox',
    selfSwitch: 'Self switch', transfer: 'Transfer player', choice: 'Yes/No choice', shop: 'Shop', openScreen: 'Open screen',
    playMusic: 'Play music', playSound: 'Play sound', playMovie: 'Play movie', saveGame: 'Save the game', playScenes: 'Play scenes', wait: 'Wait', erase: 'Erase event', trainerBattle: 'Trainer battle', wildBattle: 'Wild battle'
  };

  const D = window.Debug = {
    on: false, entries: [], filter: 'problems', panelOpen: false, overlay: false, counts: { error: 0, warning: 0 },
    seen: new Set(), runCtx: null,

    /* ---------- set-up ---------- */
    init(G) {
      D.G = G; D.on = true;
      G.dbg = (level, msg, opts) => D.add(level, msg, opts);
      D.buildUi();
      D.hook();
      window.addEventListener('keydown', e => {
        if (e.key === 'F9') { e.preventDefault(); D.toggle(); }
        if (e.key === 'F10') { e.preventDefault(); D.setOverlay(!D.overlay); }
      });
      window.addEventListener('error', e => D.add('error', 'Script error: ' + (e.message || e), { where: e.filename ? e.filename.split('/').pop() + ':' + e.lineno : '', hint: 'This is a fault in the engine or a plugin, not in your project. Copy the report and send it with the steps that caused it.' }));
      window.addEventListener('unhandledrejection', e => D.add('error', 'Script error: ' + ((e.reason && e.reason.message) || e.reason), { hint: 'This is a fault in the engine, not in your project. Copy the report and send it with the steps that caused it.' }));
      const ce = console.error.bind(console);
      console.error = (...a) => { ce(...a); D.add('error', a.map(x => (x && x.message) || String(x)).join(' ')); };
      D.add('info', 'Debugger running. F9 shows or hides this panel, F10 shows the map overlay.', { group: 'start' });
      D.scan().catch(err => D.add('error', 'The project check could not finish: ' + err.message));
    },

    /* ---------- log ---------- */
    add(level, msg, o) {
      o = o || {};
      if (!D.on) return;
      const key = level + '|' + msg + '|' + (o.where || '');
      const old = D.entries.find(e => e.key === key);
      if (old) { old.n++; old.t = D.time(); D.render(); return; }
      const e = { key, level, msg, where: o.where || '', hint: o.hint || '', group: o.group || 'play', t: D.time(), n: 1 };
      D.entries.push(e);
      if (D.entries.length > 1500) D.entries.splice(0, D.entries.findIndex(x => x.level === 'trace') + 1 || 1);
      if (level === 'error' || level === 'warning') { D.counts[level]++; D.pulse(); }
      D.render();
    },
    time() { const t = D.G.state && D.G.state.playTime, s = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
    problem(level, msg, where, hint) { D.add(level, msg, { where, hint, group: 'check' }); },

    /* ---------- names ---------- */
    db() { return D.G.db; },
    mapName(id) { const m = D.db().maps[id]; return m ? '"' + (m.name || id) + '"' : '"' + id + '"'; },
    evName(evData) { return '"' + (evData.name || 'Event ' + evData.id) + '"'; },
    whereEv(map, evData, pageIdx) { return 'Map ' + D.mapName(map.id) + ' › event ' + D.evName(evData) + ' at (' + evData.x + ', ' + evData.y + ')' + (pageIdx != null ? ' › page ' + (pageIdx + 1) : ''); },
    switchName(id) { const n = (D.db().system.switches || [])[id]; return 'switch ' + id + (n ? ' "' + n + '"' : ''); },
    cap(t) { return t ? t[0].toUpperCase() + t.slice(1) : t; },
    panelWidth() { const p = document.getElementById('dbg'); return D.panelOpen && p ? p.offsetWidth : 0; },
    cmdName(c) { return CMD[c.cmd] || c.cmd; },
    walkable(map, x, y) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
      const ts = D.db().tilesets[map.tilesetId];
      return MF.Layers.cellFlags(map, ts, x, y).pass;
    },

    /* ---------- checks shared by the project check and the live log ---------- */
    // Problems with one command. ctx: { map, evData, live } (live = checking while the game runs).
    cmdProblems(c, ctx) {
      const db = D.db(), out = [], P = (level, msg, hint) => out.push({ level, msg, hint });
      const map = ctx.map, findTarget = t => !t || t === 'this' || t === 'player' || (t === 'follower' ? true : map.events.some(e => e.name === t));
      switch (c.cmd) {
        case 'text': if (!(c.text || '').trim()) P('info', 'Show text has no text, so an empty message box appears.'); break;
        case 'giveMonster': if (!db.species(c.speciesId)) P('error', 'Give monster: the monster "' + (c.speciesId || '(none chosen)') + '" does not exist, so nothing was given.', 'Pick a monster in this command, or add it in Database → Monsters.'); break;
        case 'giveItem':
          if (!db.item(c.itemId)) P('error', 'Give item: the item "' + (c.itemId || '(none chosen)') + '" does not exist, so nothing was given.', 'Pick an item in this command, or add it in Database → Items.');
          else if (!c.amount && c.amount !== undefined) P('info', 'Give item: the amount is 0, so nothing changes.');
          break;
        case 'giveMoney': if (!c.amount) P('info', 'Give money: the amount is 0, so nothing changes.'); break;
        case 'setSwitch': if (!c.switchId) P('error', 'Set switch: no switch is chosen, so nothing changes.', 'Choose a switch in this command (Database → System lists the switch names).'); break;
        case 'moveRoute':
          if (!findTarget(c.target)) P('error', 'Move route: there is no event called "' + c.target + '" on this map, so nobody moved.', 'Event names must match exactly. Rename the event or change the command\'s target.');
          else if (c.target === 'follower' && !D.G.cfg.follower.enabled) P('warning', 'Move route: it moves the following monster, but following monsters are turned off.', 'Turn them on in Database → Menus & screens, or change the target.');
          if (!(c.steps || []).length) P('info', 'Move route has no steps.');
          break;
        case 'balloon': if (!findTarget(c.target)) P('error', 'Balloon icon: there is no event called "' + c.target + '" on this map, so no balloon was shown.', 'Event names must match exactly.'); break;
        case 'camera': if (c.mode !== 'player' && (c.x < 0 || c.y < 0 || c.x >= map.width || c.y >= map.height)) P('warning', 'Camera: the square (' + c.x + ', ' + c.y + ') is outside this map.'); break;
        case 'picture': if (c.action !== 'hide' && !c.file) P('error', 'Picture: no picture file is chosen, so nothing was shown.', 'Choose a picture in this command (Import adds your own).'); break;
        case 'transfer': {
          const to = db.maps[c.mapId];
          if (!to) { P('error', 'Transfer player: the map ' + (c.mapId ? '"' + c.mapId + '"' : '(none chosen)') + ' does not exist, so the player can\'t go there.', 'Choose the destination again in this command. The map may have been deleted.'); break; }
          if (c.x < 0 || c.y < 0 || c.x >= to.width || c.y >= to.height) P('error', 'Transfer player: (' + c.x + ', ' + c.y + ') is outside map ' + D.mapName(to.id) + ' (' + to.width + '×' + to.height + ').', 'Choose the destination square again. The map may have been made smaller.');
          else { MF.Layers.migrate(to); if (!D.walkable(to, c.x, c.y)) P('warning', 'Transfer player: the player arrives on a blocked square (' + c.x + ', ' + c.y + ') on map ' + D.mapName(to.id) + ' and may be stuck.', 'Move the destination one square onto floor, or check the tile\'s passability in Database → Tilesets.'); }
          break;
        }
        case 'choice':
          if (ctx.live) break; // while playing, each branch is checked when the player picks it
          (c.yesCmds || []).forEach((s, i) => D.cmdProblems(s, ctx).forEach(p => out.push(Object.assign({}, p, { msg: '"' + (c.yes || 'Yes') + '" branch, command ' + (i + 1) + ': ' + p.msg }))));
          (c.noCmds || []).forEach((s, i) => D.cmdProblems(s, ctx).forEach(p => out.push(Object.assign({}, p, { msg: '"' + (c.no || 'No') + '" branch, command ' + (i + 1) + ': ' + p.msg }))));
          break;
        case 'shop': {
          const goods = c.goods || [];
          if (!goods.length) P('warning', 'Shop has nothing for sale.', 'Add items to this shop command.');
          goods.filter(g => !db.item(g.itemId)).forEach(g => P('error', 'Shop: the item "' + g.itemId + '" does not exist, so it is left out of the shop.', 'Remove it from the shop, or add it in Database → Items.'));
          break;
        }
        case 'openScreen':
          if (c.screen === 'wardrobe' && !(D.G.cfg.wardrobe || {}).enabled) P('warning', 'Open screen: the Wardrobe is turned off, so nothing opened.', 'Turn it on in Database → Menus & screens → Optional features for players.');
          if (c.screen === 'worldmap' && !(D.G.cfg.worldMap.enabled && D.G.cfg.worldMap.image)) P('warning', 'Open screen: the world map is turned off or has no picture, so a message says there is no map.', 'Set it up in Database → World map.');
          if (c.screen === 'decorate' && !(D.G.cfg.decorating || {}).enabled) P('warning', 'Open screen: Decorating is turned off, so nothing opened.', 'Turn it on in Database → Menus & screens → Optional features for players.');
          break;
        case 'playSound': if (!c.file) P('warning', 'Play sound: no sound file is chosen, so nothing played.'); break;
        case 'saveGame': break;
        case 'playScenes': if (!((D.G.cfg.scenes || {})[c.group || 'ending'] || []).length) P('warning', 'Play scenes: there are no ' + ({ ending: 'ending', opening: 'opening', newGame: 'new-game' }[c.group || 'ending'] || c.group) + ' scenes yet, so nothing plays' + (c.then === 'title' || (!c.then && (c.group || 'ending') === 'ending' && D.G.cfg.scenes.endingThen === 'title') ? ' before the title screen.' : '.'), 'Add them with Scenes → Opening & Ending Scenes.'); break;
        case 'playMovie': if (!c.file) P('error', 'Play movie: no movie is chosen, so nothing played.', 'Choose a movie in this command (Import adds MP4 or WebM files).'); break;
        case 'trainerBattle': {
          const party = c.party || [];
          const bad = party.filter(p => !db.species(p.speciesId));
          bad.forEach(p => P('error', 'Trainer battle: the monster "' + (p.speciesId || '(none chosen)') + '" in ' + (c.name || 'the trainer') + '\'s team does not exist, so it is left out.', 'Fix the team in this command, or add the monster in Database → Monsters.'));
          if (party.length === bad.length) P('error', 'Trainer battle: ' + (c.name || 'the trainer') + ' has no monsters, so the battle is skipped.', 'Add at least one monster to the trainer\'s team.');
          break;
        }
        case 'wildBattle': if (!db.species(c.speciesId)) P('error', 'Wild battle: the monster "' + (c.speciesId || '(none chosen)') + '" does not exist, so the battle is skipped.', 'Pick a monster in this command.'); break;
        case 'heal': case 'letterbox': case 'selfSwitch': case 'playMusic': case 'wait': case 'erase': case 'screen': break;
        default: P('warning', 'Unknown command "' + c.cmd + '", so it was skipped.', 'This command may come from a newer version of Pocket-Game-Maker.');
      }
      return out;
    },

    // Why none of an event's pages is active right now (for the live log).
    whyNoPage(ev) {
      const G = D.G;
      if (G.erased.has(ev.data.id)) return 'it was removed by an Erase event command (it comes back when the map is entered again)';
      const key = G.map.id + ':' + ev.data.id;
      const reasons = ev.data.pages.map((pg, i) => {
        const c = pg.condition || {}, need = [];
        if (c.switchId && !G.state.switches[c.switchId]) need.push(D.switchName(c.switchId) + ' to be ON');
        if (c.switchOffId && G.state.switches[c.switchOffId]) need.push(D.switchName(c.switchOffId) + ' to be OFF');
        if (c.selfSwitch && !G.state.selfSwitches[key]) need.push('its self switch to be ON');
        return 'page ' + (i + 1) + ' needs ' + need.join(' and ');
      });
      return reasons.length ? reasons.join('; ') : 'it has no pages';
    },

    /* ---------- project check ---------- */
    async scan() {
      const G = D.G, db = D.db(), sys = db.system, maps = Object.values(db.maps);
      let n0 = D.counts.error + D.counts.warning;
      // Which switches and self switches something can turn on, so pages that need them can be checked.
      const switchesSet = new Set(), walk = (cmds, fn) => (cmds || []).forEach(c => { fn(c); if (c.cmd === 'choice') { walk(c.yesCmds, fn); walk(c.noCmds, fn); } });
      maps.forEach(m => m.events.forEach(e => e.pages.forEach(p => walk(p.commands, c => { if (c.cmd === 'setSwitch' && c.switchId && c.value !== false) switchesSet.add(+c.switchId); }))));

      // System
      if (!db.maps[(sys.start || {}).mapId]) D.problem('error', 'The player start position is not on a map that exists.', 'Database → System', 'Set it again: right-click a square in Events mode → Set player start here.');
      else { const m = MF.Layers.migrate(db.maps[sys.start.mapId]); if (!D.walkable(m, sys.start.x, sys.start.y)) D.problem('warning', 'The player starts on a blocked square (' + sys.start.x + ', ' + sys.start.y + ') and may be stuck.', 'Map ' + D.mapName(m.id), 'Move the start position onto floor.'); }
      const rs = sys.respawn;
      if (rs && rs.mapId && !db.maps[rs.mapId]) D.problem('error', 'The respawn point (where the player goes after losing) is not on a map that exists.', 'Database → System', 'Set the respawn point again.');
      (sys.startingParty || []).filter(p => !db.species(p.speciesId)).forEach(p => D.problem('error', 'The starting party has a monster that does not exist: "' + p.speciesId + '".', 'Database → System', 'Remove it or add it in Database → Monsters.'));
      Object.keys(sys.startingItems || {}).filter(id => !db.item(id)).forEach(id => D.problem('error', 'The starting items include one that does not exist: "' + id + '".', 'Database → System', 'Remove it or add it in Database → Items.'));

      const WM = G.cfg.worldMap;
      if (WM.enabled) {
        if (!WM.image) D.problem('warning', 'The world map is turned on but has no picture.', 'Database → World map', 'Choose a picture, use a default map, or draw one.');
        (WM.locations || []).forEach(l => {
          (l.maps || []).filter(id => !db.maps[id]).forEach(id => D.problem('warning', 'The place "' + l.name + '" lists a map that does not exist ("' + id + '").', 'Database → World map', 'Untick it in the place\'s maps.'));
          if (WM.travel && l.dest && l.dest.mapId && !db.maps[l.dest.mapId]) D.problem('error', 'Travelling to "' + l.name + '" goes to a map that does not exist.', 'Database → World map', 'Choose where travelling there takes the player.');
        });
        if (!(WM.locations || []).length) D.problem('info', 'The world map has no places yet, so it can\'t show where the player is.', 'Database → World map', 'Click the map picture to add places.');
      }
      if (G.cfg.saving.autosave === false && !G.cfg.menus.main.some(e => e.id === 'save' && e.on) && !maps.some(m => m.events.some(e => e.pages.some(p => (p.commands || []).some(c => c.cmd === 'saveGame' || (c.cmd === 'openScreen' && c.screen === 'save'))))) && !(db.raw.items || []).some(i => i.kind === 'tool' && i.toolAction === 'save'))
        D.problem('warning', 'Players have no way to save: Save is off in the menu, autosave is off, and there are no save points or save items.', 'Database → Menus & screens → Saving', 'Turn one of them on, or add a Save point quick event.');

      maps.forEach(map => {
        MF.Layers.migrate(map);
        const mWhere = 'Map ' + D.mapName(map.id);
        if (!db.tilesets[map.tilesetId]) D.problem('error', 'The map\'s tileset "' + map.tilesetId + '" does not exist, so the map is drawn empty.', mWhere, 'Choose a tileset in the map\'s properties.');
        Object.entries(map.edges || {}).forEach(([d, e]) => { if (e && e.mapId && !db.maps[e.mapId]) D.problem('error', 'Walking off the ' + d + ' edge leads to map "' + e.mapId + '", which does not exist.', mWhere + ' › Map edges', 'Choose the map again in Map edges, or clear it.'); });
        const enc = map.encounters || {};
        (enc.list || []).filter(e => !db.species(e.speciesId)).forEach(e => D.problem('error', 'Wild encounters include a monster that does not exist: "' + e.speciesId + '".', mWhere + ' › Wild encounters', 'Remove it from the list.'));
        if (enc.chance && !(enc.list || []).length) D.problem('warning', 'Wild encounters have a chance set but no monsters listed, so no battles happen.', mWhere + ' › Wild encounters', 'Add monsters to the list, or set the chance to 0.');

        // 2.5D: stairs that join nothing, events that can't be reached, a start on a cliff-locked square
        if (MF.Heights.hasHeights(map)) {
          const H = MF.Heights, around = (x, y) => [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => [x + dx, y + dy]).filter(([x2, y2]) => x2 >= 0 && y2 >= 0 && x2 < map.width && y2 < map.height);
          let lonely = 0, lx = 0, ly = 0;
          for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
            if (!H.isStairs(map, x, y)) continue;
            if (!around(x, y).some(([x2, y2]) => Math.abs(H.get(map, x2, y2) - H.get(map, x, y)) === 1)) { if (!lonely++) { lx = x; ly = y; } }
          }
          if (lonely) D.problem('info', lonely + ' stair square' + (lonely > 1 ? 's don\'t' : ' doesn\'t') + ' join two height levels (first at (' + lx + ', ' + ly + ')), so ' + (lonely > 1 ? 'they work' : 'it works') + ' like flat ground.', mWhere, 'Stairs go between squares one level apart. Check the heights in Height mode.');
          map.events.forEach(ev => {
            const pg = ev.pages.find(p => p.trigger === 'action');
            if (!pg || !pg.sprite || pg.through) return;
            if (!around(ev.x, ev.y).some(([x2, y2]) => H.canReach(map, x2, y2, ev.x, ev.y) && D.walkable(map, x2, y2))) D.problem('warning', D.evName(ev) + ' can\'t be reached: every square next to it is on a different height level or blocked.', D.whereEv(map, ev), 'Move it, change the heights around it, or add stairs.');
          });
        }
        const names = {}, targeted = new Set();
        map.events.forEach(e => e.pages.forEach(p => walk(p.commands, c => { if ((c.cmd === 'moveRoute' || c.cmd === 'balloon') && c.target) targeted.add(c.target); })));
        map.events.forEach(ev => {
          const eWhere = D.whereEv(map, ev);
          if (ev.x < 0 || ev.y < 0 || ev.x >= map.width || ev.y >= map.height) D.problem('error', 'This event is outside the map, so the player can never reach it.', eWhere, 'Move it back onto the map (the map may have been made smaller).');
          if (ev.name) { if (names[ev.name] && targeted.has(ev.name)) D.problem('info', 'Two events are called ' + D.evName(ev) + '. Move route and balloon commands use the first one.', 'Map ' + D.mapName(map.id), 'Give each event its own name.'); names[ev.name] = true; }
          if (!ev.pages.length) D.problem('warning', 'This event has no pages, so it never does anything.', eWhere, 'Add a page or delete the event.');
          const usesSelf = ev.pages.some(p => { let f = false; walk(p.commands, c => { if (c.cmd === 'selfSwitch' && c.value) f = true; }); return f; });
          // Can the player get next to (or onto) it?
          const actionPage = ev.pages.some(p => p.trigger === 'action' || p.trigger === 'sight');
          if (actionPage && !D.walkable(map, ev.x, ev.y) && !Object.values(DIRV).some(([dx, dy]) => D.walkable(map, ev.x + dx, ev.y + dy))) {
            D.problem('warning', 'The player can\'t reach this event: every square around it is blocked.', eWhere, 'Move it next to floor, or check the tiles\' passability with F10 or the Passability toggle.');
          }
          ev.pages.forEach((pg, i) => {
            const pWhere = D.whereEv(map, ev, i), c = pg.condition || {};
            if (c.switchId && !switchesSet.has(+c.switchId)) D.problem('warning', 'This page only appears when ' + D.switchName(c.switchId) + ' is ON, but no event turns that switch on, so it never appears.', pWhere, 'Add a Set switch command somewhere that turns it on, or change the page\'s condition.');
            if (c.selfSwitch && !usesSelf) D.problem('warning', 'This page only appears when the event\'s self switch is ON, but none of its pages turns the self switch on, so it never appears.', pWhere, 'Add a Self switch → ON command to an earlier page.');
            if (pg.trigger === 'auto') {
              let stops = false; walk(pg.commands, x => { if (['selfSwitch', 'setSwitch', 'erase', 'transfer'].includes(x.cmd)) stops = true; });
              if (!stops) D.problem('warning', 'This autorun page never turns itself off, so it runs again and again and the player can\'t move.', pWhere, 'End it with Self switch → ON (and a page 2 that needs the self switch), Set switch, or Erase event.');
            }
            if (pg.trigger === 'encounter' && pg.encounter) (pg.encounter.list || []).filter(e => !db.species(e.speciesId)).forEach(e => D.problem('error', 'This encounter area includes a monster that does not exist: "' + e.speciesId + '".', pWhere, 'Remove it from the area\'s list.'));
            (pg.commands || []).forEach((cmd, k) => D.cmdProblems(cmd, { map, evData: ev }).forEach(p => D.problem(p.level === 'info' ? 'info' : p.level, 'Command ' + (k + 1) + ': ' + p.msg, pWhere, p.hint)));
          });
        });
      });

      // Every file the project points at must exist in the project's assets folder.
      const refs = [];
      const collect = (o, path) => {
        if (typeof o === 'string') { if (ASSET_RE.test(o)) refs.push({ rel: o, path }); return; }
        if (Array.isArray(o)) o.forEach((x, i) => collect(x, path.concat(i)));
        else if (o && typeof o === 'object') Object.keys(o).forEach(k => collect(o[k], path.concat(k)));
      };
      collect({ system: db.system, monsters: db.monsters, items: db.items, tilesets: db.tilesets, maps: db.maps }, []);
      if (refs.length && window.api.assetMissing) {
        const missing = new Set(await window.api.assetMissing(G.projectPath, [...new Set(refs.map(r => r.rel))]));
        const shown = new Set();
        refs.filter(r => missing.has(r.rel)).forEach(r => {
          const where = D.describePath(r.path), k = r.rel + where;
          if (shown.has(k)) return; shown.add(k);
          D.problem('error', 'Missing file: assets/' + r.rel, where, 'Add the file with Import (or the Asset Library), or choose a different one.');
        });
      }
      const found = D.counts.error + D.counts.warning - n0;
      D.add(found ? 'warning' : 'info', found ? 'Project check found ' + found + ' problem' + (found > 1 ? 's' : '') + ' (see Problems).' : 'Project check: no problems found.', { group: 'start' });
      if (found) D.open(true);
    },
    // A readable location for a path inside the project data, e.g. maps › map001 › events › 3 › pages › 0 › sprite.
    describePath(p) {
      const db = D.db();
      if (p[0] === 'maps') {
        const map = db.maps[p[1]]; if (!map) return p.join(' › ');
        if (p[2] === 'events') { const ev = map.events[p[3]]; return D.whereEv(map, ev, p[4] === 'pages' ? p[5] : null) + (p[6] === 'commands' ? ' › command ' + (p[7] + 1) : ' › ' + p[p.length - 1]); }
        return 'Map ' + D.mapName(map.id) + ' › ' + p.slice(2).join(' › ');
      }
      if (p[0] === 'monsters') { const sp = db.monsters[p[1]]; return 'Database → Monsters › ' + ((sp && sp.name) || p[1]) + ' › ' + p.slice(2).join(' › '); }
      if (p[0] === 'items') { const it = db.items[p[1]]; return 'Database → Items › ' + ((it && it.name) || p[1]) + ' › ' + p.slice(2).join(' › '); }
      if (p[0] === 'tilesets') { const ts = Object.values(db.tilesets)[p[1]] || db.tilesets[p[1]]; return 'Database → Tilesets › ' + ((ts && ts.name) || p[1]); }
      if (p[0] === 'system') return 'Database → System › ' + p.slice(1).join(' › ');
      return p.join(' › ');
    },

    /* ---------- live hooks ---------- */
    hook() {
      const G = D.G;
      // Action button: explain what happened, especially when nothing did.
      const onKey = G.onKey;
      G.onKey = a => { if (a === 'ok' && G.scene === 'map' && !G.busy && G.player && !G.player.moving) D.explainAction(); return onKey(a); };

      const runEvent = G.runEvent;
      G.runEvent = async (ev, face) => {
        if (G.busy) return runEvent(ev, face);
        const pg = G.page(ev), where = D.whereEv(G.map, ev.data, ev.page);
        if (!pg) { D.add('warning', D.evName(ev.data) + ' was triggered but has no active page, so nothing happened: ' + D.whyNoPage(ev) + '.', { where: D.whereEv(G.map, ev.data) }); return runEvent(ev, face); }
        D.add('trace', 'Event ' + D.evName(ev.data) + ' started (page ' + (ev.page + 1) + ', ' + (TRIGGER[pg.trigger] || pg.trigger) + ').', { where });
        if (!(pg.commands || []).length) D.add('info', D.evName(ev.data) + ' page ' + (ev.page + 1) + ' has no commands, so nothing happened.', { where, hint: 'That is normal for an opened chest or a used item. Otherwise add commands to the page.' });
        const prev = D.runCtx; D.runCtx = { ev, where, k: 0 };
        try { return await runEvent(ev, face); } finally { D.runCtx = prev; }
      };

      const exec = G.exec;
      G.exec = async (c, ev, key, mapAtStart) => {
        const ctx = D.runCtx, where = ctx ? ctx.where : '';
        if (ctx && ctx.ev === ev) ctx.k++;
        D.cmdProblems(c, { map: G.map, evData: ev && ev.data, live: true }).filter(p => p.level !== 'info').forEach(p => D.add(p.level, p.msg, { where, hint: p.hint }));
        D.add('trace', D.describeCmd(c), { where });
        const before = c.cmd === 'setSwitch' ? !!G.state.switches[c.switchId] : null;
        await exec(c, ev, key, mapAtStart);
        if (c.cmd === 'setSwitch' && c.switchId) D.add('trace', D.switchName(c.switchId) + ': ' + (before ? 'ON' : 'OFF') + ' → ' + (G.state.switches[c.switchId] ? 'ON' : 'OFF'), { where });
      };

      const enterMap = G.enterMap;
      G.enterMap = async (mapId, x, y, dir) => {
        const m = G.db.maps[mapId];
        if (!m) { if (!D.runCtx) D.add('error', 'Tried to go to map "' + mapId + '", which does not exist.'); return enterMap(mapId, x, y, dir); } // inside an event, the command check has already reported it
        await enterMap(mapId, x, y, dir);
        D.add('trace', 'Entered map ' + D.mapName(mapId) + ' at (' + x + ', ' + y + ').');
        if (!G.tsImg) D.add('error', 'The map\'s tileset picture did not load, so the map is drawn empty.', { where: 'Map ' + D.mapName(mapId), hint: 'Check the tileset\'s image in Database → Tilesets.' });
        if (x < 0 || y < 0 || x >= m.width || y >= m.height) D.add('error', 'The player was placed outside map ' + D.mapName(mapId) + ' at (' + x + ', ' + y + ').', { where: D.runCtx ? D.runCtx.where : 'Map ' + D.mapName(mapId) });
        else if (!D.walkable(m, x, y)) D.add('warning', 'The player arrived on a blocked square (' + x + ', ' + y + ') and may be stuck.', { where: D.runCtx ? D.runCtx.where : 'Map ' + D.mapName(mapId), hint: 'Move the destination onto floor. Hold Ctrl in a playtest to walk through walls.' });
        D.render();
      };

      const battle = G.battle;
      G.battle = async o => {
        D.add('trace', (o.isWild ? 'Wild battle' : 'Battle with ' + (o.trainerName || 'a trainer')) + ' started.', { where: D.runCtx ? D.runCtx.where : '' });
        const r = await battle(o);
        D.add('trace', 'Battle ended: ' + r + '.');
        return r;
      };

      if (window.GameAudio) {
        const load = GameAudio.load;
        GameAudio.load = rel => {
          const p = load.call(GameAudio, rel);
          if (p && rel) p.then(buf => { if (!buf && GameAudio.ctx) D.add('error', 'Sound or music file missing or unreadable: assets/' + rel, { where: D.runCtx ? D.runCtx.where : '', hint: 'Add the file with Import, or choose a different one (MP3 or FLAC).' }); });
          return p;
        };
      }
    },
    imgFailed(rel) { D.add('error', 'Picture failed to load: assets/' + rel, { where: D.runCtx ? D.runCtx.where : (D.G.map ? 'Map ' + D.mapName(D.G.map.id) : ''), hint: 'Add the file with Import, or choose a different one.' }); },
    routeStuck(ch, step) {
      const G = D.G, who = ch === G.player ? 'The player' : ch === G.follower ? 'The following monster' : (ch.data ? D.evName(ch.data) : 'A character');
      D.add('warning', who + ' could not move ' + step + ' from (' + ch.x + ', ' + ch.y + ') during a move route, so that step was skipped.', { where: D.runCtx ? D.runCtx.where : '', hint: 'Something is in the way: a blocked tile, another event or the player. Tick "Through" on the move route to ignore it.' });
    },

    describeCmd(c) {
      const db = D.db(), n = D.cmdName(c);
      switch (c.cmd) {
        case 'text': return n + ': "' + String(c.text || '').slice(0, 50) + (String(c.text || '').length > 50 ? '…' : '') + '"';
        case 'giveItem': return n + ': ' + ((db.item(c.itemId) || {}).name || c.itemId) + ' ×' + (c.amount || 1);
        case 'giveMonster': case 'wildBattle': return n + ': ' + ((db.species(c.speciesId) || {}).name || c.speciesId) + ' Lv ' + (c.level || 5);
        case 'transfer': return n + ': map ' + D.mapName(c.mapId) + ' (' + c.x + ', ' + c.y + ')';
        case 'playMovie': return n + ': ' + (c.file || '(none)');
        case 'selfSwitch': return n + ' → ' + (c.value ? 'ON' : 'OFF');
        case 'trainerBattle': return n + ': ' + (c.name || 'Trainer');
        case 'moveRoute': case 'balloon': return n + ': ' + (c.target || 'this event');
        default: return n;
      }
    },

    // What happened when the action button was pressed.
    explainAction() {
      const G = D.G, p = G.player, [dx, dy] = DIRV[p.dir], fx = p.x + dx, fy = p.y + dy;
      const at = (x, y) => G.evs.filter(e => e.x === x && e.y === y);
      const sq = '(' + fx + ', ' + fy + ')', where = 'Map ' + D.mapName(G.map.id);
      const front = at(fx, fy), here = at(p.x, p.y).filter(e => e !== undefined);
      const fires = e => e.page >= 0 && (G.page(e).trigger === 'action' || G.page(e).trigger === 'sight');
      const f = front.find(fires);
      if (f) {
        if (G.page(f).frontOnly && p.dir !== 'up') { D.add('info', D.evName(f.data) + ' can only be used from the front: stand below it and face up.', { where: D.whereEv(G.map, f.data, f.page) }); return; }
        return; // runs normally; the event log follows
      }
      const high = front.find(e => fires(e) && !MF.Heights.canReach(G.map, p.x, p.y, e.x, e.y));
      if (high) return D.add('info', 'Action button at ' + sq + ': ' + D.evName(high.data) + ' is on a different height level (' + MF.Heights.get(G.map, high.x, high.y) + ', the player is on ' + MF.Heights.get(G.map, p.x, p.y) + '), so it can\'t be reached from here.', { where: D.whereEv(G.map, high.data, high.page), hint: 'Put the event on the same level as where the player stands, or add stairs (Height mode in the editor).' });
      if (here.find(e => e.page >= 0 && G.page(e).trigger === 'action')) return;
      const inactive = front.filter(e => e.page < 0);
      inactive.forEach(e => D.add('warning', 'Action button at ' + sq + ': ' + D.evName(e.data) + ' is there but has no active page, so nothing happened. ' + D.cap(D.whyNoPage(e)) + '.', { where: D.whereEv(G.map, e.data), hint: 'Check the page conditions, and whether a Set switch or Self switch command that should turn it on has run.' }));
      front.filter(e => e.page >= 0).forEach(e => {
        const t = G.page(e).trigger;
        D.add('info', 'Action button at ' + sq + ': ' + D.evName(e.data) + ' is a' + (t === 'auto' || t === 'encounter' ? 'n ' : ' ') + (TRIGGER[t] || t) + ' event, so the action button does not start it.' + (t === 'touch' ? ' Walk onto it instead.' : ''), { where: D.whereEv(G.map, e.data, e.page), hint: t === 'touch' ? 'Set the page\'s trigger to "Action button" if it should start when the player presses the button.' : '' });
      });
      if (front.length) return;
      if (window.Home && Home.decorOn(G) && Home.at(G, fx, fy)) return D.add('trace', 'Action button at ' + sq + ': placed furniture (Turn / Move / Put away).');
      if (G.follower && G.follower.x === fx && G.follower.y === fy) return D.add('trace', 'Action button at ' + sq + ': the following monster.');
      D.add('trace', 'Action button at ' + sq + ': nothing there.', { where });
    },

    /* ---------- overlay (F10) ---------- */
    setOverlay(on) { D.overlay = on; const lb = document.getElementById('dbg-labels'); if (lb && !on) lb.style.display = 'none'; const b = document.getElementById('dbg-ov'); if (b) b.classList.toggle('on', on); },
    drawOverlay(g, cx, cy) {
      const G = D.G, T = G.tileSize, m = G.map;
      if (!m) return;
      g.save();
      g.fillStyle = 'rgba(255,40,40,.28)';
      const x0 = Math.max(0, Math.floor(cx / T)), y0 = Math.max(0, Math.floor(cy / T));
      const x1 = Math.min(m.width, Math.ceil((cx + G.screen.width) / T)), y1 = Math.min(m.height, Math.ceil((cy + G.screen.height) / T));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!G.flagsAt(x, y).pass) g.fillRect(x * T - cx, y * T - cy, T, T);
      if (MF.Heights.hasHeights(m)) { // 2.5D: each raised square's level, and stairs
        g.font = 'bold 7px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top';
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const hh = MF.Heights.get(m, x, y), st = MF.Heights.isStairs(m, x, y);
          if (!hh && !st) continue;
          g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x * T - cx + T - 8, y * T - cy, 8, 8);
          g.fillStyle = st ? '#ffe680' : '#fff'; g.fillText(st ? '≡' : String(hh), x * T - cx + T - 1, y * T - cy + 1);
        }
      }
      const COL = { action: '#3ddc84', touch: '#4aa3ff', sight: '#ffa630', auto: '#c77dff', encounter: '#2ed3c6' };
      g.lineWidth = 1;
      const labels = D.labelBox(), used = [];
      G.evs.forEach((e, i) => {
        const pg = G.page(e), x = Math.round(e.px * T - cx) + 0.5, y = Math.round(e.py * T - cy) + 0.5;
        if (pg && pg.trigger === 'encounter' && pg.encounter && pg.encounter.width) { g.strokeStyle = COL.encounter; g.setLineDash([3, 2]); g.strokeRect(e.x * T - cx + 0.5, e.y * T - cy + 0.5, pg.encounter.width * T - 1, pg.encounter.height * T - 1); g.setLineDash([]); }
        if (pg && pg.area) { g.strokeStyle = COL.touch; g.setLineDash([3, 2]); g.strokeRect(e.x * T - cx + 0.5, e.y * T - cy + 0.5, pg.area.width * T - 1, pg.area.height * T - 1); g.setLineDash([]); }
        g.strokeStyle = pg ? (COL[pg.trigger] || '#fff') : '#9a9a9a';
        if (!pg) g.setLineDash([2, 2]);
        g.strokeRect(x, y, T - 1, T - 1); g.setLineDash([]);
        let lab = labels.children[i];
        if (!lab) { lab = document.createElement('div'); lab.className = 'dbg-lab'; labels.appendChild(lab); }
        const text = e.data.name || '#' + e.data.id;
        if (lab.textContent !== text) lab.textContent = text;
        // Neighbouring events with the same name (a two-square exit) share one label.
        const dup = used.some(u => u.text === text && Math.abs(u.x - e.x) + Math.abs(u.y - e.y) === 1);
        used.push({ text, x: e.x, y: e.y });
        lab.style.display = dup || x < -T || y < -T || x > G.screen.width || y > G.screen.height ? 'none' : '';
        lab.style.left = (x - 0.5) + 'px'; lab.style.top = (y - 7) + 'px';
        lab.classList.toggle('off', !pg);
      });
      for (let i = labels.children.length - 1; i >= G.evs.length; i--) labels.children[i].remove();
      g.restore();
    },
    labelBox() {
      let b = document.getElementById('dbg-labels');
      if (!b) { b = document.createElement('div'); b.id = 'dbg-labels'; document.getElementById('stage').appendChild(b); }
      b.style.display = ''; D._labelsShown = performance.now();
      return b;
    },

    /* ---------- panel ---------- */
    buildUi() {
      const css = document.createElement('style');
      css.textContent = `
#dbg-badge { position: fixed; left: 8px; bottom: 8px; z-index: 1000; font: 12px/1 system-ui, "Segoe UI", sans-serif; background: rgba(20,22,32,.85); color: #e8e8f0; border: 1px solid #454a66; border-radius: 6px; padding: 5px 8px; cursor: pointer; display: flex; gap: 8px; align-items: center; }
#dbg-badge:hover { background: rgba(40,44,64,.95); }
#dbg-badge .e { color: #ff6b6b; } #dbg-badge .w { color: #ffc24a; } #dbg-badge .ok { color: #6fdc8c; }
#dbg-badge.pulse { animation: dbgp .9s 2; } @keyframes dbgp { 50% { box-shadow: 0 0 0 4px rgba(255,194,74,.6); } }
#dbg { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 60vw); z-index: 1001; display: none; flex-direction: column; font: 12px/1.4 system-ui, "Segoe UI", sans-serif; color: #e6e6ee; background: rgba(18,20,30,.94); border-left: 1px solid #3a3f5a; user-select: text; }
#dbg.open { display: flex; }
#dbg header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #2e3248; }
#dbg header b { font-size: 13px; flex: 1; }
#dbg button { font: inherit; color: #e6e6ee; background: #2b2f45; border: 1px solid #454a66; border-radius: 4px; padding: 3px 8px; cursor: pointer; }
#dbg button:hover { background: #383d5a; } #dbg button.on { background: #4a5590; border-color: #6c78c0; }
#dbg .status { padding: 6px 10px; border-bottom: 1px solid #2e3248; color: #aab0cc; font-size: 11px; white-space: pre-wrap; }
#dbg .tabs { display: flex; gap: 4px; padding: 6px 10px; border-bottom: 1px solid #2e3248; }
#dbg .list { flex: 1; overflow-y: auto; padding: 4px 0; }
#dbg .row { display: grid; grid-template-columns: 16px 1fr auto; gap: 6px; padding: 5px 10px; border-bottom: 1px solid rgba(255,255,255,.04); }
#dbg .row .i { text-align: center; } #dbg .row .t { color: #7d84a6; font-size: 10.5px; }
#dbg .row.error .i { color: #ff6b6b; } #dbg .row.warning .i { color: #ffc24a; } #dbg .row.info .i { color: #67b7ff; } #dbg .row.trace { color: #aeb3c8; }
#dbg .row .w { color: #8d93b3; font-size: 11px; } #dbg .row .h { color: #9fd3a8; font-size: 11px; } #dbg .row .n { color: #7d84a6; }
#dbg .empty { color: #7d84a6; padding: 16px 10px; }
#dbg-labels { position: absolute; inset: 0; pointer-events: none; z-index: 35; overflow: hidden; }
.dbg-lab { position: absolute; font: 600 5px/6px system-ui, sans-serif; color: #fff; background: rgba(0,0,0,.7); padding: 0 1.5px; border-radius: 1px; white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
.dbg-lab.off { color: #bbb; font-style: italic; }
#dbg .keys { padding: 6px 10px; border-top: 1px solid #2e3248; color: #7d84a6; font-size: 11px; }`;
      document.head.appendChild(css);
      const badge = document.createElement('div');
      badge.id = 'dbg-badge'; badge.title = 'Debugger (F9)';
      badge.onclick = () => D.toggle();
      document.body.appendChild(badge);
      const p = document.createElement('div');
      p.id = 'dbg';
      p.innerHTML = `<header><b>🐞 Debugger</b><button id="dbg-ov" title="Outline events and shade blocked squares (F10)">Overlay</button><button id="dbg-copy" title="Copy everything in the log, to paste into a note or a bug report">Copy report</button><button id="dbg-clear" title="Clear the live log (project check results stay)">Clear</button><button id="dbg-x" title="Hide (F9)">✕</button></header>
<div class="status" id="dbg-status"></div>
<div class="tabs"><button data-f="problems">Problems</button><button data-f="activity">Activity</button><button data-f="all">Everything</button></div>
<div class="list" id="dbg-list"></div>
<div class="keys">F9 panel · F10 overlay · Ctrl walk through walls · Overlay colours: green action, blue touch, orange trainer sight, purple autorun, teal encounter area, grey dashed no active page, red squares blocked.</div>`;
      document.body.appendChild(p);
      p.querySelector('#dbg-x').onclick = () => D.toggle(false);
      p.querySelector('#dbg-ov').onclick = () => D.setOverlay(!D.overlay);
      p.querySelector('#dbg-clear').onclick = () => { D.entries = D.entries.filter(e => e.group !== 'play'); D.counts = { error: 0, warning: 0 }; D.entries.forEach(e => { if (e.level in D.counts) D.counts[e.level]++; }); D.render(); };
      p.querySelector('#dbg-copy').onclick = () => D.copy();
      p.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => { D.filter = b.dataset.f; D.render(); }; });
      // Keys pressed while the panel has focus still reach the game.
      p.addEventListener('mousedown', e => { if (e.target.tagName !== 'BUTTON') return; setTimeout(() => e.target.blur(), 0); });
      setInterval(() => {
        D.status();
        const lb = document.getElementById('dbg-labels'); // hide map labels during battles and menus that stop the map drawing
        if (lb && performance.now() - (D._labelsShown || 0) > 300) lb.style.display = 'none';
      }, 250);
      D.render();
    },
    // The game shrinks to fit beside the panel while it is open.
    toggle(on) { D.panelOpen = on == null ? !D.panelOpen : on; document.getElementById('dbg').classList.toggle('open', D.panelOpen); window.dispatchEvent(new Event('resize')); D.render(); },
    open(problemsTab) { if (problemsTab) D.filter = 'problems'; D.toggle(true); },
    pulse() { const b = document.getElementById('dbg-badge'); if (!b) return; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); },
    visible() {
      const f = D.filter;
      return D.entries.filter(e => f === 'all' || (f === 'problems' ? (e.level === 'error' || e.level === 'warning' || (e.level === 'info' && e.group === 'check')) : e.group === 'play'));
    },
    render() {
      if (D._raf) return;
      D._raf = requestAnimationFrame(() => {
        D._raf = 0;
        const badge = document.getElementById('dbg-badge');
        if (badge) badge.innerHTML = '🐞 ' + (D.counts.error ? '<span class="e">✖ ' + D.counts.error + '</span>' : '') + (D.counts.warning ? '<span class="w">⚠ ' + D.counts.warning + '</span>' : '') + (!D.counts.error && !D.counts.warning ? '<span class="ok">✓</span>' : '') + ' <span style="color:#7d84a6">F9</span>';
        const panel = document.getElementById('dbg');
        if (!panel || !D.panelOpen) return;
        panel.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.f === D.filter));
        const list = document.getElementById('dbg-list');
        const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 20;
        const rows = D.visible();
        const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        list.innerHTML = rows.length ? rows.map(e => '<div class="row ' + e.level + '"><div class="i">' + ICON[e.level] + '</div><div><div>' + esc(e.msg) + (e.n > 1 ? ' <span class="n">×' + e.n + '</span>' : '') + '</div>' + (e.where ? '<div class="w">' + esc(e.where) + '</div>' : '') + (e.hint ? '<div class="h">→ ' + esc(e.hint) + '</div>' : '') + '</div><div class="t">' + (e.group === 'check' ? 'check' : e.group === 'start' ? 'start' : e.t) + '</div></div>').join('')
          : '<div class="empty">' + (D.filter === 'problems' ? 'No problems found yet. Play the game: anything that should work but doesn\'t is listed here.' : 'Nothing yet.') + '</div>';
        if (stick || D.filter !== 'problems') list.scrollTop = list.scrollHeight;
        D.status();
      });
    },
    status() {
      const s = document.getElementById('dbg-status'), G = D.G;
      if (!s || !D.panelOpen) return;
      if (!G.map || !G.player || G.scene === 'title') { s.textContent = G.scene === 'title' ? 'On the title screen.' : 'Loading…'; return; }
      const p = G.player, [dx, dy] = DIRV[p.dir], fx = p.x + dx, fy = p.y + dy;
      const fe = G.evs.find(e => e.x === fx && e.y === fy);
      const inMap = fx >= 0 && fy >= 0 && fx < G.map.width && fy < G.map.height;
      const front = !inMap ? 'map edge' + ((G.map.edges || {})[p.dir] ? ' (leads to ' + D.mapName(G.map.edges[p.dir].mapId) + ')' : '') : (fe ? 'event ' + D.evName(fe.data) + (fe.page >= 0 ? ' · page ' + (fe.page + 1) + ' · ' + (TRIGGER[G.page(fe).trigger] || G.page(fe).trigger) : ' · no active page') : (G.flagsAt(fx, fy).pass ? 'floor' : 'blocked'));
      const on = (G.state.switches || []).map((v, i) => v ? i : 0).filter(Boolean);
      s.textContent = 'Map ' + D.mapName(G.map.id) + ' · player (' + p.x + ', ' + p.y + ') facing ' + p.dir + (G.busy ? ' · event running' : '') + '\nIn front ' + (inMap ? '(' + fx + ', ' + fy + ')' : '') + ': ' + front + '\nSwitches ON: ' + (on.length ? on.map(i => D.switchName(i)).join(', ') : 'none');
    },
    report() {
      const G = D.G, sys = D.db().system;
      const lines = ['Pocket-Game-Maker playtest report — ' + (sys.title || 'Game') + ' — ' + new Date().toLocaleString(), ''];
      D.entries.forEach(e => lines.push('[' + (e.group === 'check' ? 'check' : e.t) + '] ' + e.level.toUpperCase() + ': ' + e.msg + (e.n > 1 ? ' (×' + e.n + ')' : '') + (e.where ? '\n    at ' + e.where : '') + (e.hint ? '\n    fix: ' + e.hint : '')));
      if (G.map && G.player) lines.push('', 'Now: map ' + D.mapName(G.map.id) + ', player (' + G.player.x + ', ' + G.player.y + ') facing ' + G.player.dir);
      return lines.join('\n');
    },
    async copy() {
      const text = D.report();
      try { await navigator.clipboard.writeText(text); }
      catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      const b = document.getElementById('dbg-copy'); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy report'; }, 1200);
    }
  };
})();
