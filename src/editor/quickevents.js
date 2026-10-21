/* Quick events: ready-made events for common jobs (treasure chest, item on the ground, sign, monster encounter area).
 * The settings are kept on the event as ev.quick, so double-clicking the event reopens this window. */
(function () {
  'use strict';
  const { h, clear, field, row } = UI;

  const TYPES = {
    chest: { label: 'Treasure chest', icon: '▣', blurb: 'A closed chest the player can open once. It gives an item or money, then stays open.' },
    item: { label: 'Item on the ground', icon: '●', blurb: 'An item the player picks up. It disappears afterwards. Can be visible or hidden.' },
    sign: { label: 'Sign', icon: '▤', blurb: 'Shows a message when the player reads it. Use a sign post sprite or put it on a sign tile.' },
    encounter: { label: 'Monster encounter area', icon: '❖', blurb: 'Wild monsters appear while the player walks inside this area. Inside it, this list replaces the map\'s own encounter table.' },
    npc: { label: 'Person (NPC)', icon: '☺', blurb: 'Someone the player can talk to. They can just chat, give an item once, or battle the player, and can stand still, wander or walk a set route.' },
    lever: { label: 'Switch / lever', icon: '⏻', blurb: 'An on/off switch the player flips with the action button. It turns a game switch ON or OFF, so doors, bridges and people elsewhere can react (use “Switch is ON / OFF” in their page conditions).' },
    cutscene: { label: 'Cut scene', icon: '🎬', blurb: 'A scene that plays once: when the player steps into an area, or as soon as the map opens. It starts with black cinema bars; add moves, speech bubbles, camera pans and pictures in the full event editor.' },
    shop: { label: 'Shopkeeper', icon: '$', blurb: 'A shop the player talks to. Choose what it sells and whether the player can sell items back.' },
    exit: { label: 'Exit / door', icon: '⇲', blurb: 'Takes the player to another place: a doorway, stairs or cave entrance. To move between maps by walking off the edge instead, use Map edges in the map properties (right-hand panel).' }
  };
  const SPRITES = { chest: 'characters/chest.png', chestOpen: 'characters/chest-open.png', ball: 'characters/ball.png', signPost: 'characters/sign-post.png', shopkeeper: 'characters/shopkeeper.png', villager: 'characters/villager.png', leverOff: 'characters/lever-off.png', leverOn: 'characters/lever-on.png' };

  const ctx = () => ({ items: App.proj.items, currency: App.proj.system.currency });
  const autoMessage = q => MF.Quick.autoMessage(q, ctx());

  function defaults(type) {
    const firstItem = (App.proj.items.find(i => i.kind === 'heal') || App.proj.items[0] || {}).id || '';
    if (type === 'chest') return { type, contents: 'item', itemId: firstItem, amount: 1, money: 100, message: '', emptyMessage: 'The chest is empty.', sprite: SPRITES.chest, openSprite: SPRITES.chestOpen };
    if (type === 'item') return { type, itemId: firstItem, amount: 1, message: '', look: 'visible', sprite: SPRITES.ball };
    if (type === 'encounter') {
      const mons = App.proj.monsters;
      const list = mons.slice(0, Math.min(2, mons.length)).map((m, i) => ({ speciesId: m.id, minLevel: 3, maxLevel: 5, weight: i ? 10 : 25 }));
      return { type, dx: 0, dy: 0, width: 1, height: 1, chance: 10, list, active: 0, onlyEncTiles: false, once: false, message: '' };
    }
    if (type === 'npc') {
      const mons = App.proj.monsters;
      return { type, role: 'talk', sprite: SPRITES.villager, dir: 'down', speaker: '', move: 'fixed', steps: MF.Quick.ROUTES.backAndForth('right', 2), speed: 'normal', text: 'Hello! Lovely day, isn\'t it?',
        itemId: (App.proj.items.find(i => i.kind === 'heal') || App.proj.items[0] || {}).id || '', amount: 1, afterText: 'Take good care of it!',
        trainerName: 'Trainer', party: mons.length ? [{ speciesId: mons[0].id, level: 5 }] : [], reward: 100, sight: 4, active: 0, winText: 'You\'re strong!', loseText: 'Better luck next time!' };
    }
    if (type === 'lever') return { type, switchId: 1, offSprite: SPRITES.leverOff, onSprite: SPRITES.leverOn, oneWay: false, onText: '', offText: '', doneText: 'It won\'t budge.', sound: (App.proj.system.audio && App.proj.system.audio.sfx && App.proj.system.audio.sfx.confirm) || '' };
    if (type === 'cutscene') return { type, start: 'step', width: 1, height: 1, text: 'Something is about to happen…' };
    if (type === 'shop') {
      const goods = App.proj.items.filter(i => i.kind !== 'key' && i.price > 0).slice(0, 4).map(i => ({ itemId: i.id, price: null }));
      return { type, sprite: SPRITES.shopkeeper, dir: 'down', greeting: 'Welcome! What can I do for you?', farewell: 'Please come again!', goods, sell: true, sellRate: 50 };
    }
    if (type === 'exit') {
      const other = App.proj.mapInfos.find(i => i.id !== App.mapId) || App.proj.mapInfos[0];
      return { type, how: 'step', mapId: other ? other.id : App.mapId, x: 0, y: 0, dir: 'keep', sound: true, fade: true, sprite: '' };
    }
    return { type, title: '', text: 'Write the sign\'s message here.', look: 'post', sprite: SPRITES.signPost, frontOnly: true };
  }

  // Turn quick-event settings into normal event pages (shared with the sample generator).
  const build = q => MF.Quick.build(q, ctx());

  // Make sure the sprites a quick event needs are in the project, copying them from the asset library if not.
  async function ensureSprites(rels) {
    const missing = rels.filter(r => r && !(App.assets.characters || []).includes(r));
    if (!missing.length) return;
    try {
      const r = await window.api.libraryAdd(App.proj.path, missing, false, App.proj.tilesets.map(t => t.id));
      App.proj.credits = Object.assign(App.proj.credits || {}, r.credits || {});
      await UI.refreshAssets('characters');
      if (r.copied.length) UI.toast('Added ' + r.copied.map(f => f.split('/').pop()).join(', ') + ' from the asset library');
    } catch (e) { /* library missing: the sprite pickers will show (missing) */ }
  }

  function form(q, redraw) {
    const items = App.proj.items.map(i => [i.id, i.name]);
    const preview = h('div', { class: 'qe-preview muted' });
    const updatePreview = () => { preview.textContent = (q.type === 'chest' || q.type === 'item') ? 'Message: “' + (q.message || autoMessage(q)) + '”' : ''; };
    const ch = () => { updatePreview(); };
    let body;
    if (q.type === 'chest') {
      body = [
        row(field('Contains', q, 'contents', { type: 'select', options: [['item', 'An item'], ['money', 'Money']], onChange: redraw }),
          q.contents === 'money' ? field('Amount of ' + (App.proj.system.currency || 'money'), q, 'money', { type: 'number', min: 1, onChange: ch })
            : field('Item', q, 'itemId', { type: 'select', options: items, onChange: ch }),
          q.contents === 'money' ? null : field('How many', q, 'amount', { type: 'number', min: 1, max: 99, width: '90px', onChange: ch })),
        field('Message when opened (leave blank for the automatic one)', q, 'message', { placeholder: autoMessage(q), onChange: ch }),
        field('Message when it\'s already empty (leave blank for none)', q, 'emptyMessage'),
        row(UI.assetPicker('Closed chest sprite', q, 'sprite', 'characters', { preview: 'charFrame' }), UI.assetPicker('Open chest sprite', q, 'openSprite', 'characters', { preview: 'charFrame' }))
      ];
    } else if (q.type === 'item') {
      body = [
        row(field('Item', q, 'itemId', { type: 'select', options: items, onChange: ch }), field('How many', q, 'amount', { type: 'number', min: 1, max: 99, width: '90px', onChange: ch })),
        field('Message (leave blank for the automatic one)', q, 'message', { placeholder: autoMessage(q), onChange: ch }),
        field('Look', q, 'look', { type: 'select', options: [['visible', 'Visible: shows a sprite on the ground'], ['hidden', 'Hidden: invisible, found by pressing Z on the spot']], onChange: redraw }),
        q.look === 'hidden' ? h('p', { class: 'muted' }, 'Hidden items have no sprite. The player finds them by facing the square and pressing Z.') : UI.assetPicker('Sprite', q, 'sprite', 'characters', { preview: 'charFrame' })
      ];
    } else if (q.type === 'encounter') {
      body = [
        row(field('Width (squares)', q, 'width', { type: 'number', min: 1, max: 64, width: '120px', onChange: () => MapEditor.render() }),
          field('Height (squares)', q, 'height', { type: 'number', min: 1, max: 64, width: '120px', onChange: () => MapEditor.render() }),
          h('div', { class: 'field muted', style: { alignSelf: 'center' } }, 'Covers ' + (q.width * q.height) + ' square' + (q.width * q.height === 1 ? '' : 's') + ' starting at its top-left corner.')),
        row(field('Chance of a battle per step (%)', q, 'chance', { type: 'number', min: 1, max: 100, width: '220px', onChange: redraw }),
          h('div', { class: 'field muted', style: { alignSelf: 'center' } }, q.chance >= 100 ? 'A battle starts on every step.' : 'About one battle every ' + Math.max(1, Math.round(100 / Math.max(1, q.chance))) + ' steps.')),
        h('div', { class: 'field' }, h('span', null, 'Monsters that can appear'), QE.encounterTable(q)),
        row(field('Monsters at once (0 = the game\'s default)', q, 'active', { type: 'number', min: 0, max: 4, width: '240px' }),
          field('Message before the battle (optional)', q, 'message', { placeholder: 'e.g. Something is rustling in the grass…' })),
        field('Only on encounter tiles (tall grass, cave floor) inside the area', q, 'onlyEncTiles', { type: 'checkbox' }),
        field('Happens only once (an ambush): the area switches off after the first battle', q, 'once', { type: 'checkbox' })
      ];
    } else if (q.type === 'npc') {
      const party = h('div');
      const drawParty = () => {
        clear(party);
        q.party.forEach((p, i) => {
          const sel = h('select', null, App.proj.monsters.map(m => h('option', { value: m.id, selected: m.id === p.speciesId }, m.name)));
          sel.addEventListener('change', () => { p.speciesId = sel.value; });
          const lv = h('input', { type: 'number', value: p.level, min: 1, style: { width: '60px' } }); lv.addEventListener('input', () => { p.level = +lv.value; });
          party.appendChild(h('div', { class: 'party-row' }, sel, h('span', { class: 'muted' }, 'Lv'), lv, h('button', { class: 'icon-btn', onclick: () => { q.party.splice(i, 1); drawParty(); } }, '✕')));
        });
        party.appendChild(h('button', { class: 'small', disabled: !App.proj.monsters.length, onclick: () => { q.party.push({ speciesId: App.proj.monsters[0].id, level: 5 }); drawParty(); } }, '+ Add monster'));
      };
      drawParty();
      const roleBox = q.role === 'gift' ? [row(field('Item to give', q, 'itemId', { type: 'select', options: items }), field('How many', q, 'amount', { type: 'number', min: 1, max: 99, width: '90px' })),
          field('What they say before giving it', q, 'text', { type: 'textarea', rows: 2 }), field('What they say afterwards (when spoken to again)', q, 'afterText')]
        : q.role === 'trainer' ? [row(field('Trainer name (shown in battle)', q, 'trainerName'), field('Prize money', q, 'reward', { type: 'number', min: 0, width: '110px' }), field('Monsters out at once (0 = default)', q, 'active', { type: 'number', min: 0, max: 4, width: '190px' })),
          field('Sight range: how many squares they can see (0 = only battles when spoken to)', q, 'sight', { type: 'number', min: 0, max: 12 }),
          h('div', { class: 'field' }, h('span', null, 'Their monsters'), party),
          field('What they say before the battle', q, 'text', { type: 'textarea', rows: 2 }),
          row(field('When they lose', q, 'winText'), field('When they win', q, 'loseText')), field('What they say after the battle (when spoken to again)', q, 'afterText')]
        : [field('What they say', q, 'text', { type: 'textarea', rows: 3 })];
      body = [
        row(UI.assetPicker('Sprite', q, 'sprite', 'characters', { preview: 'charFrame' }), h('div', null, field('Name (shown on their messages, optional)', q, 'speaker'), field('Facing', q, 'dir', { type: 'select', options: [['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up']] }))),
        row(field('Movement', q, 'move', { type: 'select', options: [['fixed', 'Stand still'], ['random', 'Wander randomly'], ['turn', 'Look around randomly'], ['route', 'Walk a set route (repeats)']], onChange: redraw }), field('Speed', q, 'speed', { type: 'select', options: [['normal', 'Normal'], ['slow', 'Slow'], ['fast', 'Fast']], width: '110px' })),
        q.move === 'route' ? h('div', { class: 'field' }, h('span', null, 'Route (from where they stand)'), EventEditor.routeEditor(q, 'steps')) : null,
        field('What they do', q, 'role', { type: 'select', options: [['talk', 'Talk'], ['gift', 'Give an item (once)'], ['trainer', 'Battle the player (once)']], onChange: redraw }),
        roleBox
      ];
    } else if (q.type === 'lever') {
      const sw = { v: q.switchId };
      const swSel = () => App.proj.system.switches.map((n, i) => [i, String(i).padStart(3, '0') + ': ' + (n || '(unnamed)')]).slice(1);
      body = [
        row(field('Game switch it controls', q, 'switchId', { type: 'select', number: true, options: swSel() }),
          h('button', { class: 'small', style: { marginBottom: '8px' }, onclick: async () => { const n = await UI.prompt('New switch', '', 'Switch name (e.g. "Bridge lowered")'); if (!n) return; App.proj.system.switches.push(n); q.switchId = App.proj.system.switches.length - 1; redraw(); } }, '+ Switch')),
        row(UI.assetPicker('Sprite when OFF', q, 'offSprite', 'characters', { preview: 'charFrame' }), UI.assetPicker('Sprite when ON', q, 'onSprite', 'characters', { preview: 'charFrame' })),
        field('One way: once it\'s ON it can\'t be turned off again', q, 'oneWay', { type: 'checkbox', onChange: redraw }),
        row(field('Message when turned ON (optional)', q, 'onText'), q.oneWay ? field('Message when used again', q, 'doneText') : field('Message when turned OFF (optional)', q, 'offText')),
        UI.audioPicker('Sound', q, 'sound', 'sounds'),
        h('p', { class: 'muted' }, 'Other events react through their page conditions: give a page “Switch is ON” (for example, a bridge appears) or “Switch is OFF”.')
      ];
      void sw;
    } else if (q.type === 'cutscene') {
      body = [
        field('Starts', q, 'start', { type: 'select', options: [['step', 'When the player steps into the area'], ['map', 'As soon as the player arrives on this map']], onChange: redraw }),
        q.start === 'step' ? row(field('Area width (squares)', q, 'width', { type: 'number', min: 1, max: 64, width: '160px' }), field('Area height (squares)', q, 'height', { type: 'number', min: 1, max: 64, width: '160px' }),
          h('div', { class: 'field muted', style: { alignSelf: 'center' } }, 'The area starts at this square and goes right and down.')) : null,
        field('First line of the scene (you can change it later)', q, 'text', { type: 'textarea', rows: 2 }),
        h('p', { class: 'muted' }, 'After creating it, click “Open full event editor” (or double-click it and choose Full event editor) to add cut-scene commands: move a character, speech bubble icon, move the camera, screen effects, pictures, music and text. It plays once, then switches itself off.')
      ];
    } else if (q.type === 'shop') {
      body = [
        row(UI.assetPicker('Shopkeeper sprite', q, 'sprite', 'characters', { preview: 'charFrame' }), field('Facing', q, 'dir', { type: 'select', options: [['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up']], width: '110px' })),
        row(field('Greeting', q, 'greeting'), field('Goodbye message', q, 'farewell')),
        h('div', { class: 'field' }, h('span', null, 'Items for sale'), QE.goodsTable(q)),
        row(field('Player can sell items here', q, 'sell', { type: 'checkbox', onChange: redraw }),
          q.sell ? field('Sell price (% of the item\'s price)', q, 'sellRate', { type: 'number', min: 0, max: 100, width: '220px' }) : null),
        h('p', { class: 'muted' }, 'Prices come from Database → Items unless you set a price here. Key items and items with no price can\'t be sold.')
      ];
    } else if (q.type === 'exit') {
      const maps = App.proj.mapInfos.map(i => [i.id, i.name]);
      const dest = App.proj.maps[q.mapId];
      body = [
        field('How it works', q, 'how', { type: 'select', options: [['step', 'Walk onto the square (doorway, stairs, cave entrance)'], ['door', 'Face it and press the action button (a door you open)']], onChange: redraw }),
        row(field('Go to map', q, 'mapId', { type: 'select', options: maps, onChange: redraw }), field('X', q, 'x', { type: 'number', min: 0, width: '80px' }), field('Y', q, 'y', { type: 'number', min: 0, width: '80px' }),
          field('Facing', q, 'dir', { type: 'select', options: [['keep', 'Keep facing'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up']], width: '130px' })),
        dest ? h('p', { class: 'muted', style: { marginTop: 0 } }, dest.name + ' is ' + dest.width + '×' + dest.height + ' squares (X 0–' + (dest.width - 1) + ', Y 0–' + (dest.height - 1) + '). Land the player one square away from that map\'s own exit so they don\'t bounce straight back.') : null,
        row(field('Play the door sound', q, 'sound', { type: 'checkbox' }), field('Fade to black', q, 'fade', { type: 'checkbox' })),
        q.how === 'door' ? UI.assetPicker('Sprite (optional, e.g. a door; leave empty to use a door tile you painted)', q, 'sprite', 'characters', { preview: 'charFrame' }) : null
      ];
    } else {
      body = [
        field('Title (optional, shown above the message, e.g. "Route 1")', q, 'title'),
        field('Message (leave an empty line between paragraphs to show them as separate boxes)', q, 'text', { type: 'textarea', rows: 5 }),
        field('Look', q, 'look', { type: 'select', options: [['post', 'Sign post sprite'], ['tile', 'Invisible: put this event on a sign tile you painted on the map']], onChange: redraw }),
        q.look === 'post' ? UI.assetPicker('Sprite', q, 'sprite', 'characters', { preview: 'charFrame' }) : null,
        field('Only readable from the front (player stands below it, facing up)', q, 'frontOnly', { type: 'checkbox' })
      ];
    }
    updatePreview();
    return h('div', null, h('p', { class: 'muted', style: { marginTop: 0 } }, TYPES[q.type].blurb), body, preview);
  }

  const QE = window.QuickEvent = {
    TYPES, build, autoMessage,
    // Create a new quick event of `type` at x,y, or edit an existing one (ev.quick).
    // area (optional, encounter areas only): {x, y, w, h} in map squares, chosen by dragging in Events mode.
    async open(type, x, y, ev, area) {
      const t = ev ? ev.quick.type : type;
      if (!App.proj.items.length && (t === 'chest' || t === 'item')) return UI.alert('No items yet', 'Add some items in Database → Items first.');
      if (!App.proj.monsters.length && t === 'encounter') return UI.alert('No monsters yet', 'Add some monsters in Database → Monsters first.');
      const q = Object.assign(defaults(t), ev ? JSON.parse(JSON.stringify(ev.quick)) : {});
      if (!ev && area && t === 'encounter') Object.assign(q, { dx: area.x - x, dy: area.y - y, width: area.w, height: area.h });
      if (t === 'shop' && !App.proj.items.length) return UI.alert('No items yet', 'Add some items in Database → Items first.');
      if (t === 'npc' && q.role === 'trainer' && !App.proj.monsters.length) return UI.alert('No monsters yet', 'Add some monsters in Database → Monsters first.');
      let addedSwitch = false;
      if (t === 'lever' && !ev) { const sw = App.proj.system.switches; sw.push('Lever ' + sw.length); q.switchId = sw.length - 1; addedSwitch = true; }
      if (!['encounter', 'exit', 'cutscene'].includes(t)) await ensureSprites(q.type === 'chest' ? [q.sprite, q.openSprite] : q.type === 'lever' ? [q.offSprite, q.onSprite] : [q.sprite]);
      const name = { v: ev ? ev.name : TYPES[q.type].label };
      const box = h('div');
      const redraw = () => { clear(box); box.append(field('Event name', name, 'v'), form(q, redraw)); };
      App._suppressDirty = true;
      redraw();
      const buttons = [{ label: 'Cancel', value: false }];
      if (ev) buttons.push({ label: 'Open full event editor', value: 'full' });
      if (!ev && q.type === 'cutscene') buttons.push({ label: 'Create and open full event editor', value: 'create-full' });
      buttons.push({ label: ev ? 'Save' : 'Create', primary: true, value: true });
      QE.preview = { ev, x, y, q };
      MapEditor.render();
      const res = await UI.modal({ title: (ev ? 'Edit ' : 'New ') + TYPES[q.type].label.toLowerCase(), body: box, buttons, size: q.type === 'encounter' || q.type === 'npc' ? 'large' : '' });
      QE.preview = null;
      App._suppressDirty = false;
      if (addedSwitch && (!res || q.switchId !== App.proj.system.switches.length - 1)) App.proj.system.switches.pop(); // not used after all
      if (res === 'full') return EventEditor.open(ev);
      if (res === 'create-full') { const made = await QE.finish(q, ev, name, x, y); return EventEditor.open(made); }
      if (!res) return null;
      if (q.type === 'item' && !q.itemId) return UI.toast('Choose an item first');
      if (q.type === 'shop') { q.goods = (q.goods || []).filter(g => g.itemId); if (!q.goods.length && !q.sell) return UI.alert('Nothing to sell', 'Add at least one item for sale, or let the player sell items here.'); }
      if (q.type === 'exit' && !App.proj.maps[q.mapId]) return UI.alert('Choose a map', 'Choose where the exit leads.');
      if (q.type === 'npc' && q.role === 'trainer' && !(q.party || []).length) return UI.alert('No monsters', 'Give the trainer at least one monster.');
      if (q.type === 'npc' && q.role === 'gift' && !q.itemId) return UI.alert('Choose an item', 'Choose the item they give.');
      if (q.type === 'encounter') { q.list = (q.list || []).filter(e => e.speciesId && e.weight > 0); q.width = Math.max(1, q.width | 0); q.height = Math.max(1, q.height | 0); if (!q.list.length) return UI.alert('No monsters in the list', 'Add at least one monster with a frequency above zero.'); }
      return QE.finish(q, ev, name, x, y);
    },
    finish(q, ev, name, x, y) {
      const target = ev || App.newEvent(x, y);
      target.name = name.v || TYPES[q.type].label;
      target.quick = q;
      target.pages = build(q);
      App.selectedEventId = target.id;
      App.markDirty(); MapEditor.sprites = {}; MapEditor.render(); App.renderInspector();
      UI.toast((ev ? 'Updated ' : 'Created ') + target.name);
      return target;
    },
    edit(ev) { return QE.open(null, ev.x, ev.y, ev); },
    menuItems(x, y, area) {
      return Object.entries(TYPES).map(([k, t]) => (k === 'encounter' && area && (area.w > 1 || area.h > 1))
        ? { label: 'Quick event: ' + t.label + ' (' + area.w + '×' + area.h + ' selected)…', action: () => QE.open('encounter', x, y, null, area) }
        : { label: 'Quick event: ' + t.label + '…', action: () => QE.open(k, x, y) });
    },

    // Editable list of items a shop sells, each with an optional price that overrides the item's own price.
    goodsTable(q) {
      q.goods = q.goods || [];
      const wrap = h('div', { class: 'enc-table' });
      const draw = () => {
        clear(wrap);
        const tbl = h('table', { class: 'grid' }, h('tr', null, h('th', null, 'Item'), h('th', null, 'Normal price'), h('th', null, 'Price in this shop'), h('th')));
        q.goods.forEach((g, i) => {
          const it = App.proj.items.find(x => x.id === g.itemId);
          const sel = h('select', null, App.proj.items.map(x => h('option', { value: x.id, selected: x.id === g.itemId }, x.name)));
          sel.addEventListener('change', () => { g.itemId = sel.value; draw(); });
          const pr = h('input', { type: 'number', min: 0, value: g.price == null ? '' : g.price, placeholder: 'same', style: { width: '90px' } });
          pr.addEventListener('input', () => { g.price = pr.value === '' ? null : Math.max(0, +pr.value); });
          tbl.appendChild(h('tr', null, h('td', null, sel), h('td', { class: 'muted' }, it ? String(it.price || 0) : '—'), h('td', null, pr),
            h('td', null, h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { q.goods.splice(i, 1); draw(); } }, '✕'))));
        });
        if (!q.goods.length) tbl.appendChild(h('tr', null, h('td', { colspan: 4, class: 'muted' }, 'Nothing for sale yet.')));
        wrap.append(tbl, h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'small', onclick: () => { const used = q.goods.map(g => g.itemId); const next = App.proj.items.find(x => !used.includes(x.id)) || App.proj.items[0]; if (next) q.goods.push({ itemId: next.id, price: null }); draw(); } }, '+ Add item')));
      };
      draw();
      return wrap;
    },

    // Editable table of monsters with level range and frequency. Used by the quick window and the event editor.
    encounterTable(enc) {
      enc.list = enc.list || [];
      const wrap = h('div', { class: 'enc-table' });
      const draw = () => {
        clear(wrap);
        const total = enc.list.reduce((a, e) => a + (e.weight > 0 ? e.weight : 0), 0) || 1;
        const tbl = h('table', { class: 'grid' }, h('tr', null, h('th'), h('th', null, 'Monster'), h('th', null, 'Level from'), h('th', null, 'to'), h('th', null, 'How often'), h('th', null, 'Weight'), h('th', null, 'Share'), h('th')));
        enc.list.forEach((e, i) => {
          const sp = App.proj.monsters.find(m => m.id === e.speciesId);
          const img = h('img', { class: 'credit-thumb', src: sp && sp.front ? UI.assetUrl(sp.front) : '' });
          const mon = h('select', null, App.proj.monsters.map(m => h('option', { value: m.id, selected: m.id === e.speciesId }, m.name)));
          mon.addEventListener('change', () => { e.speciesId = mon.value; draw(); });
          const num = (k, min, max) => { const n = h('input', { type: 'number', value: e[k], min, max, style: { width: '64px' } }); n.addEventListener('input', () => { e[k] = Math.max(min, +n.value || 0); if (k === 'minLevel' && e.maxLevel < e[k]) e.maxLevel = e[k]; if (k === 'weight') draw(); }); n.addEventListener('blur', draw); return n; };
          const preset = MF.Quick.FREQUENCIES.find(f => f[1] === e.weight);
          const freq = h('select', null, MF.Quick.FREQUENCIES.map(([n, w]) => h('option', { value: w, selected: preset && preset[1] === w }, n + ' (' + w + ')')), preset ? null : h('option', { value: '', selected: true }, 'Custom'));
          freq.addEventListener('change', () => { if (freq.value) { e.weight = +freq.value; draw(); } });
          const pct = Math.round(100 * (e.weight > 0 ? e.weight : 0) / total);
          tbl.appendChild(h('tr', null, h('td', null, img), h('td', null, mon), h('td', null, num('minLevel', 1, 999)), h('td', null, num('maxLevel', 1, 999)), h('td', null, freq), h('td', null, num('weight', 0, 999)),
            h('td', null, h('div', { class: 'enc-share' }, h('div', { class: 'stat-bar', style: { width: '70px', marginTop: 0 } }, h('i', { style: { width: pct + '%' } })), h('span', null, pct + '%'))),
            h('td', null, h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { enc.list.splice(i, 1); draw(); } }, '✕'))));
        });
        if (!enc.list.length) tbl.appendChild(h('tr', null, h('td', { colspan: 8, class: 'muted' }, 'No monsters yet. Click “+ Add monster”.')));
        wrap.append(tbl, h('div', { class: 'row', style: { marginTop: '6px' } },
          h('button', { class: 'small', onclick: () => { const last = enc.list[enc.list.length - 1]; enc.list.push({ speciesId: (App.proj.monsters[0] || {}).id, minLevel: last ? last.minLevel : 3, maxLevel: last ? last.maxLevel : 5, weight: 10 }); draw(); } }, '+ Add monster'),
          h('span', { class: 'muted', style: { fontSize: '11px' } }, 'Share is each monster\'s chance of being the one that appears. A higher weight means it appears more often.')));
      };
      draw();
      return wrap;
    }
  };
})();
