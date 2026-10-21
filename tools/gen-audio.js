// Generates Pocket-Game-Maker's free preset music and sound effects (original works, CC0).
// Everything is synthesised here from note lists: no samples or third-party recordings are used.
// Needs ffmpeg (with libmp3lame) on the PATH to encode MP3. Run: node tools/gen-audio.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SR = 44100;
const OUT = path.join(__dirname, '..', 'library');
const AUTHOR = 'project-tech-me';

/* ---------------- helpers ---------------- */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('Bad note ' + name);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function chord(name) { // "Am", "F#", "Bb", "E7" -> root midi (octave 3) + intervals
  const m = /^([A-G])(#|b)?(m)?(7)?$/.exec(name);
  if (!m) throw new Error('Bad chord ' + name);
  const root = midi(m[1] + (m[2] || '') + '3');
  const iv = m[3] ? [0, 3, 7] : [0, 4, 7];
  if (m[4]) iv.push(m[3] ? 10 : 10);
  return { root, iv };
}
// Melody: bars separated by "|", tokens "E5/4" (note for 4 sixteenths) or "-/4" (rest).
function parseMelody(src, bars) {
  const out = []; let t = 0;
  const parts = src.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length !== bars) throw new Error('Melody has ' + parts.length + ' bars, expected ' + bars);
  parts.forEach((bar, bi) => {
    let sum = 0;
    bar.split(/\s+/).forEach(tok => {
      const [n, d] = tok.split('/'); const len = +d;
      if (n !== '-') out.push({ t: t + sum, len, m: midi(n) });
      sum += len;
    });
    if (sum !== 16) throw new Error('Bar ' + (bi + 1) + ' has ' + sum + ' sixteenths: ' + bar);
    t += 16;
  });
  return out;
}

/* ---------------- synth ---------------- */
function makeBuf(seconds) { return new Float32Array(Math.ceil(seconds * SR)); }
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };

// Adds one note into buf (wrapping past the end when wrap is true, for seamless loops).
function tone(buf, start, dur, freq, o) {
  o = Object.assign({ wave: 'square', duty: 0.5, vol: 0.2, a: 0.004, d: 0.08, s: 0.65, r: 0.06, vib: 0, vibDelay: 0.18, slide: 0, wrap: false }, o);
  const n0 = Math.floor(start * SR), total = Math.floor((dur + o.r) * SR);
  let ph = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let env;
    if (t < o.a) env = t / o.a;
    else if (t < o.a + o.d) env = 1 - (1 - o.s) * ((t - o.a) / o.d);
    else env = o.s;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / o.r);
    let f = freq * (1 + (o.slide ? o.slide * Math.min(1, t / dur) : 0));
    if (o.vib && t > o.vibDelay) f *= 1 + o.vib * Math.sin(2 * Math.PI * 5.5 * (t - o.vibDelay));
    ph += f / SR; ph -= Math.floor(ph);
    let v;
    if (o.wave === 'square') v = ph < o.duty ? 1 : -1;
    else if (o.wave === 'tri') v = 4 * Math.abs(ph - 0.5) - 1;
    else if (o.wave === 'saw') v = 2 * ph - 1;
    else if (o.wave === 'sine') v = Math.sin(2 * Math.PI * ph);
    else v = rnd();
    let idx = n0 + i;
    if (idx >= buf.length) { if (!o.wrap) break; idx %= buf.length; }
    buf[idx] += v * env * o.vol;
  }
}
function kick(buf, start, vol, wrap) {
  const n = Math.floor(0.16 * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 140 * Math.exp(-t * 28) + 42;
    ph += f / SR;
    let idx = Math.floor(start * SR) + i; if (idx >= buf.length) { if (!wrap) break; idx %= buf.length; }
    buf[idx] += Math.sin(2 * Math.PI * ph) * Math.exp(-t * 18) * vol;
  }
}
function noiseHit(buf, start, len, vol, decay, wrap, tonal) {
  const n = Math.floor(len * SR); let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const raw = rnd(); lp += (raw - lp) * (tonal || 0.6);
    let idx = Math.floor(start * SR) + i; if (idx >= buf.length) { if (!wrap) break; idx %= buf.length; }
    buf[idx] += lp * Math.exp(-t * decay) * vol;
  }
}

/* ---------------- arranger ---------------- */
const DRUMS = {
  none: [],
  gentle: ['k.......k...s...', 'k.......k...s..h'],
  march: ['k...s...k.k.s...', 'k...s...k.k.s.ss'],
  drive: ['k.h.s.h.k.hks.h.', 'k.h.s.h.k.hks.ss'],
  battle: ['k.hkshk.k.hkshkh', 'k.hkshk.k.hks.ss'],
  sparse: ['k...............', '........s.......']
};
function song(spec) {
  const spb = 60 / spec.bpm / 4; // seconds per sixteenth
  const bars = spec.chords.length;
  const len = bars * 16 * spb + (spec.loop ? 0 : (spec.tail || 1.2));
  const buf = makeBuf(len);
  const wrap = !!spec.loop;
  // melody
  parseMelody(spec.melody, bars).forEach(n => {
    const lead = Object.assign({ wave: 'square', duty: 0.25, vol: 0.16, vib: 0.006, d: 0.1, s: 0.7, r: 0.07, wrap }, spec.lead || {});
    tone(buf, n.t * spb, n.len * spb * 0.92, hz(n.m), lead);
    if (spec.echo) tone(buf, n.t * spb + spec.echo * spb, n.len * spb * 0.9, hz(n.m), Object.assign({}, lead, { vol: lead.vol * 0.35 }));
  });
  // harmony
  spec.chords.forEach((c, bar) => {
    const ch = chord(c), t0 = bar * 16;
    const bassVol = spec.bassVol || 0.24, bassWave = { wave: 'tri', vol: bassVol, a: 0.003, d: 0.05, s: 0.9, r: 0.03, wrap };
    const b = spec.bass || 'eighths';
    if (b === 'whole') tone(buf, t0 * spb, 16 * spb * 0.97, hz(ch.root - 12), Object.assign({}, bassWave, { r: 0.2 }));
    else if (b === 'half') [0, 8].forEach(s => tone(buf, (t0 + s) * spb, 7.5 * spb, hz(ch.root - 12 + (s ? 7 : 0)), bassWave));
    else if (b === 'eighths') for (let s = 0; s < 16; s += 2) tone(buf, (t0 + s) * spb, 1.7 * spb, hz(ch.root - 12 + ((s / 2) % 2 ? 12 : 0)), bassWave);
    else if (b === 'walk') [0, 4, 8, 12].forEach((s, k) => tone(buf, (t0 + s) * spb, 3.6 * spb, hz(ch.root - 12 + [0, 7, 12, 7][k]), bassWave));
    else if (b === 'gallop') for (let s = 0; s < 16; s += 4) [0, 2, 3].forEach(o => tone(buf, (t0 + s + o) * spb, 0.9 * spb, hz(ch.root - 12), bassWave));
    const arp = spec.arp || 'none';
    const tones = ch.iv.map(i => ch.root + 12 + i);
    if (arp === 'sixteenths') for (let s = 0; s < 16; s++) tone(buf, (t0 + s) * spb, 0.8 * spb, hz(tones[[0, 1, 2, 1][s % 4]] + (spec.arpUp || 0)), { wave: 'square', duty: 0.125, vol: 0.05, a: 0.002, d: 0.04, s: 0.4, r: 0.02, wrap });
    else if (arp === 'eighths') for (let s = 0; s < 16; s += 2) tone(buf, (t0 + s) * spb, 1.5 * spb, hz(tones[(s / 2) % 3] + (spec.arpUp || 0)), { wave: 'square', duty: 0.125, vol: 0.055, a: 0.002, d: 0.05, s: 0.4, r: 0.03, wrap });
    else if (arp === 'pad') tones.forEach(m => tone(buf, t0 * spb, 15.5 * spb, hz(m + (spec.arpUp || 0)), { wave: 'tri', vol: 0.05, a: 0.12, d: 0.2, s: 0.8, r: 0.25, wrap }));
    else if (arp === 'stabs') [2, 6, 10, 14].forEach(s => tones.forEach(m => tone(buf, (t0 + s) * spb, 1.2 * spb, hz(m), { wave: 'square', duty: 0.25, vol: 0.03, a: 0.002, d: 0.05, s: 0.3, r: 0.02, wrap })));
    // drums
    const pat = DRUMS[spec.drums || 'none'];
    if (pat.length) {
      const p = pat[bar % pat.length];
      for (let s = 0; s < 16; s++) {
        const c2 = p[s], at = (t0 + s) * spb, dv = spec.drumVol || 1;
        if (c2 === 'k') kick(buf, at, 0.5 * dv, wrap);
        else if (c2 === 's') noiseHit(buf, at, 0.14, 0.22 * dv, 22, wrap, 0.75);
        else if (c2 === 'h') noiseHit(buf, at, 0.04, 0.07 * dv, 70, wrap, 0.95);
      }
    }
  });
  return buf;
}

/* ---------------- the presets ---------------- */
const MUSIC = [
  { file: 'title-dawn-of-adventure', name: 'Dawn of Adventure', use: 'Title screen', loop: true, bpm: 116, bass: 'eighths', arp: 'sixteenths', drums: 'march',
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'C', 'C'],
    melody: 'G4/4 C5/4 E5/4 G5/4 | F5/4 E5/2 D5/2 D5/8 | E5/4 A5/4 G5/4 E5/4 | F5/6 E5/2 C5/8 | G4/4 C5/4 E5/4 G5/4 | B5/4 A5/2 G5/2 D5/8 | A5/4 C6/4 A5/4 F5/4 | G5/12 -/4 |' +
      'A5/4 G5/4 E5/4 C5/4 | F5/4 E5/4 D5/4 C5/4 | E5/4 G5/4 C6/4 G5/4 | B5/6 A5/2 G5/8 | A5/4 G5/4 F5/4 A5/4 | G5/4 F5/4 E5/4 D5/4 | C5/4 E5/4 G5/4 C6/4 | C6/12 -/4' },
  { file: 'town-sunny-town', name: 'Sunny Town', use: 'Towns and villages', loop: true, bpm: 96, bass: 'walk', arp: 'eighths', drums: 'gentle', drumVol: 0.6,
    lead: { duty: 0.5, vol: 0.13, vib: 0.008 },
    chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C'],
    melody: 'A4/2 C5/2 F5/4 E5/2 F5/2 G5/4 | A5/6 G5/2 F5/4 D5/4 | D5/2 F5/2 Bb5/4 A5/2 G5/2 F5/4 | G5/8 E5/4 C5/4 | A4/2 C5/2 F5/4 E5/2 F5/2 A5/4 | C6/6 A5/2 F5/4 D5/4 | Bb5/4 A5/4 G5/2 F5/2 E5/4 | E5/4 G5/4 F5/8' },
  { file: 'route-open-road', name: 'Open Road', use: 'Routes and the overworld', loop: true, bpm: 132, bass: 'eighths', arp: 'sixteenths', drums: 'drive', drumVol: 0.8,
    chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'G', 'G'],
    melody: 'D5/2 G5/2 B5/4 A5/2 G5/2 D5/4 | F#5/4 A5/4 D6/4 A5/4 | G5/2 F#5/2 E5/4 B4/4 E5/4 | G5/6 E5/2 C5/8 | D5/2 G5/2 B5/4 D6/4 B5/4 | A5/4 F#5/4 D5/4 F#5/4 | E5/4 G5/4 C6/4 B5/4 | A5/12 -/4 |' +
      'B5/4 G5/4 E5/4 G5/4 | C6/4 B5/4 A5/4 G5/4 | B5/4 D6/4 G6/4 D6/4 | F#6/6 E6/2 D6/8 | E6/4 D6/4 C6/4 A5/4 | D6/4 C6/4 B5/4 A5/4 | G5/4 B5/4 D6/4 B5/4 | G5/12 -/4' },
  { file: 'cave-echoing-depths', name: 'Echoing Depths', use: 'Caves and dungeons', loop: true, bpm: 80, bass: 'whole', arp: 'pad', drums: 'sparse', drumVol: 0.6, echo: 3,
    lead: { wave: 'tri', vol: 0.2, vib: 0.01, s: 0.8, r: 0.25 },
    chords: ['Am', 'Am', 'F', 'F', 'Dm', 'Dm', 'E', 'E'],
    melody: 'E5/8 -/4 A4/4 | C5/6 B4/2 A4/8 | F5/8 -/4 E5/4 | C5/12 -/4 | D5/8 F5/4 A5/4 | G5/6 F5/2 D5/8 | E5/8 G#5/4 B5/4 | E5/12 -/4' },
  { file: 'battle-wild-clash', name: 'Wild Clash', use: 'Wild monster battles', loop: true, bpm: 156, bass: 'gallop', arp: 'sixteenths', drums: 'battle', drumVol: 0.9,
    chords: ['Am', 'F', 'G', 'E', 'Am', 'F', 'G', 'E'],
    melody: 'A5/2 A5/2 -/2 A5/2 G5/2 A5/2 C6/4 | A5/2 F5/2 -/2 F5/2 E5/2 F5/2 A5/4 | G5/2 B5/2 D6/4 C6/2 B5/2 G5/4 | G#5/4 B5/4 E6/8 | A5/2 A5/2 -/2 A5/2 G5/2 A5/2 E6/4 | F6/4 E6/4 C6/4 A5/4 | B5/2 C6/2 D6/4 C6/2 B5/2 G5/4 | E5/4 G#5/4 B5/4 E6/4' },
  { file: 'battle-rival-showdown', name: 'Rival Showdown', use: 'Trainer battles', loop: true, bpm: 168, bass: 'eighths', arp: 'sixteenths', drums: 'battle',
    lead: { duty: 0.5, vol: 0.14 },
    chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'],
    melody: 'D6/2 -/2 A5/2 D6/2 F6/4 E6/4 | D6/2 -/2 Bb5/2 D6/2 F6/4 D6/4 | E6/2 -/2 C6/2 E6/2 G6/4 E6/4 | C#6/4 E6/4 A6/8 | F6/2 E6/2 D6/2 C6/2 D6/4 A5/4 | Bb5/2 C6/2 D6/2 F6/2 Bb6/8 | G6/4 F6/4 E6/2 D6/2 Bb5/4 | A5/4 C#6/4 E6/4 A6/4' },
  { file: 'victory-fanfare', name: 'Victory Fanfare', use: 'After winning a battle', loop: true, bpm: 132, bass: 'half', arp: 'stabs', drums: 'march', drumVol: 0.7,
    lead: { duty: 0.5, vol: 0.15 },
    chords: ['C', 'F', 'G', 'C'],
    melody: 'G5/2 G5/2 G5/2 C6/10 | A5/4 C6/4 F6/8 | D6/4 B5/4 G5/4 B5/4 | C6/12 -/4' }
];
const JINGLES = [
  { file: 'jingle-rest-well', name: 'Rest Well', use: 'Healing the party', bpm: 140, bass: 'whole', arp: 'pad', tail: 1.4,
    chords: ['C', 'C'], melody: 'C5/2 E5/2 G5/2 C6/4 G5/2 C6/4 | E6/12 -/4' },
  { file: 'jingle-found-it', name: 'Found It!', use: 'Getting an item', bpm: 150, bass: 'half', arp: 'stabs', tail: 1.0,
    chords: ['C', 'G'], melody: 'G5/2 G5/2 G5/2 C6/6 E6/4 | D6/4 G6/12' },
  { file: 'jingle-new-friend', name: 'New Friend', use: 'Catching or receiving a monster', bpm: 150, bass: 'half', arp: 'stabs', tail: 1.2,
    chords: ['F', 'G', 'C', 'C'], melody: 'A5/2 C6/2 F6/4 E6/4 C6/4 | D6/2 B5/2 G5/4 B5/4 D6/4 | E6/4 G6/4 C7/8 | -/16' }
];

/* ---------------- sound effects ---------------- */
function sfx(len, fn) { const b = makeBuf(len); fn(b); return b; }
const SOUNDS = [
  { file: 'cursor', name: 'Cursor', use: 'Moving through menus', make: () => sfx(0.08, b => tone(b, 0, 0.03, 1760, { duty: 0.5, vol: 0.18, r: 0.03, d: 0.02, s: 0.5 })) },
  { file: 'confirm', name: 'Confirm', use: 'Choosing a menu option', make: () => sfx(0.18, b => { tone(b, 0, 0.04, 1320, { duty: 0.5, vol: 0.2, r: 0.02 }); tone(b, 0.05, 0.07, 1980, { duty: 0.5, vol: 0.2, r: 0.04 }); }) },
  { file: 'cancel', name: 'Cancel', use: 'Closing a menu', make: () => sfx(0.18, b => { tone(b, 0, 0.04, 1320, { duty: 0.5, vol: 0.18, r: 0.02 }); tone(b, 0.05, 0.07, 880, { duty: 0.5, vol: 0.18, r: 0.04 }); }) },
  { file: 'buzzer', name: 'Buzzer', use: 'Something can\'t be chosen', make: () => sfx(0.3, b => tone(b, 0, 0.22, 110, { wave: 'saw', vol: 0.22, r: 0.05, s: 1 })) },
  { file: 'hit', name: 'Hit', use: 'A move hits', make: () => sfx(0.3, b => { noiseHit(b, 0, 0.25, 0.5, 16, false, 0.5); tone(b, 0, 0.08, 180, { wave: 'square', vol: 0.18, slide: -0.6, r: 0.05 }); }) },
  { file: 'hit-strong', name: 'Strong hit', use: 'A super-effective or critical hit', make: () => sfx(0.45, b => { noiseHit(b, 0, 0.4, 0.6, 10, false, 0.45); kick(b, 0, 0.6); tone(b, 0, 0.15, 240, { wave: 'square', vol: 0.18, slide: -0.7, r: 0.08 }); }) },
  { file: 'faint', name: 'Faint', use: 'A monster faints', make: () => sfx(0.8, b => tone(b, 0, 0.65, 880, { duty: 0.5, vol: 0.18, slide: -0.85, r: 0.1, s: 0.9 })) },
  { file: 'throw', name: 'Throw', use: 'Throwing a capture ball', make: () => sfx(0.4, b => tone(b, 0, 0.32, 400, { wave: 'square', duty: 0.25, vol: 0.14, slide: 2, r: 0.05 })) },
  { file: 'shake', name: 'Ball shake', use: 'The ball wobbles', make: () => sfx(0.2, b => { tone(b, 0, 0.05, 330, { wave: 'tri', vol: 0.35, r: 0.03 }); tone(b, 0.06, 0.05, 260, { wave: 'tri', vol: 0.3, r: 0.04 }); }) },
  { file: 'catch', name: 'Caught', use: 'A capture succeeds', make: () => sfx(0.7, b => [1047, 1319, 1568, 2093].forEach((f, i) => tone(b, i * 0.07, 0.12, f, { duty: 0.5, vol: 0.16, r: 0.12 }))) },
  { file: 'break-free', name: 'Break free', use: 'A monster escapes the ball', make: () => sfx(0.4, b => { noiseHit(b, 0, 0.2, 0.4, 20, false, 0.7); tone(b, 0, 0.2, 600, { duty: 0.5, vol: 0.14, slide: -0.5, r: 0.05 }); }) },
  { file: 'level-up', name: 'Level up', use: 'A monster grows a level', make: () => sfx(0.9, b => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(b, i * 0.08, i === 4 ? 0.3 : 0.07, f, { duty: 0.25, vol: 0.15, r: 0.1, vib: i === 4 ? 0.01 : 0 }))) },
  { file: 'run-away', name: 'Run away', use: 'Escaping from a battle', make: () => sfx(0.5, b => [0, 0.09, 0.18].forEach(t => noiseHit(b, t, 0.08, 0.25, 30, false, 0.3))) },
  { file: 'door', name: 'Door', use: 'Going through a door or exit', make: () => sfx(0.45, b => { noiseHit(b, 0, 0.12, 0.35, 25, false, 0.25); tone(b, 0.02, 0.18, 150, { wave: 'tri', vol: 0.3, slide: -0.3, r: 0.1 }); noiseHit(b, 0.22, 0.1, 0.3, 30, false, 0.2); }) },
  { file: 'bump', name: 'Bump', use: 'Walking into a wall', make: () => sfx(0.12, b => tone(b, 0, 0.06, 90, { wave: 'square', duty: 0.5, vol: 0.18, r: 0.03 })) },
  { file: 'coin', name: 'Coins', use: 'Buying or selling in a shop', make: () => sfx(0.35, b => { tone(b, 0, 0.05, 1976, { duty: 0.5, vol: 0.15, r: 0.03 }); tone(b, 0.06, 0.2, 2637, { duty: 0.5, vol: 0.15, r: 0.08 }); }) },
  { file: 'heal', name: 'Heal', use: 'Using a healing item', make: () => sfx(0.6, b => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(b, i * 0.06, 0.1, f, { wave: 'tri', vol: 0.28, r: 0.1 }))) },
  { file: 'encounter', name: 'Encounter', use: 'A wild battle starts', make: () => sfx(0.6, b => { for (let i = 0; i < 6; i++) tone(b, i * 0.07, 0.05, i % 2 ? 1568 : 1175, { duty: 0.5, vol: 0.14, r: 0.02 }); }) },
  { file: 'save', name: 'Save', use: 'Saving the game', make: () => sfx(0.5, b => [1047, 1568, 2093].forEach((f, i) => tone(b, i * 0.1, 0.12, f, { wave: 'tri', vol: 0.3, r: 0.12 }))) }
];

/* ---------------- output ---------------- */
function normalise(buf, peak) {
  let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v));
  const g = mx > 0 ? peak / mx : 1;
  // gentle one-pole low-pass to take the edge off the raw square waves
  let lp = 0; for (let i = 0; i < buf.length; i++) { lp += (buf[i] * g - lp) * 0.55; buf[i] = lp; }
  return buf;
}
function wav(buf) {
  const b = Buffer.alloc(44 + buf.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + buf.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  return b;
}
function encode(buf, dst, kbps) {
  const tmp = path.join(os.tmpdir(), 'mf-audio-' + process.pid + '.wav');
  fs.writeFileSync(tmp, wav(buf));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', kbps + 'k', '-metadata', 'artist=' + AUTHOR, '-metadata', 'copyright=CC0 1.0 (public domain)', dst]);
  fs.unlinkSync(tmp);
}

function main() {
  const meta = { music: {}, sounds: {} };
  const md = fs.mkdirSync(path.join(OUT, 'music'), { recursive: true }); void md;
  fs.mkdirSync(path.join(OUT, 'sounds'), { recursive: true });
  const credit = { origin: 'Original chiptune made for Pocket-Game-Maker (generated by tools/gen-audio.js)', author: AUTHOR, licence: 'CC0 1.0 (public domain)', status: 'Placeholder' };
  for (const s of MUSIC.concat(JINGLES)) {
    const buf = normalise(song(s), 0.85);
    const rel = 'music/' + s.file + '.mp3';
    encode(buf, path.join(OUT, rel), 112);
    meta.music[rel] = Object.assign({ name: s.name, description: s.use + (s.loop ? ' (loops)' : ' (plays once)'), loop: !!s.loop }, credit);
    console.log(rel, (buf.length / SR).toFixed(1) + 's');
  }
  for (const s of SOUNDS) {
    const buf = normalise(s.make(), 0.8);
    const rel = 'sounds/' + s.file + '.mp3';
    encode(buf, path.join(OUT, rel), 96);
    meta.sounds[rel] = Object.assign({ name: s.name, description: s.use }, credit, { origin: 'Original sound effect made for Pocket-Game-Maker (generated by tools/gen-audio.js)' });
  }
  console.log('Wrote', Object.keys(meta.music).length, 'music tracks and', Object.keys(meta.sounds).length, 'sound effects');
  return meta;
}

module.exports = { main, MUSIC, JINGLES, SOUNDS };
if (require.main === module) {
  const meta = main();
  fs.writeFileSync(path.join(OUT, 'audio-meta.json'), JSON.stringify(meta, null, 2));
}
