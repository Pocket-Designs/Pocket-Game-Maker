/* The game's connection to the outside world when it runs on its own (exported for the web or Android).
   The editor's playtest and exported desktop builds provide window.api from their preload script instead,
   so this file only fills it in when it is missing. Saves are kept in the browser's local storage. */
(function () {
  'use strict';
  if (window.api) return;
  const base = 'game/';
  let info = null;
  const key = slot => 'mf-save:' + ((info && info.id) || 'game') + ':' + (+slot === 0 ? 'auto' : slot); // slot 0: Autosave
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  window.api = {
    async getPlaytestData() {
      const data = await (await fetch(base + 'game.json')).json();
      info = data.exportInfo || {};
      return { projectPath: '', data, start: null };
    },
    assetUrl: (dir, rel) => base + 'assets/' + rel.split('/').map(encodeURIComponent).join('/'),
    async readAsset(dir, rel) {
      try {
        const r = await fetch(base + 'assets/' + rel.split('/').map(encodeURIComponent).join('/'));
        return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      } catch (e) { return null; }
    },
    async listSaves(dir, count) {
      const out = [], metaOf = s => { try { return s ? JSON.parse(s).meta || {} : null; } catch (e) { return null; } };
      const auto = metaOf(store.get(key(0)));
      if (auto) out.push({ slot: 0, auto: true, meta: auto });
      for (let i = 1; i <= Math.max(1, Math.min(12, count | 0 || 4)); i++) out.push({ slot: i, meta: metaOf(store.get(key(i))) });
      return out;
    },
    async saveGame(dir, slot, obj) { return store.set(key(slot), JSON.stringify(obj)); },
    async loadGame(dir, slot) { const s = store.get(key(slot)); try { return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    async quitGame() { if (window.AndroidGame && window.AndroidGame.quit) window.AndroidGame.quit(); else window.close(); },
    saveScreenshot: null
  };
})();
