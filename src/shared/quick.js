/* Quick events → normal event pages. Shared by the editor and the sample-project generator. */
(function (root) {
  'use strict';
  const article = name => (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;
  const newPage = o => Object.assign({ condition: { switchId: 0, selfSwitch: false }, sprite: '', dir: 'down', trigger: 'action', move: 'fixed', through: false, sightRange: 0, commands: [] }, o);

  // ctx: { items: [{id,name}], currency: 'Coins' }
  function autoMessage(q, ctx) {
    if (q.type === 'chest' && q.contents === 'money') return 'You opened the chest and found ' + (q.money || 0) + ' ' + (ctx.currency || 'money') + '!';
    const it = (ctx.items || []).find(i => i.id === q.itemId);
    const name = it ? it.name : 'item';
    const what = (q.amount || 1) > 1 ? (q.amount + '× ' + name) : article(name);
    return q.type === 'chest' ? 'You opened the chest and found ' + what + '!' : 'You found ' + what + '!';
  }

  function build(q, ctx) {
    if (q.type === 'chest') {
      const give = q.contents === 'money' ? { cmd: 'giveMoney', amount: q.money || 0, silent: true } : { cmd: 'giveItem', itemId: q.itemId, amount: q.amount || 1, silent: true };
      return [
        newPage({ sprite: q.sprite, commands: [
          { cmd: 'selfSwitch', value: true },          // switches to page 2, so the chest shows as open
          { cmd: 'wait', frames: 12 },
          { cmd: 'text', speaker: '', text: q.message || autoMessage(q, ctx) },
          give
        ] }),
        newPage({ condition: { switchId: 0, selfSwitch: true }, sprite: q.openSprite, commands: q.emptyMessage ? [{ cmd: 'text', speaker: '', text: q.emptyMessage }] : [] })
      ];
    }
    if (q.type === 'item') {
      return [
        newPage({ sprite: q.look === 'hidden' ? '' : q.sprite, commands: [
          { cmd: 'text', speaker: '', text: q.message || autoMessage(q, ctx) },
          { cmd: 'giveItem', itemId: q.itemId, amount: q.amount || 1, silent: true },
          { cmd: 'selfSwitch', value: true }
        ] }),
        newPage({ condition: { switchId: 0, selfSwitch: true }, sprite: '', through: true })
      ];
    }
    if (q.type === 'encounter') {
      const encounter = {
        dx: q.dx || 0, dy: q.dy || 0, width: Math.max(1, q.width || 1), height: Math.max(1, q.height || 1),
        chance: q.chance, list: (q.list || []).map(e => ({ speciesId: e.speciesId, minLevel: e.minLevel, maxLevel: e.maxLevel, weight: e.weight })),
        active: q.active || 0, onlyEncTiles: !!q.onlyEncTiles, once: !!q.once, message: q.message || ''
      };
      const pages = [newPage({ trigger: 'encounter', through: true, encounter })];
      if (q.once) pages.push(newPage({ condition: { switchId: 0, selfSwitch: true }, through: true }));
      return pages;
    }
    if (q.type === 'sign') {
      return [newPage({ sprite: q.look === 'post' ? q.sprite : '', frontOnly: !!q.frontOnly, commands: [{ cmd: 'text', speaker: q.title || '', text: q.text || '' }] })];
    }
    if (q.type === 'shop') {
      return [newPage({ sprite: q.sprite || '', dir: q.dir || 'down', commands: [{ cmd: 'shop', greeting: q.greeting || '', farewell: q.farewell || '', goods: (q.goods || []).filter(g => g && g.itemId).map(g => ({ itemId: g.itemId, price: g.price == null || g.price === '' ? null : +g.price })), sell: q.sell !== false, sellRate: q.sellRate == null ? 50 : +q.sellRate }] })];
    }
    if (q.type === 'exit') {
      // "step": walk onto the square (doorways, stairs, cave mouths). "door": face it and press the action button.
      const step = q.how !== 'door';
      return [newPage({ sprite: step ? '' : (q.sprite || ''), trigger: step ? 'touch' : 'action', through: step, commands: [{ cmd: 'transfer', mapId: q.mapId, x: q.x | 0, y: q.y | 0, dir: q.dir || 'keep', sound: q.sound !== false, fade: q.fade === false ? 'none' : 'black' }] })];
    }
    if (q.type === 'npc') {
      const look = { sprite: q.sprite || '', dir: q.dir || 'down', move: q.move || 'fixed', route: q.move === 'route' ? { steps: (q.steps || []).slice(), repeat: true } : undefined, speed: q.speed || 'normal' };
      const say = (text, extra) => text ? [Object.assign({ cmd: 'text', speaker: q.speaker || '', text }, extra || {})] : [];
      if (q.role === 'gift') {
        return [
          newPage(Object.assign({}, look, { commands: say(q.text).concat([{ cmd: 'giveItem', itemId: q.itemId, amount: q.amount || 1 }, { cmd: 'selfSwitch', value: true }]) })),
          newPage(Object.assign({}, look, { condition: { switchId: 0, selfSwitch: true }, commands: say(q.afterText) }))
        ];
      }
      if (q.role === 'trainer') {
        const sight = Math.max(0, q.sight | 0);
        return [
          newPage(Object.assign({}, look, { trigger: sight ? 'sight' : 'action', sightRange: sight, commands: say(q.text).concat([
            { cmd: 'trainerBattle', name: q.trainerName || q.speaker || 'Trainer', active: q.active || 0, party: (q.party || []).filter(p => p.speciesId).map(p => ({ speciesId: p.speciesId, level: p.level || 5 })), reward: q.reward || 0, winText: q.winText || '', loseText: q.loseText || '', battleback: '', continueOnLoss: false },
            { cmd: 'selfSwitch', value: true }]) })),
          newPage(Object.assign({}, look, { condition: { switchId: 0, selfSwitch: true }, commands: say(q.afterText) }))
        ];
      }
      return [newPage(Object.assign({}, look, { commands: say(q.text) }))];
    }
    if (q.type === 'lever') {
      // Page 1 shows the switch OFF; page 2 (switch ON) shows it ON. Using it flips the global switch.
      const on = { cmd: 'setSwitch', switchId: q.switchId | 0, value: true }, off = { cmd: 'setSwitch', switchId: q.switchId | 0, value: false };
      const snd = q.sound ? [{ cmd: 'playSound', file: q.sound, volume: 100, wait: false }] : [];
      return [
        newPage({ sprite: q.offSprite || '', commands: snd.concat([on]).concat(q.onText ? [{ cmd: 'text', speaker: '', text: q.onText }] : []) }),
        newPage({ condition: { switchId: q.switchId | 0, selfSwitch: false }, sprite: q.onSprite || '', commands: q.oneWay ? (q.doneText ? [{ cmd: 'text', speaker: '', text: q.doneText }] : []) : snd.concat([off]).concat(q.offText ? [{ cmd: 'text', speaker: '', text: q.offText }] : []) })
      ];
    }
    if (q.type === 'cutscene') {
      // Runs once: when the player steps on the square(s), or as soon as the map opens.
      const cmds = [{ cmd: 'letterbox', on: true }].concat(q.commands && q.commands.length ? q.commands : [{ cmd: 'text', speaker: '', text: q.text || 'Edit this cut scene in the full event editor.' }]).concat([{ cmd: 'letterbox', on: false }, { cmd: 'selfSwitch', value: true }]);
      const pages = [newPage({ trigger: q.start === 'map' ? 'auto' : 'touch', through: true, commands: cmds })];
      if (q.start !== 'map' && (q.width > 1 || q.height > 1)) pages[0].area = { width: Math.max(1, q.width | 0), height: Math.max(1, q.height | 0) };
      pages.push(newPage({ condition: { switchId: 0, selfSwitch: true }, through: true }));
      return pages;
    }
    throw new Error('Unknown quick event type: ' + q.type);
  }

  // Encounter areas: the squares an encounter page covers (relative to its event), and weighted monster picking.
  function zoneRect(ev, enc) { return { x: ev.x + (enc.dx || 0), y: ev.y + (enc.dy || 0), w: Math.max(1, enc.width || 1), h: Math.max(1, enc.height || 1) }; }
  function inZone(ev, enc, x, y) { const r = zoneRect(ev, enc); return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
  // Returns [{speciesId, level}] x n, choosing each by weight. rng() in [0,1).
  function pick(list, n, rng) {
    const ok = (list || []).filter(e => e && e.speciesId && (e.weight || 0) > 0);
    if (!ok.length) return [];
    const total = ok.reduce((a, e) => a + e.weight, 0);
    const out = [];
    for (let i = 0; i < Math.max(1, n || 1); i++) {
      let r = rng() * total, choice = ok[ok.length - 1];
      for (const e of ok) { r -= e.weight; if (r < 0) { choice = e; break; } }
      const lo = Math.max(1, choice.minLevel || 1), hi = Math.max(lo, choice.maxLevel || lo);
      out.push({ speciesId: choice.speciesId, level: lo + Math.floor(rng() * (hi - lo + 1)) });
    }
    return out;
  }
  // Movement routes: a list of steps an event (or the player, in a cut scene) follows.
  // Steps: up / down / left / right move one square; face-up etc. turn; wait pauses.
  const STEPS = ['up', 'down', 'left', 'right', 'face-up', 'face-down', 'face-left', 'face-right', 'wait'];
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const ROUTES = {
    backAndForth: (dir, n) => { const a = []; for (let i = 0; i < n; i++) a.push(dir); a.push('wait'); for (let i = 0; i < n; i++) a.push(OPPOSITE[dir]); a.push('wait'); return a; },
    square: (n, clockwise) => { const order = clockwise ? ['right', 'down', 'left', 'up'] : ['left', 'down', 'right', 'up']; const a = []; order.forEach(d => { for (let i = 0; i < n; i++) a.push(d); }); return a; },
    lookAround: () => ['face-left', 'wait', 'face-down', 'wait', 'face-right', 'wait', 'face-down', 'wait']
  };
  const FREQUENCIES = [['Very common', 40], ['Common', 25], ['Uncommon', 10], ['Rare', 4], ['Very rare', 1]];
  const Quick = { build, autoMessage, newPage, zoneRect, inZone, pick, FREQUENCIES, STEPS, ROUTES };
  if (root.MF) root.MF.Quick = Quick;
  if (typeof module !== 'undefined' && module.exports) module.exports = Quick;
})(typeof window !== 'undefined' ? window : globalThis);
