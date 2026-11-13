/* 2.5D map drawing: raised ground with cliff faces, characters that stand on it, shadows, ledge jumps, and the
   tilted camera that leans the whole map away from the player. Used only on maps with height levels or the
   tilted camera; ordinary maps are drawn by game.js as before. Settings and walking rules: src/shared/heights.js.

   How it draws: every map row is pre-drawn once into a strip (its tiles lifted by their height, plus the cliff
   faces on their south side). Each frame, the strips are drawn from the back of the map to the front, with the
   characters of each row drawn straight after their row, so raised ground in front hides whoever stands behind it.
   For the tilted camera the frame is drawn into a larger picture first, then squeezed onto the screen one line at
   a time: lines near the top of the screen are narrower and shorter, so the ground seems to lean away. */
(function () {
  'use strict';
  const H25 = MF.Heights;

  const V = window.View25 = {
    // Called by G.enterMap before the tiles are drawn.
    prepare(G) {
      const m = G.map, T = G.tileSize, vw = H25.view(m);
      const hasH = H25.hasHeights(m);
      const v = G.v25 = { on: H25.active(m), hasH, view: vw, tilted: vw.camera === 'tilted', L: Math.max(2, Math.round(T * Math.max(0.25, Math.min(1, vw.step)))), maxH: hasH ? H25.maxHeight(m) : 0 };
      if (!v.on) return;
      if (hasH) {
        v.SH = T + v.maxH * v.L; // strip height: a row's tiles, plus room for them to rise
        v.rowsB = []; v.rowsA = [];
        for (let y = 0; y < m.height; y++) {
          const b = document.createElement('canvas'), a = document.createElement('canvas');
          b.width = a.width = m.width * T; b.height = a.height = v.SH;
          v.rowsB.push(b); v.rowsA.push(a);
        }
        v.topExtra = 0; for (let x = 0; x < m.width; x++) v.topExtra = Math.max(v.topExtra, H25.get(m, x, 0) * v.L);
      }
      if (v.tilted) V.setupTilt(G);
    },
    // Draw one square into its row strip (and redraw the faces it shares with the squares around it).
    drawCell(G, xx, yy, timeMs) {
      const v = G.v25, m = G.map, T = G.tileSize, L = v.L;
      const bg = v.rowsB[yy].getContext('2d'), ag = v.rowsA[yy].getContext('2d');
      bg.clearRect(xx * T, 0, T, v.SH); ag.clearRect(xx * T, 0, T, v.SH);
      const h = H25.get(m, xx, yy), top = (v.maxH - h) * L, px = xx * T;
      if (G.tsImg) for (let Ly = 0; Ly < m.layers.length; Ly++) {
        if ((m.layerInfo[Ly] || {}).hideInGame) continue;
        const t = m.layers[Ly][yy * m.width + xx];
        if (t < 0 || t == null) continue;
        const f = G.ts.flags[t] || {};
        const g = MF.Layers.drawsAbove(m, Ly, f) ? ag : bg;
        MF.Tiles.drawTile(g, G.tsImg, G.ts, G.cols, T, t, px, top, m.layers[Ly], m.width, m.height, xx, yy, timeMs);
      }
      // stairs: step lines across the square
      if (H25.isStairs(m, xx, yy)) {
        bg.fillStyle = 'rgba(0,0,0,.22)'; for (let s = 3; s < T; s += 4) bg.fillRect(px + 1, top + s, T - 2, 1);
        bg.fillStyle = 'rgba(255,255,255,.18)'; for (let s = 2; s < T; s += 4) bg.fillRect(px + 1, top + s, T - 2, 1);
      }
      // edges of raised ground: a light lip where the ground drops behind, dark sides, a shadow from higher ground on the left
      const hN = yy > 0 ? H25.get(m, xx, yy - 1) : h, hW = xx > 0 ? H25.get(m, xx - 1, yy) : h, hE = xx < m.width - 1 ? H25.get(m, xx + 1, yy) : h;
      if (hN < h) { bg.fillStyle = 'rgba(255,255,255,.28)'; bg.fillRect(px, top, T, 1); }
      if (hW < h) { bg.fillStyle = 'rgba(0,0,0,.28)'; bg.fillRect(px, top, 1, T); }
      if (hE < h) { bg.fillStyle = 'rgba(0,0,0,.35)'; bg.fillRect(px + T - 1, top, 1, T); }
      if (hW > h) { bg.fillStyle = 'rgba(0,0,0,.22)'; bg.fillRect(px, top, 3, T); bg.fillStyle = 'rgba(0,0,0,.12)'; bg.fillRect(px + 3, top, 2, T); }
      if (hN > h) { bg.fillStyle = 'rgba(0,0,0,.25)'; bg.fillRect(px, top, T, 2); bg.fillStyle = 'rgba(0,0,0,.1)'; bg.fillRect(px, top + 2, T, 2); } // shade at the foot of the cliff behind
      if (h > 0) { bg.fillStyle = 'rgba(255,250,220,' + (0.05 * h) + ')'; bg.fillRect(px, top, T, T); } // higher ground catches more light
      // the cliff face below this square, down to the square in front of it
      const hS = yy < m.height - 1 ? H25.get(m, xx, yy + 1) : 0;
      if (hS < h) {
        const stairs = (h - hS === 1) && (H25.isStairs(m, xx, yy) || H25.isStairs(m, xx, yy + 1));
        H25.drawFace(bg, px, top + T, T, (h - hS) * L, v.view.cliff, xx, yy, { stairs, leftEdge: hW < h, rightEdge: hE < h });
      }
    },
    // The height a character is standing at right now (in pixels), and how high a ledge jump has carried it.
    liftOf(G, c) {
      const v = G.v25; if (!v || !v.hasH) return { ground: 0, air: 0 };
      const m = G.map, x0 = Math.floor(c.px), y0 = Math.floor(c.py), x1 = Math.ceil(c.px), y1 = Math.ceil(c.py);
      const k = (c.px - x0) + (c.py - y0); // only one of the two moves at a time
      const a = H25.get(m, x0, y0), b = H25.get(m, x1, y1);
      const ground = (a + (b - a) * k) * v.L;
      const jump = a !== b && !H25.isStairs(m, x0, y0) && !H25.isStairs(m, x1, y1);
      return { ground, air: jump ? Math.sin(Math.PI * k) * G.tileSize * 0.45 : 0 };
    },
    // Where the camera looks, in map pixels, lifted with the player so the player stays in the middle.
    centre(G) {
      const c = G.camCentre();
      if (!G.cam && G.v25 && G.v25.hasH) c.y -= V.liftOf(G, G.player).ground;
      return c;
    },

    /* ---------- tilted camera ---------- */
    setupTilt(G) {
      const v = G.v25, W = G.screen.width, H = G.screen.height, t = Math.max(0.2, Math.min(1, +v.view.tilt || 0.55));
      const sTop = 1 - 0.42 * t, vk = 1 - 0.32 * t;
      v.sRow = new Float32Array(H + 1); v.srcY = new Float32Array(H + 2);
      for (let y = 0; y <= H; y++) v.sRow[y] = sTop + (1 - sTop) * (y / H);
      v.srcY[0] = 0;
      for (let y = 0; y <= H; y++) v.srcY[y + 1] = v.srcY[y] + 1 / (v.sRow[y] * vk);
      v.Ws = Math.ceil(W / sTop) + 2; v.Hs = Math.ceil(v.srcY[H + 1]) + 2;
      v.anchorY = Math.round(H * 0.6); // where the player appears on screen
      v.src = document.createElement('canvas'); v.src.width = v.Ws; v.src.height = v.Hs;
    },

    /* ---------- drawing ---------- */
    draw(G) {
      const v = G.v25, g = G.ctx, W = G.screen.width, H = G.screen.height;
      g.fillStyle = v.view.sky || '#000'; g.fillRect(0, 0, W, H);
      if (!v.tilted) {
        const T = G.tileSize, m = G.map, c = V.centre(G);
        const mw = m.width * T, mh = m.height * T, top = -(v.topExtra || 0);
        let cx = c.x - W / 2, cy = c.y - H / 2;
        cx = mw <= W ? (mw - W) / 2 : Math.max(0, Math.min(mw - W, cx));
        cy = mh - top <= H ? (mh + top - H) / 2 : Math.max(top, Math.min(mh - H, cy));
        if (G.shake && performance.now() < G.shake.until) { cx += (Math.random() * 2 - 1) * G.shake.power; cy += (Math.random() * 2 - 1) * G.shake.power * 0.5; }
        cx = Math.round(cx); cy = Math.round(cy);
        G.camX = cx; G.camY = cy; v.cx = cx; v.cy = cy;
        V.world(G, g, cx, cy, W, H);
        return;
      }
      // tilted: draw the frame into the big picture, then squeeze it onto the screen line by line
      const s = v.src, sg = s.getContext('2d'), c = V.centre(G);
      sg.imageSmoothingEnabled = false;
      sg.fillStyle = v.view.sky || '#000'; sg.fillRect(0, 0, v.Ws, v.Hs);
      let cx = c.x - v.Ws / 2, cy = c.y - v.srcY[v.anchorY];
      if (G.shake && performance.now() < G.shake.until) { cx += (Math.random() * 2 - 1) * G.shake.power; cy += (Math.random() * 2 - 1) * G.shake.power * 0.5; }
      cx = Math.round(cx); cy = Math.round(cy);
      G.camX = cx; G.camY = cy; v.cx = cx; v.cy = cy;
      V.world(G, sg, cx, cy, v.Ws, v.Hs);
      g.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) {
        const dw = v.Ws * v.sRow[y], sy = v.srcY[y], sh = Math.max(0.5, v.srcY[y + 1] - sy);
        g.drawImage(s, 0, sy, v.Ws, sh, (W - dw) / 2, y, dw, 1);
      }
      // mist over the far part of the map
      const haze = Math.max(0, Math.min(0.8, +v.view.haze || 0));
      if (haze > 0) {
        const gr = g.createLinearGradient(0, 0, 0, H * 0.55);
        gr.addColorStop(0, V.rgba(v.view.sky, haze)); gr.addColorStop(1, V.rgba(v.view.sky, 0));
        g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.55);
      }
    },
    rgba(hex, a) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || [0, '000000'];
      const n = parseInt(m[1], 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    },
    // The map, back to front, with characters drawn after the row they stand on.
    world(G, g, cx, cy, W, H) {
      const v = G.v25, m = G.map, T = G.tileSize;
      const chars = G.charList(cx, cy);
      chars.forEach(it => { it.lift = it.draw ? { ground: 0, air: 0 } : V.liftOf(G, it.c); it.row = Math.max(0, Math.min(m.height - 1, Math.ceil(it.c.py - 1e-6))); });
      chars.sort((a, b) => a.row - b.row || a.c.py - b.c.py || (a.c.px || 0) - (b.c.px || 0));
      const shadows = v.view.shadows !== false;
      const drawChars = list => list.forEach(it => {
        if (shadows && !it.draw) {
          const sx = it.c.px * T + T / 2 - cx, sy = it.c.py * T + T - 3 - it.lift.ground - cy, k = Math.max(0.55, 1 - it.lift.air / (T * 1.2));
          g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(sx, sy, T * 0.34 * k, T * 0.14 * k, 0, 0, Math.PI * 2); g.fill();
        }
        G.drawChar(g, it, cx, cy + it.lift.ground + it.lift.air);
      });
      if (!v.hasH) {
        // tilted camera on a flat map: the usual layers
        g.drawImage(G.below, -cx, -cy);
        if (window.Home) Home.drawFloor(G, g, cx, cy);
        drawChars(chars);
        g.drawImage(G.above, -cx, -cy);
      } else {
        const y0 = Math.max(0, Math.floor(cy / T) - 1), y1 = Math.min(m.height - 1, Math.ceil((cy + H + v.maxH * v.L) / T));
        let ci = 0;
        while (ci < chars.length && chars[ci].row < y0) ci++;
        for (let y = y0; y <= y1; y++) {
          g.drawImage(v.rowsB[y], -cx, y * T - v.maxH * v.L - cy);
          if (window.Home) Home.drawFloor(G, g, cx, cy, y);
          const here = [];
          while (ci < chars.length && chars[ci].row === y) here.push(chars[ci++]);
          drawChars(here);
        }
        for (let y = y0; y <= y1; y++) g.drawImage(v.rowsA[y], -cx, y * T - v.maxH * v.L - cy);
      }
      if (window.Home) Home.drawCursor(G, g, cx, cy);
      if (window.Debug && Debug.overlay) Debug.drawOverlay(g, cx, cy);
    },
    // A point on the map (in map pixels) → where it appears on the screen.
    toScreen(G, wx, wy) {
      const v = G.v25;
      if (!v || !v.on || !v.tilted) return { x: wx - G.camX, y: wy - G.camY };
      const sy = wy - v.cy, H = G.screen.height;
      let lo = 0, hi = H;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (v.srcY[mid + 1] <= sy) lo = mid + 1; else hi = mid; }
      const y = Math.max(0, Math.min(H, lo));
      return { x: G.screen.width / 2 + (wx - v.cx - v.Ws / 2) * v.sRow[y], y };
    }
  };
})();
