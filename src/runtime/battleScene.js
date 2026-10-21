/* Battle scene: drives MF.Battle and animates its events. Layout adapts to any active count. */
(function () {
  'use strict';
  const { el, esc, wait, message, closeMessage, choose } = RUI;

  const BS = window.BattleScene = {
    async run(G, o) {
      const db = G.db, S = G.screen;
      const settings = db.battleSettings();
      const enemyActive = Math.max(1, o.active || (o.isWild ? o.enemyParty.length : settings.trainerActive));
      const playerActive = Math.max(1, o.active || (o.isWild ? Math.max(1, o.enemyParty.length) : settings.trainerActive));
      const b = new MF.Battle(db, {
        playerParty: G.state.party, enemyParty: o.enemyParty, playerActive, enemyActive,
        isWild: o.isWild, trainerName: o.trainerName, bag: G.state.bag,
        canRun: o.canRun, canCapture: o.canCapture
      });
      this.b = b; this.G = G;

      // ---------- build scene ----------
      await RUI.fade(true, 200);
      const root = el('div', 'battle');
      const bgSrc = G.asset(o.battleback || (G.map && G.map.battleback) || db.system.defaultBattleback);
      if (bgSrc) { const bg = el('img', 'bg'); bg.src = bgSrc; root.appendChild(bg); }
      document.getElementById('ui').appendChild(root);
      this.root = root;
      const W = S.width, H = S.height, k = H / 240;
      const msgTop = H - 52;
      this.view = [[], []];
      const layout = (side, n) => {
        const out = [];
        for (let i = 0; i < n; i++) {
          if (side === 1) {
            const size = (n === 1 ? 84 : n === 2 ? 66 : 54) * k;
            const cx = W * 0.70 + (i - (n - 1) / 2) * Math.min(W * 0.22, size * 0.95);
            const base = H * 0.40;
            out.push({ x: cx - size / 2, y: base - size, w: size, h: size, cx, base });
          } else {
            const size = (n === 1 ? 104 : n === 2 ? 84 : 68) * k;
            const cx = W * 0.27 + (i - (n - 1) / 2) * Math.min(W * 0.26, size * 0.9);
            const base = msgTop + 6 * k;
            out.push({ x: cx - size / 2, y: base - size, w: size, h: size, cx, base });
          }
        }
        return out;
      };
      [1, 0].forEach(side => {
        const n = b.sides[side].active.length;
        const pos = layout(side, n);
        // platform
        const pw = side === 1 ? Math.max(110 * k, n * 70 * k) : Math.max(130 * k, n * 86 * k);
        const pcx = side === 1 ? W * 0.70 : W * 0.27, pcy = side === 1 ? H * 0.40 : msgTop + 4 * k;
        const plat = el('div', 'platform');
        Object.assign(plat.style, { left: (pcx - pw / 2) + 'px', top: (pcy - 9 * k) + 'px', width: pw + 'px', height: (18 * k) + 'px' });
        root.appendChild(plat);
        pos.forEach((p, slot) => {
          const m = el('div', 'bmon hidden');
          Object.assign(m.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' });
          const img = el('img'); m.appendChild(img); root.appendChild(m);
          const hud = el('div', 'hud hidden');
          if (side === 1) Object.assign(hud.style, { left: '6px', top: (6 + slot * 30) + 'px' });
          else Object.assign(hud.style, { right: '6px', bottom: (58 + slot * 48) + 'px' });
          hud.innerHTML = '<div class="top"><span class="nm"></span><span class="lv"></span></div><div class="hpbar"><i></i></div>' + (side === 0 ? '<div class="hpnum"></div><div class="expbar"><i></i></div>' : '');
          root.appendChild(hud);
          this.view[side][slot] = { m, img, hud, pos: p, hp: 0, max: 1 };
        });
      });
      await RUI.fade(false, 250);

      // ---------- main loop ----------
      await this.play(b.start());
      while (b.state !== 'ended') {
        if (b.state === 'input') {
          const actions = await this.chooseActions();
          await this.play(b.submit(actions));
        } else if (b.state === 'replace') {
          const map = {};
          for (const slot of b.replaceSlots()) {
            const used = Object.values(map);
            const bench = b.benchIndices(0);
            const pi = await this.pickPartyMember('Choose a monster to send out.', i => bench.includes(i) && !used.includes(i), false);
            map[slot] = pi;
          }
          await this.play(b.submitReplacements(map));
        }
      }

      // ---------- wrap up ----------
      const result = b.result;
      if (result === 'win') GameAudio.playBgm(G.audioCfg.victory, { restart: true, fade: 0.2 });
      if (!o.isWild && result === 'win') {
        if (o.winText) await message(o.winText, { speaker: o.trainerName, keep: true });
        if (o.reward) { G.state.money += o.reward; await message('You got ' + o.reward + ' ' + (db.system.currency || 'money') + ' for winning!', { keep: true }); }
      }
      if (result === 'lose' && !o.isWild && o.loseText) await message(o.loseText, { speaker: o.trainerName, keep: true });
      closeMessage();
      await RUI.fade(true, 300);
      root.remove();
      this.root = null;
      // battle-only effects end; fainted status stays as HP 0
      G.state.party.forEach(m => { delete m._faintAnnounced; });
      return { result, caught: b.caught, post: b.post };
    },

    /* ---------- event playback ---------- */
    async play(events) {
      for (const e of events) {
        const v = e.side !== undefined && e.slot !== undefined ? this.view[e.side][e.slot] : null;
        switch (e.type) {
          case 'msg': await message(e.text.replace(/\bPP\b/g, this.G.terms.pp), { keep: true, auto: 700 }); break;
          case 'sendOut': {
            const mon = this.b.sides[e.side].party[e.partyIndex];
            const sp = this.G.db.species(mon.speciesId);
            v.img.src = this.G.asset(e.side === 1 ? sp.front : sp.back) || '';
            v.hp = mon.hp; v.max = mon.stats.hp; v.mon = mon;
            v.m.className = 'bmon';
            v.hud.classList.remove('hidden');
            this.refreshHud(e.side, e.slot);
            if (e.side === 1) this.G.seen(mon.speciesId);
            await wait(260);
            break;
          }
          case 'withdraw': v.m.className = 'bmon hidden'; v.hud.classList.add('hidden'); await wait(200); break;
          case 'anim': v.m.classList.add(e.side === 0 ? 'lunge-r' : 'lunge-l'); await wait(260); v.m.classList.remove('lunge-r', 'lunge-l'); break;
          case 'hit': GameAudio.se(e.eff > 1 || e.crit ? 'hitStrong' : 'hit'); v.m.classList.add('flash'); await wait(420); v.m.classList.remove('flash'); break;
          case 'sfx': GameAudio.se(e.name); break;
          case 'hp': v.hp = e.hp; v.max = e.max; this.refreshHud(e.side, e.slot); await wait(430); break;
          case 'status': case 'levelUp': if (e.type === 'levelUp') GameAudio.se('levelUp'); this.refreshHud(e.side, e.slot); if (e.type === 'levelUp' && v) v.max = v.mon.stats.hp; break;
          case 'faint': GameAudio.se('faint'); v.m.className = 'bmon faint'; v.hud.classList.add('hidden'); await wait(450); break;
          case 'capture': await this.captureFx(v, e); break;
          default: break;
        }
        // keep player HUDs (level/exp) current as exp is awarded
        if (e.type === 'msg') this.view[0].forEach((vv, slot) => { if (vv && vv.mon && this.b.battler(0, slot) && this.b.mon(0, slot) === vv.mon) this.refreshHud(0, slot, true); });
      }
    },
    refreshHud(side, slot, soft) {
      const v = this.view[side][slot]; if (!v || !v.mon) return;
      const mon = v.mon, db = this.G.db;
      v.hud.querySelector('.nm').innerHTML = esc(MF.monName(db, mon)) + (mon.status ? '<span class="st ' + mon.status + '">' + MF.STATUS_SHORT[mon.status] + '</span>' : '');
      v.hud.querySelector('.lv').textContent = 'Lv' + mon.level;
      if (!soft) {
        const pct = Math.max(0, Math.min(100, 100 * v.hp / v.max));
        const bar = v.hud.querySelector('.hpbar i');
        bar.style.width = pct + '%';
        bar.className = pct < 20 ? 'low' : pct < 50 ? 'mid' : '';
        const num = v.hud.querySelector('.hpnum'); if (num) num.textContent = Math.max(0, v.hp) + ' / ' + v.max;
      }
      const exp = v.hud.querySelector('.expbar i');
      if (exp) {
        const sp = db.species(mon.speciesId);
        const a = MF.expForLevel(sp.growth, mon.level), z = MF.expForLevel(sp.growth, mon.level + 1);
        exp.style.width = Math.max(0, Math.min(100, 100 * (mon.exp - a) / Math.max(1, z - a))) + '%';
      }
    },
    async captureFx(v, e) {
      const ball = el('div', 'ball-fx');
      const startX = this.G.screen.width * 0.2, startY = this.G.screen.height * 0.75;
      Object.assign(ball.style, { left: startX + 'px', top: startY + 'px' });
      this.root.appendChild(ball);
      GameAudio.se('throw');
      await wait(30);
      const tx = v.pos.cx - 5, ty = v.pos.base - v.pos.h * 0.55;
      Object.assign(ball.style, { left: tx + 'px', top: ty + 'px' });
      await wait(480);
      v.m.className = 'bmon inball';
      await wait(300);
      ball.style.top = (v.pos.base - 12) + 'px';
      await wait(450);
      for (let i = 0; i < e.shakes; i++) { GameAudio.se('shake'); ball.classList.add('shake'); await wait(480); ball.classList.remove('shake'); await wait(260); }
      if (!e.caught) { GameAudio.se('breakFree'); ball.remove(); v.m.className = 'bmon'; await wait(250); }
      else { GameAudio.se('catch'); ball.style.filter = 'brightness(.7)'; await wait(300); }
    },

    /* ---------- command input ---------- */
    async chooseActions() {
      const b = this.b, actions = [];
      const slots = b.inputSlots();
      let i = 0;
      while (i < slots.length) {
        const a = await this.chooseFor(slots[i], i, actions);
        if (a === 'back') { if (i > 0) { i--; actions.pop(); } continue; }
        actions.push(a); i++;
        if (a.kind === 'run') break;
      }
      closeMessage();
      return actions;
    },
    async chooseFor(slot, ord, pending) {
      const b = this.b, db = this.G.db;
      const mon = b.mon(0, slot);
      for (;;) {
        RUI.say('What will ' + MF.monName(db, mon) + ' do?');
        const items = [{ label: 'Fight' }, { label: 'Bag' }, { label: 'Monsters' }, ord === 0 ? { label: 'Run', disabled: !b.canRun } : { label: 'Back' }];
        const c = await choose({ items, cols: 2, right: 6, bottom: 6, w: 112, cancel: true, onDisabled: () => RUI.toast('You can\'t run from this battle!') });
        if (c === -1) { if (ord > 0) return 'back'; continue; }
        if (c === 3) return ord === 0 ? { slot, kind: 'run' } : 'back';
        if (c === 0) { const a = await this.chooseMove(slot); if (a) return a; }
        if (c === 1) { const a = await this.chooseItem(slot, pending); if (a) return a; }
        if (c === 2) {
          const taken = pending.filter(p => p.kind === 'switch').map(p => p.partyIndex);
          const pi = await this.pickPartyMember('Switch to which monster?', i => {
            const m = b.sides[0].party[i];
            return m.hp > 0 && !b.sides[0].active.some(x => x && x.partyIndex === i) && !taken.includes(i);
          }, true);
          if (pi >= 0) return { slot, kind: 'switch', partyIndex: pi };
        }
      }
    },
    async chooseMove(slot) {
      const b = this.b, db = this.G.db;
      const mon = b.mon(0, slot);
      if (!mon.moves.some(m => m.pp > 0 && db.move(m.id))) return { slot, kind: 'move', moveIndex: -1, target: { side: 1, slot: b.aliveSlots(1)[0] } };
      const info = el('div', 'win', '');
      Object.assign(info.style, { right: '6px', bottom: '6px', width: '96px', height: '44px', zIndex: 55, fontSize: '9px' });
      document.getElementById('ui').appendChild(info);
      const showInfo = i => {
        const mv = db.move(mon.moves[i].id);
        if (!mv) { info.textContent = ''; return; }
        const t = db.type(mv.type);
        info.innerHTML = '<div>' + esc(this.G.terms.pp) + ' ' + mon.moves[i].pp + '/' + mv.pp + '</div><div><span class="chip" style="background:' + (t ? t.color : '#ccc') + '">' + esc(t ? t.name : '—') + '</span></div><div class="muted">' + (mv.category === 'status' ? 'Status' : (mv.category === 'physical' ? 'Phys ' : 'Spec ') + mv.power) + '</div>';
      };
      const items = mon.moves.map(m => { const mv = db.move(m.id); return { label: mv ? mv.name : '???', disabled: !mv || m.pp <= 0 }; });
      const idx = await choose({ items, cols: 2, left: 6, bottom: 6, w: this.G.screen.width - 116, cancel: true, onMove: showInfo, onDisabled: () => RUI.toast('No ' + this.G.terms.pp + ' left for this move!') });
      info.remove();
      if (idx < 0) return null;
      const mv = db.move(mon.moves[idx].id);
      let target = null;
      if (mv.target === 'enemy') {
        const alive = b.aliveSlots(1);
        if (alive.length === 1) target = { side: 1, slot: alive[0] };
        else { const t = await this.pickTarget(1, alive); if (t < 0) return null; target = { side: 1, slot: t }; }
      } else if (mv.target === 'ally') {
        const alive = b.aliveSlots(0);
        if (alive.length === 1) target = { side: 0, slot: alive[0] };
        else { const t = await this.pickTarget(0, alive); if (t < 0) return null; target = { side: 0, slot: t }; }
      }
      return { slot, kind: 'move', moveIndex: idx, target };
    },
    async pickTarget(side, slots) {
      const db = this.G.db;
      const arrow = el('div', 'target-arrow', '▼');
      this.root.appendChild(arrow);
      const place = i => { const v = this.view[side][slots[i]]; Object.assign(arrow.style, { left: (v.pos.cx - 4) + 'px', top: (v.pos.y - 4) + 'px' }); };
      const r = await choose({ title: 'Target', items: slots.map(s => ({ label: MF.monName(db, this.b.mon(side, s)) })), right: 6, bottom: 6, w: 112, onMove: place });
      arrow.remove();
      return r < 0 ? -1 : slots[r];
    },
    async chooseItem(slot, pending) {
      const b = this.b, db = this.G.db, bag = this.G.state.bag;
      const reserved = {};
      pending.forEach(p => { if (p.kind === 'item') reserved[p.itemId] = (reserved[p.itemId] || 0) + 1; });
      const list = Object.keys(bag).filter(id => bag[id] - (reserved[id] || 0) > 0 && db.item(id) && db.item(id).battleUsable);
      if (!list.length) { await message('You have no items you can use in battle.', { keep: true, auto: 900 }); return null; }
      const idx = await choose({ title: 'Bag', items: list.map(id => ({ label: db.item(id).name, right: '×' + (bag[id] - (reserved[id] || 0)) })), right: 6, top: 6, w: 150, maxH: this.G.screen.height - 70 });
      if (idx < 0) return null;
      const it = db.item(list[idx]);
      if (it.kind === 'ball') {
        if (!b.canCapture) { await message('You can\'t catch another trainer\'s monster!', { keep: true, auto: 1000 }); return null; }
        if (b.aliveSlots(1).length > 1) { await message('There are too many targets to aim at! Knock one out first.', { keep: true, auto: 1200 }); return null; }
        return { slot, kind: 'item', itemId: it.id, target: { side: 1, slot: b.aliveSlots(1)[0] } };
      }
      const pi = await this.pickPartyMember('Use ' + it.name + ' on which monster?', i => {
        const m = b.sides[0].party[i];
        return it.kind === 'revive' ? m.hp <= 0 : m.hp > 0;
      }, true);
      if (pi < 0) return null;
      return { slot, kind: 'item', itemId: it.id, partyIndex: pi };
    },
    async pickPartyMember(prompt, ok, cancellable) {
      const b = this.b, db = this.G.db;
      const party = b.sides[0].party;
      RUI.say(prompt);
      const items = party.map((m, i) => ({ label: MF.monName(db, m) + (b.sides[0].active.some(x => x && x.partyIndex === i) ? ' ★' : ''), right: 'Lv' + m.level + '  ' + Math.max(0, m.hp) + '/' + m.stats.hp + (m.status ? ' ' + MF.STATUS_SHORT[m.status] : ''), disabled: !ok(i) }));
      return choose({ title: 'Monsters', items, right: 6, top: 6, w: 190, cancel: cancellable, onDisabled: () => RUI.toast('Can\'t choose that one.') });
    }
  };
})();
