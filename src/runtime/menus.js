/* Field menus: main menu, party, summary, bag, storage, monster database (DB), save/load, learn move, evolution. */
(function () {
  'use strict';
  const { el, esc, wait, message, closeMessage, choose } = RUI;
  const typeChip = (db, id) => { const t = db.type(id); return t ? '<span class="chip" style="background:' + t.color + '">' + esc(t.name) + '</span>' : ''; };

  const Menus = window.Menus = {
    // The field menu. Which entries appear, their names and order come from Database → Menus.
    async main(G) {
      const cfg = G.cfg.menus, T = G.terms;
      const money = el('div', 'win', '');
      Object.assign(money.style, { left: '6px', top: '6px', zIndex: 50, fontSize: '9px' });
      const refreshMoney = () => { money.innerHTML = '<b>' + esc(G.state.playerName) + '</b>' + (cfg.showMoney ? '<br>' + esc(G.db.system.currency || 'Money') + ': ' + G.state.money : '') + (cfg.main.some(e => e.id === 'dex' && e.on) ? '<br><span class="muted">' + esc(T.dex) + ' ' + Object.keys(G.state.dex.caught).length + ' caught</span>' : ''); };
      refreshMoney();
      document.getElementById('ui').appendChild(money);
      const entries = cfg.main.filter(e => e.on && (e.id !== 'decorate' || Home.decorOn(G)) && (e.id !== 'wardrobe' || Home.wearOn(G)) && (e.id !== 'worldmap' || G.cfg.worldMap.enabled));
      if (!entries.some(e => e.id === 'close')) entries.push({ id: 'close', label: 'Close' });
      let idx = 0;
      for (;;) {
        const items = entries.map(e => ({ label: MF.Config.word(T, e.label), disabled: e.id === 'party' && !G.state.party.length }));
        const w = Math.max(84, 16 + 7 * Math.max(...items.map(i => i.label.length)));
        const c = await choose({ items, right: 6, top: 6, w, index: idx });
        if (c < 0 || entries[c].id === 'close') break;
        idx = c;
        if (await Menus.open(G, entries[c].id) === 'travel') break; // travelled on the world map: back to walking
        refreshMoney();
      }
      money.remove();
    },
    // Open one of the standard screens by id (used by the menu, bag shortcuts and tool items).
    async open(G, id) {
      if (id === 'dex') return Menus.dex(G);
      if (id === 'party') { if (!G.state.party.length) return message('You don\'t have any monsters yet.'); return Menus.party(G); }
      if (id === 'bag') return Menus.bag(G);
      if (id === 'storage') return Menus.storage(G);
      if (id === 'save') return Menus.saveScreen(G);
      if (id === 'decorate') return Home.menu(G);
      if (id === 'wardrobe') return Home.wardrobe(G);
      if (id === 'worldmap') { if (!G.cfg.worldMap.enabled || !G.cfg.worldMap.image) return message('There is no map of this world.'); return WorldMap.open(G); }
      if (id === 'options') return Menus.options(G);
    },

    /* ---------- options (the player's own settings, kept on this computer or phone) ---------- */
    async options(G) {
      const P = G.prefs, A = window.GameAudio;
      const SPEEDS = [['slow', 'Slow', 1], ['normal', 'Normal', 2], ['fast', 'Fast', 4], ['instant', 'Instant', 999]];
      let idx = 0;
      for (;;) {
        const sp = SPEEDS.find(x => x[0] === P.textSpeed) || SPEEDS[1];
        const bar = v => '■'.repeat(Math.round(v / 10)) + '□'.repeat(10 - Math.round(v / 10));
        const items = [{ label: 'Music', right: bar(P.bgmVolume) }, { label: 'Sounds', right: bar(P.sfxVolume) }, { label: 'Text speed', right: '◂ ' + sp[1] + ' ▸' }, { label: 'Done' }];
        const c = await choose({ title: 'Options', items, left: 20, top: 20, w: G.screen.width - 40, index: idx,
          onKey: (a, i) => {
            if (a !== 'left' && a !== 'right') return false;
            const d = a === 'right' ? 1 : -1;
            if (i === 0) P.bgmVolume = Math.max(0, Math.min(100, P.bgmVolume + d * 10));
            if (i === 1) { P.sfxVolume = Math.max(0, Math.min(100, P.sfxVolume + d * 10)); GameAudio.se('cursor'); }
            if (i === 2) { const k = SPEEDS.indexOf(sp); P.textSpeed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, k + d))][0]; }
            G.applyPrefs(); idx = i; return 'redraw';
          } });
        if (c === 'redraw') continue;
        if (c < 0 || c === 3) break;
        idx = c;
      }
      G.savePrefs();
      void A;
    },
    // A scrolling page of text (credits, licence). Supports simple Markdown: # headings, - lists, **bold**.
    textScreen(G, title, text) {
      return new Promise(resolve => {
        const panel = el('div', 'win panel-full text-screen');
        const body = el('div', 'text-body');
        const md = line => esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        body.innerHTML = '<div class="ts-title">' + esc(title) + '</div>' + String(text || '').split(/\r?\n/).map(l => {
          if (/^#{1,6}\s/.test(l)) return '<div class="ts-h">' + md(l.replace(/^#+\s*/, '')) + '</div>';
          if (/^\s*[-*]\s/.test(l)) return '<div class="ts-li">• ' + md(l.replace(/^\s*[-*]\s/, '')) + '</div>';
          if (/^\s*\|/.test(l)) { if (/^\s*\|[\s|:-]+\|\s*$/.test(l)) return ''; return '<div class="ts-row">' + l.split('|').slice(1, -1).map(c => '<span>' + md(c.trim()) + '</span>').join('') + '</div>'; }
          return l.trim() ? '<div>' + md(l) + '</div>' : '<div class="ts-gap"></div>';
        }).join('');
        panel.append(body, el('div', 'muted ts-help', '↑ ↓ scroll · X back'));
        document.getElementById('ui').appendChild(panel);
        const done = () => { pop(); panel.remove(); resolve(); };
        const pop = Input.push(a => {
          if (a === 'down') body.scrollTop += 24; else if (a === 'up') body.scrollTop -= 24;
          else if (a === 'right') body.scrollTop += body.clientHeight; else if (a === 'left') body.scrollTop -= body.clientHeight;
          else if (a === 'cancel' || a === 'ok') { GameAudio.se('cancel'); done(); }
        });
      });
    },

    /* ---------- party ---------- */
    // mode 'menu' (summary / reorder) or 'pick' (returns index or -1). filter(i) -> bool for pick mode.
    party(G, opts) {
      opts = opts || { mode: 'menu' };
      const db = G.db, party = G.state.party;
      return new Promise(resolve => {
        const panel = el('div', 'win panel-full');
        const head = el('div', 'title', esc(opts.title || 'Monsters'));
        head.style.cssText = 'font-weight:700;margin-bottom:4px';
        const grid = el('div', 'party-list');
        const help = el('div', 'muted', opts.help || 'Z: select · X: back');
        help.style.cssText = 'position:absolute;bottom:4px;left:8px;font-size:8px';
        panel.append(head, grid, help);
        document.getElementById('ui').appendChild(panel);
        let idx = 0, swapFrom = -1, sub = false;
        const draw = () => {
          grid.innerHTML = '';
          party.forEach((m, i) => {
            const sp = db.species(m.speciesId);
            const pct = 100 * m.hp / m.stats.hp;
            const cell = el('div', 'pslot' + (i === idx ? ' sel' : '') + (m.hp <= 0 ? ' fnt' : '') + (i === swapFrom ? ' swap' : ''));
            const ok = !opts.filter || opts.filter(i);
            if (!ok) cell.style.opacity = .5;
            cell.innerHTML = '<img src="' + esc(G.asset(sp.front) || '') + '"><div><div class="nm"><span>' + esc(MF.monName(db, m)) + '</span><span>Lv' + m.level + '</span></div>' +
              '<div class="hpbar"><i class="' + (pct < 20 ? 'low' : pct < 50 ? 'mid' : '') + '" style="width:' + pct + '%"></i></div>' +
              '<div class="sub"><span>' + (m.status ? MF.STATUS_SHORT[m.status] : (m.hp <= 0 ? 'FNT' : '')) + '</span><span>' + m.hp + '/' + m.stats.hp + '</span></div></div>';
            cell.onclick = () => { idx = i; draw(); act(); };
            grid.appendChild(cell);
          });
        };
        const close = v => { pop(); panel.remove(); resolve(v); };
        const act = async () => {
          if (sub) return;
          if (opts.mode === 'pick') {
            if (opts.filter && !opts.filter(idx)) { RUI.toast(opts.reject || 'Can\'t choose that one.'); return; }
            return close(idx);
          }
          if (swapFrom >= 0) {
            [party[swapFrom], party[idx]] = [party[idx], party[swapFrom]];
            swapFrom = -1; draw(); return;
          }
          sub = true;
          const c = await choose({ items: [{ label: 'Summary' }, { label: 'Switch' }, { label: 'Cancel' }], right: 10, bottom: 10, w: 70 });
          sub = false;
          if (c === 0) { await Menus.summary(G, party, idx); draw(); }
          if (c === 1) { swapFrom = idx; draw(); }
        };
        const pop = Input.push(a => {
          if (sub) return;
          const n = party.length; if (!n) return close(-1);
          if (a === 'left') idx = (idx - 1 + n) % n;
          if (a === 'right') idx = (idx + 1) % n;
          if (a === 'up') idx = (idx - 2 + n) % n;
          if (a === 'down') idx = (idx + 2) % n;
          if (a === 'ok') return act();
          if (a === 'cancel') { if (swapFrom >= 0) { swapFrom = -1; draw(); return; } return close(-1); }
          draw();
        });
        draw();
      });
    },

    summary(G, list, start) {
      const db = G.db;
      return new Promise(resolve => {
        let i = start;
        const panel = el('div', 'win panel-full');
        document.getElementById('ui').appendChild(panel);
        const draw = () => {
          const m = list[i], sp = db.species(m.speciesId);
          const a = MF.expForLevel(sp.growth, m.level), z = MF.expForLevel(sp.growth, m.level + 1);
          const stats = MF.STATS.map(s => '<tr><td>' + MF.STAT_NAMES[s] + '</td><td style="text-align:right"><b>' + (s === 'hp' ? m.hp + '/' : '') + m.stats[s] + '</b></td></tr>').join('');
          const moves = m.moves.map(mv => { const d = db.move(mv.id); return d ? '<tr><td>' + typeChip(db, d.type) + esc(d.name) + '</td><td class="muted">' + (d.category === 'status' ? '—' : d.power) + '</td><td style="text-align:right">' + esc(G.terms.pp) + ' ' + mv.pp + '/' + d.pp + '</td></tr>' : ''; }).join('');
          panel.innerHTML = '<div class="sum"><div><img class="big" src="' + esc(G.asset(sp.front) || '') + '"><div style="margin-top:4px"><b>' + esc(MF.monName(db, m)) + '</b></div><div class="muted">' + esc(sp.name) + ' · Lv ' + m.level + '</div><div>' + (sp.types || []).map(t => typeChip(db, t)).join('') + '</div>' +
            '<div class="muted" style="font-size:8px;margin-top:3px">' + (m.level >= db.battleSettings().maxLevel ? 'Max level' : (z - m.exp) + ' exp to next') + '</div><div class="expbar"><i style="width:' + Math.max(0, Math.min(100, 100 * (m.exp - a) / Math.max(1, z - a))) + '%"></i></div>' +
            (m.status ? '<div style="margin-top:3px">Status: ' + MF.STATUS_NAMES[m.status] + '</div>' : '') + '</div>' +
            '<div><table>' + stats + '</table><div style="height:6px"></div><table>' + (moves || '<tr><td class="muted">No moves</td></tr>') + '</table></div></div>' +
            '<div class="muted" style="position:absolute;bottom:4px;left:8px;font-size:8px">← → other monsters · X back</div>';
        };
        const pop = Input.push(a => {
          if (a === 'left') i = (i - 1 + list.length) % list.length;
          if (a === 'right') i = (i + 1) % list.length;
          if (a === 'cancel' || a === 'ok') { pop(); panel.remove(); resolve(); return; }
          draw();
        });
        panel.onclick = () => { pop(); panel.remove(); resolve(); };
        draw();
      });
    },

    /* ---------- bag ---------- */
    // The bag. With pockets on (Database → Menus & screens → Bag pockets) it has a tab per pocket: ← → change pocket.
    async bag(G) {
      const db = G.db, bag = G.state.bag, T = G.terms, PK = G.cfg.pockets;
      const shortcuts = G.cfg.menus.bag.filter(e => e.on && (e.id !== 'worldmap' || G.cfg.worldMap.enabled));
      const pockets = PK.enabled && PK.list.length ? PK.list : null;
      let idx = 0, pi = Math.min(G.bagPocket || 0, pockets ? pockets.length - 1 : 0);
      for (;;) {
        const all = Object.keys(bag).filter(id => bag[id] > 0 && db.item(id));
        const pocket = pockets ? pockets[pi] : null;
        const ids = pocket ? all.filter(id => MF.Config.pocketOf(PK, db.item(id)) === pocket.id) : all;
        if (!all.length && !shortcuts.length) { await message('Your bag is empty.'); return; }
        const help = el('div', 'win help', '');
        document.getElementById('ui').appendChild(help);
        let tabs = null;
        if (pockets) {
          tabs = el('div', 'win bag-tabs', pockets.map((p, i) => '<span class="' + (i === pi ? 'on' : '') + '">' + (p.icon ? esc(p.icon) + ' ' : '') + (i === pi ? esc(p.name) : '') + '</span>').join(''));
          document.getElementById('ui').appendChild(tabs);
        }
        // Shortcuts chosen in Database → Menus appear at the top of the bag.
        const rows = shortcuts.map(e => ({ label: '▸ ' + MF.Config.word(T, e.label), shortcut: e.id })).concat(ids.map(id => ({ label: db.item(id).name, right: '×' + bag[id], id })));
        if (!ids.length) rows.push({ label: pocket ? '(nothing in ' + pocket.name + ')' : '(no items)', disabled: true });
        const turn = d => { pi = (pi + d + pockets.length) % pockets.length; G.bagPocket = pi; idx = shortcuts.length; return 'pocket'; };
        const c = await choose({ title: pockets ? pocket.name : 'Bag', items: rows, right: 6, top: pockets ? 24 : 6, w: 170, maxH: G.screen.height - (pockets ? 70 : 52), index: Math.min(idx, rows.length - 1),
          onMove: i => { const r = rows[i]; help.textContent = r.shortcut ? 'Open ' + r.label.slice(2) : r.id ? (db.item(r.id).description || '') : (pockets ? '← → change pocket' : ''); },
          onKey: pockets ? a => (a === 'left' ? turn(-1) : a === 'right' ? turn(1) : false) : null });
        help.remove(); if (tabs) tabs.remove();
        if (c === 'pocket') { GameAudio.se('cursor'); continue; }
        if (c < 0) return;
        idx = c;
        if (rows[c].shortcut) { if (await Menus.open(G, rows[c].shortcut) === 'travel') return 'travel'; continue; }
        const it = db.item(rows[c].id);
        if (it.kind === 'tool') { if (await Menus.open(G, it.toolAction || 'storage') === 'travel') return 'travel'; continue; }
        if (it.kind === 'decoration') { if (Home.decorOn(G)) await Home.place(G, it.id); else await message('You can put that up in your home.'); continue; }
        if (it.kind === 'clothing') { if (Home.wearOn(G)) await Home.wardrobe(G, it.id); else await message('There\'s no use for that right now.'); continue; }
        if (!it.fieldUsable) { await message('There\'s no use for that right now.'); continue; }
        if (!G.state.party.length) { await message('You don\'t have any monsters.'); continue; }
        const pk = await Menus.party(G, { mode: 'pick', title: 'Use ' + it.name + ' on…' });
        if (pk < 0) continue;
        const mon = G.state.party[pk];
        if (it.kind === 'evolution') {
          const into = MF.itemCausesEvolution(db, mon, it.id);
          if (!into) { await message('It won\'t have any effect.'); continue; }
          bag[it.id]--;
          await Menus.evolve(G, mon, into);
          continue;
        }
        const r = MF.applyItemToMonster(db, it, mon);
        if (!r.used) { await message('It won\'t have any effect.'); continue; }
        if (it.kind === 'heal' || it.kind === 'revive' || it.kind === 'pp') GameAudio.se('heal');
        bag[it.id]--;
        await message(MF.monName(db, mon) + ' ' + r.text.replace('PP', T.pp));
      }
    },

    /* ---------- storage ---------- */
    async storage(G) {
      const db = G.db, st = G.state;
      const maxParty = db.battleSettings().maxParty;
      for (;;) {
        const c = await choose({ title: 'Storage (' + st.storage.length + ' stored)', items: [{ label: 'Withdraw', disabled: !st.storage.length }, { label: 'Deposit', disabled: st.party.length <= 1 }, { label: 'Close' }], right: 6, top: 6, w: 110 });
        if (c < 0 || c === 2) return;
        if (c === 0) {
          if (st.party.length >= maxParty) { await message('Your party is full! Deposit a monster first.'); continue; }
          const w = await choose({ title: 'Withdraw', items: st.storage.map(m => ({ label: MF.monName(db, m), right: 'Lv' + m.level })), left: 6, top: 6, w: 170, maxH: G.screen.height - 12 });
          if (w < 0) continue;
          const m = st.storage.splice(w, 1)[0]; st.party.push(m);
          await message(MF.monName(db, m) + ' joined your party.');
        } else {
          const d = await Menus.party(G, { mode: 'pick', title: 'Deposit which monster?', filter: i => st.party.filter((p, k) => k !== i && p.hp > 0).length > 0, reject: 'You need at least one healthy monster in your party.' });
          if (d < 0) continue;
          const m = st.party.splice(d, 1)[0]; MF.healMonster(db, m); st.storage.push(m);
          await message(MF.monName(db, m) + ' was sent to storage. It will rest and recover there.');
        }
      }
    },

    /* ---------- dex ---------- */
    dex(G) {
      const db = G.db, all = db.raw.monsters || [];
      return new Promise(resolve => {
        const panel = el('div', 'win panel-full');
        const seen = Object.keys(G.state.dex.seen).length, caught = Object.keys(G.state.dex.caught).length;
        panel.innerHTML = '<div style="font-weight:700;margin-bottom:4px">' + esc(G.terms.dexLong) + ' <span class="muted">· Seen ' + seen + ' · Caught ' + caught + ' / ' + all.length + '</span></div>';
        const list = el('div', 'dex-list');
        all.forEach((m, i) => {
          const c = G.state.dex.caught[m.id], s = G.state.dex.seen[m.id];
          list.appendChild(el('div', '', '<span class="muted">' + String(i + 1).padStart(3, '0') + '</span> ' + (c ? '● ' : '○ ') + (s || c ? esc(m.name) : '-----')));
        });
        panel.appendChild(list);
        panel.appendChild(el('div', 'muted', 'X: back'));
        panel.lastChild.style.cssText = 'position:absolute;bottom:4px;left:8px;font-size:8px';
        document.getElementById('ui').appendChild(panel);
        const done = () => { pop(); panel.remove(); resolve(); };
        const pop = Input.push(a => { if (a === 'cancel' || a === 'ok') done(); });
        panel.onclick = done;
      });
    },

    /* ---------- save / load ---------- */
    // Choose a save slot. Returns the slot number (1…, or 0 for the Autosave slot when loading) or -1.
    async slotPicker(G, title, forLoad) {
      const saves = (await window.api.listSaves(G.projectPath, G.cfg.saving.slots)).filter(s => forLoad || !s.auto);
      const name = s => s.auto ? 'Autosave' : 'Slot ' + s.slot;
      const items = saves.map(s => s.meta ? { label: name(s) + ': ' + (s.meta.mapName || ''), right: (s.meta.party || 0) + ' mon · ' + (s.meta.time || '') } : { label: name(s) + ': (empty)', disabled: forLoad });
      const c = await choose({ title, items, left: 20, top: 20, w: G.screen.width - 40, maxH: G.screen.height - 40 });
      return c < 0 ? -1 : saves[c].slot;
    },
    async saveScreen(G) {
      const slot = await Menus.slotPicker(G, 'Save to which slot?', false);
      if (slot < 0) return false;
      if (G.cfg.saving.confirmOverwrite) {
        const cur = (await window.api.listSaves(G.projectPath, G.cfg.saving.slots)).find(s => s.slot === slot);
        if (cur && cur.meta && !(await RUI.confirm('Save over the game in slot ' + slot + '?'))) return false;
      }
      await window.api.saveGame(G.projectPath, slot, G.makeSave()); GameAudio.se('save');
      await message('Your progress was saved.');
      return true;
    },
    // The latest save of all (by the time it was written), or null.
    async latestSave(G) {
      const saves = (await window.api.listSaves(G.projectPath, G.cfg.saving.slots)).filter(s => s.meta);
      if (!saves.length) return null;
      return saves.sort((a, b) => (b.meta.savedAt || 0) - (a.meta.savedAt || 0))[0].slot;
    },

    /* ---------- learning & evolution ---------- */
    async learnMove(G, mon, moveId) {
      const db = G.db, name = MF.monName(db, mon), mv = db.move(moveId);
      if (mon.moves.some(m => m.id === moveId)) return;
      if (mon.moves.length < db.battleSettings().maxMoves) {
        mon.moves.push(MF.newMoveSlot(db, moveId));
        await message(name + ' learned ' + mv.name + '!'); return;
      }
      for (;;) {
        const yes = await RUI.confirm(name + ' wants to learn ' + mv.name + ', but already knows ' + mon.moves.length + ' moves. Forget a move to make room?');
        if (!yes) {
          if (await RUI.confirm('Stop trying to teach ' + mv.name + '?')) { await message(name + ' did not learn ' + mv.name + '.'); return; }
          continue;
        }
        RUI.say('Which move should be forgotten?');
        const items = mon.moves.map(m => ({ label: (db.move(m.id) || { name: '???' }).name, right: m.pp + '/' + (db.move(m.id) || { pp: 0 }).pp })).concat([{ label: mv.name + ' (new)', right: mv.pp + '/' + mv.pp }]);
        const c = await choose({ items, right: 6, top: 6, w: 150 });
        closeMessage();
        if (c < 0 || c === mon.moves.length) continue;
        const old = db.move(mon.moves[c].id);
        mon.moves[c] = MF.newMoveSlot(db, moveId);
        await message('1, 2 and… Poof! ' + name + ' forgot ' + (old ? old.name : 'a move') + ' and learned ' + mv.name + '!');
        return;
      }
    },
    async evolve(G, mon, into) {
      const db = G.db;
      const from = db.species(mon.speciesId), to = db.species(into);
      const oldName = MF.monName(db, mon);
      const ov = el('div', 'battle');
      ov.style.background = 'radial-gradient(circle, #fff 0%, #cfe8ff 50%, #3b4a7a 100%)';
      const img = el('img'); img.src = G.asset(from.front) || '';
      Object.assign(img.style, { position: 'absolute', left: '50%', top: '40%', width: '96px', height: '96px', transform: 'translate(-50%,-50%)', objectFit: 'contain', transition: 'filter .15s' });
      ov.appendChild(img);
      document.getElementById('ui').appendChild(ov);
      await message('What? ' + oldName + ' is evolving!', { keep: true });
      for (let k = 0; k < 10; k++) {
        img.style.filter = 'brightness(10)'; await wait(120 - k * 6);
        img.src = G.asset(k % 2 ? from.front : to.front) || ''; img.style.filter = 'brightness(10)'; await wait(120 - k * 6);
      }
      img.src = G.asset(to.front) || ''; img.style.filter = 'none';
      const nick = mon.nickname;
      MF.evolve(db, mon, into);
      G.caught(into);
      await message('Congratulations! ' + oldName + ' evolved into ' + to.name + '!', { keep: true });
      void nick;
      closeMessage();
      for (const l of (to.learnset || []).filter(l => l.level === mon.level)) await Menus.learnMove(G, mon, l.moveId);
      ov.remove();
    }
  };
})();
