/* Audio settings shared by the editor and the game: which music and sound slots exist,
   their labels, and the preset files from the asset library that fill them by default. */
(function (root) {
  'use strict';
  const MUSIC_SLOTS = [
    ['title', 'Title screen', 'music/title-dawn-of-adventure.mp3'],
    ['battleWild', 'Wild battle', 'music/battle-wild-clash.mp3'],
    ['battleTrainer', 'Trainer battle', 'music/battle-rival-showdown.mp3'],
    ['victory', 'Victory (after winning)', 'music/victory-fanfare.mp3']
  ];
  const JINGLE_SLOTS = [
    ['heal', 'Healing the party', 'music/jingle-rest-well.mp3'],
    ['item', 'Getting an item', 'music/jingle-found-it.mp3'],
    ['monster', 'Catching or receiving a monster', 'music/jingle-new-friend.mp3']
  ];
  const SFX_SLOTS = [
    ['cursor', 'Menu cursor', 'sounds/cursor.mp3'],
    ['confirm', 'Confirm', 'sounds/confirm.mp3'],
    ['cancel', 'Cancel / close', 'sounds/cancel.mp3'],
    ['buzzer', 'Not allowed', 'sounds/buzzer.mp3'],
    ['hit', 'Move hits', 'sounds/hit.mp3'],
    ['hitStrong', 'Super-effective or critical hit', 'sounds/hit-strong.mp3'],
    ['faint', 'Monster faints', 'sounds/faint.mp3'],
    ['throw', 'Throw a ball', 'sounds/throw.mp3'],
    ['shake', 'Ball shakes', 'sounds/shake.mp3'],
    ['catch', 'Caught!', 'sounds/catch.mp3'],
    ['breakFree', 'Monster breaks free', 'sounds/break-free.mp3'],
    ['levelUp', 'Level up', 'sounds/level-up.mp3'],
    ['runAway', 'Run away', 'sounds/run-away.mp3'],
    ['encounter', 'Wild battle starts', 'sounds/encounter.mp3'],
    ['door', 'Door / exit', 'sounds/door.mp3'],
    ['bump', 'Walk into a wall', 'sounds/bump.mp3'],
    ['jump', 'Jump down a ledge (2.5D)', 'sounds/jump.mp3'],
    ['coin', 'Buy or sell', 'sounds/coin.mp3'],
    ['heal', 'Use a healing item', 'sounds/heal.mp3'],
    ['save', 'Game saved', 'sounds/save.mp3']
  ];
  const EXT = ['mp3', 'flac'];
  const RE = /\.(mp3|flac)$/i;

  // Fill missing settings with the presets that exist in the project (has(rel) tells whether a file is there).
  function withDefaults(audio, has) {
    const a = Object.assign({ bgmVolume: 80, sfxVolume: 80 }, audio || {});
    a.sfx = Object.assign({}, a.sfx || {});
    const ok = rel => !has || has(rel);
    MUSIC_SLOTS.concat(JINGLE_SLOTS).forEach(([k, , def]) => { if (a[k] === undefined) a[k] = ok(def) ? def : ''; });
    SFX_SLOTS.forEach(([k, , def]) => { if (a.sfx[k] === undefined) a.sfx[k] = ok(def) ? def : ''; });
    return a;
  }

  const api = { MUSIC_SLOTS, JINGLE_SLOTS, SFX_SLOTS, EXT, RE, withDefaults };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MF = root.MF || {}; root.MF.Audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
