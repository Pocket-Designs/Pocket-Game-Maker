/* Runtime input + window primitives (message box, choice menus, fades). */
(function () {
  'use strict';
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok',
    x: 'cancel', X: 'cancel', Escape: 'cancel', Backspace: 'cancel',
    Shift: 'run', Control: 'through', r: 'turn', R: 'turn'
  };
  const Input = window.Input = {
    stack: [], held: {}, onFree: null,
    init() {
      window.addEventListener('keydown', e => {
        const a = KEYS[e.key];
        if (!a) return;
        e.preventDefault();
        this.held[a] = true;
        if ((a === 'ok' || a === 'cancel') && e.repeat) return;
        if (this.stack.length) this.stack[this.stack.length - 1](a);
        else if (this.onFree) this.onFree(a);
      });
      window.addEventListener('keyup', e => { const a = KEYS[e.key]; if (a) this.held[a] = false; });
      window.addEventListener('blur', () => { this.held = {}; });
    },
    push(fn) { this.stack.push(fn); return () => { const i = this.stack.lastIndexOf(fn); if (i >= 0) this.stack.splice(i, 1); }; },
    busy() { return this.stack.length > 0; },
    dir() { for (const d of ['up', 'down', 'left', 'right']) if (this.held[d]) return d; return null; }
  };

  const ui = () => document.getElementById('ui');
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- message box ---------- */
  let msgBox = null;
  function ensureMsg() {
    if (msgBox && msgBox.parentNode) return msgBox;
    msgBox = el('div', 'win msg');
    msgBox.innerHTML = '<div class="speaker" style="display:none"></div><div class="txt"></div><div class="more" style="display:none">▼</div>';
    ui().appendChild(msgBox);
    return msgBox;
  }
  function paginate(text) {
    const box = ensureMsg();
    const t = box.querySelector('.txt');
    const maxH = box.clientHeight - 10;
    const pages = [];
    String(text).split(/\n\n+/).forEach(par => {
      const words = par.split(/(\s+)/);
      let cur = '';
      for (const w of words) {
        t.textContent = cur + w;
        if (t.scrollHeight > maxH && cur.trim()) { pages.push(cur.trim()); cur = w.trimStart(); }
        else cur += w;
      }
      if (cur.trim()) pages.push(cur.trim());
    });
    t.textContent = '';
    return pages.length ? pages : [''];
  }
  async function message(text, opts) {
    opts = opts || {};
    const box = ensureMsg();
    const sp = box.querySelector('.speaker');
    sp.style.display = opts.speaker ? '' : 'none';
    sp.textContent = opts.speaker || '';
    const pages = paginate(text);
    for (let p = 0; p < pages.length; p++) {
      await typePage(box, pages[p], opts, p === pages.length - 1);
    }
    if (!opts.keep) closeMessage();
  }
  function typePage(box, text, opts, last) {
    return new Promise(resolve => {
      const t = box.querySelector('.txt'), more = box.querySelector('.more');
      more.style.display = 'none';
      let i = 0, done = false, timer = null, autoT = null;
      const finish = () => {
        done = true; t.textContent = text; clearInterval(timer);
        if (opts.auto !== undefined) autoT = setTimeout(close, opts.auto);
        else more.style.display = '';
      };
      const close = () => { clearTimeout(autoT); pop(); resolve(); };
      const pop = Input.push(a => {
        if (a !== 'ok' && a !== 'cancel') return;
        if (!done) finish(); else close();
      });
      box.onclick = () => { if (!done) finish(); else close(); };
      const speed = opts.speed || RUI.textSpeed || 2; // the player's Options choice
      timer = setInterval(() => { i += speed; t.textContent = text.slice(0, i); if (i >= text.length) finish(); }, 16);
      if (!text.length) finish();
      void last;
    });
  }
  function closeMessage() { if (msgBox) { msgBox.remove(); msgBox = null; } }
  // Show text instantly without waiting for input (used as a prompt under menus).
  function say(text, speaker) {
    const box = ensureMsg();
    const sp = box.querySelector('.speaker');
    sp.style.display = speaker ? '' : 'none'; sp.textContent = speaker || '';
    box.querySelector('.txt').textContent = text;
    box.querySelector('.more').style.display = 'none';
    box.onclick = null;
  }

  /* ---------- choice menu ---------- */
  // opts: {items:[{label,right,disabled,help}], x,y,w, right, bottom, cols, cancel, index, title, help:fn, dark, onMove}
  function choose(opts) {
    const box = el('div', 'win menu' + (opts.cols > 1 ? ' grid' : '') + (opts.dark ? ' dark' : ''));
    if (opts.cols > 1) box.style.gridTemplateColumns = 'repeat(' + opts.cols + ', 1fr)';
    // position: x / left, y / top, right, bottom; width: w
    ['left', 'top', 'right', 'bottom', 'width'].forEach(k => { const alias = { left: 'x', top: 'y', width: 'w' }[k]; const v = opts[k] !== undefined ? opts[k] : alias ? opts[alias] : undefined; if (v !== undefined) box.style[k] = v + 'px'; });
    if (opts.maxH) { box.style.maxHeight = opts.maxH + 'px'; box.style.overflowY = 'auto'; }
    if (opts.title) { const t = el('div', 'title', esc(opts.title)); if (opts.cols > 1) t.style.gridColumn = '1 / -1'; box.appendChild(t); }
    const rows = opts.items.map((it, i) => {
      const o = el('div', 'opt' + (it.disabled ? ' dis' : ''), '<span>' + esc(it.label) + '</span>' + (it.right !== undefined ? '<span class="r">' + esc(it.right) + '</span>' : ''));
      o.addEventListener('mouseenter', () => set(i));
      o.addEventListener('click', () => { set(i); pick(); });
      box.appendChild(o);
      return o;
    });
    let idx = Math.max(0, Math.min(opts.items.length - 1, opts.index || 0));
    const cols = opts.cols || 1;
    let resolveFn;
    const p = new Promise(r => { resolveFn = r; });
    function set(i, byKey) {
      if (byKey && i !== idx && window.GameAudio) GameAudio.se('cursor');
      idx = i;
      rows.forEach((r, k) => r.classList.toggle('sel', k === idx));
      if (rows[idx]) rows[idx].scrollIntoView({ block: 'nearest' });
      if (opts.onMove) opts.onMove(idx);
    }
    function pick() {
      const it = opts.items[idx];
      if (!it || it.disabled) { if (window.GameAudio) GameAudio.se('buzzer'); if (opts.onDisabled) opts.onDisabled(idx); return; }
      if (window.GameAudio && !opts.silent) GameAudio.se('confirm');
      done(idx);
    }
    function done(v) { pop(); if (!opts.keep) box.remove(); resolveFn(v); }
    const pop = Input.push(a => {
      const n = opts.items.length;
      // onKey(action, index): a screen can handle a key itself; returning a value closes the menu with it.
      if (opts.onKey) { const v = opts.onKey(a, idx); if (v) return done(v); }
      if (a === 'up') set((idx - cols + n) % n, true);
      else if (a === 'down') set((idx + cols) % n, true);
      else if (a === 'left' && cols > 1) set((idx - 1 + n) % n, true);
      else if (a === 'right' && cols > 1) set((idx + 1) % n, true);
      else if (a === 'ok') pick();
      else if (a === 'cancel' && opts.cancel !== false) { if (window.GameAudio) GameAudio.se('cancel'); done(-1); }
    });
    (opts.parent || ui()).appendChild(box);
    set(idx);
    p.el = box;
    return p;
  }

  async function confirm(text, opts) {
    await message(text, Object.assign({ keep: true, auto: 0 }, opts || {}));
    const r = await choose({ items: [{ label: 'Yes' }, { label: 'No' }], right: 6, bottom: 56, w: 56 });
    closeMessage();
    return r === 0;
  }

  function toast(text, ms) {
    const t = el('div', 'toast', esc(text));
    ui().appendChild(t);
    setTimeout(() => t.remove(), ms || 1600);
  }
  function fade(on, ms) {
    const f = document.getElementById('fade');
    f.style.transitionDuration = (ms || 250) + 'ms';
    f.style.opacity = on ? 1 : 0;
    return wait((ms || 250) + 20);
  }

  window.RUI = { el, esc, wait, message, closeMessage, say, choose, confirm, toast, fade };
})();
