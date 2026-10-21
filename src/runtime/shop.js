/* Shop: buy items for money and sell items back. Opened by the "Open shop" event command. */
(function () {
  'use strict';
  const { el, esc, message, closeMessage, choose, say } = RUI;

  // A small window that lets the player pick how many (1..max). Resolves to the number, or 0 if cancelled.
  function quantity(G, unitPrice, max, verb) {
    return new Promise(resolve => {
      const box = el('div', 'win shop-qty');
      Object.assign(box.style, { right: '6px', bottom: '56px', width: '128px' });
      document.getElementById('ui').appendChild(box);
      let n = 1;
      const cur = G.db.system.currency || 'money';
      const draw = () => { box.innerHTML = '<div class="qty"><span>×' + String(n).padStart(2, '0') + '</span><span class="r">' + (unitPrice * n) + '</span></div><div class="hint">' + esc(verb) + ' · ' + esc(cur) + ' · ↑↓ ±1 ←→ ±10</div>'; };
      draw();
      const pop = Input.push(a => {
        const old = n;
        if (a === 'up') n = n >= max ? 1 : n + 1;
        else if (a === 'down') n = n <= 1 ? max : n - 1;
        else if (a === 'right') n = Math.min(max, n + 10);
        else if (a === 'left') n = Math.max(1, n - 10);
        else if (a === 'ok') { GameAudio.se('confirm'); finish(n); return; }
        else if (a === 'cancel') { GameAudio.se('cancel'); finish(0); return; }
        if (n !== old) { GameAudio.se('cursor'); draw(); }
      });
      function finish(v) { pop(); box.remove(); resolve(v); }
    });
  }

  const Shop = window.Shop = {
    async open(G, c) {
      const db = G.db, st = G.state, cur = db.system.currency || 'money';
      const goods = (c.goods || []).map(g => ({ item: db.item(g.itemId), price: g.price == null ? null : g.price })).filter(g => g.item)
        .map(g => ({ item: g.item, price: g.price == null ? (g.item.price || 0) : g.price }));
      const rate = c.sellRate == null ? 50 : c.sellRate;
      const sellPrice = it => Math.floor((it.price || 0) * rate / 100);
      const moneyBox = el('div', 'win shop-money');
      Object.assign(moneyBox.style, { left: '6px', top: '6px' });
      const showMoney = () => { moneyBox.innerHTML = '<div class="muted">' + esc(cur) + '</div><div class="r">' + st.money + '</div>'; };
      showMoney();
      document.getElementById('ui').appendChild(moneyBox);
      const owned = it => st.bag[it.id] || 0;
      try {
        let greet = c.greeting || 'Welcome!';
        for (;;) {
          say(greet);
          const opts = [{ label: 'Buy', disabled: !goods.length }];
          if (c.sell !== false) opts.push({ label: 'Sell' });
          opts.push({ label: 'Leave' });
          const pick = await choose({ items: opts, right: 6, top: 6, w: 70 });
          const what = pick < 0 ? 'Leave' : opts[pick].label;
          if (what === 'Leave') break;
          if (what === 'Buy') await Shop.buy(G, goods, showMoney, cur, owned);
          else await Shop.sell(G, sellPrice, showMoney, cur);
          greet = 'Is there anything else I can do for you?';
        }
        closeMessage();
        if (c.farewell) await message(c.farewell);
      } finally { moneyBox.remove(); closeMessage(); }
    },

    async buy(G, goods, showMoney, cur, owned) {
      const st = G.state;
      let index = 0;
      for (;;) {
        say('What would you like?');
        const detail = el('div', 'win shop-desc');
        Object.assign(detail.style, { left: '6px', top: '44px', width: (G.screen.width - 186) + 'px' });
        document.getElementById('ui').appendChild(detail);
        const info = i => { const g = goods[i]; detail.innerHTML = '<b>' + esc(g.item.name) + '</b><div>' + esc(g.item.description || '') + '</div><div class="muted">In bag: ' + owned(g.item) + '</div>'; };
        const i = await choose({ title: 'Buy', items: goods.map(g => ({ label: g.item.name, right: String(g.price) })), right: 6, top: 6, w: 170, maxH: G.screen.height - 66, index, onMove: info, silent: true });
        detail.remove();
        if (i < 0) return;
        index = i;
        const g = goods[i];
        const canAfford = g.price > 0 ? Math.floor(st.money / g.price) : 99;
        if (canAfford < 1) { GameAudio.se('buzzer'); await message('You don\'t have enough ' + cur + '.', { keep: true }); continue; }
        // Clothes: one of each is enough (they're never used up).
        const isClothes = g.item.kind === 'clothing';
        const worn = isClothes && st.wear && Object.values(st.wear).includes(g.item.id);
        if (isClothes && (owned(g.item) > 0 || worn)) { GameAudio.se('buzzer'); await message('You already have that.', { keep: true }); continue; }
        say(g.item.name + (isClothes ? '? That will be ' + g.price + ' ' + cur + '.' : '? How many would you like?'));
        const n = isClothes ? 1 : await quantity(G, g.price, Math.min(99, canAfford), 'Buy');
        if (!n) continue;
        const total = g.price * n;
        const ok = await RUI.confirm(n + '× ' + g.item.name + ' comes to ' + total + ' ' + cur + '. Is that all right?');
        if (!ok) continue;
        st.money -= total;
        st.bag[g.item.id] = (st.bag[g.item.id] || 0) + n;
        GameAudio.se('coin'); showMoney();
        await message('Here you are! Thank you!', { keep: true });
      }
    },

    async sell(G, sellPrice, showMoney, cur) {
      const st = G.state, db = G.db;
      let index = 0;
      for (;;) {
        const ids = Object.keys(st.bag).filter(id => st.bag[id] > 0 && db.item(id));
        if (!ids.length) { await message('You have nothing to sell.', { keep: true }); return; }
        say('What would you like to sell?');
        const items = ids.map(id => { const it = db.item(id), p = sellPrice(it); return { label: it.name + ' ×' + st.bag[id], right: it.kind === 'key' || p <= 0 ? '—' : String(p), disabled: it.kind === 'key' || p <= 0 }; });
        const i = await choose({ title: 'Sell', items, right: 6, top: 6, w: 190, maxH: G.screen.height - 66, index: Math.min(index, ids.length - 1), silent: true, onDisabled: () => RUI.toast('I can\'t buy that, sorry.') });
        if (i < 0) return;
        index = i;
        const it = db.item(ids[i]), p = sellPrice(it);
        say(it.name + '? How many will you sell?');
        const n = await quantity(G, p, Math.min(99, st.bag[it.id]), 'Sell');
        if (!n) continue;
        const ok = await RUI.confirm('I can pay ' + (p * n) + ' ' + cur + ' for ' + n + '× ' + it.name + '. Deal?');
        if (!ok) continue;
        st.bag[it.id] -= n;
        if (st.bag[it.id] <= 0) { delete st.bag[it.id]; if (st.wear) Object.keys(st.wear).forEach(k => { if (st.wear[k] === it.id) delete st.wear[k]; }); }
        st.money += p * n;
        GameAudio.se('coin'); showMoney();
        await message('Thank you!', { keep: true });
      }
    }
  };
  void closeMessage;
})();
