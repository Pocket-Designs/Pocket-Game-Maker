/* Pocket-Game-Maker core rules: data access, monster instances, formulas.
 * Pure JS, no DOM. Works in the browser (window.MF) and in Node (require). */
(function (root) {
  'use strict';
  const MF = root.MF || {};

  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const STAT_NAMES = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'Accuracy', eva: 'Evasion' };
  const STATUS_NAMES = { psn: 'poisoned', brn: 'burned', par: 'paralyzed', slp: 'asleep' };
  const STATUS_SHORT = { psn: 'PSN', brn: 'BRN', par: 'PAR', slp: 'SLP' };

  /* ---------- RNG ---------- */
  function makeRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    let s = seed >>> 0 || 1;
    return function () { // mulberry32
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

  /* ---------- Database wrapper ---------- */
  class Database {
    constructor(data) {
      this.raw = data;
      this.system = data.system || {};
      this.types = (data.types && data.types.types) || [];
      this.chart = (data.types && data.types.chart) || {};
      this.moves = index(data.moves);
      this.monsters = index(data.monsters);
      this.items = index(data.items);
      this.tilesets = index(data.tilesets);
      this.maps = data.maps || {};
    }
    move(id) { return this.moves[id]; }
    species(id) { return this.monsters[id]; }
    item(id) { return this.items[id]; }
    type(id) { return this.types.find(t => t.id === id); }
    typeName(id) { const t = this.type(id); return t ? t.name : id; }
    effectiveness(atkType, defTypes) {
      let m = 1;
      for (const d of defTypes || []) {
        if (!d) continue;
        const row = this.chart[atkType];
        const v = row && row[d] !== undefined ? row[d] : 1;
        m *= v;
      }
      return m;
    }
    battleSettings() {
      const b = this.system.battle || {};
      return {
        maxParty: b.maxParty || 6,
        wildActive: b.wildActive || 1,
        trainerActive: b.trainerActive || 1,
        maxMoves: b.maxMoves || 4,
        maxLevel: b.maxLevel || 100,
        critChance: b.critChance !== undefined ? b.critChance : 1 / 24,
        critMultiplier: b.critMultiplier || 1.5,
        stab: b.stab || 1.5,
        expMultiplier: b.expMultiplier || 1,
        trainerExpBonus: b.trainerExpBonus || 1.5,
        allowRunFromTrainer: !!b.allowRunFromTrainer
      };
    }
  }
  function index(arr) {
    const o = {};
    (arr || []).forEach(x => { if (x && x.id !== undefined) o[x.id] = x; });
    return o;
  }

  /* ---------- Growth / exp ---------- */
  const GROWTH = {
    fast: n => Math.floor(0.8 * n * n * n),
    medium: n => n * n * n,
    slow: n => Math.floor(1.25 * n * n * n),
    erratic: n => n <= 50 ? Math.floor(n * n * n * (100 - n) / 50) : Math.floor(n * n * n * (150 - n) / 100)
  };
  function expForLevel(growth, level) {
    if (level <= 1) return 0;
    const f = GROWTH[growth] || GROWTH.medium;
    return f(level);
  }

  /* ---------- Stats ---------- */
  function calcStat(stat, base, iv, level) {
    if (stat === 'hp') return Math.floor((2 * base + iv) * level / 100) + level + 10;
    return Math.floor((2 * base + iv) * level / 100) + 5;
  }
  function recalcStats(db, mon) {
    const sp = db.species(mon.speciesId);
    const oldMax = mon.stats ? mon.stats.hp : null;
    mon.stats = {};
    STATS.forEach(s => { mon.stats[s] = calcStat(s, (sp.baseStats || {})[s] || 50, mon.ivs[s] || 0, mon.level); });
    if (oldMax === null) mon.hp = mon.stats.hp;
    else mon.hp = Math.max(0, Math.min(mon.stats.hp, mon.hp + (mon.stats.hp - oldMax)));
    return mon;
  }

  let uidCounter = 1;
  function createMonster(db, speciesId, level, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const sp = db.species(speciesId);
    if (!sp) throw new Error('Unknown species: ' + speciesId);
    const lvl = Math.max(1, Math.min(level || 5, db.battleSettings().maxLevel));
    const ivs = {};
    STATS.forEach(s => { ivs[s] = opts.ivs && opts.ivs[s] !== undefined ? opts.ivs[s] : randInt(rng, 0, 31); });
    const mon = {
      uid: Date.now().toString(36) + '-' + (uidCounter++).toString(36) + '-' + Math.floor(rng() * 1e6).toString(36),
      speciesId: sp.id,
      nickname: opts.nickname || '',
      level: lvl,
      exp: expForLevel(sp.growth, lvl),
      ivs,
      status: null,
      moves: [],
      caughtBall: opts.ball || null,
      ot: opts.ot || ''
    };
    recalcStats(db, mon);
    const maxMoves = db.battleSettings().maxMoves;
    const learn = (sp.learnset || []).filter(l => l.level <= lvl).sort((a, b) => a.level - b.level);
    const ids = [];
    learn.forEach(l => { if (!ids.includes(l.moveId) && db.move(l.moveId)) ids.push(l.moveId); });
    ids.slice(-maxMoves).forEach(id => mon.moves.push(newMoveSlot(db, id)));
    return mon;
  }
  function newMoveSlot(db, moveId) {
    const mv = db.move(moveId);
    return { id: moveId, pp: mv ? mv.pp : 10 };
  }
  function monName(db, mon) {
    if (mon.nickname) return mon.nickname;
    const sp = db.species(mon.speciesId);
    return sp ? sp.name : '???';
  }
  function healMonster(db, mon) {
    mon.hp = mon.stats.hp;
    mon.status = null;
    mon.moves.forEach(m => { const mv = db.move(m.id); m.pp = mv ? mv.pp : m.pp; });
  }

  /* Gain experience; returns list of events: levelUp, learnedMove, learnPending, evolve */
  function gainExp(db, mon, amount) {
    const events = [];
    const sp = db.species(mon.speciesId);
    const maxLevel = db.battleSettings().maxLevel;
    if (mon.level >= maxLevel) return events;
    mon.exp += amount;
    while (mon.level < maxLevel && mon.exp >= expForLevel(sp.growth, mon.level + 1)) {
      mon.level++;
      recalcStats(db, mon);
      events.push({ type: 'levelUp', level: mon.level });
      (sp.learnset || []).filter(l => l.level === mon.level).forEach(l => {
        if (!db.move(l.moveId) || mon.moves.some(m => m.id === l.moveId)) return;
        if (mon.moves.length < db.battleSettings().maxMoves) {
          mon.moves.push(newMoveSlot(db, l.moveId));
          events.push({ type: 'learnedMove', moveId: l.moveId });
        } else {
          events.push({ type: 'learnPending', moveId: l.moveId });
        }
      });
    }
    if (mon.level >= maxLevel) mon.exp = expForLevel(sp.growth, maxLevel);
    return events;
  }
  function checkEvolution(db, mon) {
    const sp = db.species(mon.speciesId);
    if (!sp || !sp.evolution) return null;
    const ev = sp.evolution;
    if (ev.method === 'level' && ev.into && db.species(ev.into) && mon.level >= (ev.level || 999)) return ev.into;
    return null;
  }
  function evolve(db, mon, intoId) {
    mon.speciesId = intoId;
    recalcStats(db, mon);
  }
  function itemCausesEvolution(db, mon, itemId) {
    const sp = db.species(mon.speciesId);
    if (!sp || !sp.evolution) return null;
    const ev = sp.evolution;
    if (ev.method === 'item' && ev.itemId === itemId && db.species(ev.into)) return ev.into;
    return null;
  }

  function expYield(db, defeated, isTrainer, participants) {
    const sp = db.species(defeated.speciesId);
    const s = db.battleSettings();
    const base = sp.expYield || 50;
    let e = Math.floor(base * defeated.level / 7);
    if (isTrainer) e = Math.floor(e * s.trainerExpBonus);
    e = Math.floor(e * s.expMultiplier / Math.max(1, participants));
    return Math.max(1, e);
  }

  /* ---------- Battle math ---------- */
  function stageMult(stage) {
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }
  function accStageMult(stage) {
    return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
  }

  /* Capture: returns {caught, shakes} */
  function captureAttempt(db, target, ballItem, rng) {
    const sp = db.species(target.speciesId);
    const rate = sp.catchRate !== undefined ? sp.catchRate : 45;
    const ballBonus = ballItem && ballItem.catchBonus ? ballItem.catchBonus : 1;
    if (ballItem && ballItem.catchBonus >= 255) return { caught: true, shakes: 3 };
    const statusBonus = target.status === 'slp' ? 2 : (target.status ? 1.5 : 1);
    const max = target.stats.hp;
    const a = ((3 * max - 2 * target.hp) * rate * ballBonus * statusBonus) / (3 * max);
    if (a >= 255) return { caught: true, shakes: 3 };
    const b = 65536 / Math.pow(255 / Math.max(a, 0.0001), 0.1875);
    let shakes = 0;
    for (let i = 0; i < 4; i++) {
      if (rng() * 65536 < b) shakes++; else break;
    }
    return { caught: shakes === 4, shakes: Math.min(shakes, 3) };
  }

  Object.assign(MF, {
    STATS, STAT_NAMES, STATUS_NAMES, STATUS_SHORT, makeRng, randInt, Database,
    expForLevel, calcStat, recalcStats, createMonster, newMoveSlot, monName, healMonster,
    gainExp, checkEvolution, evolve, itemCausesEvolution, expYield, stageMult, accStageMult, captureAttempt
  });
  root.MF = MF;
  if (typeof module !== 'undefined' && module.exports) module.exports = MF;
})(typeof window !== 'undefined' ? window : globalThis);
