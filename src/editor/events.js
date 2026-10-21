/* Event editor: pages, conditions, triggers and command lists. */
(function () {
  'use strict';
  const { h, clear, field, row } = UI;
  let EE_audioField;
  const DIRS = [['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up']];

  const speciesOpts = () => App.proj.monsters.map(m => [m.id, m.name]);
  const itemOpts = () => App.proj.items.map(i => [i.id, i.name]);
  const mapOpts = () => App.proj.mapInfos.map(i => [i.id, i.name]);
  const switchOpts = (none) => [[0, none || '(none)']].concat(App.proj.system.switches.map((s, i) => [i, String(i).padStart(3, '0') + ': ' + (s || '(unnamed)')]).slice(1));
  const nameOf = (list, id) => { const x = list.find(o => o.id === id); return x ? x.name : '??'; };

  function switchField(label, obj, key, none) {
    const wrap = h('div', { class: 'row' });
    const draw = () => {
      clear(wrap);
      wrap.append(field(label, obj, key, { type: 'select', number: true, options: switchOpts(none) }),
        h('button', { class: 'small', style: { marginBottom: '8px' }, title: 'Add a new named switch', onclick: async () => {
          const n = await UI.prompt('New switch', '', 'Switch name (e.g. "Beat Gym 1")');
          if (!n) return;
          App.proj.system.switches.push(n); obj[key] = App.proj.system.switches.length - 1; draw();
        } }, '+ Switch'));
    };
    draw();
    return wrap;
  }

  const audioField = (label, obj, key, kind, allowMusic) => UI.audioPicker(label, obj, key, kind, { alsoMusic: allowMusic });
  EE_audioField = audioField;

  const terms = () => MF.Config.withDefaults(App.proj.system).terms;
  const SPEED_OPTS = [['normal', 'Normal'], ['slow', 'Slow'], ['fast', 'Fast']];
  const targetName = t => !t || t === 'this' ? 'this event' : t === 'player' ? 'the player' : t === 'follower' ? 'the following monster' : '“' + t + '”';
  function targetField(c) {
    const m = App.map(); const names = m ? [...new Set(m.events.map(e => e.name))] : [];
    return field('Who', c, 'target', { type: 'select', width: '180px', options: [['this', 'This event'], ['player', 'The player'], ['follower', 'The following monster']].concat(names.map(n => [n, 'Event: ' + n])) });
  }

  const COMMANDS = {
    text: { label: 'Show text', make: () => ({ speaker: '', text: '' }),
      form: c => [field('Speaker (optional)', c, 'speaker'), field('Message', c, 'text', { type: 'textarea', rows: 2 })],
      sum: c => (c.speaker ? c.speaker + ': ' : '') + '“' + (c.text || '').slice(0, 60) + '”' },
    giveMonster: { label: 'Give monster', make: () => ({ speciesId: (App.proj.monsters[0] || {}).id || '', level: 5, nickname: '' }),
      form: c => [row(field('Monster', c, 'speciesId', { type: 'select', options: speciesOpts() }), field('Level', c, 'level', { type: 'number', min: 1, width: '70px' }), field('Nickname', c, 'nickname'))],
      sum: c => 'Give ' + nameOf(App.proj.monsters, c.speciesId) + ' Lv ' + c.level },
    giveItem: { label: 'Give / take item', make: () => ({ itemId: (App.proj.items[0] || {}).id || '', amount: 1 }),
      form: c => [row(field('Item', c, 'itemId', { type: 'select', options: itemOpts() }), field('Amount (negative takes)', c, 'amount', { type: 'number', width: '150px' })), field('Don\'t show the "obtained" message (use your own Show text instead)', c, 'silent', { type: 'checkbox' })],
      sum: c => (c.amount < 0 ? 'Take ' : 'Give ') + Math.abs(c.amount) + '× ' + nameOf(App.proj.items, c.itemId) },
    giveMoney: { label: 'Give / take money', make: () => ({ amount: 100 }),
      form: c => [field('Amount (negative takes)', c, 'amount', { type: 'number' }), field('Don\'t show the money message', c, 'silent', { type: 'checkbox' })], sum: c => (c.amount < 0 ? 'Take ' : 'Give ') + Math.abs(c.amount) + ' money' },
    openScreen: { label: 'Open a screen (bag, storage, wardrobe…)', make: () => ({ screen: 'wardrobe' }),
      form: c => [field('Screen', c, 'screen', { type: 'select', options: [['wardrobe', 'Wardrobe (change clothes)'], ['decorate', 'Decorate (place furniture)'], ['storage', 'Monster storage'], ['party', 'Monsters'], ['bag', 'Bag'], ['dex', MF.Config.word(terms(), '{dexLong}')], ['save', 'Save']] }),
        h('div', { class: 'muted' }, 'Wardrobe and Decorate only open when that feature is turned on in Database → Menus & screens. Decorate only works on maps players can decorate.')],
      sum: c => 'Open screen: ' + ({ wardrobe: 'Wardrobe', decorate: 'Decorate', storage: 'Storage', party: 'Monsters', bag: 'Bag', dex: MF.Config.word(terms(), '{dex}'), save: 'Save' }[c.screen] || c.screen) },
    heal: { label: 'Heal party', make: () => ({}), form: () => [h('div', { class: 'muted' }, 'Restores HP, ' + terms().pp + ' and status for the whole party.')], sum: () => 'Heal party' },
    setSwitch: { label: 'Set switch (on / off)', make: () => ({ switchId: 1, value: true }),
      form: c => { const o = { v: c.value === 'toggle' ? 'toggle' : c.value ? 'on' : 'off' }; return [row(switchField('Switch', c, 'switchId'), field('Set it', o, 'v', { type: 'select', width: '160px', options: [['on', 'ON'], ['off', 'OFF'], ['toggle', 'Flip (ON ↔ OFF)']], onChange: v => { c.value = v === 'toggle' ? 'toggle' : v === 'on'; } }))]; },
      sum: c => 'Switch ' + (App.proj.system.switches[c.switchId] || '#' + c.switchId) + ' = ' + (c.value === 'toggle' ? 'flip' : c.value ? 'ON' : 'OFF') },
    selfSwitch: { label: 'Set self switch', make: () => ({ value: true }),
      form: c => [field('Self switch ON (used for one-off events like item pickups and trainers)', c, 'value', { type: 'checkbox' })],
      sum: c => 'Self switch = ' + (c.value ? 'ON' : 'OFF') },
    transfer: { label: 'Transfer player', make: () => ({ mapId: App.mapId, x: 0, y: 0, dir: 'down', sound: false, fade: 'black' }),
      form: c => [row(field('Map', c, 'mapId', { type: 'select', options: mapOpts() }), field('X', c, 'x', { type: 'number', width: '60px' }), field('Y', c, 'y', { type: 'number', width: '60px' }), field('Face', c, 'dir', { type: 'select', options: [['keep', 'Keep']].concat(DIRS), width: '90px' })),
        row(field('Fade', c, 'fade', { type: 'select', options: [['black', 'Fade to black'], ['none', 'Instant']], width: '150px' }), field('Play the door sound', c, 'sound', { type: 'checkbox' }))],
      sum: c => 'Transfer to ' + nameOf(App.proj.mapInfos, c.mapId) + ' (' + c.x + ',' + c.y + ')' },
    choice: { label: 'Yes / No choice', make: () => ({ speaker: '', text: 'Do you want to?', yes: 'Yes', no: 'No', cancelIsNo: true, yesCmds: [], noCmds: [] }),
      form: (c, redraw) => {
        c.yesCmds = c.yesCmds || []; c.noCmds = c.noCmds || [];
        return [row(field('Speaker (optional)', c, 'speaker', { width: '160px' }), field('Question', c, 'text')),
          row(field('First answer', c, 'yes', { width: '130px' }), field('Second answer', c, 'no', { width: '130px' }), field('Pressing cancel picks the second answer', c, 'cancelIsNo', { type: 'checkbox' })),
          h('div', { class: 'branch' }, h('div', { class: 'branch-head yes' }, 'If the player picks “' + (c.yes || 'Yes') + '”'), EE.cmdList(c.yesCmds, redraw, 1)),
          h('div', { class: 'branch' }, h('div', { class: 'branch-head no' }, 'If the player picks “' + (c.no || 'No') + '”'), EE.cmdList(c.noCmds, redraw, 1))];
      },
      sum: c => 'Choice: “' + (c.text || '').slice(0, 40) + '” ' + (c.yes || 'Yes') + ' (' + (c.yesCmds || []).length + ') / ' + (c.no || 'No') + ' (' + (c.noCmds || []).length + ')' },
    shop: { label: 'Open shop', make: () => ({ greeting: 'Welcome! What can I do for you?', farewell: 'Please come again!', goods: App.proj.items.filter(i => i.kind !== 'key' && i.price > 0).slice(0, 3).map(i => ({ itemId: i.id, price: null })), sell: true, sellRate: 50 }),
      form: c => [row(field('Greeting', c, 'greeting'), field('Goodbye message', c, 'farewell')),
        h('div', { class: 'field' }, h('span', null, 'Items for sale'), QuickEvent.goodsTable(c)),
        row(field('Player can sell items', c, 'sell', { type: 'checkbox' }), field('Sell price (% of item price)', c, 'sellRate', { type: 'number', min: 0, max: 100, width: '190px' }))],
      sum: c => 'Shop: ' + (c.goods || []).map(g => nameOf(App.proj.items, g.itemId)).join(', ') + (c.sell ? ' (buys items too)' : '') },
    playMusic: { label: 'Play music', make: () => ({ file: '', volume: 100 }),
      form: c => [row(audioField('Music (leave empty to stop the music)', c, 'file', 'music'), field('Volume %', c, 'volume', { type: 'number', min: 0, max: 100, width: '90px' })),
        h('div', { class: 'muted' }, 'Keeps playing until another Play music command, a map with its own music, or a battle. To play a short jingle once, use Play sound and choose a file from music.')],
      sum: c => c.file ? 'Play music ' + c.file.split('/').pop() : 'Stop music' },
    playSound: { label: 'Play sound', make: () => ({ file: (App.proj.system.audio && App.proj.system.audio.sfx && App.proj.system.audio.sfx.confirm) || '', volume: 100, wait: false }),
      form: c => [row(audioField('Sound', c, 'file', 'sounds', true), field('Volume %', c, 'volume', { type: 'number', min: 0, max: 100, width: '90px' })),
        field('Wait for it to finish (jingles: the music pauses while it plays)', c, 'wait', { type: 'checkbox' })],
      sum: c => 'Play sound ' + (c.file || '(none)').split('/').pop() },
    trainerBattle: { label: 'Trainer battle', make: () => ({ name: 'Trainer', active: 0, party: [{ speciesId: (App.proj.monsters[0] || {}).id || '', level: 5 }], reward: 100, winText: '', loseText: '', battleback: '', continueOnLoss: false }),
      form: c => {
        const partyBox = h('div');
        const drawParty = () => {
          clear(partyBox);
          c.party.forEach((p, i) => {
            const sel = h('select', null, speciesOpts().map(([id, n]) => h('option', { value: id, selected: id === p.speciesId }, n)));
            sel.addEventListener('change', () => { p.speciesId = sel.value; });
            const lv = h('input', { type: 'number', value: p.level, min: 1 }); lv.addEventListener('input', () => { p.level = +lv.value; });
            partyBox.appendChild(h('div', { class: 'party-row' }, h('span', { class: 'muted' }, (i + 1) + '.'), sel, h('span', { class: 'muted' }, 'Lv'), lv,
              h('button', { class: 'icon-btn', onclick: () => { c.party.splice(i, 1); drawParty(); } }, '✕')));
          });
          if (c.party.length < App.proj.system.battle.maxParty) partyBox.appendChild(h('button', { class: 'small', onclick: () => { c.party.push({ speciesId: (App.proj.monsters[0] || {}).id, level: 5 }); drawParty(); } }, '+ Add monster'));
        };
        drawParty();
        return [row(field('Trainer name', c, 'name'), field('Active per side (0 = default)', c, 'active', { type: 'number', min: 0, max: 6, width: '170px', help: '1 = singles, 2 = doubles, 3 = triples. 0 uses Database → System → Trainer battle size.' }), field('Prize money', c, 'reward', { type: 'number', width: '100px' })),
          h('div', { class: 'field' }, h('span', null, 'Party'), partyBox),
          row(field('Defeat line (when you win)', c, 'winText'), field('Victory line (when you lose)', c, 'loseText')),
          row(UI.assetPicker('Battle background override', c, 'battleback', 'battlebacks'), audioField('Battle music override (empty = the usual trainer battle music)', c, 'bgm', 'music')),
          field('Story battle: continue the event if the player loses (no blackout)', c, 'continueOnLoss', { type: 'checkbox' })];
      },
      sum: c => 'Battle ' + c.name + ' (' + c.party.length + ' monster' + (c.party.length === 1 ? '' : 's') + (c.active > 1 ? ', ' + c.active + 'v' + c.active : '') + ')' },
    wildBattle: { label: 'Wild battle (scripted)', make: () => ({ speciesId: (App.proj.monsters[0] || {}).id || '', level: 5, canRun: true, canCapture: true }),
      form: c => [row(field('Monster', c, 'speciesId', { type: 'select', options: speciesOpts() }), field('Level', c, 'level', { type: 'number', width: '70px' })),
        row(field('Can run', c, 'canRun', { type: 'checkbox' }), field('Can capture', c, 'canCapture', { type: 'checkbox' }))],
      sum: c => 'Wild battle: ' + nameOf(App.proj.monsters, c.speciesId) + ' Lv ' + c.level },
    moveRoute: { label: 'Cut scene: move a character', make: () => ({ target: 'this', steps: ['down', 'down'], speed: 'normal', wait: true, through: false }),
      form: c => [row(targetField(c), field('Speed', c, 'speed', { type: 'select', options: SPEED_OPTS, width: '120px' }), field('Wait until finished', c, 'wait', { type: 'checkbox' }), field('Walk through anything', c, 'through', { type: 'checkbox' })),
        h('div', { class: 'field' }, h('span', null, 'Steps'), EE.routeEditor(c, 'steps', true))],
      sum: c => 'Move ' + targetName(c.target) + ': ' + (c.steps || []).length + ' steps' + (c.wait === false ? ' (don\'t wait)' : '') },
    balloon: { label: 'Cut scene: speech bubble icon', make: () => ({ target: 'this', icon: '!' }),
      form: c => [row(targetField(c), field('Icon', c, 'icon', { type: 'select', width: '150px', options: [['!', '! Surprise'], ['?', '? Question'], ['♪', '♪ Music'], ['♥', '♥ Love'], ['…', '… Silence'], ['✶', '✶ Idea'], ['💢', '💢 Angry'], ['zz', 'zz Sleep']] }))],
      sum: c => targetName(c.target) + ' shows ' + c.icon },
    camera: { label: 'Cut scene: move the camera', make: () => ({ mode: 'pan', x: 0, y: 0, frames: 60 }),
      form: c => [row(field('Camera', c, 'mode', { type: 'select', options: [['pan', 'Pan to a square'], ['player', 'Back to the player']], width: '170px' }), field('X', c, 'x', { type: 'number', width: '60px' }), field('Y', c, 'y', { type: 'number', width: '60px' }), field('Frames (60 = 1 second)', c, 'frames', { type: 'number', min: 1, width: '160px' })),
        h('div', { class: 'muted' }, 'The camera stays where it was moved until "Back to the player" or until the player changes map.')],
      sum: c => c.mode === 'player' ? 'Camera back to the player' : 'Camera to (' + c.x + ',' + c.y + ')' },
    screen: { label: 'Cut scene: screen effect', make: () => ({ effect: 'fadeOut', colour: 'black', frames: 30, power: 4, tint: 'none' }),
      form: c => [row(field('Effect', c, 'effect', { type: 'select', width: '170px', options: [['fadeOut', 'Fade out'], ['fadeIn', 'Fade back in'], ['flash', 'Flash'], ['shake', 'Shake'], ['tint', 'Tint (colour the screen)']] }),
        field('Colour (fade, flash)', c, 'colour', { type: 'select', width: '130px', options: [['black', 'Black'], ['white', 'White'], ['red', 'Red (flash)'], ['yellow', 'Yellow (flash)']] }),
        field('Tint', c, 'tint', { type: 'select', width: '120px', options: [['none', 'None'], ['dawn', 'Dawn'], ['dusk', 'Dusk'], ['night', 'Night'], ['sepia', 'Sepia (memory)'], ['grey', 'Grey']] }),
        field('Shake strength', c, 'power', { type: 'number', min: 1, max: 16, width: '110px' }), field('Frames', c, 'frames', { type: 'number', min: 1, width: '80px' }))],
      sum: c => ({ fadeOut: 'Fade out', fadeIn: 'Fade in', flash: 'Flash', shake: 'Shake screen', tint: 'Tint: ' + c.tint }[c.effect] || c.effect) },
    picture: { label: 'Cut scene: show / hide a picture', make: () => ({ action: 'show', slot: 1, file: '', position: 'centre', x: 0, y: 0, opacity: 100, frames: 20 }),
      form: c => [row(field('Action', c, 'action', { type: 'select', options: [['show', 'Show'], ['hide', 'Hide']], width: '100px' }), field('Picture number (1–5; higher shows on top)', c, 'slot', { type: 'number', min: 1, max: 5, width: '230px' }), field('Fade frames', c, 'frames', { type: 'number', min: 0, width: '100px' })),
        UI.assetPicker('Picture', c, 'file', 'pictures'),
        row(field('Position', c, 'position', { type: 'select', options: [['centre', 'Centre'], ['fill', 'Fill the screen'], ['xy', 'At X, Y (pixels)']], width: '150px' }), field('X', c, 'x', { type: 'number', width: '70px' }), field('Y', c, 'y', { type: 'number', width: '70px' }), field('Opacity %', c, 'opacity', { type: 'number', min: 0, max: 100, width: '90px' }))],
      sum: c => (c.action === 'hide' ? 'Hide picture ' : 'Show picture ') + c.slot + (c.action === 'hide' ? '' : ': ' + (c.file || '').split('/').pop()) },
    letterbox: { label: 'Cut scene: black bars on / off', make: () => ({ on: true }), form: c => [field('Show the black cinema bars at the top and bottom', c, 'on', { type: 'checkbox' })], sum: c => 'Black bars ' + (c.on ? 'on' : 'off') },
    wait: { label: 'Wait', make: () => ({ frames: 30 }), form: c => [field('Frames (60 = 1 second)', c, 'frames', { type: 'number' })], sum: c => 'Wait ' + c.frames + ' frames' },
    erase: { label: 'Erase event (until map reload)', make: () => ({}), form: () => [h('div', { class: 'muted' }, 'Hides this event until the player leaves the map.')], sum: () => 'Erase event' }
  };

  const EE = window.EventEditor = {
    COMMANDS,
    newPage() { return { condition: { switchId: 0, selfSwitch: false }, sprite: '', dir: 'down', trigger: 'action', move: 'fixed', through: false, sightRange: 0, commands: [] }; },
    summary(c) { const d = COMMANDS[c.cmd]; return d ? d.sum(c) : c.cmd; },
    audioField: (...a) => EE_audioField(...a),

    // Builds a list of movement steps: arrows move, "face" buttons turn, ⏸ waits. Presets fill common patterns.
    routeEditor(obj, key, short) {
      obj[key] = obj[key] || [];
      const wrap = h('div', { class: 'route-ed' });
      const ICON = { up: '↑', down: '↓', left: '←', right: '→', 'face-up': '⇡', 'face-down': '⇣', 'face-left': '⇠', 'face-right': '⇢', wait: 'wait' };
      const TITLE = { up: 'Step up', down: 'Step down', left: 'Step left', right: 'Step right', 'face-up': 'Turn to face up', 'face-down': 'Turn to face down', 'face-left': 'Turn to face left', 'face-right': 'Turn to face right', wait: 'Wait a moment' };
      const draw = () => {
        clear(wrap);
        const list = obj[key];
        const chips = h('div', { class: 'route-chips' }, list.length ? list.map((st, i) => h('button', { class: 'route-chip' + (st.startsWith('face') ? ' turn' : st === 'wait' ? ' wait' : ''), title: TITLE[st] + ' (click to remove)', onclick: () => { list.splice(i, 1); App.markDirty(); draw(); } }, ICON[st] || st)) : h('span', { class: 'muted' }, 'No steps yet.'));
        const add = st => h('button', { class: 'small', title: TITLE[st], onclick: () => { list.push(st); App.markDirty(); draw(); } }, ICON[st]);
        const presetSel = h('select', null, h('option', { value: '' }, 'Presets…'),
          [['lr', 'Back and forth: left ↔ right'], ['ud', 'Back and forth: up ↔ down'], ['sq', 'Walk around a square'], ['look', 'Stand and look around']].map(([v, t]) => h('option', { value: v }, t)));
        const n = { v: 3 };
        const nIn = h('input', { type: 'number', min: 1, max: 20, value: 3, class: 'route-n', title: 'How many squares the preset walks' });
        nIn.addEventListener('input', () => { n.v = +nIn.value || 1; });
        presetSel.addEventListener('change', () => {
          const R = MF.Quick.ROUTES, v = presetSel.value, k = Math.max(1, n.v | 0);
          const steps = v === 'lr' ? R.backAndForth('right', k) : v === 'ud' ? R.backAndForth('down', k) : v === 'sq' ? R.square(k, true) : v === 'look' ? R.lookAround() : null;
          if (steps) { obj[key] = steps; App.markDirty(); draw(); }
        });
        wrap.append(chips, h('div', { class: 'route-tools' }, ['up', 'down', 'left', 'right'].map(add), h('span', { class: 'sep' }), ['face-up', 'face-down', 'face-left', 'face-right'].map(add), add('wait'),
          h('button', { class: 'small', title: 'Remove the last step', disabled: !list.length, onclick: () => { list.pop(); App.markDirty(); draw(); } }, '⌫'),
          h('button', { class: 'small', disabled: !list.length, onclick: () => { list.length = 0; App.markDirty(); draw(); } }, 'Clear'),
          short ? null : h('span', { class: 'sep' }), short ? null : presetSel, short ? null : h('span', { class: 'muted' }, 'squares:'), short ? null : nIn));
      };
      draw();
      return wrap;
    },

    // An editable list of commands. Choices contain two of these (one per answer), so lists can nest.
    cmdList(cmds, draw, depth) {
      depth = depth || 0;
      const list = h('div', { class: 'cmd-list' + (depth ? ' nested' : '') });
      cmds.forEach((c, i) => {
        const def = COMMANDS[c.cmd];
        list.appendChild(h('div', { class: 'cmd' },
          h('div', { class: 'cmd-num' }, String(i + 1)),
          h('div', null, h('div', { class: 'cmd-title' }, def ? def.label : c.cmd), def ? def.form(c, draw) : h('div', { class: 'muted' }, 'Unknown command')),
          h('div', { class: 'cmd-tools' },
            h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => { [cmds[i - 1], cmds[i]] = [cmds[i], cmds[i - 1]]; draw(); } }, '↑'),
            h('button', { class: 'icon-btn', title: 'Move down', disabled: i === cmds.length - 1, onclick: () => { [cmds[i + 1], cmds[i]] = [cmds[i], cmds[i + 1]]; draw(); } }, '↓'),
            h('button', { class: 'icon-btn', title: 'Duplicate', onclick: () => { cmds.splice(i + 1, 0, JSON.parse(JSON.stringify(c))); draw(); } }, '⧉'),
            h('button', { class: 'icon-btn', title: 'Delete', onclick: () => { cmds.splice(i, 1); draw(); } }, '✕'))));
      });
      if (!cmds.length) list.appendChild(h('div', { class: 'muted', style: { padding: depth ? '8px' : '14px' } }, depth ? 'Nothing happens. Add a command below.' : 'No commands yet. Add one below.'));
      const addSel = h('select', null, Object.entries(COMMANDS).map(([k, d]) => h('option', { value: k }, d.label)));
      list.appendChild(h('div', { class: 'cmd-add' }, addSel, h('button', { class: depth ? 'small' : 'primary', onclick: () => { cmds.push(Object.assign({ cmd: addSel.value }, COMMANDS[addSel.value].make())); draw(); } }, '+ Add command')));
      return list;
    },

    async open(ev) {
      const work = JSON.parse(JSON.stringify(ev));
      let pageIdx = 0;
      const body = h('div');
      const draw = () => {
        clear(body);
        const tabs = h('div', { class: 'ev-pages' },
          work.pages.map((p, i) => h('button', { class: i === pageIdx ? 'active' : '', onclick: () => { pageIdx = i; draw(); } }, 'Page ' + (i + 1))),
          h('button', { class: 'small', onclick: () => { work.pages.push(EE.newPage()); pageIdx = work.pages.length - 1; draw(); } }, '+ New page'),
          h('button', { class: 'small', onclick: () => { work.pages.push(JSON.parse(JSON.stringify(work.pages[pageIdx]))); pageIdx = work.pages.length - 1; draw(); } }, 'Copy page'),
          h('button', { class: 'small danger', disabled: work.pages.length < 2, onclick: () => { work.pages.splice(pageIdx, 1); pageIdx = Math.max(0, pageIdx - 1); draw(); } }, 'Delete page'),
          h('span', { class: 'muted', style: { marginLeft: '8px', fontSize: '11px' } }, 'The highest-numbered page whose conditions are met is the one that runs.'));
        const p = work.pages[pageIdx];
        p.condition = p.condition || { switchId: 0, selfSwitch: false };
        if (p.move === 'route' && !p.route) p.route = { steps: [], repeat: true };

        const left = h('div', null,
          h('fieldset', { class: 'section' }, h('legend', null, 'Conditions'),
            switchField('Switch is ON', p.condition, 'switchId', '(no switch needed)'),
            switchField('Switch is OFF', p.condition, 'switchOffId', '(no switch needed)'),
            field('Self switch is ON', p.condition, 'selfSwitch', { type: 'checkbox' })),
          h('fieldset', { class: 'section' }, h('legend', null, 'Appearance'),
            UI.assetPicker('Sprite (3×4 character sheet)', p, 'sprite', 'characters', { preview: 'charFrame' }),
            field('Facing', p, 'dir', { type: 'select', options: DIRS })),
          h('fieldset', { class: 'section' }, h('legend', null, 'Behaviour'),
            field('Trigger', p, 'trigger', { type: 'select', options: [['action', 'Action button (talk / inspect)'], ['touch', 'Player touch (step on / bump)'], ['sight', 'Trainer sight (spots the player)'], ['auto', 'Autorun (runs when page activates)'], ['encounter', 'Monster encounter area (wild battles inside an area)']], onChange: () => { if (p.trigger === 'encounter' && !p.encounter) { p.encounter = { dx: 0, dy: 0, width: 3, height: 3, chance: 10, list: [], active: 0, onlyEncTiles: false, once: false, message: '' }; p.through = true; } draw(); } }),
            p.trigger === 'encounter' ? h('div', null,
              row(field('Area width', p.encounter, 'width', { type: 'number', min: 1 }), field('Area height', p.encounter, 'height', { type: 'number', min: 1 }), field('Chance per step (%)', p.encounter, 'chance', { type: 'number', min: 1, max: 100 })),
              h('div', { class: 'field' }, h('span', null, 'Monsters'), QuickEvent.encounterTable(p.encounter)),
              field('Only on encounter tiles', p.encounter, 'onlyEncTiles', { type: 'checkbox' })) : null,
            p.trigger === 'sight' ? field('Sight range (tiles in the facing direction)', p, 'sightRange', { type: 'number', min: 1, max: 12 }) : null,
            row(field('Movement', p, 'move', { type: 'select', options: [['fixed', 'Stand still'], ['random', 'Wander randomly'], ['turn', 'Turn randomly'], ['route', 'Walk a set route (repeats)']], onChange: () => { if (p.move === 'route' && !p.route) p.route = { steps: MF.Quick.ROUTES.backAndForth('right', 2), repeat: true }; draw(); } }),
              field('Speed', p, 'speed', { type: 'select', options: SPEED_OPTS, width: '100px' })),
            p.move === 'route' ? h('div', { class: 'field' }, h('span', null, 'Route'), EE.routeEditor(p.route, 'steps'), field('Repeat the route forever', p.route, 'repeat', { type: 'checkbox' })) : null,
            field('Walk-through (player can pass over it)', p, 'through', { type: 'checkbox' }),
            p.trigger === 'action' ? field('Only works from the front (player below, facing up), e.g. signs', p, 'frontOnly', { type: 'checkbox' }) : null));

        const list = EE.cmdList(p.commands, draw);
        body.append(row(field('Event name', work, 'name'), h('div', { class: 'field', style: { flex: '0 0 120px' } }, h('span', null, 'Position'), h('div', null, work.x + ', ' + work.y))),
          tabs, h('div', { class: 'ev-layout' }, left, h('div', null, h('div', { class: 'field' }, h('span', null, 'Commands (run top to bottom)')), list)));
      };
      App._suppressDirty = true;
      draw();
      const ok = await UI.modal({ title: 'Event — ' + ev.name, size: 'large', body, dismissable: false,
        buttons: [{ label: 'Cancel', value: false }, { label: 'OK', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      Object.assign(ev, work);
      // Hand-edited pages turn a quick event into a normal event, so a later quick edit can't overwrite them.
      if (ev.quick && window.QuickEvent && JSON.stringify(ev.pages) !== JSON.stringify(QuickEvent.build(ev.quick))) delete ev.quick;
      App.markDirty(); MapEditor.render(); App.renderInspector();
    }
  };
})();
