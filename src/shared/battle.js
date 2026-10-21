/* Pocket-Game-Maker battle engine. Pure state machine, no DOM.
 * Supports any number of active slots per side (1v1, 2v2, 3v3, or uneven).
 *
 *   const b = new MF.Battle(db, { playerParty, enemyParty, playerActive, enemyActive,
 *                                 isWild, trainerName, bag, rng });
 *   let ev = b.start();                  // array of events to animate
 *   b.state                              // 'input' | 'replace' | 'ended'
 *   b.inputSlots()                       // player slots that need an action
 *   ev = b.submit([{slot, kind:'move', moveIndex, target:{side,slot}}, ...]);
 *   b.replaceSlots()                     // when state === 'replace'
 *   ev = b.submitReplacements({slot: partyIndex});
 *
 * Events: msg, sendOut, withdraw, hp, faint, status, stat, capture, end.
 */
(function (root) {
  'use strict';
  const MF = root.MF || (typeof require !== 'undefined' ? require('./core.js') : {});

  const STRUGGLE = { id: '__struggle', name: 'Struggle', type: null, category: 'physical', power: 50, accuracy: 0, pp: 1, priority: 0, target: 'enemy', effect: { kind: 'recoil', amount: 25 } };
  const STAGE_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];

  class Battle {
    constructor(db, opts) {
      this.db = db;
      this.settings = db.battleSettings();
      this.rng = opts.rng || Math.random;
      this.isWild = !!opts.isWild;
      this.trainerName = opts.trainerName || 'Trainer';
      this.bag = opts.bag || {};
      this.canRun = opts.canRun !== undefined ? opts.canRun : (this.isWild || this.settings.allowRunFromTrainer);
      this.canCapture = opts.canCapture !== undefined ? opts.canCapture : this.isWild;
      this.sides = [
        this._makeSide(opts.playerParty, opts.playerActive || 1),
        this._makeSide(opts.enemyParty, opts.enemyActive || 1)
      ];
      this.state = 'start';
      this.turn = 0;
      this.runAttempts = 0;
      this.participants = {};    // enemy uid -> Set(player uid)
      this.post = [];            // [{mon, kind:'learnPending'|'evolve', moveId|into}]
      this.caught = null;
      this.result = null;
    }
    _makeSide(party, n) {
      return { party, active: new Array(Math.max(1, n)).fill(null) };
    }

    /* ---------- helpers ---------- */
    mon(side, slot) {
      const b = this.sides[side].active[slot];
      return b ? this.sides[side].party[b.partyIndex] : null;
    }
    battler(side, slot) { return this.sides[side].active[slot]; }
    name(side, slot) {
      const m = this.mon(side, slot);
      const n = MF.monName(this.db, m);
      if (side === 0) return n;
      return this.isWild ? 'The wild ' + n : 'The foe\'s ' + n;
    }
    aliveSlots(side) {
      return this.sides[side].active.map((b, i) => (b && this.mon(side, i).hp > 0 ? i : -1)).filter(i => i >= 0);
    }
    benchIndices(side) {
      const s = this.sides[side];
      const onField = s.active.filter(Boolean).map(b => b.partyIndex);
      return s.party.map((m, i) => i).filter(i => s.party[i].hp > 0 && !onField.includes(i));
    }
    sideDefeated(side) {
      return this.sides[side].party.every(m => m.hp <= 0);
    }
    effSpeed(side, slot) {
      const m = this.mon(side, slot), b = this.battler(side, slot);
      let s = m.stats.spe * MF.stageMult(b.stages.spe);
      if (m.status === 'par') s *= 0.5;
      return s;
    }
    _sendOut(side, slot, partyIndex, ev) {
      this.sides[side].active[slot] = { partyIndex, stages: Object.fromEntries(STAGE_STATS.map(s => [s, 0])), sleep: 0 };
      const m = this.mon(side, slot);
      if (m.status === 'slp') this.battler(side, slot).sleep = MF.randInt(this.rng, 1, 3);
      const n = MF.monName(this.db, m);
      ev.push({ type: 'sendOut', side, slot, partyIndex });
      ev.push({ type: 'msg', text: side === 0 ? 'Go, ' + n + '!' : (this.isWild ? '' : this.trainerName + ' sent out ' + n + '!') });
      this._markParticipation();
    }
    _markParticipation() {
      const players = this.aliveSlots(0).map(s => this.mon(0, s).uid);
      this.aliveSlots(1).forEach(s => {
        const u = this.mon(1, s).uid;
        if (!this.participants[u]) this.participants[u] = new Set();
        players.forEach(p => this.participants[u].add(p));
      });
    }

    /* ---------- start ---------- */
    start() {
      const ev = [];
      const enemies = this.sides[1];
      let idx = 0;
      for (let slot = 0; slot < enemies.active.length; slot++) {
        while (idx < enemies.party.length && enemies.party[idx].hp <= 0) idx++;
        if (idx >= enemies.party.length) { enemies.active.length = slot; break; }
        enemies.active[slot] = { partyIndex: idx, stages: Object.fromEntries(STAGE_STATS.map(s => [s, 0])), sleep: 0 };
        ev.push({ type: 'sendOut', side: 1, slot, partyIndex: idx });
        idx++;
      }
      const names = enemies.active.map((b, i) => MF.monName(this.db, this.mon(1, i)));
      if (this.isWild) ev.push({ type: 'msg', text: 'A wild ' + names.join(' and ') + ' appeared!' });
      else {
        ev.push({ type: 'msg', text: this.trainerName + ' wants to battle!' });
        ev.push({ type: 'msg', text: this.trainerName + ' sent out ' + names.join(' and ') + '!' });
      }
      const player = this.sides[0];
      let pi = 0;
      for (let slot = 0; slot < player.active.length; slot++) {
        while (pi < player.party.length && player.party[pi].hp <= 0) pi++;
        if (pi >= player.party.length) { player.active.length = Math.max(1, slot); break; }
        this._sendOut(0, slot, pi, ev);
        pi++;
      }
      this.state = 'input';
      return ev.filter(e => !(e.type === 'msg' && !e.text));
    }

    inputSlots() { return this.state === 'input' ? this.aliveSlots(0) : []; }

    /* ---------- AI ---------- */
    _aiAction(slot) {
      const m = this.mon(1, slot);
      const usable = m.moves.map((mv, i) => ({ mv, i, data: this.db.move(mv.id) })).filter(x => x.mv.pp > 0 && x.data);
      const targets = this.aliveSlots(0);
      if (!usable.length) return { slot, kind: 'move', moveIndex: -1, target: { side: 0, slot: targets[0] } };
      let choice;
      if (!this.isWild && this.rng() < 0.7) {
        let best = -1;
        usable.forEach(x => {
          targets.forEach(t => {
            const tm = this.mon(0, t);
            const sp = this.db.species(tm.speciesId);
            let score = x.data.category === 'status' ? 30 : (x.data.power || 0) * this.db.effectiveness(x.data.type, sp.types);
            const own = this.db.species(m.speciesId);
            if ((own.types || []).includes(x.data.type)) score *= 1.5;
            score *= 0.85 + this.rng() * 0.3;
            if (score > best) { best = score; choice = { x, t }; }
          });
        });
      }
      if (!choice) choice = { x: usable[Math.floor(this.rng() * usable.length)], t: targets[Math.floor(this.rng() * targets.length)] };
      return { slot, kind: 'move', moveIndex: choice.x.i, target: { side: 0, slot: choice.t } };
    }

    /* ---------- turn ---------- */
    submit(actions) {
      if (this.state !== 'input') throw new Error('Battle not awaiting input');
      const ev = [];
      this.turn++;
      const all = [];
      actions.forEach(a => all.push(Object.assign({ side: 0 }, a)));
      this.aliveSlots(1).forEach(s => all.push(Object.assign({ side: 1 }, this._aiAction(s))));

      const rank = a => a.kind === 'run' ? 0 : a.kind === 'switch' ? 1 : a.kind === 'item' ? 2 : 3;
      all.forEach(a => {
        a._rand = this.rng();
        if (a.kind === 'move') {
          const m = this.mon(a.side, a.slot);
          const mvSlot = m.moves[a.moveIndex];
          const mv = mvSlot ? this.db.move(mvSlot.id) : null;
          a._prio = mv ? (mv.priority || 0) : 0;
          a._speed = this.effSpeed(a.side, a.slot);
        }
      });
      all.sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.kind === 'move') {
          if (a._prio !== b._prio) return b._prio - a._prio;
          if (a._speed !== b._speed) return b._speed - a._speed;
        }
        return a._rand - b._rand;
      });

      for (const a of all) {
        if (this.state === 'ended') break;
        if (a.kind === 'move' || a.kind === 'switch') {
          const m = this.mon(a.side, a.slot);
          if (!m || m.hp <= 0) continue;
        }
        if (a.kind === 'run') this._doRun(ev);
        else if (a.kind === 'switch') this._doSwitch(a, ev);
        else if (a.kind === 'item') this._doItem(a, ev);
        else if (a.kind === 'move') this._doMove(a, ev);
        if (this._checkEnd(ev)) break;
      }
      if (this.state !== 'ended') this._endOfTurn(ev);
      if (this.state !== 'ended') this._afterTurn(ev);
      return ev.filter(e => !(e.type === 'msg' && !e.text));
    }

    _doRun(ev) {
      if (!this.canRun) { ev.push({ type: 'msg', text: 'There\'s no running from a trainer battle!' }); return; }
      this.runAttempts++;
      const mine = Math.max(...this.aliveSlots(0).map(s => this.effSpeed(0, s)));
      const theirs = Math.max(1, ...this.aliveSlots(1).map(s => this.effSpeed(1, s)));
      const odds = mine >= theirs ? 1 : (mine * 128 / theirs + 30 * this.runAttempts) / 256;
      if (this.rng() < odds) {
        ev.push({ type: 'sfx', name: 'runAway' });
        ev.push({ type: 'msg', text: 'Got away safely!' });
        this._finish('run', ev);
      } else ev.push({ type: 'msg', text: 'Couldn\'t get away!' });
    }

    _doSwitch(a, ev) {
      const side = this.sides[a.side];
      const target = side.party[a.partyIndex];
      if (!target || target.hp <= 0) return;
      if (side.active.some(b => b && b.partyIndex === a.partyIndex)) return;
      ev.push({ type: 'msg', text: MF.monName(this.db, this.mon(a.side, a.slot)) + ', come back!' });
      ev.push({ type: 'withdraw', side: a.side, slot: a.slot });
      this._sendOut(a.side, a.slot, a.partyIndex, ev);
    }

    _doItem(a, ev) {
      const item = this.db.item(a.itemId);
      if (!item || !(this.bag[a.itemId] > 0)) { ev.push({ type: 'msg', text: 'You don\'t have that item.' }); return; }
      if (item.kind === 'ball') return this._doCapture(a, item, ev);
      const target = this.sides[0].party[a.partyIndex];
      if (!target) return;
      const tName = MF.monName(this.db, target);
      const r = applyItemToMonster(this.db, item, target);
      ev.push({ type: 'msg', text: 'You used ' + item.name + '.' });
      if (!r.used) { ev.push({ type: 'msg', text: 'It had no effect...' }); return; }
      this.bag[a.itemId]--;
      const slot = this.sides[0].active.findIndex(b => b && b.partyIndex === a.partyIndex);
      if (slot >= 0) {
        ev.push({ type: 'hp', side: 0, slot, hp: target.hp, max: target.stats.hp });
        ev.push({ type: 'status', side: 0, slot, status: target.status });
      }
      ev.push({ type: 'msg', text: tName + ' ' + r.text });
    }

    _doCapture(a, ball, ev) {
      ev.push({ type: 'msg', text: 'You threw a ' + ball.name + '!' });
      if (!this.canCapture) { this.bag[a.itemId]--; ev.push({ type: 'msg', text: 'The trainer blocked the ball! Don\'t be a thief!' }); return; }
      const alive = this.aliveSlots(1);
      if (alive.length > 1) { ev.push({ type: 'msg', text: 'It\'s impossible to aim with more than one target!' }); return; }
      this.bag[a.itemId]--;
      const slot = alive[0];
      const target = this.mon(1, slot);
      const r = MF.captureAttempt(this.db, target, ball, this.rng);
      ev.push({ type: 'capture', side: 1, slot, shakes: r.shakes, caught: r.caught, itemId: ball.id });
      if (r.caught) {
        target.caughtBall = ball.id;
        this.caught = target;
        ev.push({ type: 'msg', text: 'Gotcha! ' + MF.monName(this.db, target) + ' was caught!' });
        this._finish('caught', ev);
      } else {
        ev.push({ type: 'msg', text: ['Oh no! It broke free!', 'Argh! Almost had it!', 'Aargh! So close!', 'Shoot! It was so close too!'][r.shakes] });
      }
    }

    _resolveTarget(a, mv) {
      const opp = 1 - a.side;
      if (mv.target === 'self') return [{ side: a.side, slot: a.slot }];
      if (mv.target === 'allEnemies') return this.aliveSlots(opp).map(slot => ({ side: opp, slot }));
      if (mv.target === 'ally') {
        const t = a.target && a.target.side === a.side ? a.target : { side: a.side, slot: a.slot };
        return this.mon(t.side, t.slot) && this.mon(t.side, t.slot).hp > 0 ? [t] : [{ side: a.side, slot: a.slot }];
      }
      let t = a.target && a.target.side === opp ? a.target : null;
      if (!t || !this.mon(t.side, t.slot) || this.mon(t.side, t.slot).hp <= 0) {
        const alive = this.aliveSlots(opp);
        if (!alive.length) return [];
        t = { side: opp, slot: alive[Math.floor(this.rng() * alive.length)] };
      }
      return [t];
    }

    _doMove(a, ev) {
      const user = this.mon(a.side, a.slot);
      const ub = this.battler(a.side, a.slot);
      const uName = this.name(a.side, a.slot);

      if (user.status === 'slp') {
        if (ub.sleep > 0) { ub.sleep--; ev.push({ type: 'msg', text: uName + ' is fast asleep.' }); return; }
        user.status = null;
        ev.push({ type: 'msg', text: uName + ' woke up!' });
        ev.push({ type: 'status', side: a.side, slot: a.slot, status: null });
      }
      if (user.status === 'par' && this.rng() < 0.25) { ev.push({ type: 'msg', text: uName + ' is paralyzed! It can\'t move!' }); return; }

      let mv, slotRef = null;
      if (a.moveIndex < 0 || !user.moves[a.moveIndex] || user.moves[a.moveIndex].pp <= 0) {
        const anyPP = user.moves.some(m => m.pp > 0 && this.db.move(m.id));
        if (!anyPP) { mv = STRUGGLE; ev.push({ type: 'msg', text: uName + ' has no moves left!' }); }
        else { slotRef = user.moves.find(m => m.pp > 0 && this.db.move(m.id)); mv = this.db.move(slotRef.id); }
      } else { slotRef = user.moves[a.moveIndex]; mv = this.db.move(slotRef.id); }
      if (!mv) return;
      if (slotRef) slotRef.pp = Math.max(0, slotRef.pp - 1);

      ev.push({ type: 'msg', text: uName + ' used ' + mv.name + '!' });
      ev.push({ type: 'anim', side: a.side, slot: a.slot, moveId: mv.id, moveType: mv.type, category: mv.category });
      const targets = this._resolveTarget(a, mv);
      if (!targets.length) { ev.push({ type: 'msg', text: 'But there was no target...' }); return; }
      const spread = targets.length > 1 ? 0.75 : 1;

      for (const t of targets) {
        const target = this.mon(t.side, t.slot);
        if (!target || target.hp <= 0) continue;
        const tb = this.battler(t.side, t.slot);
        const tName = this.name(t.side, t.slot);
        const selfTarget = t.side === a.side && t.slot === a.slot;

        if (!selfTarget && mv.accuracy > 0) {
          const accMult = MF.accStageMult(ub.stages.acc - tb.stages.eva);
          if (this.rng() * 100 >= mv.accuracy * accMult) { ev.push({ type: 'msg', text: tName + ' avoided the attack!' }); continue; }
        }

        if (mv.category !== 'status' && mv.power > 0) {
          const tsp = this.db.species(target.speciesId);
          const eff = mv.type ? this.db.effectiveness(mv.type, tsp.types) : 1;
          if (eff === 0) { ev.push({ type: 'msg', text: 'It doesn\'t affect ' + tName + '...' }); continue; }
          const dmgInfo = this._damage(a.side, a.slot, t.side, t.slot, mv, eff, spread);
          const dealt = Math.min(target.hp, dmgInfo.damage);
          target.hp -= dealt;
          ev.push({ type: 'hit', side: t.side, slot: t.slot, eff, crit: !!dmgInfo.crit });
          ev.push({ type: 'hp', side: t.side, slot: t.slot, hp: target.hp, max: target.stats.hp });
          if (dmgInfo.crit) ev.push({ type: 'msg', text: 'A critical hit!' });
          if (eff > 1) ev.push({ type: 'msg', text: 'It\'s super effective!' });
          else if (eff < 1) ev.push({ type: 'msg', text: 'It\'s not very effective...' });
          this._secondary(mv, a, t, dealt, ev);
          if (target.hp <= 0) this._faint(t.side, t.slot, ev);
          if (user.hp <= 0) { this._faint(a.side, a.slot, ev); break; }
        } else {
          this._statusMove(mv, a, t, ev);
        }
      }
    }

    _damage(as, aslot, ts, tslot, mv, eff, spread) {
      const u = this.mon(as, aslot), t = this.mon(ts, tslot);
      const ub = this.battler(as, aslot), tb = this.battler(ts, tslot);
      const phys = mv.category === 'physical';
      const crit = this.rng() < this.settings.critChance;
      let aStage = phys ? ub.stages.atk : ub.stages.spa;
      let dStage = phys ? tb.stages.def : tb.stages.spd;
      if (crit) { aStage = Math.max(0, aStage); dStage = Math.min(0, dStage); }
      let A = (phys ? u.stats.atk : u.stats.spa) * MF.stageMult(aStage);
      const D = Math.max(1, (phys ? t.stats.def : t.stats.spd) * MF.stageMult(dStage));
      if (phys && u.status === 'brn') A *= 0.5;
      let dmg = Math.floor(Math.floor(Math.floor(2 * u.level / 5 + 2) * mv.power * A / D) / 50) + 2;
      dmg *= spread;
      if (crit) dmg *= this.settings.critMultiplier;
      dmg *= 0.85 + this.rng() * 0.15;
      const usp = this.db.species(u.speciesId);
      if (mv.type && (usp.types || []).includes(mv.type)) dmg *= this.settings.stab;
      dmg *= eff;
      return { damage: Math.max(1, Math.floor(dmg)), crit };
    }

    _secondary(mv, a, t, dealt, ev) {
      const e = mv.effect || {};
      const user = this.mon(a.side, a.slot);
      if (e.kind === 'drain' && dealt > 0 && user.hp > 0) {
        const heal = Math.max(1, Math.floor(dealt * (e.amount || 50) / 100));
        user.hp = Math.min(user.stats.hp, user.hp + heal);
        ev.push({ type: 'hp', side: a.side, slot: a.slot, hp: user.hp, max: user.stats.hp });
        ev.push({ type: 'msg', text: this.name(t.side, t.slot) + ' had its energy drained!' });
      } else if (e.kind === 'recoil' && dealt > 0) {
        const r = Math.max(1, Math.floor(dealt * (e.amount || 25) / 100));
        user.hp = Math.max(0, user.hp - r);
        ev.push({ type: 'hp', side: a.side, slot: a.slot, hp: user.hp, max: user.stats.hp });
        ev.push({ type: 'msg', text: this.name(a.side, a.slot) + ' is damaged by recoil!' });
      } else if ((e.kind === 'status' || e.kind === 'stat') && this.rng() * 100 < (e.chance || 100)) {
        const who = e.who === 'self' ? { side: a.side, slot: a.slot } : t;
        if (this.mon(who.side, who.slot).hp > 0) this._applyEffect(e, who, ev, true);
      }
    }

    _statusMove(mv, a, t, ev) {
      const e = mv.effect || {};
      const who = e.who === 'self' ? { side: a.side, slot: a.slot } : t;
      if (e.kind === 'heal') {
        const m = this.mon(who.side, who.slot);
        if (m.hp >= m.stats.hp) { ev.push({ type: 'msg', text: this.name(who.side, who.slot) + '\'s HP is full!' }); return; }
        m.hp = Math.min(m.stats.hp, m.hp + Math.floor(m.stats.hp * (e.amount || 50) / 100));
        ev.push({ type: 'hp', side: who.side, slot: who.slot, hp: m.hp, max: m.stats.hp });
        ev.push({ type: 'msg', text: this.name(who.side, who.slot) + ' regained health!' });
        return;
      }
      if (e.kind === 'status' || e.kind === 'stat') {
        if (this.rng() * 100 < (e.chance || 100)) this._applyEffect(e, who, ev, false);
        else ev.push({ type: 'msg', text: 'But it failed!' });
        return;
      }
      ev.push({ type: 'msg', text: 'But nothing happened!' });
    }

    _applyEffect(e, who, ev, quiet) {
      const m = this.mon(who.side, who.slot), b = this.battler(who.side, who.slot);
      const n = this.name(who.side, who.slot);
      if (e.kind === 'status') {
        if (m.status) { if (!quiet) ev.push({ type: 'msg', text: n + ' is already ' + MF.STATUS_NAMES[m.status] + '!' }); return; }
        const sp = this.db.species(m.speciesId);
        const immune = (this.db.system.statusImmunity || {})[e.status] || [];
        if ((sp.types || []).some(ty => immune.includes(ty))) { if (!quiet) ev.push({ type: 'msg', text: 'It doesn\'t affect ' + n + '...' }); return; }
        m.status = e.status;
        if (e.status === 'slp') b.sleep = MF.randInt(this.rng, 1, 3);
        ev.push({ type: 'status', side: who.side, slot: who.slot, status: m.status });
        ev.push({ type: 'msg', text: n + (e.status === 'slp' ? ' fell asleep!' : ' was ' + MF.STATUS_NAMES[e.status] + '!') });
      } else if (e.kind === 'stat') {
        const stat = e.stat || 'atk', st = e.stages || -1;
        const before = b.stages[stat];
        b.stages[stat] = Math.max(-6, Math.min(6, before + st));
        const diff = b.stages[stat] - before;
        const sn = MF.STAT_NAMES[stat] || stat;
        if (diff === 0) { if (!quiet) ev.push({ type: 'msg', text: n + '\'s ' + sn + ' won\'t go any ' + (st > 0 ? 'higher!' : 'lower!') }); return; }
        ev.push({ type: 'stat', side: who.side, slot: who.slot, stat, diff });
        const word = Math.abs(diff) >= 2 ? (diff > 0 ? ' rose sharply!' : ' harshly fell!') : (diff > 0 ? ' rose!' : ' fell!');
        ev.push({ type: 'msg', text: n + '\'s ' + sn + word });
      }
    }

    _faint(side, slot, ev) {
      const m = this.mon(side, slot);
      if (!m || m._faintAnnounced === this.turn + ':' + slot) return;
      m.hp = 0; m.status = null;
      m._faintAnnounced = this.turn + ':' + slot;
      ev.push({ type: 'faint', side, slot });
      ev.push({ type: 'msg', text: this.name(side, slot) + ' fainted!' });
      if (side === 1) this._awardExp(m, ev);
    }

    _awardExp(defeated, ev) {
      const parts = Array.from(this.participants[defeated.uid] || []);
      const party = this.sides[0].party;
      const receivers = parts.map(u => party.find(p => p.uid === u)).filter(p => p && p.hp > 0);
      receivers.forEach(p => {
        const gain = MF.expYield(this.db, defeated, !this.isWild, receivers.length);
        ev.push({ type: 'msg', text: MF.monName(this.db, p) + ' gained ' + gain + ' Exp. Points!' });
        const res = MF.gainExp(this.db, p, gain);
        const slot = this.sides[0].active.findIndex(b => b && party[b.partyIndex] === p);
        res.forEach(r => {
          if (r.type === 'levelUp') {
            ev.push({ type: 'levelUp', side: 0, slot, uid: p.uid, level: r.level });
            if (slot >= 0) ev.push({ type: 'hp', side: 0, slot, hp: p.hp, max: p.stats.hp });
            ev.push({ type: 'msg', text: MF.monName(this.db, p) + ' grew to Lv. ' + r.level + '!' });
          } else if (r.type === 'learnedMove') {
            ev.push({ type: 'msg', text: MF.monName(this.db, p) + ' learned ' + this.db.move(r.moveId).name + '!' });
          } else if (r.type === 'learnPending') {
            this.post.push({ mon: p, kind: 'learnPending', moveId: r.moveId });
          }
        });
        const into = MF.checkEvolution(this.db, p);
        if (into && !this.post.some(x => x.mon === p && x.kind === 'evolve')) this.post.push({ mon: p, kind: 'evolve', into });
      });
    }

    _endOfTurn(ev) {
      for (const side of [0, 1]) {
        for (const slot of this.aliveSlots(side)) {
          const m = this.mon(side, slot);
          if (m.status === 'psn' || m.status === 'brn') {
            const d = Math.max(1, Math.floor(m.stats.hp / (m.status === 'psn' ? 8 : 16)));
            m.hp = Math.max(0, m.hp - d);
            ev.push({ type: 'hp', side, slot, hp: m.hp, max: m.stats.hp });
            ev.push({ type: 'msg', text: this.name(side, slot) + ' is hurt by its ' + (m.status === 'psn' ? 'poison' : 'burn') + '!' });
            if (m.hp <= 0) this._faint(side, slot, ev);
          }
        }
      }
      this._checkEnd(ev);
    }

    _checkEnd(ev) {
      if (this.state === 'ended') return true;
      if (this.sideDefeated(1)) {
        if (!this.isWild) ev.push({ type: 'msg', text: 'You defeated ' + this.trainerName + '!' });
        this._finish('win', ev); return true;
      }
      if (this.sideDefeated(0)) {
        ev.push({ type: 'msg', text: 'You have no more monsters that can fight!' });
        this._finish('lose', ev); return true;
      }
      return false;
    }

    _afterTurn(ev) {
      // Enemy replacements happen automatically.
      const enemy = this.sides[1];
      enemy.active.forEach((b, slot) => {
        if (b && this.mon(1, slot).hp <= 0) {
          const bench = this.benchIndices(1);
          if (bench.length) { ev.push({ type: 'withdraw', side: 1, slot }); this._sendOut(1, slot, bench[0], ev); }
          else { enemy.active[slot] = null; ev.push({ type: 'withdraw', side: 1, slot }); }
        }
      });
      const need = this.replaceSlots();
      if (need.length) this.state = 'replace';
      else {
        // Clear fainted player slots that cannot be refilled.
        this.sides[0].active.forEach((b, slot) => {
          if (b && this.mon(0, slot).hp <= 0) { this.sides[0].active[slot] = null; ev.push({ type: 'withdraw', side: 0, slot }); }
        });
        this.state = 'input';
      }
    }

    replaceSlots() {
      const s = this.sides[0];
      const fainted = s.active.map((b, i) => (b && this.mon(0, i).hp <= 0 ? i : -1)).filter(i => i >= 0);
      const bench = this.benchIndices(0).length;
      return fainted.slice(0, bench);
    }

    submitReplacements(map) {
      if (this.state !== 'replace') throw new Error('Battle not awaiting replacements');
      const ev = [];
      const used = new Set();
      this.replaceSlots().forEach(slot => {
        let pi = map[slot];
        const bench = this.benchIndices(0).filter(i => !used.has(i));
        if (!bench.includes(pi)) pi = bench[0];
        used.add(pi);
        ev.push({ type: 'withdraw', side: 0, slot });
        this._sendOut(0, slot, pi, ev);
      });
      this.sides[0].active.forEach((b, slot) => {
        if (b && this.mon(0, slot).hp <= 0) { this.sides[0].active[slot] = null; ev.push({ type: 'withdraw', side: 0, slot }); }
      });
      this.state = 'input';
      return ev.filter(e => !(e.type === 'msg' && !e.text));
    }

    _finish(result, ev) {
      this.state = 'ended';
      this.result = result;
      // Clear stat stages and sleep counters are battle-only; HP/status persist.
      ev.push({ type: 'end', result });
    }
  }

  /* Shared item logic for battle and field menus. Returns {used, text}. */
  function applyItemToMonster(db, item, mon) {
    const fainted = mon.hp <= 0;
    if (item.kind === 'revive') {
      if (!fainted) return { used: false };
      mon.hp = Math.max(1, Math.floor(mon.stats.hp * (item.revivePercent || 50) / 100));
      return { used: true, text: 'was revived!' };
    }
    if (fainted) return { used: false };
    if (item.kind === 'heal') {
      let used = false, parts = [];
      const amt = item.healAmount || 0, pct = item.healPercent || 0;
      if ((amt || pct) && mon.hp < mon.stats.hp) {
        const before = mon.hp;
        mon.hp = Math.min(mon.stats.hp, mon.hp + amt + Math.floor(mon.stats.hp * pct / 100));
        parts.push('recovered ' + (mon.hp - before) + ' HP');
        used = true;
      }
      if (item.cureStatus && mon.status && (item.cureStatus === 'all' || item.cureStatus === mon.status)) {
        parts.push('was cured of its ' + ({ psn: 'poison', brn: 'burn', par: 'paralysis', slp: 'sleep' }[mon.status]));
        mon.status = null; used = true;
      }
      return { used, text: parts.join(' and ') + '!' };
    }
    if (item.kind === 'pp') {
      let used = false;
      mon.moves.forEach(m => { const mv = db.move(m.id); if (mv && m.pp < mv.pp) { m.pp = Math.min(mv.pp, m.pp + (item.ppAmount || mv.pp)); used = true; } });
      return { used, text: 'had its PP restored!' }; // 'PP' is swapped for the game's own word (EP by default) when shown
    }
    return { used: false };
  }

  MF.Battle = Battle;
  MF.applyItemToMonster = applyItemToMonster;
  if (typeof module !== 'undefined' && module.exports) module.exports = MF;
})(typeof window !== 'undefined' ? window : globalThis);
