/* Layers panel: choose the layer to paint on, show/hide, lock, fade, reorder, add/remove layers and edit their properties. */
(function () {
  'use strict';
  const { h, clear, field, row } = UI;
  const L = () => MF.Layers;
  const COLL_SHORT = { walk: 'Walkable', block: 'Blocks', tile: 'Tile setting' };

  const LP = window.LayersPanel = {
    render() {
      const box = document.getElementById('layers-list');
      if (!box) return;
      clear(box);
      const m = App.map();
      if (!m) return;
      L().migrate(m);
      if (App.layer >= m.layers.length) App.layer = m.layers.length - 1;
      // Top layer first, like most art programs.
      for (let i = m.layers.length - 1; i >= 0; i--) {
        const info = m.layerInfo[i];
        const used = m.layers[i].some(t => t >= 0);
        const badges = [
          h('span', { class: 'lb lb-' + info.collision, title: 'Collision: ' + (L().COLLISION.find(c => c[0] === info.collision) || [])[1] }, COLL_SHORT[info.collision]),
          info.above ? h('span', { class: 'lb lb-above', title: 'Drawn above the player' }, '▲ Above') : null,
          info.encounters !== 'none' ? h('span', { class: 'lb lb-enc', title: 'Wild encounters: ' + (L().ENCOUNTERS.find(c => c[0] === info.encounters) || [])[1] }, '♣') : null,
          info.hideInGame ? h('span', { class: 'lb', title: 'Not drawn in the game' }, 'Hidden in game') : null
        ];
        const rowEl = h('div', { class: 'layer-row' + (i === App.layer ? ' sel' : '') + (info.visible === false ? ' off' : ''), title: 'Double-click for layer properties, right-click for more',
          onclick: () => App.setLayer(i), ondblclick: () => LP.properties(i),
          oncontextmenu: e => { e.preventDefault(); App.setLayer(i); UI.menu(e.clientX, e.clientY, [
            { label: 'Properties…', action: () => LP.properties(i) },
            { label: 'Add a layer above', action: () => LP.add() },
            { label: 'Move up', disabled: i >= m.layers.length - 1, action: () => LP.move(i, 1) },
            { label: 'Move down', disabled: i <= 0, action: () => LP.move(i, -1) },
            '-',
            { label: 'Delete layer', disabled: m.layers.length <= 1, action: () => LP.remove(i) }]); } },
          h('button', { class: 'icon-btn eye', title: info.visible === false ? 'Show layer' : 'Hide layer', onclick: e => { e.stopPropagation(); info.visible = info.visible === false; App.markDirty(); LP.render(); MapEditor.render(); } }, info.visible === false ? '◌' : '◉'),
          h('button', { class: 'icon-btn lock' + (info.locked ? ' on' : ''), title: info.locked ? 'Unlock layer' : 'Lock layer (stops painting on it)', onclick: e => { e.stopPropagation(); info.locked = !info.locked; App.markDirty(); LP.render(); } }, info.locked ? '🔒' : '🔓'),
          h('div', { class: 'layer-main' },
            h('div', { class: 'layer-name' }, h('span', { class: 'muted' }, (i + 1) + '. '), info.name, used ? null : h('span', { class: 'muted', style: { fontSize: '10px', marginLeft: '4px' } }, '(empty)')),
            h('div', { class: 'layer-badges' }, badges)));
        box.appendChild(rowEl);
      }
      const n = m.layers.length;
      document.getElementById('layer-tools').replaceChildren(
        h('button', { class: 'small', title: 'Add a new layer above the selected one', onclick: () => LP.add() }, '+ Add'),
        h('button', { class: 'small', title: 'Layer properties', onclick: () => LP.properties(App.layer) }, 'Properties…'),
        h('button', { class: 'small', title: 'Move layer up (drawn later)', disabled: App.layer >= n - 1, onclick: () => LP.move(App.layer, 1) }, '▲'),
        h('button', { class: 'small', title: 'Move layer down (drawn earlier)', disabled: App.layer <= 0, onclick: () => LP.move(App.layer, -1) }, '▼'),
        h('button', { class: 'small danger', title: n <= 1 ? 'A map needs at least one layer' : 'Delete the selected layer', disabled: n <= 1, onclick: () => LP.remove(App.layer) }, 'Delete'));
    },

    add() {
      const m = App.map(); if (!m) return;
      MapEditor.pushUndo();
      const at = App.layer + 1;
      m.layers.splice(at, 0, new Array(m.width * m.height).fill(-1));
      m.layerInfo.splice(at, 0, L().newLayerInfo(m.layers.length - 1));
      m.layerInfo[at].name = 'Layer ' + m.layers.length;
      App.layer = at;
      App.markDirty(); MapEditor.cacheMapId = null; LP.render(); MapEditor.render();
      LP.properties(at, true);
    },
    move(i, dir) {
      const m = App.map(); const j = i + dir;
      if (j < 0 || j >= m.layers.length) return;
      MapEditor.pushUndo();
      [m.layers[i], m.layers[j]] = [m.layers[j], m.layers[i]];
      [m.layerInfo[i], m.layerInfo[j]] = [m.layerInfo[j], m.layerInfo[i]];
      App.layer = j;
      App.markDirty(); MapEditor.cacheMapId = null; LP.render(); MapEditor.render();
    },
    async remove(i) {
      const m = App.map();
      if (m.layers.length <= 1) return UI.toast('A map needs at least one layer');
      const used = m.layers[i].filter(t => t >= 0).length;
      const msg = 'Delete the layer “' + m.layerInfo[i].name + '”' + (used ? ' and the ' + used + ' tile' + (used === 1 ? '' : 's') + ' painted on it' : '') + '? You can undo this with Ctrl+Z.';
      if (!await UI.confirm('Delete layer', msg, 'Delete', true)) return;
      MapEditor.pushUndo();
      m.layers.splice(i, 1); m.layerInfo.splice(i, 1);
      App.layer = Math.max(0, Math.min(i, m.layers.length - 1));
      App.markDirty(); MapEditor.cacheMapId = null; LP.render(); MapEditor.render();
    },
    async properties(i, isNew) {
      const m = App.map(); const info = m.layerInfo[i]; if (!info) return;
      const work = JSON.parse(JSON.stringify(info));
      const op = { pct: Math.round((work.opacity == null ? 1 : work.opacity) * 100) };
      const body = h('div', null,
        field('Name', work, 'name'),
        h('fieldset', { class: 'section' }, h('legend', null, 'In the game'),
          field('Collision', work, 'collision', { type: 'select', options: L().COLLISION, help: 'Walkable: never blocks. Blocks: anything painted here blocks the player. Tile setting: uses each tile\'s walkable/blocked setting from the tileset.' }),
          field('Drawn above the player and characters (tree tops, roofs, tall grass that covers feet)', work, 'above', { type: 'checkbox' }),
          field('Wild encounters', work, 'encounters', { type: 'select', options: L().ENCOUNTERS }),
          field('Hidden in the game (still counts for collision and encounters, e.g. invisible walls)', work, 'hideInGame', { type: 'checkbox' })),
        h('fieldset', { class: 'section' }, h('legend', null, 'In the editor'),
          row(field('Visible', work, 'visible', { type: 'checkbox' }), field('Locked (can\'t be painted on)', work, 'locked', { type: 'checkbox' })),
          field('Opacity while editing (%)', op, 'pct', { type: 'number', min: 0, max: 100 })),
        h('p', { class: 'muted' }, 'If any layer blocks a square, the player can\'t walk there. Layers are drawn from the bottom of the list (layer 1) to the top.'));
      App._suppressDirty = true;
      const ok = await UI.modal({ title: (isNew ? 'New layer' : 'Layer properties') + ' — layer ' + (i + 1), body, buttons: [{ label: isNew ? 'Done' : 'Cancel', value: !!isNew }, { label: 'Save', primary: true, value: true }] });
      App._suppressDirty = false;
      if (!ok) return;
      work.opacity = Math.max(0, Math.min(100, +op.pct || 0)) / 100;
      MapEditor.pushUndo();
      m.layerInfo[i] = work;
      App.markDirty(); LP.render(); MapEditor.render();
    }
  };
})();
