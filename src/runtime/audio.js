/* Game audio: looping background music, one-off jingles and sound effects (MP3 or FLAC).
   Files are read through the preload bridge and decoded with Web Audio, so loops are gapless. */
(function () {
  'use strict';
  const SFX_KEYS = ['cursor', 'confirm', 'cancel', 'buzzer', 'hit', 'hitStrong', 'faint', 'throw', 'shake', 'catch', 'breakFree', 'levelUp', 'runAway', 'door', 'bump', 'coin', 'heal', 'encounter', 'save'];

  const A = window.GameAudio = {
    ctx: null, cache: {}, bgm: null, stack: [], projectPath: '', settings: {},
    init(projectPath, settings) {
      A.projectPath = projectPath;
      A.settings = Object.assign({ bgmVolume: 80, sfxVolume: 80, sfx: {} }, settings || {});
      try {
        A.ctx = new (window.AudioContext || window.webkitAudioContext)();
        A.bgmGain = A.ctx.createGain(); A.bgmGain.connect(A.ctx.destination);
        A.sfxGain = A.ctx.createGain(); A.sfxGain.connect(A.ctx.destination);
        A.applyVolumes();
        const wake = () => { if (A.ctx.state === 'suspended') A.ctx.resume(); };
        window.addEventListener('keydown', wake); window.addEventListener('mousedown', wake);
      } catch (e) { console.warn('Audio unavailable', e); A.ctx = null; }
    },
    applyVolumes() { if (!A.ctx) return; A.bgmGain.gain.value = (A.settings.bgmVolume ?? 80) / 100; A.sfxGain.gain.value = (A.settings.sfxVolume ?? 80) / 100; },
    load(rel) {
      if (!A.ctx || !rel) return Promise.resolve(null);
      if (!A.cache[rel]) A.cache[rel] = window.api.readAsset(A.projectPath, rel)
        .then(bytes => bytes ? A.ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) : null)
        .catch(err => { console.warn('Could not load audio', rel, err); return null; });
      return A.cache[rel];
    },
    preload(list) { list.filter(Boolean).forEach(r => A.load(r)); },

    /* ---------- background music ---------- */
    // Starts a looping track. The same track keeps playing if it is already on.
    async playBgm(rel, opts) {
      opts = opts || {};
      if (!A.ctx) return;
      if (!rel) return A.stopBgm(opts.fade ?? 0.4);
      if (A.bgm && A.bgm.rel === rel && !opts.restart) return;
      const buf = await A.load(rel);
      if (!buf) return;
      A.stopBgm(opts.fade ?? 0.4);
      const src = A.ctx.createBufferSource(); src.buffer = buf; src.loop = opts.loop !== false;
      const g = A.ctx.createGain(); g.gain.value = (opts.volume ?? 100) / 100;
      src.connect(g); g.connect(A.bgmGain);
      const offset = (opts.offset || 0) % buf.duration;
      src.start(0, offset);
      A.bgm = { rel, src, g, buf, startedAt: A.ctx.currentTime - offset, volume: opts.volume ?? 100, loop: src.loop };
    },
    stopBgm(fade) {
      if (!A.bgm) return;
      const { src, g } = A.bgm; A.bgm = null;
      try {
        if (fade) { g.gain.setValueAtTime(g.gain.value, A.ctx.currentTime); g.gain.linearRampToValueAtTime(0, A.ctx.currentTime + fade); src.stop(A.ctx.currentTime + fade + 0.05); }
        else src.stop();
      } catch (e) { /* already stopped */ }
    },
    position() { return A.bgm ? (A.ctx.currentTime - A.bgm.startedAt) % A.bgm.buf.duration : 0; },
    // Battles push the map music aside and pop it back where it left off.
    pushBgm() { A.stack.push(A.bgm ? { rel: A.bgm.rel, offset: A.position(), volume: A.bgm.volume } : null); },
    popBgm() {
      const prev = A.stack.pop();
      if (!prev) { A.stopBgm(0.4); return; }
      A.playBgm(prev.rel, { offset: prev.offset, volume: prev.volume, restart: true, fade: 0.3 });
    },

    /* ---------- jingles (music effects) ---------- */
    // Plays a short tune once over a dipped background track; resolves when it ends.
    async playMe(rel) {
      if (!A.ctx || !rel) return;
      const buf = await A.load(rel);
      if (!buf) return;
      const t = A.ctx.currentTime;
      A.bgmGain.gain.cancelScheduledValues(t); A.bgmGain.gain.setValueAtTime(A.bgmGain.gain.value, t); A.bgmGain.gain.linearRampToValueAtTime(0, t + 0.15);
      const src = A.ctx.createBufferSource(); src.buffer = buf; src.connect(A.sfxGain); src.start();
      await new Promise(r => { src.onended = r; setTimeout(r, buf.duration * 1000 + 300); });
      const t2 = A.ctx.currentTime, vol = (A.settings.bgmVolume ?? 80) / 100;
      A.bgmGain.gain.cancelScheduledValues(t2); A.bgmGain.gain.setValueAtTime(0, t2); A.bgmGain.gain.linearRampToValueAtTime(vol, t2 + 0.6);
    },

    /* ---------- sound effects ---------- */
    // name: one of the system sound slots (e.g. 'cursor'), or a file path like 'sounds/door.mp3'.
    async se(name, volume) {
      if (!A.ctx) return;
      const rel = name && name.includes('/') ? name : (A.settings.sfx || {})[name];
      if (!rel) return;
      const buf = await A.load(rel);
      if (!buf) return;
      const src = A.ctx.createBufferSource(); src.buffer = buf;
      const g = A.ctx.createGain(); g.gain.value = (volume ?? 100) / 100;
      src.connect(g); g.connect(A.sfxGain); src.start();
    },
    SFX_KEYS
  };
})();
