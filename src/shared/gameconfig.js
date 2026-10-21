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
  const TITLE_ITEMS = [['new', 'New Game'], ['continue', 'Continue'], ['credits', 'Credits'], ['licence', 'Licence'], ['quit', 'Quit']];
  const MAIN_ITEMS = [['dex', '{dex}'], ['party', 'Monsters'], ['bag', 'Bag'], ['storage', 'Storage'], ['decorate', 'Decorate'], ['wardrobe', 'Wardrobe'], ['save', 'Save'], ['close', 'Close']];
  const BAG_SHORTCUTS = [['storage', 'Storage'], ['dex', '{dex}'], ['party', 'Monsters'], ['save', 'Save']];
  const TOOL_ACTIONS = [['storage', 'Opens monster storage'], ['dex', 'Opens the {dex}'], ['party', 'Opens the party screen'], ['save', 'Opens the save screen']];

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
    const t = Object.assign({ showTitle: true, subtitle: 'Made with Pocket-Game-Maker', background: '', menuPosition: 'centre', textColour: '#ffffff' }, s.titleScreen || {});
    t.menu = mergeList(t.menu, TITLE_ITEMS, id => id === 'new' || id === 'continue');
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
    return { terms, titleScreen: t, menus, follower, touchControls, decorating, wardrobe };
  }
  // Replace {dex}, {pp} etc. in a label with the game's own words.
  const word = (terms, text) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (terms && terms[k]) || m);

  const api = { TERMS, TITLE_ITEMS, MAIN_ITEMS, BAG_SHORTCUTS, TOOL_ACTIONS, withDefaults, word };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MF = root.MF || {}; root.MF.Config = api;
})(typeof window !== 'undefined' ? window : globalThis);
