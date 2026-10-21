/* On-screen controls for touch screens (Android, tablets, phones in a browser):
   a direction pad on the left, A (confirm / talk) and B (cancel / menu) on the right.
   They press the same keys as a keyboard, so the rest of the game needs no changes.
   Shown automatically on touch devices; Database → Menus & screens can force them on or off. */
(function () {
  'use strict';
  const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'z', b: 'x', run: 'Shift' };
  const send = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: KEY[k], bubbles: true }));

  function build() {
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.innerHTML = '<div class="tc-pad"><span class="u">▲</span><span class="l">◀</span><span class="r">▶</span><span class="d">▼</span></div>' +
      '<div class="tc-buttons"><button class="tc-b" data-k="b">B</button><button class="tc-a" data-k="a">A</button></div>';
    document.body.appendChild(root);
    const pad = root.querySelector('.tc-pad');
    let dir = null;
    const setDir = d => { if (d === dir) return; if (dir) send('keyup', dir); dir = d; if (dir) send('keydown', dir); pad.dataset.dir = dir || ''; };
    const fromTouch = t => {
      const r = pad.getBoundingClientRect(), x = t.clientX - (r.left + r.width / 2), y = t.clientY - (r.top + r.height / 2);
      if (Math.hypot(x, y) < r.width * 0.12) return null;
      return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
    };
    const padTouch = e => { e.preventDefault(); const t = [...e.touches].find(t => pad.contains(document.elementFromPoint(t.clientX, t.clientY)) || t.target === pad || pad.contains(t.target)); setDir(t ? fromTouch(t) : null); };
    pad.addEventListener('touchstart', padTouch, { passive: false });
    pad.addEventListener('touchmove', padTouch, { passive: false });
    pad.addEventListener('touchend', padTouch, { passive: false });
    pad.addEventListener('touchcancel', () => setDir(null));
    root.querySelectorAll('button').forEach(b => {
      const k = b.dataset.k;
      b.addEventListener('touchstart', e => { e.preventDefault(); b.classList.add('on'); send('keydown', k); }, { passive: false });
      const up = e => { e.preventDefault(); b.classList.remove('on'); send('keyup', k); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    });
  }

  window.TouchControls = {
    // mode: 'auto' (touch screens only), 'always' or 'never'
    init(mode) {
      const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      if (mode === 'never' || (mode !== 'always' && !touch)) return;
      build();
    }
  };
})();
