/* Small UI toolkit for the editor: DOM builder, modals, bound fields, asset pickers. */
(function () {
  'use strict';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c === null || c === undefined || c === false) return; el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return el;
  }
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- modals ---------- */
  const stack = [];
  function modal(opts) {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal ' + (opts.size || ''), role: 'dialog' },
      h('div', { class: 'modal-head' }, h('h2', null, opts.title || ''), h('button', { class: 'icon-btn', title: 'Close (Esc)', onclick: () => close(false) }, '✕')),
      h('div', { class: 'modal-body' }, opts.body),
      opts.buttons ? h('div', { class: 'modal-foot' }, opts.buttons.map(b => h('button', { class: b.primary ? 'primary' : (b.danger ? 'danger' : ''), onclick: () => { const r = b.onClick ? b.onClick() : b.value; if (r !== false) close(b.value !== undefined ? b.value : r); } }, b.label))) : null
    );
    back.appendChild(box);
    document.body.appendChild(back);
    let resolve;
    const p = new Promise(r => { resolve = r; });
    function close(v) {
      if (!back.parentNode) return;
      if (opts.onClose && opts.onClose(v) === false) return;
      back.remove(); stack.splice(stack.indexOf(entry), 1); stopAudio(); resolve(v);
    }
    const entry = { close, opts };
    stack.push(entry);
    back.addEventListener('mousedown', e => { if (e.target === back && opts.dismissable !== false) close(false); });
    setTimeout(() => { const f = box.querySelector('[autofocus], input, select, textarea'); if (f) f.focus(); }, 0);
    p.close = close; p.box = box;
    return p;
  }
  document.addEventListener('keydown', e => {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    if (e.key === 'Escape') { e.preventDefault(); top.close(false); }
    if (e.key === 'Enter' && top.opts.enterValue !== undefined && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); top.close(top.opts.enterValue()); }
  }, true);
  const anyModal = () => stack.length > 0;

  function prompt(title, value, label) {
    const inp = h('input', { type: 'text', value: value || '', autofocus: true });
    return modal({ title, size: 'small', body: h('label', { class: 'field' }, h('span', null, label || ''), inp), enterValue: () => inp.value,
      buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, onClick: () => inp.value }] });
  }
  function confirm(title, text, okLabel, danger) {
    return modal({ title, size: 'small', body: h('p', null, text), enterValue: () => true,
      buttons: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', primary: !danger, danger, value: true }] });
  }
  function alert(title, text) { return modal({ title, size: 'small', body: h('p', null, text), buttons: [{ label: 'OK', primary: true, value: true }] }); }

  let toastTimer;
  function toast(text, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast' }); document.body.appendChild(t); }
    t.textContent = text; t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2400);
  }

  function menu(x, y, items) {
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
    const m = h('div', { class: 'ctx-menu', style: { left: x + 'px', top: y + 'px' } },
      items.filter(Boolean).map(it => it === '-' ? h('hr') : h('button', { disabled: it.disabled, onclick: () => { m.remove(); it.action(); } }, it.label)));
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    if (r.right > innerWidth) m.style.left = (innerWidth - r.width - 4) + 'px';
    if (r.bottom > innerHeight) m.style.top = (innerHeight - r.height - 4) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }

  /* ---------- bound fields ---------- */
  // field(label, obj, key, {type, options, min, max, step, onChange, help, width})
  function field(label, obj, key, o) {
    o = o || {};
    const type = o.type || (typeof obj[key] === 'number' ? 'number' : typeof obj[key] === 'boolean' ? 'checkbox' : 'text');
    let input;
    const changed = v => { obj[key] = v; if (o.onChange) o.onChange(v); App.markDirty(); };
    if (type === 'select') {
      input = h('select', null, (o.options || []).map(op => {
        const [val, text] = Array.isArray(op) ? op : [op, op];
        return h('option', { value: val, selected: String(obj[key] ?? '') === String(val) }, text);
      }));
      input.addEventListener('change', () => changed(o.number ? Number(input.value) : input.value));
    } else if (type === 'checkbox') {
      input = h('input', { type: 'checkbox', checked: !!obj[key] });
      input.addEventListener('change', () => changed(input.checked));
      return h('label', { class: 'field check', title: o.help || '' }, input, h('span', null, label));
    } else if (type === 'textarea') {
      input = h('textarea', { rows: o.rows || 3 }, obj[key] || '');
      input.addEventListener('input', () => changed(input.value));
    } else if (type === 'color') {
      input = h('input', { type: 'color', value: obj[key] || '#888888' });
      input.addEventListener('input', () => changed(input.value));
    } else {
      input = h('input', { type, value: obj[key] ?? '', min: o.min, max: o.max, step: o.step || (type === 'number' ? 'any' : undefined), placeholder: o.placeholder });
      input.addEventListener('input', () => {
        if (type === 'number') { const n = parseFloat(input.value); if (!isNaN(n)) changed(n); }
        else changed(input.value);
      });
      if (type === 'number') input.addEventListener('blur', () => { if (input.value === '' || isNaN(parseFloat(input.value))) { input.value = obj[key] ?? 0; } });
    }
    return h('label', { class: 'field', title: o.help || '', style: o.width ? { flex: '0 0 ' + o.width } : null }, h('span', null, label), input);
  }
  const row = (...kids) => h('div', { class: 'row' }, kids);
  const section = (title, ...kids) => h('fieldset', { class: 'section' }, h('legend', null, title), kids);

  /* ---------- assets ---------- */
  const imgCache = {};
  function assetUrl(rel) {
    if (!rel || !App.proj) return '';
    return window.api.assetUrl(App.proj.path, rel) + '?v=' + (App.assetVersion || 0);
  }
  function loadImage(rel) {
    const url = assetUrl(rel);
    if (!url) return Promise.resolve(null);
    if (imgCache[url]) return imgCache[url];
    imgCache[url] = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    return imgCache[url];
  }
  async function refreshAssets(kind) {
    const kinds = kind ? [kind] : ['tilesets', 'characters', 'monsters', 'battlebacks', 'pictures', 'decorations', 'music', 'sounds', 'text'];
    for (const k of kinds) App.assets[k] = await window.api.listAssets(App.proj.path, k);
  }
  async function importAssets(kind) {
    const got = await window.api.importAssets(App.proj.path, kind);
    if (got && got.length) {
      App.proj.credits = App.proj.credits || {};
      got.forEach(rel => { App.proj.credits[rel] = { name: rel.split('/').pop().replace(/\.[^.]+$/, ''), origin: 'Imported from your computer', author: '', licence: 'Not set', status: 'Custom' }; });
      App.markDirty();
      App.assetVersion = Date.now();
      await refreshAssets(kind);
      toast('Imported ' + got.length + ' file' + (got.length > 1 ? 's' : '') + ' into ' + (kind === 'sounds' ? 'sound effects' : kind));
    }
    return got || [];
  }
  // assetPicker(label, obj, key, kind, {preview: 'full'|'charFrame', onChange})
  function assetPicker(label, obj, key, kind, o) {
    o = o || {};
    const wrap = h('div', { class: 'asset-picker' });
    const render = () => {
      clear(wrap);
      const sel = h('select', null, h('option', { value: '' }, '(none)'),
        (App.assets[kind] || []).map(a => h('option', { value: a, selected: obj[key] === a }, a.split('/').pop())));
      if (obj[key] && !(App.assets[kind] || []).includes(obj[key])) sel.appendChild(h('option', { value: obj[key], selected: true }, obj[key].split('/').pop() + ' (missing)'));
      sel.addEventListener('change', () => { obj[key] = sel.value; App.markDirty(); if (o.onChange) o.onChange(sel.value); render(); });
      const prev = h('div', { class: 'asset-prev ' + (o.preview || 'full') });
      if (obj[key]) loadImage(obj[key]).then(img => {
        if (!img) { prev.textContent = 'missing'; return; }
        if (o.preview === 'charFrame') {
          const c = h('canvas', { width: img.width / 3, height: img.height / 4 });
          c.getContext('2d').drawImage(img, img.width / 3, 0, img.width / 3, img.height / 4, 0, 0, img.width / 3, img.height / 4);
          prev.appendChild(c);
        } else prev.appendChild(h('img', { src: img.src }));
      });
      const imp = h('button', { class: 'small', title: 'Copy image files into this project\'s assets/' + kind + ' folder', onclick: async () => {
        const got = await importAssets(kind);
        if (got.length) { obj[key] = got[0]; App.markDirty(); if (o.onChange) o.onChange(got[0]); render(); }
      } }, 'Import…');
      wrap.append(h('div', { class: 'asset-row' }, sel, imp), prev);
    };
    render();
    return h('div', { class: 'field' }, h('span', null, label), wrap);
  }

  /* ---------- audio ---------- */
  // One shared preview player for the whole editor.
  const player = { el: null, rel: null, btn: null };
  function stopAudio() {
    if (player.el) { player.el.pause(); player.el = null; }
    if (player.btn) { player.btn.textContent = '▶'; player.btn.classList.remove('playing'); }
    player.rel = null; player.btn = null;
  }
  function playAudio(rel, btn) {
    const same = player.rel === rel;
    stopAudio();
    if (!rel || same) return;
    const a = new Audio(/^file:/.test(rel) ? rel : assetUrl(rel));
    a.addEventListener('ended', () => { if (player.el === a) stopAudio(); });
    a.play().catch(() => toast('Could not play ' + rel.split('/').pop(), 'error'));
    player.el = a; player.rel = rel; player.btn = btn || null;
    if (btn) { btn.textContent = '■'; btn.classList.add('playing'); }
  }
  // A ▶/■ button that previews the file returned by getRel().
  function audioButton(getRel) {
    const b = h('button', { class: 'icon-btn play-btn', title: 'Play / stop' }, '▶');
    b.addEventListener('click', e => { e.preventDefault(); const r = getRel(); if (!r) return toast('Nothing chosen to play'); playAudio(r, b); });
    return b;
  }
  // audioPicker(label, obj, key, 'music' | 'sounds', {alsoMusic, none, onChange, specials: [[value, label]]})
  function audioPicker(label, obj, key, kind, o) {
    o = o || {};
    const wrap = h('div', { class: 'asset-row' });
    const render = () => {
      clear(wrap);
      const files = (App.assets[kind] || []).concat(o.alsoMusic ? (App.assets.music || []) : []);
      const sel = h('select', null, h('option', { value: '' }, o.none || '(none)'), (o.specials || []).map(([v, t]) => h('option', { value: v, selected: obj[key] === v }, t)),
        files.map(f => h('option', { value: f, selected: obj[key] === f }, (o.alsoMusic ? f : f.split('/').pop()))));
      if (obj[key] && !files.includes(obj[key]) && !(o.specials || []).some(x => x[0] === obj[key])) sel.appendChild(h('option', { value: obj[key], selected: true }, obj[key].split('/').pop() + ' (missing)'));
      sel.addEventListener('change', () => { obj[key] = sel.value; App.markDirty(); if (o.onChange) o.onChange(sel.value); });
      const imp = h('button', { class: 'small', title: 'Copy MP3 or FLAC files into this project\'s assets/' + kind + ' folder', onclick: async () => {
        const got = await importAssets(kind);
        if (got.length) { obj[key] = got[0]; App.markDirty(); if (o.onChange) o.onChange(got[0]); render(); }
      } }, 'Import…');
      wrap.append(sel, audioButton(() => (obj[key] && obj[key].includes('/')) ? obj[key] : null), imp);
    };
    render();
    return h('div', { class: 'field' }, h('span', null, label), wrap);
  }

  /* ---------- misc ---------- */
  function slug(name, existing) {
    let base = (name || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';
    let id = base, n = 2;
    while (existing.includes(id)) id = base + '_' + (n++);
    return id;
  }
  function listEditor(opts) {
    // opts: {items, label(item), onSelect(item), onAdd(), onDelete(item), onDuplicate(item), selected}
    const ul = h('div', { class: 'list' });
    const filter = h('input', { type: 'search', placeholder: 'Filter…', class: 'list-filter' });
    const draw = () => {
      clear(ul);
      const q = filter.value.toLowerCase();
      opts.items().forEach((it, i) => {
        const text = opts.label(it, i);
        if (q && !text.toLowerCase().includes(q)) return;
        const li = h('div', { class: 'list-item' + (opts.isSelected(it) ? ' sel' : ''), onclick: () => { opts.onSelect(it); draw(); } }, text);
        ul.appendChild(li);
      });
    };
    filter.addEventListener('input', draw);
    const tools = h('div', { class: 'list-tools' },
      h('button', { class: 'small', onclick: () => { opts.onAdd(); draw(); } }, '+ New'),
      opts.onDuplicate ? h('button', { class: 'small', onclick: () => { opts.onDuplicate(); draw(); } }, 'Duplicate') : null,
      h('button', { class: 'small danger', onclick: async () => { if (await opts.onDelete()) draw(); } }, 'Delete'));
    const el = h('div', { class: 'list-panel' }, filter, ul, tools);
    el.redraw = draw;
    draw();
    return el;
  }

  window.UI = { h, clear, modal, prompt, confirm, alert, toast, menu, field, row, section, assetUrl, loadImage, refreshAssets, importAssets, assetPicker, audioPicker, audioButton, playAudio, stopAudio, slug, listEditor, anyModal };
})();
