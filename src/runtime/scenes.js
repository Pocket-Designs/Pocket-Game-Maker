/* Opening and ending scenes (Scenes → Opening & Ending Scenes in the editor).

   Three lists in system.scenes: opening (before the title screen), newGame (after New Game, before the first map)
   and ending (played by the "Play ending" event command). Each scene is one of:
     movie    a movie file (MP4 / WebM)
     slides   pictures with captions, one after another (each for some seconds, or until a key is pressed)
     text     story text on a picture or a colour, scrolling up or shown a page at a time
     credits  a credits roll: built from the game's credits list, or your own text, ending with "The End"
   Every scene can change the music and can let the player skip it (X / Esc, or a long tap). Z moves a slide or page on. */
(function () {
  'use strict';
  const { el, esc, wait } = RUI;

  // Simple Markdown for text and credits: # heading, ## subheading, - list item, **bold**, blank line = gap.
  function md(text) {
    const inline = l => esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return String(text || '').split(/\r?\n/).map(l => {
      if (/^#\s/.test(l)) return '<div class="sc-h1">' + inline(l.slice(2)) + '</div>';
      if (/^#{2,6}\s/.test(l)) return '<div class="sc-h2">' + inline(l.replace(/^#+\s*/, '')) + '</div>';
      if (/^\s*[-*]\s/.test(l)) return '<div class="sc-li">' + inline(l.replace(/^\s*[-*]\s/, '')) + '</div>';
      return l.trim() ? '<div>' + inline(l) + '</div>' : '<div class="sc-gap"></div>';
    }).join('');
  }

  const Scenes = window.Scenes = {
    TYPES: { movie: 'Movie', slides: 'Picture slides', text: 'Story text', credits: 'Credits roll' },

    // Play a list of scenes, one after another.
    async play(G, list) {
      list = (list || []).filter(s => s && !s.off);
      if (!list.length) return;
      const ui = document.getElementById('ui');
      for (const sc of list) {
        try { await Scenes.one(G, sc, ui); }
        catch (e) { console.error(e); G.dbg('error', 'The scene "' + (sc.name || sc.type) + '" could not be played: ' + e.message); }
      }
    },

    music(G, sc) {
      if (sc.type === 'movie') return; // a movie pauses the music, or keeps it playing (sc.music 'keep')
      if (sc.music === 'none') GameAudio.stopBgm(0.6);
      else if (sc.music) GameAudio.playBgm(sc.music, { restart: false, fade: 0.4 });
    },

    // Keys during a scene. Returns {skip(), next(), off()}: skip ends the scene, next moves a slide or page on.
    keys(sc, onNext, onSkip) {
      const pop = Input.push(a => {
        if ((a === 'cancel' || a === 'menu') && sc.skippable !== false) onSkip();
        else if (a === 'ok') onNext();
      });
      return pop;
    },

    async one(G, sc, ui) {
      Scenes.music(G, sc);
      if (sc.type === 'movie') { await G.playMovie({ file: sc.file, skippable: sc.skippable !== false, music: sc.music ? 'keep' : 'pause', volume: sc.volume ?? 100, fit: sc.fit || 'fit' }); return; }
      const box = el('div', 'scene' + (sc.type === 'credits' ? ' credits' : ''));
      box.style.background = sc.colour || '#000';
      if (sc.textColour) box.style.color = sc.textColour;
      if (sc.background && sc.type !== 'slides') { const bg = el('img', 'sc-bg'); bg.src = G.asset(sc.background); box.appendChild(bg); }
      if (sc.skippable !== false) box.appendChild(el('div', 'sc-skip', 'X: skip'));
      ui.appendChild(box);
      requestAnimationFrame(() => box.classList.add('on'));
      await wait(350);
      let skipped = false, nextFn = () => {};
      const skipWait = [];
      const pop = Scenes.keys(sc, () => nextFn(), () => { skipped = true; skipWait.forEach(f => f()); });
      let tapTimer = null;
      box.addEventListener('pointerdown', () => { tapTimer = setTimeout(() => { if (sc.skippable !== false) { skipped = true; skipWait.forEach(f => f()); } }, 700); });
      box.addEventListener('pointerup', () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; nextFn(); } });
      // Wait ms (or until Z / a tap, when allowed); resolves early if the scene is skipped.
      const hold = (ms, byKey) => new Promise(res => {
        if (skipped) return res();
        let t = ms > 0 ? setTimeout(done, ms) : null;
        function done() { clearTimeout(t); nextFn = () => {}; res(); }
        if (byKey) nextFn = done;
        skipWait.push(done);
      });
      try {
        if (sc.type === 'slides') await Scenes.slides(G, sc, box, hold, () => skipped);
        else if (sc.type === 'text' && sc.style === 'pages') await Scenes.pages(G, sc, box, hold, () => skipped);
        else await Scenes.roll(G, sc, box, hold, () => skipped);
      } finally {
        pop();
        box.classList.remove('on');
        await wait(350);
        box.remove();
      }
    },

    async slides(G, sc, box, hold, skipped) {
      const slides = (sc.slides || []).filter(s => s.picture || s.text);
      for (let i = 0; i < slides.length && !skipped(); i++) {
        const s = slides[i];
        const page = el('div', 'sc-slide' + (sc.transition === 'cut' ? ' cut' : ''));
        if (s.picture) { const im = el('img', 'sc-pic' + (s.fit === 'fill' ? ' fill' : '')); im.src = G.asset(s.picture); page.appendChild(im); }
        if (s.text) page.appendChild(el('div', 'sc-cap ' + (s.textPos || 'bottom'), md(s.text)));
        box.appendChild(page);
        requestAnimationFrame(() => page.classList.add('on'));
        const secs = s.seconds > 0 ? s.seconds : sc.seconds > 0 ? sc.seconds : 4;
        await hold(sc.advance === 'key' ? 0 : secs * 1000, true);
        page.classList.remove('on');
        if (sc.transition !== 'cut') await wait(400);
        page.remove();
      }
    },

    async pages(G, sc, box, hold, skipped) {
      const pages = String(sc.text || '').split(/\n\s*---+\s*\n|\n{3,}/); // pages are separated by a line of --- (or two blank lines)
      for (let i = 0; i < pages.length && !skipped(); i++) {
        const page = el('div', 'sc-page ' + (sc.align || 'centre'), md(pages[i]));
        box.appendChild(page);
        requestAnimationFrame(() => page.classList.add('on'));
        await hold(sc.advance === 'key' ? 0 : (sc.seconds > 0 ? sc.seconds : 5) * 1000, true);
        page.classList.remove('on'); await wait(400); page.remove();
      }
    },

    // Scrolling text (story crawls and credits). speed: pixels per second at the game's resolution.
    async roll(G, sc, box, hold, skipped) {
      let text = sc.text || '';
      if (sc.type === 'credits' && sc.source !== 'custom') text = await G.creditsText();
      if (sc.type === 'credits' && sc.heading) text = '# ' + sc.heading + '\n\n' + text;
      const inner = el('div', 'sc-roll ' + (sc.align || 'centre'), md(text));
      box.appendChild(inner);
      const H = G.screen.height, h = inner.offsetHeight;
      const speed = Math.max(4, sc.speed || 24);
      let y = H, last = performance.now();
      inner.style.transform = 'translateY(' + y + 'px)';
      await new Promise(res => {
        const step = t => {
          if (skipped()) return res();
          const dt = Math.min(0.1, (t - last) / 1000); last = t;
          y -= speed * dt * (Input.held && Input.held.run ? 3 : 1); // hold Shift to speed it up
          inner.style.transform = 'translateY(' + Math.round(y) + 'px)';
          if (y < -h) return res();
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      inner.remove();
      if (sc.type === 'credits' && sc.endText && !skipped()) {
        const end = el('div', 'sc-end', esc(sc.endText));
        box.appendChild(end);
        requestAnimationFrame(() => end.classList.add('on'));
        await hold(4000, true);
      }
    }
  };
})();
