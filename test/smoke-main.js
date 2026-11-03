// Electron smoke test: opens the sample project, screenshots editor views, then drives a playtest.
// Run: xvfb-run -a npx electron test/smoke-main.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const OUT = path.resolve(process.argv[process.argv.length - 1].endsWith('smoke-main.js') ? 'smoke-out' : process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-proj-'));
fs.cpSync(path.join(__dirname, '..', 'templates', 'sample'), proj, { recursive: true });

const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, win) => {
  win.webContents.on('console-message', (ev, level, msg, line, src) => { if (ev && ev.message !== undefined) { level = { error: 3, warning: 2 }[ev.level] || 0; msg = ev.message; line = ev.lineNumber; src = ev.sourceId; } if (level >= 2) errors.push('[' + path.basename(src || '') + ':' + line + '] ' + msg); });
  win.webContents.on('preload-error', (ev, p, err) => errors.push('preload: ' + err));
});

require('../main.js');

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  console.log('shot', name);
}
const js = (win, code) => win.webContents.executeJavaScript(code, true);
async function key(win, k, times = 1, gap = 120) {
  for (let i = 0; i < times; i++) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k });
    await sleep(40);
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k });
    await sleep(gap);
  }
}

app.whenReady().then(async () => {
  await sleep(1500);
  const editor = BrowserWindow.getAllWindows()[0];
  await shot(editor, '01-welcome');
  await js(editor, `App.openProject(${JSON.stringify(proj)}); 0`);
  await sleep(1200);
  await js(editor, `document.getElementById('zoom').value='2'; App.zoom=2; MapEditor.render();`);
  await shot(editor, '02-map-editor');
  await js(editor, `document.getElementById('chk-pass').click()`);
  await js(editor, `App.selectMap('map002')`); await sleep(500);
  await shot(editor, '03-route-passability');
  await js(editor, `document.getElementById('chk-pass').click(); App.setMode('event'); App.selectedEventId = App.map().events.find(e=>e.name.startsWith('Twins')).id; MapEditor.render(); App.renderInspector();`);
  await sleep(300);
  await shot(editor, '04-events-mode');
  await js(editor, `EventEditor.open(App.selectedEvent()); 0`); await sleep(500);
  await shot(editor, '05-event-editor');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `DB.tab='monsters'; DB.open()`); await sleep(700);
  await shot(editor, '06-db-monsters');
  await js(editor, `DB.tab='types'; DB.draw()`); await sleep(400);
  await shot(editor, '07-db-types');
  await js(editor, `DB.tab='tilesets'; DB.draw()`); await sleep(500);
  await shot(editor, '08-db-tilesets');
  await js(editor, `DB.tab='moves'; DB.draw()`); await sleep(300);
  await shot(editor, '08b-db-moves');
  await js(editor, `DB.tab='system'; DB.draw()`); await sleep(400);
  await shot(editor, '09-db-system');
  await key(editor, 'Escape'); await sleep(300);

  // ---- asset library
  await js(editor, `AssetLib.open(); 0`); await sleep(1200);
  await shot(editor, 'L1-library-tilesets');
  await js(editor, `AssetLib.add(AssetLib.lib.items.filter(i => i.kind === 'tilesets' || i.kind === 'battlebacks'), false); 0`); await sleep(1200);
  console.log('tilesets after add:', await js(editor, `App.proj.tilesets.map(t => t.id + ':' + (t.names||[]).length).join(', ')`));
  await js(editor, `AssetLib.tab='characters'; AssetLib.draw(); 0`); await sleep(700);
  await shot(editor, 'L2-library-characters');
  await js(editor, `AssetLib.tab='monsters'; AssetLib.draw(); 0`); await sleep(700);
  await shot(editor, 'L3-library-monsters');
  await key(editor, 'Escape'); await sleep(400);
  const libRoundTrip = await js(editor, `(async () => { const t = App.proj.tilesets.find(t => t.id === 'cave'); t.flags[0].enc = true; await AssetLib.saveMapping(t); const m = await window.api.libraryMapping(t.library); t.flags[0].enc = false; await AssetLib.saveMapping(t); return m.tiles[0].enc + '/' + m.tiles[0].name; })()`);
  console.log('mapping save round trip (expect true/Cave floor):', libRoundTrip);
  await js(editor, `DB.tab='tilesets'; DB.sel.tilesets='town'; DB.open(); 0`); await sleep(900);
  await shot(editor, 'L4-db-town-tileset');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectMap('map001'); 0`); await sleep(600);

  // ---- credits
  await js(editor, `AssetLib.open(); 0`); await sleep(1000);
  await js(editor, `AssetLib.tab='characters'; AssetLib.draw(); 0`); await sleep(600);
  await shot(editor, 'C1-library-credits');
  await key(editor, 'Escape'); await sleep(300);
  const libCred = await js(editor, `(async () => { await window.api.librarySetCredit('characters', 'characters/hiker.png', { status: 'Custom', origin: 'Smoke test origin', licence: 'Test licence' }); const l = await window.api.libraryList(); const it = l.items.find(i => i.key === 'characters/hiker.png'); await window.api.librarySetCredit('characters', 'characters/hiker.png', { status: 'Placeholder', origin: '', licence: 'CC0 1.0 (public domain)' }); return it.credit.status + '/' + it.credit.origin; })()`);
  console.log('library credit edit (expect Custom/Smoke test origin):', libCred);
  const libMd = fs.readFileSync(path.join(require('electron').app.getPath('documents'), 'Pocket-Game-Maker', 'Asset Library', 'CREDITS.md'), 'utf8');
  console.log('library CREDITS.md rows:', (libMd.match(/^\| (tilesets|characters|monsters|battlebacks)\//gm) || []).length);
  await js(editor, `DB.tab='credits'; DB.open(); 0`); await sleep(900);
  await shot(editor, 'C2-db-credits');
  await key(editor, 'Escape'); await sleep(300);

  // ---- quick events in the editor
  await js(editor, `App.selectMap('map001'); App.setMode('event'); 0`); await sleep(400);
  await js(editor, `QuickEvent.open('chest', 2, 4); 0`); await sleep(900);
  await shot(editor, 'Q1-quick-chest-dialog');
  await js(editor, `document.querySelector('.modal-foot .primary').click(); 0`); await sleep(600);
  console.log('quick chest created:', await js(editor, `(() => { const e = App.map().events.find(e => e.x === 2 && e.y === 4); return e ? e.quick.type + ' pages=' + e.pages.length + ' cmds=' + e.pages[0].commands.map(c => c.cmd).join(',') : 'none'; })()`));
  await js(editor, `QuickEvent.open('sign', 3, 4); 0`); await sleep(700);
  await js(editor, `(() => { const ta = document.querySelector('.modal textarea'); ta.value = 'Custom sign text from the test.'; ta.dispatchEvent(new Event('input')); document.querySelector('.modal-foot .primary').click(); })(); 0`); await sleep(500);
  console.log('quick sign text:', await js(editor, `App.map().events.find(e => e.x === 3 && e.y === 4).pages[0].commands[0].text`));
  await js(editor, `QuickEvent.open('item', 4, 4); 0`); await sleep(700);
  await shot(editor, 'Q2-quick-item-dialog');
  await js(editor, `document.querySelector('.modal-foot .primary').click(); 0`); await sleep(500);
  await js(editor, `App.selectedEventId = App.map().events.find(e => e.name === 'Treasure chest' && e.x === 17).id; MapEditor.render(); App.renderInspector(); 0`); await sleep(300);
  await shot(editor, 'Q3-events-with-quick');
  // reopening keeps settings; full-editor edits convert to a normal event
  console.log('reopen keeps item:', await js(editor, `App.map().events.find(e => e.x === 17 && e.y === 6).quick.itemId`));
  // ---- layers
  await js(editor, `App.selectMap('map001'); App.setMode('map'); App.setLayer(1); 0`); await sleep(600);
  await shot(editor, 'Y1-layers-panel');
  await js(editor, `LayersPanel.properties(2); 0`); await sleep(600);
  await shot(editor, 'Y2-layer-properties');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `LayersPanel.add(); 0`); await sleep(600);
  await js(editor, `(() => { const b = document.querySelector('.modal'); const name = b.querySelector('input[type=text]'); name.value = 'Invisible walls'; name.dispatchEvent(new Event('input'));
    const sel = b.querySelector('select'); sel.value = 'block'; sel.dispatchEvent(new Event('change'));
    const cb = [...b.querySelectorAll('label.check')].find(l => l.textContent.includes('Hidden in the game')).querySelector('input'); cb.checked = true; cb.dispatchEvent(new Event('change'));
    document.querySelector('.modal-foot .primary').click(); })(); 0`); await sleep(500);
  await js(editor, `MapEditor.brush = { x: 0, y: 0, w: 1, h: 1 }; MapEditor.setTile(17, 10, 0); MapEditor.redrawTiles(17, 10, 1, 1); App.markDirty(); App.dimOthers = true; document.getElementById('chk-dim').checked = true; MapEditor.render(); LayersPanel.render(); 0`); await sleep(400);
  console.log('layers now:', await js(editor, `App.map().layerInfo.map((l, i) => (i + 1) + ':' + l.name + '/' + l.collision + (l.above ? '/above' : '') + (l.hideInGame ? '/hidden' : '')).join(', ') + ' | selected ' + (App.layer + 1)`));
  await shot(editor, 'Y3-four-layers-dim');
  await js(editor, `App.dimOthers = false; document.getElementById('chk-dim').checked = false; App.setLayer(0); MapEditor.render(); 0`);
  console.log('cannot go below 3:', await js(editor, `(() => { const m = App.map(); const btn = [...document.querySelectorAll('#layer-tools button')].find(b => b.textContent === 'Delete'); App.setLayer(3); LayersPanel.render(); const ok4 = !btn.disabled; return 'delete enabled with 4 layers: ' + ![...document.querySelectorAll('#layer-tools button')].find(b => b.textContent === 'Delete').disabled; })()`));

  // ---- encounter area from a dragged selection
  await js(editor, `App.selectMap('map002'); App.setMode('event'); MapEditor.area = { x: 3, y: 12, w: 5, h: 5 }; MapEditor.render(); 0`); await sleep(400);
  await js(editor, `QuickEvent.open('encounter', 3, 12, null, MapEditor.area); 0`); await sleep(900);
  await js(editor, `[...document.querySelectorAll('.modal button')].find(b => b.textContent === '+ Add monster').click(); 0`); await sleep(300);
  await shot(editor, 'E1-encounter-dialog');
  await js(editor, `document.querySelector('.modal-foot .primary').click(); 0`); await sleep(600);
  console.log('encounter area created:', await js(editor, `(() => { const e = App.map().events.find(e => e.x === 3 && e.y === 12); const z = e.pages[0].encounter; return e.quick.type + ' ' + z.width + 'x' + z.height + ' chance=' + z.chance + ' monsters=' + z.list.length; })()`));
  await js(editor, `MapEditor.area = null; App.selectedEventId = null; MapEditor.render(); App.renderInspector(); 0`); await sleep(300);
  await shot(editor, 'E2-encounter-areas-on-map');
  await js(editor, `App.setMode('map'); 0`);

  // ---- 0.6: map size, autotiles, music & sounds, map edges, exits, shops, choices (editor side)
  await js(editor, `App.setMode('map'); App.addMap(); 0`); await sleep(700);
  await js(editor, `[...document.querySelectorAll('.size-card')].find(c => c.textContent.startsWith('Medium')).click(); 0`); await sleep(300);
  await shot(editor, 'N1-new-map');
  await js(editor, `(() => { const i = document.querySelector('.modal input[type=text]'); i.value = 'Test Field'; i.dispatchEvent(new Event('input')); document.querySelector('.modal-foot .primary').click(); })(); 0`); await sleep(700);
  console.log('new map:', await js(editor, `App.map().name + ' ' + App.map().width + 'x' + App.map().height`));
  await js(editor, `(() => { const ev = App.newEvent(0, 0); ev.name = 'Corner'; App.setMode('map'); })(); 0`);
  await js(editor, `App.resizeDialog(App.map()); 0`); await sleep(600);
  await js(editor, `[...document.querySelectorAll('.size-card')].find(c => c.textContent.startsWith('Large')).click(); document.querySelectorAll('.anchor-grid button')[8].click(); 0`); await sleep(300);
  await shot(editor, 'N2-change-size');
  await js(editor, `document.querySelector('.modal-foot .primary').click(); 0`); await sleep(500);
  console.log('resized (expect 40x30, corner event at 10,10):', await js(editor, `(() => { const m = App.map(); const e = m.events.find(e => e.name === 'Corner'); return m.width + 'x' + m.height + ' corner at ' + e.x + ',' + e.y + ' ground filled=' + m.layers[0].every(t => t >= 0); })()`));
  await js(editor, `MapEditor.undo(); 0`); await sleep(300);
  console.log('undo resize:', await js(editor, `App.map().width + 'x' + App.map().height`));
  await js(editor, `App.selectMap('map003'); App.setMode('map'); 0`); await sleep(900);
  await shot(editor, 'A1-autotiles-lakeside');
  // paint a water square next to the lake and check that it joins (the neighbour's shape changes)
  console.log('autotile paint:', await js(editor, `(() => { const m = App.map(); const ts = App.tileset(); const w = ts.flags.findIndex(f => f.auto && f.anim); App.setLayer(1); MapEditor.brush = { x: w % MapEditor.cols, y: Math.floor(w / MapEditor.cols), w: 1, h: 1 }; MapEditor.pushUndo(); MapEditor.paintAt(16, 9); return 'tile at 16,9 = ' + m.layers[1][9 * m.width + 16] + ' (water ' + w + ')'; })()`));
  await js(editor, `MapEditor.undo(); App.setLayer(0); 0`);
  await js(editor, `DB.tab='tilesets'; DB.sel.tilesets='outdoor'; DB.tileMode='auto'; DB.open(); 0`); await sleep(900);
  await shot(editor, 'A2-tileset-autotiles');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `DB.tileMode='pass'; DB.tab='audio'; DB.open(); 0`); await sleep(1000);
  await shot(editor, 'M1-audio-tab');
  console.log('audio settings:', await js(editor, `(() => { const a = App.proj.system.audio; return 'title=' + a.title + ' battle=' + a.battleWild + ' cursor=' + a.sfx.cursor + ' music files=' + (App.assets.music || []).length + ' sounds=' + (App.assets.sounds || []).length; })()`));
  console.log('editor audio preview plays:', await js(editor, `(async () => { const a = new Audio(UI.assetUrl('music/town-sunny-town.mp3')); try { await a.play(); await new Promise(r => setTimeout(r, 700)); const t = a.currentTime; a.pause(); return 'ok, t=' + t.toFixed(2); } catch (e) { return 'error ' + e.message; } })()`));
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectMap('map002'); App.setMode('map'); 0`); await sleep(700);
  await js(editor, `(() => { const box = document.getElementById('inspector'); const s = box.querySelector('.insp-section[data-key="music"]'); box.scrollTop = s.offsetTop - 8; })(); 0`); await sleep(300);
  await shot(editor, 'X1-map-music-edges');
  await js(editor, `document.getElementById('inspector').scrollTop = 0; App.setMode('event'); 0`);
  await js(editor, `QuickEvent.open('exit', 5, 5); 0`); await sleep(800);
  await shot(editor, 'X2-exit-dialog');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectMap('map001'); App.setMode('event'); QuickEvent.open('shop', 2, 12); 0`); await sleep(900);
  await shot(editor, 'S1-shop-dialog');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectedEventId = App.map().events.find(e => e.name === 'Villager').id; EventEditor.open(App.selectedEvent()); 0`); await sleep(800);
  await shot(editor, 'K1-choice-editor');
  // add a command inside the Yes branch through the nested list, then cancel
  console.log('nested add:', await js(editor, `(() => { const nested = document.querySelectorAll('.cmd-list.nested'); const add = nested[0].querySelector('.cmd-add'); add.querySelector('select').value = 'playSound'; add.querySelector('button').click(); return document.querySelectorAll('.cmd-list.nested')[0].querySelectorAll(':scope > .cmd').length; })()`));
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.setMode('map'); App.selectMap('map001'); 0`); await sleep(500);

  // ---- 0.7 editor: menus & screens, NPCs, levers, cut scenes, routes
  await js(editor, `DB.tab='menus'; DB.open(); 0`); await sleep(1000);
  await shot(editor, 'P1-menus-tab');
  await js(editor, `(() => { const f = document.querySelector('.db-form'); f.scrollTop = f.scrollHeight; })(); 0`); await sleep(300);
  await shot(editor, 'P2-menus-tab-lower');
  console.log('menus config:', await js(editor, `(() => { const s = App.proj.system; return 'title menu=' + s.titleScreen.menu.filter(e => e.on).map(e => e.label).join('/') + ' | main=' + s.menus.main.filter(e => e.on).map(e => e.label).join('/') + ' | terms=' + s.terms.dex + ',' + s.terms.pp + ' | follower=' + s.follower.enabled; })()`));
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectMap('map001'); App.setMode('event'); QuickEvent.open('npc', 2, 7); 0`); await sleep(800);
  await js(editor, `(() => { const sels = [...document.querySelectorAll('.modal select')]; const mv = sels.find(s => [...s.options].some(o => o.value === 'route')); mv.value = 'route'; mv.dispatchEvent(new Event('change')); })(); 0`); await sleep(300);
  await js(editor, `(() => { const sels = [...document.querySelectorAll('.modal select')]; const role = sels.find(s => [...s.options].some(o => o.value === 'trainer')); role.value = 'trainer'; role.dispatchEvent(new Event('change')); })(); 0`); await sleep(400);
  await shot(editor, 'P3-npc-dialog');
  await js(editor, `document.querySelector('.modal-foot .primary').click(); 0`); await sleep(500);
  console.log('npc created:', await js(editor, `(() => { const e = App.map().events.find(e => e.x === 2 && e.y === 7); return e ? e.quick.role + ' pages=' + e.pages.length + ' trigger=' + e.pages[0].trigger + ' move=' + e.pages[0].move + ' steps=' + (e.pages[0].route || {}).steps.length : 'none'; })()`));
  await js(editor, `QuickEvent.open('lever', 3, 7); 0`); await sleep(700);
  await shot(editor, 'P4-lever-dialog');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectedEventId = App.map().events.find(e => e.name === 'Jogger').id; MapEditor.render(); EventEditor.open(App.selectedEvent()); 0`); await sleep(800);
  await shot(editor, 'P5-route-editor');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectMap('map003'); App.setMode('event'); App.selectedEventId = App.map().events.find(e => e.name === 'Lakeside arrival').id; EventEditor.open(App.selectedEvent()); 0`); await sleep(900);
  await shot(editor, 'P6-cutscene-editor');
  await key(editor, 'Escape'); await sleep(300);
  await js(editor, `App.selectMap('map001'); App.setMode('map'); 0`); await sleep(400);

  // test save round trip
  await js(editor, `App.save()`); await sleep(500);
  const saved = JSON.parse(fs.readFileSync(path.join(proj, 'data', 'maps', 'map002.json'), 'utf8'));
  console.log('saved map002 events:', saved.events.length);
  const pc = fs.readFileSync(path.join(proj, 'CREDITS.md'), 'utf8');
  console.log('project CREDITS.md rows:', (pc.match(/^\| (tilesets|characters|monsters|battlebacks)\//gm) || []).length, '| not recorded:', JSON.stringify(Object.keys(JSON.parse(fs.readFileSync(path.join(proj, 'data', 'credits.json'), 'utf8'))).length));

  // ---- playtest: title screen -> new game
  await js(editor, `App.playtest(); 0`); await sleep(500);
  // dismiss "check before playtesting" if it appears
  await js(editor, `document.querySelector('.modal-foot .primary') && document.querySelector('.modal-foot .primary').click()`);
  await sleep(1800);
  const play = BrowserWindow.getAllWindows().find(w => w !== editor);
  await shot(play, '10-title');
  await key(play, 'Down', 2, 250); await key(play, 'Z', 1, 900);
  await shot(play, 'P7-credits');
  await key(play, 'Escape', 1, 500); await key(play, 'Down', 1, 250); await key(play, 'Z', 1, 900);
  await shot(play, 'P8-licence');
  console.log('licence screen:', await js(play, `(document.querySelector('.text-screen .ts-title')||{}).textContent + ' / ' + ((document.querySelector('.text-screen .text-body')||{}).textContent || '').slice(0, 60)`));
  await key(play, 'Escape', 1, 500); await key(play, 'Up', 3, 250);
  await key(play, 'Z'); await sleep(900);
  await shot(play, '11-town');
  // walk up to the starter table: start (9,8) facing up; table orbs at y=5, so step up to y=6 and press Z
  await key(play, 'Up', 2, 350); await sleep(300);
  await key(play, 'Z'); await sleep(900);
  await shot(play, '12-starter-text');
  await key(play, 'Z', 6, 500); await sleep(500);
  const party = await js(play, `G.state.party.map(m=>m.speciesId+' L'+m.level)`);
  console.log('party after starter:', party);
  // talk to professor? He is behind the table at (9,4): facing up from (9,6) the table (9,5) has an orb event, so use scripted check instead.
  // Trainer double battle via script, to exercise 2v2 UI
  await js(play, `const ec=MF.createMonster(G.db,'embercub',15); ec.exp=MF.expForLevel('medium',16)-3; G.state.party=[ec, MF.createMonster(G.db,'zapmouse',12)]; G.state.bag={capture_orb:5, potion:2}; G.busy=true; G.battle({enemyParty:[MF.createMonster(G.db,'toxifrog',5),MF.createMonster(G.db,'pebblit',5)], isWild:false, trainerName:'Twins', active:2, reward:50}).finally(()=>{G.busy=false; window.__done=true;}); 0`);
  await sleep(2600);
  await shot(play, '13-double-battle-intro');
  // advance messages until command menu, then pick Fight -> first move -> target
  for (let i = 0; i < 4; i++) { await key(play, 'Z', 1, 700); }
  await shot(play, '14-double-battle-menu');
  // play out the battle by mashing Z
  for (let i = 0; i < 600; i++) {
    const done = await js(play, '!!window.__done');
    if (done) break;
    await key(play, 'Z', 1, 150);
    if (i === 6) await shot(play, '15-double-battle-mid');
    if (await js(play, `!!document.querySelector('.battle img[style*="translate"]')`) && !globalThis.__evoShot) { globalThis.__evoShot = 1; await shot(play, '15b-evolution'); }
  }
  console.log('double battle done:', await js(play, '!!window.__done'), 'party:', await js(play, `G.state.party.map(m=>m.speciesId+' L'+m.level+' '+m.hp+'/'+m.stats.hp)`));
  for (let i = 0; i < 200 && !(await js(play, '!!window.__done')); i++) await key(play, 'Z', 1, 200);
  console.log('after doubles, party:', await js(play, `G.state.party.map(m=>m.speciesId+' L'+m.level)`));
  await sleep(600);
  // wild battle with capture
  await js(play, `window.__done=false; G.state.party.forEach(m=>MF.healMonster(G.db,m)); const w=MF.createMonster(G.db,'fluffkin',3); w.hp=1; G.busy=true; G.battle({enemyParty:[w], isWild:true, canRun:true, canCapture:true}).then(r=>{window.__res=r}).finally(()=>{G.busy=false; window.__done=true;}); 0`);
  await sleep(2400);
  await shot(play, '16-wild-battle');
  await key(play, 'Z', 1, 900);   // dismiss "appeared"
  await key(play, 'Right', 1, 200); // Bag
  await key(play, 'Z', 1, 500);
  await shot(play, '17-bag');
  await key(play, 'Z', 1, 600); // first item (capture orb or potion)
  for (let i = 0; i < 80; i++) { if (await js(play, '!!window.__done')) break; await key(play, 'Z', 1, 300); if (i === 2) await shot(play, '18-capture'); }
  console.log('wild result:', await js(play, 'window.__res'), 'party size', await js(play, 'G.state.party.length'), 'dex caught', await js(play, 'Object.keys(G.state.dex.caught)'));
  await sleep(500);
  // field menu
  await key(play, 'Escape'); await sleep(500);
  await shot(play, '19-menu');
  await key(play, 'Down'); await key(play, 'Z'); await sleep(500);
  await shot(play, '20-party');
  await key(play, 'Z'); await key(play, 'Z'); await sleep(500);
  await shot(play, '21-summary');
  await key(play, 'Escape', 3, 300);
  // walk the route: teleport to Route 1 to test sight trainer
  await js(play, `G.enterMap('map002', 10, 12, 'up'); 0`); await sleep(600);
  await shot(play, '22-route');
  await key(play, 'Up', 3, 350); await sleep(1500);
  await shot(play, '23-trainer-spotted');

  // ---- quick events in the game
  const runTo = async (map, x, y, dir) => { await js(play, `G.busy=false; Input.stack.length=0; RUI.closeMessage(); G.enterMap('${map}', ${x}, ${y}, '${dir}'); 0`); await sleep(700); };
  await runTo('map001', 17, 7, 'up');
  const potsBefore = await js(play, `G.state.bag.super_potion || 0`);
  await key(play, 'Z'); await sleep(1100);
  await shot(play, 'Q4-chest-opened');
  await key(play, 'Z', 3, 500);
  console.log('chest: super potions', potsBefore, '->', await js(play, `G.state.bag.super_potion || 0`), '| page now', await js(play, `G.evs.find(e => e.data.name === 'Treasure chest').page`));
  await key(play, 'Z'); await sleep(900);
  console.log('chest again says:', await js(play, `(document.querySelector('.msg .txt')||{}).textContent`));
  await key(play, 'Z', 2, 400);
  await runTo('map001', 13, 8, 'left');
  await key(play, 'Z'); await sleep(700);
  console.log('sign from the side opens?', await js(play, `!!document.querySelector('.msg')`));
  await runTo('map001', 12, 9, 'up');
  await key(play, 'Z'); await sleep(1200);
  await shot(play, 'Q5-sign');
  console.log('sign from front:', await js(play, `(document.querySelector('.msg .speaker')||{}).textContent + ' | ' + (document.querySelector('.msg .txt')||{}).textContent`));
  await key(play, 'Z', 2, 400);
  await runTo('map002', 17, 16, 'up');
  const potionBefore = await js(play, `G.state.bag.potion || 0`);
  await key(play, 'Z'); await sleep(1000);
  await shot(play, 'Q6-hidden-item');
  await key(play, 'Z', 2, 500);
  console.log('hidden potion:', potionBefore, '->', await js(play, `G.state.bag.potion || 0`), '| gone:', await js(play, `G.evs.find(e => e.data.name === 'Hidden Potion').page === 1`));

  // ---- layers in the game
  console.log('layers in game:', await js(play, `(async () => { await G.enterMap('map001', 16, 10, 'right'); const m = G.map; return 'layers=' + m.layers.length + ' invisible wall blocks=' + !G.flagsAt(17, 10).pass + ' flowers walkable=' + G.flagsAt(3, 3).pass + ' tree blocks=' + !G.flagsAt(0, 5).pass; })()`));

  // ---- encounter areas in the game (battle stubbed to just record who appears)
  const encStats = await js(play, `(async () => {
    await G.enterMap('map002', 13, 5, 'up');
    const real = G.battle; const seen = []; G.battle = async o => { seen.push(o.enemyParty.map(m => m.speciesId + ':' + m.level).join('+')); return 'run'; };
    const zone = G.evs.find(e => e.data.name === 'North-east grass'); G.page(zone).encounter.chance = 100;
    G.map.encounters.chance = 100;
    const inside = {}, outside = {};
    for (let i = 0; i < 300; i++) { G.busy = false; G.player.x = 13; G.player.y = 5; G.checkEncounter(); await new Promise(r => setTimeout(r, 0)); }
    seen.splice(0).forEach(s => { const k = s.split(':')[0]; inside[k] = (inside[k] || 0) + 1; });
    for (let i = 0; i < 300; i++) { G.busy = false; G.player.x = 4; G.player.y = 4; G.checkEncounter(); await new Promise(r => setTimeout(r, 0)); }
    seen.splice(0).forEach(s => { const k = s.split(':')[0]; outside[k] = (outside[k] || 0) + 1; });
    // a one-time area switches itself off after its first battle
    zone.data.pages = MF.Quick.build({ type: 'encounter', width: 5, height: 6, chance: 100, list: [{ speciesId: 'sproutle', minLevel: 5, maxLevel: 5, weight: 1 }], once: true, onlyEncTiles: true }, {});
    G.refreshPages(); let onceCount = 0;
    for (let i = 0; i < 5; i++) { G.busy = false; G.player.x = 13; G.player.y = 5; G.checkEncounter(); await new Promise(r => setTimeout(r, 0)); }
    onceCount = seen.filter(s => s.startsWith('sproutle')).length;
    G.battle = real; G.busy = false;
    return JSON.stringify({ inside, outside, onceCount });
  })()`);
  console.log('encounter areas:', encStats);

  // ---- 0.6 in the game
  const flac = path.join(proj, 'assets', 'music', 'test-tone.flac');
  try { require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(proj, 'assets', 'music', 'jingle-found-it.mp3'), flac]); } catch (e) { console.log('ffmpeg missing, FLAC test skipped'); }
  console.log('audio decode:', await js(play, `(async () => {
    const mp3 = await GameAudio.load('music/route-open-road.mp3'); const fl = await GameAudio.load('music/test-tone.flac');
    return 'ctx=' + (GameAudio.ctx ? GameAudio.ctx.state : 'none') + ' mp3=' + (mp3 ? mp3.duration.toFixed(1) + 's' : 'fail') + ' flac=' + (fl ? fl.duration.toFixed(1) + 's' : 'fail');
  })()`));
  await runTo('map002', 9, 0, 'up');
  console.log('route music:', await js(play, `GameAudio.bgm && GameAudio.bgm.rel`));
  await key(play, 'Up', 1, 200); await sleep(1600);
  console.log('edge up ->', await js(play, `G.map.name + ' at ' + G.player.x + ',' + G.player.y`));
  await sleep(900);
  await shot(play, 'P9-cutscene');
  for (let i = 0; i < 12 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 700);
  console.log('cut scene done:', await js(play, `!G.busy + ' camera back=' + (G.cam === null) + ' selfSwitch=' + !!G.state.selfSwitches[G.map.id + ':' + G.evs.find(e => e.data.name === 'Lakeside arrival').data.id]`));
  await sleep(300);
  await shot(play, 'A3-lakeside-game');
  const animInfo = await js(play, `'animated squares=' + G.animCells.length`);
  await sleep(700);
  await shot(play, 'A4-lakeside-game-later');
  console.log(animInfo);
  await key(play, 'Down', 1, 200); await sleep(1600);
  console.log('edge down ->', await js(play, `G.map.name + ' at ' + G.player.x + ',' + G.player.y`));
  await runTo('map002', 9, 17, 'down');
  await key(play, 'Down', 1, 200); await sleep(1500);
  console.log('exit event ->', await js(play, `G.map.name + ' at ' + G.player.x + ',' + G.player.y + ' music ' + (GameAudio.bgm && GameAudio.bgm.rel)`));
  // choice: talk to the villager and pick the second answer
  await runTo('map001', 2, 2, 'down');
  await js(play, `G.runEvent(G.evs.find(e => e.data.name === 'Villager')); 0`); await sleep(1800);
  await shot(play, 'K2-choice-game');
  await key(play, 'Down', 1, 200); await key(play, 'Z', 1, 900);
  console.log('choice "No thanks" says:', await js(play, `(document.querySelector('.msg .txt')||{}).textContent`));
  await key(play, 'Z', 2, 400);
  // shop: buy 2 Capture Orbs, then sell 1 Potion, then leave
  await js(play, `G.state.money = 1000; G.state.bag = { potion: 3 }; G.busy = false; 0`);
  await js(play, `window.__shop = false; G.runEvent(G.evs.find(e => e.data.name === 'Shopkeeper')).then(() => { window.__shop = true; }); 0`); await sleep(900);
  await key(play, 'Z', 1, 600);          // Buy
  await shot(play, 'S2-shop-buy-list');
  await key(play, 'Z', 1, 600);          // Capture Orb
  await key(play, 'Up', 1, 300);         // quantity 2
  await shot(play, 'S3-shop-quantity');
  await key(play, 'Z', 1, 1500);         // OK -> confirm question
  await key(play, 'Z', 1, 900);          // Yes
  await key(play, 'Z', 1, 700);          // "Here you are"
  await key(play, 'Escape', 1, 600);     // back to Buy/Sell/Leave
  await key(play, 'Down', 1, 200); await key(play, 'Z', 1, 600);   // Sell
  await shot(play, 'S4-shop-sell');
  await key(play, 'Z', 1, 600);          // Potion
  await key(play, 'Z', 1, 1500);         // quantity 1 -> confirm
  await key(play, 'Z', 1, 900);          // Yes
  await key(play, 'Z', 1, 700);          // "Thank you"
  await key(play, 'Escape', 1, 600);     // back
  await key(play, 'Down', 2, 200); await key(play, 'Z', 1, 700);   // Leave
  await key(play, 'Z', 2, 600);
  await sleep(200);
  console.log('shop result (expect money 1000-400+150=750, orbs 2, potions 2):', await js(play, `'done=' + window.__shop + ' money=' + G.state.money + ' orbs=' + (G.state.bag.capture_orb || 0) + ' potions=' + (G.state.bag.potion || 0)`));
  // ---- 0.7 in the game
  await runTo('map001', 9, 6, 'down');
  console.log('follower:', await js(play, `G.follower ? 'at ' + G.follower.x + ',' + G.follower.y + ' mon=' + (G.followerMon() && G.followerMon().speciesId) : 'none'`));
  await key(play, 'Left', 3, 380); await sleep(500);
  console.log('follower after walking left 3:', await js(play, `'player ' + G.player.x + ',' + G.player.y + ' follower ' + G.follower.x + ',' + G.follower.y`));
  await shot(play, 'P10-follower');
  const j0 = await js(play, `(e => e.x + ',' + e.y)(G.evs.find(e => e.data.name === 'Jogger'))`); await sleep(2500);
  console.log('jogger moved:', j0, '->', await js(play, `(e => e.x + ',' + e.y)(G.evs.find(e => e.data.name === 'Jogger'))`));
  await runTo('map001', 11, 11, 'down');
  const sp0 = await js(play, `G.state.bag.super_potion || 0`);
  await js(play, `(() => { const e = G.evs.find(e => e.data.name === 'Gardener'); e.dir = 'up'; })(); 0`);
  await key(play, 'Z', 1, 1200); await shot(play, 'P11-gift');
  for (let i = 0; i < 6 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 600);
  console.log('gift: super potions', sp0, '->', await js(play, `G.state.bag.super_potion || 0`), '| page', await js(play, `G.evs.find(e => e.data.name === 'Gardener').page`));
  await key(play, 'Z', 1, 900);
  console.log('gardener afterwards says:', await js(play, `(document.querySelector('.msg .txt')||{}).textContent`));
  for (let i = 0; i < 4 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 500);
  // the hiker walks his route and spots the player (battle stubbed to a win)
  await js(play, `window.__hb = 0; G.__realBattle = G.__realBattle || G.battle; G.battle = async o => { window.__hb++; window.__hbName = o.trainerName; return 'win'; }; 0`);
  await runTo('map002', 9, 10, 'left');
  for (let i = 0; i < 40 && !(await js(play, 'window.__hb')); i++) { await sleep(300); if (await js(play, `!!document.querySelector('.msg')`)) await key(play, 'Z', 1, 200); }
  for (let i = 0; i < 6 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 500);
  console.log('hiker battle:', await js(play, `window.__hb + ' ' + window.__hbName + ' | beaten=' + !!G.state.selfSwitches['map002:' + G.evs.find(e => e.data.name === 'Hiker Hugo').data.id]`));
  await js(play, `G.battle = G.__realBattle; 0`);
  // the lever turns switch 3 on and the boulder disappears
  await runTo('map003', 7, 12, 'up');
  for (let i = 0; i < 6 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 600);
  console.log('boulder before:', await js(play, `G.evs.find(e => e.data.name === 'Boulder').page`));
  await key(play, 'Z', 1, 1200); await shot(play, 'P12-lever');
  for (let i = 0; i < 4 && await js(play, 'G.busy'); i++) await key(play, 'Z', 1, 500);
  console.log('lever: switch 3 =', await js(play, `!!G.state.switches[3]`), '| boulder page', await js(play, `G.evs.find(e => e.data.name === 'Boulder').page`), '| lever page', await js(play, `G.evs.find(e => e.data.name === 'Lever').page`));
  // menus: DB name, bag shortcut, storage box tool
  await js(play, `G.cfg.menus.bag.find(e => e.id === 'storage').on = true; G.state.bag.storage_box = 1; 0`);
  await key(play, 'Escape', 1, 600);
  console.log('menu entries:', await js(play, `[...document.querySelectorAll('.menu .opt')].map(o => o.textContent).join(' / ')`));
  await key(play, 'Down', 2, 200); await key(play, 'Z', 1, 600);
  await shot(play, 'P13-bag-shortcut');
  console.log('bag rows:', await js(play, `[...document.querySelectorAll('.menu .opt')].map(o => o.textContent).join(' / ')`));
  await key(play, 'Z', 1, 600);
  console.log('shortcut opened:', await js(play, `(document.querySelector('.menu .title')||{}).textContent`));
  await key(play, 'Escape', 3, 400);
  fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
  console.log('console errors:', errors.length ? errors : 'none');
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });
