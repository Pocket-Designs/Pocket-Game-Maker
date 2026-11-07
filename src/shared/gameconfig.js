/* Game-wide options shared by the editor and the game: words used in the game, the title (start) menu,
   the in-game menu and bag shortcuts, and the following monster. withDefaults() fills anything missing. */
(function (root) {
  'use strict';
  const TERMS = [
    ['dex', 'DB', 'Short name for the monster database (shown in menus)'],
    ['dexLong', 'Database', 'Full name for the monster database (shown as its title)'],
    ['pp', 'EP', 'Short name for move energy (shown next to moves)'],
    ['ppLong', 'Energy Points', 'Full name for move energy']
  ];
  // Start menu entries. Continue loads the latest save straight away (or asks which, if set so); Load game always asks.
  const TITLE_ITEMS = [['new', 'New Game'], ['continue', 'Continue'], ['load', 'Load Game'], ['options', 'Options'], ['scenes', 'Replay Opening'], ['credits', 'Credits'], ['licence', 'Licence'], ['quit', 'Quit']];
  const MAIN_ITEMS = [['dex', '{dex}'], ['party', 'Monsters'], ['bag', 'Bag'], ['worldmap', 'Map'], ['storage', 'Storage'], ['decorate', 'Decorate'], ['wardrobe', 'Wardrobe'], ['save', 'Save'], ['options', 'Options'], ['close', 'Close']];
  const BAG_SHORTCUTS = [['storage', 'Storage'], ['dex', '{dex}'], ['party', 'Monsters'], ['worldmap', 'Map'], ['save', 'Save']];
  const TOOL_ACTIONS = [['storage', 'Opens monster storage'], ['dex', 'Opens the {dex}'], ['party', 'Opens the party screen'], ['save', 'Opens the save screen'], ['worldmap', 'Opens the world map']];
  // Item kinds (Database → Items) and the bag pockets they go in by default.
  const ITEM_KINDS = [['ball', 'Capture ball'], ['heal', 'Healing / status cure'], ['revive', 'Revive'], ['pp', '{pp} restore'], ['evolution', 'Evolution item'], ['tool', 'Tool (opens a screen, e.g. a storage box or a map)'], ['decoration', 'Decoration (furniture for a home)'], ['clothing', 'Clothing (for the Wardrobe)'], ['key', 'Key item (no effect)']];
  const DEFAULT_POCKETS = [
    { id: 'items', name: 'Items', icon: '✚', kinds: ['heal', 'revive', 'pp'], rest: true },
    { id: 'balls', name: 'Capture Orbs', icon: '●', kinds: ['ball'] },
    { id: 'evolution', name: 'Evolution', icon: '✦', kinds: ['evolution'] },
    { id: 'home', name: 'Home & Style', icon: '⌂', kinds: ['decoration', 'clothing'] },
    { id: 'key', name: 'Key Items', icon: '⚿', kinds: ['key', 'tool'] }
  ];
  // Which pocket an item goes in: the item's own choice, else the first pocket that takes its kind, else the
  // "everything else" pocket (or the first). Returns a pocket id.
  function pocketOf(pockets, item) {
    const list = (pockets && pockets.list) || [];
    if (!list.length || !item) return null;
    if (item.pocket && list.some(p => p.id === item.pocket)) return item.pocket;
    const byKind = list.find(p => (p.kinds || []).includes(item.kind));
    return (byKind || list.find(p => p.rest) || list[0]).id;
  }

  // Fill in each list from its defaults, keeping the order, labels and on/off choices already saved.
  function mergeList(saved, defs, onByDefault) {
    const out = (saved || []).filter(e => e && defs.some(d => d[0] === e.id)).map(e => Object.assign({}, e));
    defs.forEach(([id, label]) => {
      if (out.some(e => e.id === id)) return;
      const close = out.findIndex(e => e.id === 'close'); // new entries go before Close
      out.splice(close >= 0 && id !== 'close' ? close : out.length, 0, { id, label, on: onByDefault(id) });
    });
    return out;
  }

  function withDefaults(system) {
    const s = system || {};
    const terms = Object.assign({}, s.terms || {});
    TERMS.forEach(([k, v]) => { if (!terms[k]) terms[k] = v; });
    const t = Object.assign({ showTitle: true, subtitle: 'Made with Pocket-Game-Maker', background: '', menuPosition: 'centre', textColour: '#ffffff',
      logo: '', pressStart: false, pressStartText: 'Press any key', menuStyle: 'window', continueMode: 'latest' }, s.titleScreen || {});
    t.menu = mergeList(t.menu, TITLE_ITEMS, id => id === 'new' || id === 'continue' || id === 'options');
    t.credits = Object.assign({ source: 'auto', file: '', heading: 'Credits' }, t.credits || {});
    t.licence = Object.assign({ file: '', heading: 'Licence' }, t.licence || {});
    const menus = Object.assign({}, s.menus || {});
    menus.main = mergeList(menus.main, MAIN_ITEMS, () => true);
    menus.bag = mergeList(menus.bag, BAG_SHORTCUTS, () => false);
    menus.showMoney = menus.showMoney !== false;
    const follower = Object.assign({ enabled: false, talk: true }, s.follower || {});
    const touchControls = s.touchControls || 'auto';
    // Optional player features (off unless the game maker turns them on).
    const decorating = Object.assign({ enabled: false }, s.decorating || {});
    const wardrobe = Object.assign({ enabled: false, start: {} }, s.wardrobe || {});
    // Bag pockets: tabs in the bag, each holding some kinds of item.
    const pockets = Object.assign({ enabled: true }, s.pockets || {});
    pockets.list = (pockets.list && pockets.list.length ? pockets.list : DEFAULT_POCKETS).map(p => Object.assign({ icon: '', kinds: [], rest: false }, p));
    // Saving: from the menu (the Save entry), save points (events), a bag item (a Tool that opens the save screen),
    // and autosave (when the player changes map, after battles, every few minutes) into its own Autosave slot.
    const saving = Object.assign({ slots: 4, confirmOverwrite: true, autosave: false, autoOnMap: true, autoAfterBattle: false, autoMinutes: 0, autoToast: true }, s.saving || {});
    saving.slots = Math.max(1, Math.min(12, saving.slots | 0 || 4));
    // The world map: a picture with named places; shows where the player is, and can let them travel to places they have been.
    const worldMap = Object.assign({ enabled: false, image: '', title: 'World Map', travel: false, showUnvisited: true, locations: [] }, s.worldMap || {});
    // Opening and ending scenes: movies, picture slides, scrolling text and credits, played before the title screen,
    // when a new game starts, and at the end (the Play ending command).
    const scenes = Object.assign({ opening: [], newGame: [], ending: [], endingThen: 'title' }, s.scenes || {});
    return { terms, titleScreen: t, menus, follower, touchControls, decorating, wardrobe, pockets, saving, worldMap, scenes };
  }
  // Replace {dex}, {pp} etc. in a label with the game's own words.
  const word = (terms, text) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (terms && terms[k]) || m);

  const api = { TERMS, TITLE_ITEMS, MAIN_ITEMS, BAG_SHORTCUTS, TOOL_ACTIONS, ITEM_KINDS, DEFAULT_POCKETS, pocketOf, withDefaults, word };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MF = root.MF || {}; root.MF.Config = api;
})(typeof window !== 'undefined' ? window : globalThis);
