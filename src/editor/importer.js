/* Import window: copy your own images, music, sounds and text files into the project.
   Opened from the toolbar (Import), File → Import Assets… (Ctrl+I) or the Asset Library window. */
(function () {
  'use strict';
  const { h, clear } = UI;
  const KINDS = [
    ['tilesets', 'Tilesets', 'PNG sheets of map tiles in a grid (16, 24, 32 or 48 pixels square). You can add each one to the Database as a tileset straight away.', 'png, jpg, webp, gif'],
    ['characters', 'Characters', 'Walking sprites for the player, people and objects: 3 frames across, 4 directions down (down, left, right, up).', 'png, jpg, webp, gif'],
    ['monsters', 'Monster pictures', 'Front and back battle pictures, and overworld walking sheets for followers.', 'png, jpg, webp, gif'],
    ['battlebacks', 'Battle backgrounds', 'Pictures shown behind battles. Best at the game screen size or larger.', 'png, jpg, webp, gif'],
    ['pictures', 'Pictures', 'Title screen backgrounds, pictures for cut scenes, store key art.', 'png, jpg, webp, gif'],
    ['decorations', 'Decorations', 'Furniture and ornaments players can buy and place in a house. One tile (16 pixels) per square: a 2×1 table is 32×16.', 'png, jpg, webp, gif'],
    ['music', 'Music', 'Background music and jingles.', 'mp3, flac'],
    ['sounds', 'Sound effects', 'Short sounds for menus, battles and events.', 'mp3, flac'],
    ['movies', 'Movies', 'Video cut scenes, played with the Play a movie command or a Cut scene quick event. MP4 (H.264 video, AAC sound) plays everywhere; WebM plays on computers and Android.', 'mp4, webm'],
    ['text', 'Text', 'Credits and licence files for the title screen.', 'txt, md']
  ];

  const Importer = window.Importer = {
    async open(only) {
      if (!App.proj) return UI.toast('Open or create a project first');
      await UI.refreshAssets();
      const body = h('div', { class: 'importer' });
      const draw = () => {
        clear(body);
        body.append(h('p', { class: 'muted', style: { marginTop: 0 } }, 'Choose what kind of file you are adding. The files are copied into your project\'s assets folder, so the originals stay where they are. Each one is added to Database → Credits as Custom: fill in where it came from and its licence before you release your game.'));
        body.append(h('div', { class: 'imp-tpl' },
          h('span', null, 'Drawing your own? The art templates show the exact sizes and layouts (tiles, characters, monsters, furniture, clothes, battle backgrounds).'),
          h('button', { class: 'small', onclick: () => window.api.artTemplates() }, 'Open art templates…')));
        const grid = h('div', { class: 'imp-grid' });
        KINDS.filter(k => !only || k[0] === only).forEach(([kind, name, help, types]) => {
          const have = (App.assets[kind] || []).length;
          grid.appendChild(h('div', { class: 'imp-card' },
            h('div', { class: 'imp-title' }, name, h('span', { class: 'muted' }, have + ' in project')),
            h('div', { class: 'muted imp-help' }, help),
            h('div', { class: 'imp-foot' }, h('span', { class: 'muted' }, types),
              h('span', null,
                window.PixelEditor && PixelEditor.PRESETS.some(p => p.kind === kind) ? h('button', { class: 'small', title: 'Draw a new one in the pixel editor', onclick: async () => { const m = await PixelEditor.newPicture(kind); if (m) await m; await UI.refreshAssets(kind); draw(); } }, 'Draw new…') : null, ' ',
                h('button', { class: 'primary small', onclick: async () => { await Importer.importKind(kind); draw(); } }, 'Import…')))));
        });
        body.append(grid);
      };
      draw();
      await UI.modal({ title: 'Import your own assets', size: 'large', body, buttons: [{ label: 'Close', primary: true, value: true }] });
      App.renderInspector();
      MapEditor.renderPalette && MapEditor.renderPalette();
    },

    async importKind(kind) {
      const got = await UI.importAssets(kind);
      if (!got.length) return got;
      if (kind === 'tilesets') await Importer.offerTilesets(got);
      return got;
    },

    // New tileset images: offer to add each one to Database → Tilesets.
    async offerTilesets(rels) {
      const P = App.proj;
      const fresh = rels.filter(rel => !P.tilesets.some(t => t.image === rel));
      if (!fresh.length) return;
      const o = { add: true, tileSize: 16 };
      const body = h('div', null,
        h('p', null, 'Add ' + (fresh.length === 1 ? 'this image' : 'these ' + fresh.length + ' images') + ' to Database → Tilesets so you can paint maps with ' + (fresh.length === 1 ? 'it' : 'them') + '?'),
        h('ul', { class: 'muted' }, fresh.map(r => h('li', null, r.split('/').pop()))),
        UI.field('Tile size (pixels)', o, 'tileSize', { type: 'select', number: true, options: [[16, '16 × 16'], [24, '24 × 24'], [32, '32 × 32'], [48, '48 × 48']] }));
      App._suppressDirty = true;
      const ok = await UI.modal({ title: 'Add as tilesets?', size: 'small', body, buttons: [{ label: 'Not now', value: false }, { label: 'Add to Database', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      fresh.forEach(rel => {
        const name = rel.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        P.tilesets.push({ id: UI.slug(name, P.tilesets.map(t => t.id)), name, image: rel, tileSize: +o.tileSize || 16, flags: [], animSpeed: 300 });
      });
      App.markDirty();
      UI.toast('Added ' + fresh.length + ' tileset' + (fresh.length > 1 ? 's' : '') + '. Set which tiles block the player in Database → Tilesets.');
    },
    KINDS
  };
})();
