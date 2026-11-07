/* The Opening & Ending Scenes window (Scenes menu, or the Scenes button on the toolbar).

   Three lists of scenes in system.scenes, each played in order:
     opening   before the title screen (studio logo, an intro movie, "Long ago…" story text)
     newGame   after the player picks New Game, before the first map (the professor's speech, a prologue)
     ending    when an event runs "Play the ending" (the final cut scene, then the credits roll)
   A scene is a movie, picture slides, story text or a credits roll (see src/runtime/scenes.js). */
(function () {
  'use strict';
  const { h, clear } = UI;

  const GROUPS = [
    ['opening', 'Before the title', 'Played when the game starts, before the title screen. Good for a studio logo, an intro movie or a short story. Players can watch it again with "Replay Opening" on the title screen (Database → Menus & Screens).'],
    ['newGame', 'New game starts', 'Played after the player picks New Game, before the first map. Good for a prologue or the professor\'s welcome.'],
    ['ending', 'Ending & credits', 'Played when an event uses the "Play the ending (or other story scenes)" command, e.g. after the final battle. Usually a last scene and then the credits roll.']
  ];
  const TYPES = [
    ['movie', '🎬', 'Movie', 'An MP4 or WebM movie file.'],
    ['slides', '🖼', 'Picture slides', 'Pictures with captions, one after another.'],
    ['text', '📜', 'Story text', 'Text that scrolls up, or a page at a time.'],
    ['credits', '🎞', 'Credits roll', 'Scrolling credits, built from your credits list or written yourself, then "The End".']
  ];
  const ICON = Object.fromEntries(TYPES.map(t => [t[0], t[1]]));
  const NAME = Object.fromEntries(TYPES.map(t => [t[0], t[2]]));

  function newScene(type, group) {
    const base = { id: 'sc' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), type, name: NAME[type], skippable: true, music: '' };
    if (type === 'movie') return Object.assign(base, { file: '', fit: 'fit', volume: 100 });
    if (type === 'slides') return Object.assign(base, { transition: 'fade', advance: 'auto', seconds: 4, colour: '#000000',
      slides: [{ picture: '', text: 'Long ago, people and monsters lived side by side…', seconds: 4, textPos: 'bottom', fit: 'fit' }] });
    if (type === 'text') return Object.assign(base, { style: group === 'ending' ? 'pages' : 'scroll', align: 'centre', speed: 18, seconds: 5, advance: 'auto',
      colour: '#000000', textColour: '#ffffff', background: '',
      text: group === 'ending' ? '# The End?\n\nThank you for playing!' : '# Long ago…\n\nPeople and monsters lived side by side.\n\nThen one day, everything changed.\n\nThis is your story.' });
    return Object.assign(base, { source: 'auto', heading: 'Credits', text: '# Credits\n\n## Made by\nYour name\n\n## Special thanks\nEveryone who played!', speed: 24, endText: 'The End',
      colour: '#000000', textColour: '#ffffff', background: '' });
  }

  const SE = window.ScenesEditor = {
    group: 'opening', sel: {},
    S() { const s = App.proj.system; s.scenes = MF.Config.withDefaults(s).scenes; return s.scenes; },
    list() { return SE.S()[SE.group]; },

    open(group) {
      if (group && GROUPS.some(g => g[0] === group)) SE.group = group;
      if (UI.anyModal()) return UI.toast('Close the open window first');
      SE.root = h('div', { style: { width: '100%', height: '100%', display: 'flex' } });
      SE.draw();
      UI.modal({ title: 'Opening & Ending Scenes', size: 'full', body: SE.root, buttons: [{ label: 'Done', primary: true, value: true }] });
    },

    draw() {
      const root = clear(SE.root);
      const S = SE.S(), list = SE.list();
      const tabs = h('div', { class: 'db-tabs' }, GROUPS.map(([k, n]) => h('div', { class: 'db-tab' + (SE.group === k ? ' sel' : ''), onclick: () => { SE.group = k; SE.draw(); } },
        n, h('span', { class: 'muted' }, ' ' + S[k].filter(s => !s.off).length))));
      let cur = list.find(s => s.id === SE.sel[SE.group]) || list[0];
      SE.sel[SE.group] = cur && cur.id;

      // the list of scenes in this group, in the order they play
      const items = h('div', { class: 'list' }, list.length ? list.map((s, i) => h('div', { class: 'list-item' + (s === cur ? ' sel' : '') + (s.off ? ' off' : ''), title: s.off ? 'Turned off: it will not play' : '',
        onclick: () => { SE.sel[SE.group] = s.id; SE.draw(); } }, (i + 1) + '. ' + ICON[s.type] + ' ' + (s.name || NAME[s.type]), s.off ? h('span', { class: 'muted' }, 'off') : null))
        : h('p', { class: 'muted', style: { padding: '8px 10px' } }, 'No scenes yet. Click “+ Add scene”.'));
      const move = d => { const i = list.indexOf(cur), j = i + d; if (!cur || j < 0 || j >= list.length) return; list.splice(i, 1); list.splice(j, 0, cur); App.markDirty(); SE.draw(); };
      const tools = h('div', { class: 'list-tools' },
        h('button', { class: 'small primary', onclick: e => { const r = e.target.getBoundingClientRect();
          UI.menu(r.left, r.bottom, TYPES.map(([t, ic, n, d]) => ({ label: ic + ' ' + n + ' — ' + d, action: () => { const s = newScene(t, SE.group); list.push(s); SE.sel[SE.group] = s.id; App.markDirty(); SE.draw(); } }))); } }, '+ Add scene'),
        h('button', { class: 'small', disabled: !cur, title: 'Make a copy', onclick: () => { const c = JSON.parse(JSON.stringify(cur)); c.id = newScene(cur.type).id; c.name = (cur.name || '') + ' (copy)'; list.splice(list.indexOf(cur) + 1, 0, c); SE.sel[SE.group] = c.id; App.markDirty(); SE.draw(); } }, 'Duplicate'),
        h('button', { class: 'small', disabled: !cur || list.indexOf(cur) === 0, title: 'Play earlier', onclick: () => move(-1) }, '▲'),
        h('button', { class: 'small', disabled: !cur || list.indexOf(cur) === list.length - 1, title: 'Play later', onclick: () => move(1) }, '▼'),
        h('button', { class: 'small danger', disabled: !cur, onclick: async () => { if (!await UI.confirm('Delete scene', 'Delete "' + (cur.name || NAME[cur.type]) + '"?', 'Delete', true)) return; list.splice(list.indexOf(cur), 1); App.markDirty(); SE.draw(); } }, 'Delete'));
      const grp = GROUPS.find(g => g[0] === SE.group);
      const head = h('div', { class: 'sc-group-head' }, h('p', { class: 'muted' }, grp[2]),
        h('button', { class: 'small', disabled: !list.some(s => !s.off), title: 'Playtest every scene in this list, in order', onclick: () => SE.preview(list) }, '▶ Play all'),
        SE.group === 'ending' ? UI.field('Afterwards', S, 'endingThen', { type: 'select', options: [['title', 'Back to the title screen'], ['continue', 'Carry on playing (post-game)']],
          help: 'What happens after the ending scenes. You can also choose this in each "Play the ending" command.' }) : null);
      const side = h('div', { class: 'list-panel' }, head, items, tools);

      const form = h('div', { class: 'db-form' });
      if (cur) SE.form(form, cur);
      else form.append(h('h2', null, grp[1]), h('p', { class: 'muted' }, 'Add a scene to get started. Ideas:'),
        h('div', { class: 'sc-ideas' }, (SE.group === 'ending' ? [['text', 'A last message'], ['credits', 'The credits roll']] : SE.group === 'newGame' ? [['slides', 'A picture prologue'], ['text', 'A welcome message']] : [['text', 'An opening story crawl'], ['slides', 'Picture slides'], ['movie', 'An intro movie']])
          .map(([t, label]) => h('button', { onclick: () => { const s = newScene(t, SE.group); s.name = label; list.push(s); SE.sel[SE.group] = s.id; App.markDirty(); SE.draw(); } }, ICON[t] + ' ' + label))));
      root.appendChild(h('div', { class: 'db scenes-ed' }, tabs, side, form));
    },

    // Playtest scenes (the game starts with them, then shows the title screen).
    preview(scenes) {
      scenes = scenes.filter(s => !s.off || scenes.length === 1);
      if (!scenes.length) return UI.toast('Nothing to play');
      App.playtest({ scenes: JSON.parse(JSON.stringify(scenes)) });
    },

    form(form, sc) {
      const redraw = () => SE.draw();
      const F = UI.field;
      form.append(
        h('h2', null, ICON[sc.type] + ' ' + (sc.name || NAME[sc.type])),
        h('div', { class: 'id-line' }, NAME[sc.type] + ' · scene ' + (SE.list().indexOf(sc) + 1) + ' of ' + SE.list().length),
        h('div', { class: 'row' }, F('Name (only you see this)', sc, 'name', { onChange: () => { const t = form.querySelector('h2'); if (t) t.textContent = ICON[sc.type] + ' ' + sc.name; } }),
          h('button', { class: 'primary', style: { alignSelf: 'flex-end' }, onclick: () => SE.preview([sc]) }, '▶ Preview')),
        h('div', { class: 'row' },
          F('Play this scene', { v: !sc.off }, 'v', { type: 'checkbox', onChange: v => { sc.off = !v; redraw(); }, help: 'Untick to keep the scene but not play it.' }),
          F('Players can skip it (X / Esc, or a long tap)', sc, 'skippable', { type: 'checkbox' })));
      if (sc.type !== 'movie') form.append(UI.audioPicker('Music', sc, 'music', 'music', { none: '(keep the music that is playing)', specials: [['none', '(silence: stop the music)']] }));

      if (sc.type === 'movie') {
        form.append(UI.section('Movie',
          UI.moviePicker('Movie file', sc, 'file'),
          h('div', { class: 'row' },
            F('Size', sc, 'fit', { type: 'select', options: [['fit', 'Fit the screen (black bars if needed)'], ['fill', 'Fill the screen (crops the edges)']] }),
            F('Volume %', sc, 'volume', { type: 'number', min: 0, max: 100, width: '110px' })),
          F('Game music', sc, 'music', { type: 'select', options: [['', 'Pause it during the movie'], ['keep', 'Keep playing under the movie']] }),
          h('p', { class: 'muted' }, 'Import movies with “Import…”, or from the Asset Library. MP4 (H.264) plays everywhere.')));
      }

      if (sc.type === 'slides') {
        const box = h('div', { class: 'sc-slides' });
        const drawSlides = () => {
          clear(box);
          sc.slides.forEach((s, i) => {
            const mv = d => { const j = i + d; if (j < 0 || j >= sc.slides.length) return; sc.slides.splice(i, 1); sc.slides.splice(j, 0, s); App.markDirty(); drawSlides(); };
            box.appendChild(h('div', { class: 'sc-slide-ed' },
              h('div', { class: 'sc-slide-num' }, String(i + 1), h('button', { class: 'icon-btn', title: 'Earlier', disabled: i === 0, onclick: () => mv(-1) }, '▲'),
                h('button', { class: 'icon-btn', title: 'Later', disabled: i === sc.slides.length - 1, onclick: () => mv(1) }, '▼'),
                h('button', { class: 'icon-btn', title: 'Remove this slide', onclick: () => { sc.slides.splice(i, 1); App.markDirty(); drawSlides(); } }, '✕')),
              h('div', { class: 'sc-slide-body' },
                UI.assetPicker('Picture', s, 'picture', 'pictures'),
                F('Caption (optional; **bold**, # heading)', s, 'text', { type: 'textarea', rows: 2 }),
                h('div', { class: 'row' },
                  F('Caption place', s, 'textPos', { type: 'select', options: [['bottom', 'Bottom'], ['top', 'Top'], ['centre', 'Middle']] }),
                  F('Picture size', s, 'fit', { type: 'select', options: [['fit', 'Fit'], ['fill', 'Fill (crop)']] }),
                  sc.advance === 'key' ? null : F('Seconds', s, 'seconds', { type: 'number', min: 0.5, max: 60, width: '90px' })))));
          });
          box.appendChild(h('button', { class: 'small', onclick: () => { const last = sc.slides[sc.slides.length - 1]; sc.slides.push({ picture: last ? last.picture : '', text: '', seconds: sc.seconds || 4, textPos: last ? last.textPos : 'bottom', fit: last ? last.fit : 'fit' }); App.markDirty(); drawSlides(); } }, '+ Add slide'));
        };
        drawSlides();
        form.append(UI.section('How the slides change',
          h('div', { class: 'row' },
            F('Next slide', sc, 'advance', { type: 'select', options: [['auto', 'After some seconds (Z skips ahead)'], ['key', 'When the player presses Z / taps']], onChange: () => drawSlides() }),
            F('Change', sc, 'transition', { type: 'select', options: [['fade', 'Fade'], ['cut', 'Cut (instant)']] }),
            F('Background colour', sc, 'colour', { type: 'color', width: '130px' }))),
          UI.section('Slides', box));
      }

      if (sc.type === 'text' || sc.type === 'credits') {
        const scroll = sc.type === 'credits' || sc.style !== 'pages';
        const sec = UI.section(sc.type === 'credits' ? 'Credits' : 'Text');
        if (sc.type === 'credits') {
          sec.append(F('Credits come from', sc, 'source', { type: 'select', options: [['auto', 'The game\'s credits list (Database → Credits)'], ['custom', 'Text I write here']], onChange: redraw }),
            sc.source === 'custom' ? null : F('Heading above them (optional)', sc, 'heading'));
        } else {
          sec.append(F('Show the text', sc, 'style', { type: 'select', options: [['scroll', 'Scrolling up (a story crawl)'], ['pages', 'A page at a time']], onChange: redraw }));
        }
        if (sc.type === 'text' || sc.source === 'custom') {
          sec.append(F(sc.type === 'text' && sc.style === 'pages' ? 'Text (start a new page with a line of ---)' : 'Text', sc, 'text', { type: 'textarea', rows: 10 }),
            h('p', { class: 'muted' }, 'Tips: start a line with # for a big heading, ## for a small one, - for a list. **Two stars** make bold text. A blank line leaves a gap.'));
        }
        sec.append(h('div', { class: 'row' },
          scroll ? F('Scroll speed', sc, 'speed', { type: 'number', min: 4, max: 200, width: '120px', help: 'Pixels per second. Players can hold Shift to speed it up.' }) : null,
          !scroll ? F('Next page', sc, 'advance', { type: 'select', options: [['auto', 'After some seconds'], ['key', 'When the player presses Z / taps']], onChange: redraw }) : null,
          !scroll && sc.advance !== 'key' ? F('Seconds per page', sc, 'seconds', { type: 'number', min: 1, max: 60, width: '120px' }) : null,
          F('Line up', sc, 'align', { type: 'select', options: [['centre', 'Centre'], ['left', 'Left']] })),
          sc.type === 'credits' ? F('Words at the end (blank for none)', sc, 'endText') : null);
        form.append(sec, UI.section('Look',
          h('div', { class: 'row' }, F('Background colour', sc, 'colour', { type: 'color', width: '130px' }), F('Text colour', sc, 'textColour', { type: 'color', width: '130px' })),
          UI.assetPicker('Background picture (optional)', sc, 'background', 'pictures')));
      }
    }
  };
})();
