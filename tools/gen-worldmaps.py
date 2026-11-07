#!/usr/bin/env python3
"""Makes the asset library's default world maps (library/pictures/worldmap-*.png, 320 x 240 pixel art) and their
credits in library/library.json. Run: python3 tools/gen-worldmaps.py (needs Pillow).

  worldmap-island.png      an island: a town in the south, a route north to a lake, mountains, forests, a second town
  worldmap-continent.png   a continent: forest, grassland, desert, snowy north, a river, towns and a castle
  worldmap-parchment.png   an old hand-drawn map on parchment: ink coastline, mountains, dashed routes, a compass
The island is laid out to match the sample project (Starter Town in the south, Route 1, Lakeside in the north)."""
import os, json, math, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, 'library')
W, H = 320, 240
E = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in {  # Endesga 32
    'deep': '#124e89', 'sea': '#0099db', 'shallow': '#2ce8f5', 'sand': '#ead4aa', 'sand2': '#e4a672', 'grass': '#63c74d', 'grass2': '#3e8948',
    'forest': '#265c42', 'forest2': '#193c3e', 'rock': '#8b9bb4', 'rock2': '#5a6988', 'snow': '#ffffff', 'snow2': '#c0cbdc', 'dirt': '#b86f50',
    'dirt2': '#733e39', 'roof': '#e43b44', 'roof2': '#a22633', 'wall': '#ead4aa', 'ink': '#3e2731', 'paper': '#ead4aa', 'paper2': '#e4a672',
    'gold': '#feae34', 'yellow': '#fee761', 'dark': '#181425', 'white': '#ffffff', 'desert': '#e4a672', 'desert2': '#d77643', 'purple': '#68386c'}.items()}


class Noise:
    """Smooth value noise, so coastlines and biomes look natural (seeded, so the maps are the same every time)."""
    def __init__(self, seed, cell):
        r = random.Random(seed); self.cell = cell
        self.g = [[r.random() for _ in range(W // cell + 3)] for _ in range(H // cell + 3)]
    def __call__(self, x, y):
        cx, cy = x / self.cell, y / self.cell; ix, iy = int(cx), int(cy); fx, fy = cx - ix, cy - iy
        gw, gh = len(self.g[0]) - 1, len(self.g) - 1; ix, iy = ix % gw, iy % gh
        s = lambda t: t * t * (3 - 2 * t); fx, fy = s(fx), s(fy)
        a, b, c, d = self.g[iy][ix], self.g[iy][ix + 1], self.g[iy + 1][ix], self.g[iy + 1][ix + 1]
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(seed):
    n = [Noise(seed + i, c) for i, c in enumerate((64, 32, 16, 8))]
    return lambda x, y: sum(f(x, y) * w for f, w in zip(n, (0.5, 0.25, 0.15, 0.1)))


def dither(x, y, a, b, t):
    """Checkerboard blend between two colours (pixel-art shading); t in 0..1."""
    return b if ((x + y) % 2 == 0 and t > 0.5) or t > 0.85 else a


def town(d, x, y, big=False):
    s = 7 if big else 5
    d.rectangle([x - s, y - 1, x + s, y + 4], fill=E['wall'], outline=E['dark'])
    d.polygon([(x - s - 1, y - 1), (x, y - s), (x + s + 1, y - 1)], fill=E['roof'], outline=E['dark'])
    d.point((x, y + 2), fill=E['dirt2'])


def mountain(d, x, y, s=7, snow=True):
    d.polygon([(x - s, y + s // 2), (x, y - s), (x + s, y + s // 2)], fill=E['rock'], outline=E['rock2'])
    d.polygon([(x, y - s), (x + s, y + s // 2), (x + 1, y + s // 2)], fill=E['rock2'])
    if snow: d.polygon([(x - s // 3, y - s // 3), (x, y - s), (x + s // 3, y - s // 3)], fill=E['snow'])


def tree(d, x, y, c=None):
    d.ellipse([x - 3, y - 4, x + 3, y + 2], fill=c or E['forest'], outline=E['forest2'])
    d.point((x, y + 3), fill=E['dirt2'])


def dashed(d, pts, colour, on=3, off=2, width=1):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = max(1, int(math.hypot(x1 - x0, y1 - y0)))
        for i in range(0, L, on + off):
            a, b = i / L, min(L, i + on) / L
            d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=colour, width=width)


def island():
    n = fbm(11)
    img = Image.new('RGB', (W, H)); px = img.load()
    cx, cy = W * 0.5, H * 0.53
    for y in range(H):
        for x in range(W):
            dx, dy = (x - cx) / (W * 0.40), (y - cy) / (H * 0.44)
            h = n(x, y) * 0.9 - (dx * dx + dy * dy) * 0.62 + 0.18
            if h < 0.02: px[x, y] = dither(x, y, E['deep'], E['sea'], (h + 0.25) / 0.27) if h > -0.25 else E['deep']
            elif h < 0.07: px[x, y] = dither(x, y, E['sea'], E['shallow'], (h - 0.02) / 0.05)
            elif h < 0.11: px[x, y] = E['sand']
            elif h < 0.34: px[x, y] = dither(x, y, E['grass'], E['grass2'], (h - 0.11) / 0.23)
            elif h < 0.48: px[x, y] = E['grass2']
            elif h < 0.57: px[x, y] = dither(x, y, E['grass2'], E['forest'], (h - 0.48) / 0.09)
            else: px[x, y] = E['rock2'] if (x * 7 + y * 3) % 5 else E['rock']
    d = ImageDraw.Draw(img)
    # the lake in the north (Lakeside) and its shore
    d.ellipse([132, 44, 192, 76], fill=E['sand']); d.ellipse([136, 47, 188, 73], fill=E['sea'])
    for i in range(6): d.point((148 + i * 6, 58 + (i % 2) * 4), fill=E['shallow'])
    # Route 1: a dirt road from the town (south) to the lake (north)
    road = [(160, 182), (156, 160), (166, 138), (158, 116), (164, 96), (160, 78)]
    d.line(road, fill=E['dirt2'], width=4); d.line(road, fill=E['dirt'], width=2)
    d.line([(165, 152), (214, 140), (240, 150)], fill=E['dirt'], width=2)  # the road east to Harbour Town
    for x, y in [(120, 120), (128, 132), (114, 140), (124, 150), (198, 110), (206, 120), (190, 124), (214, 100), (104, 100), (110, 160), (205, 170), (95, 128)]: tree(d, x, y)
    for x, y in [(86, 74), (100, 66), (114, 78), (226, 72), (240, 84), (212, 84)]: mountain(d, x, y, 9)
    d.rectangle([236, 82, 242, 86], fill=E['dark'])  # a cave mouth
    town(d, 160, 186, big=True)   # Starter Town
    town(d, 244, 152)             # Harbour Town
    d.rectangle([180, 64, 186, 70], fill=E['wall'], outline=E['dark']); d.rectangle([181, 61, 185, 64], fill=E['roof2'])  # a cabin at the lake
    return img


def continent():
    n, m = fbm(23), fbm(57)
    img = Image.new('RGB', (W, H)); px = img.load()
    for y in range(H):
        for x in range(W):
            dx, dy = (x - W * 0.48) / (W * 0.52), (y - H * 0.52) / (H * 0.55)
            h = n(x, y) - (dx * dx * 0.55 + dy * dy * 0.75) * 0.75 + 0.12
            t = y / H + (m(x, y) - 0.5) * 0.35  # temperature: snowy north, warm south
            dry = x / W + (m(x + 99, y) - 0.5) * 0.4  # dry east
            if h < 0.27: px[x, y] = dither(x, y, E['deep'], E['sea'], (h - 0.05) / 0.22) if h > 0.05 else E['deep']
            elif h < 0.30: px[x, y] = E['sand']
            elif t < 0.28: px[x, y] = dither(x, y, E['snow'], E['snow2'], m(x, y))
            elif h > 0.63: px[x, y] = E['rock'] if (x + y) % 3 else E['rock2']
            elif dry > 0.68 and t > 0.45: px[x, y] = dither(x, y, E['desert'], E['desert2'], m(x * 2, y * 2))
            elif dry < 0.38: px[x, y] = dither(x, y, E['forest'], E['grass2'], m(x * 3, y * 3))
            else: px[x, y] = dither(x, y, E['grass'], E['grass2'], (h - 0.30) / 0.33)
    d = ImageDraw.Draw(img)
    river = [(120, 40), (132, 70), (126, 100), (146, 130), (140, 160), (160, 196), (168, 220)]
    d.line(river, fill=E['sea'], width=3)
    roads = [[(80, 150), (140, 160), (210, 150), (250, 168)], [(140, 160), (150, 110), (170, 70)]]
    for r in roads: dashed(d, r, E['dirt2'], 3, 2, 1)
    for x, y in [(70, 110), (60, 128), (84, 124), (76, 96), (92, 104)]: tree(d, x, y)
    for x, y in [(190, 62), (204, 70), (176, 70)]: mountain(d, x, y, 8)
    town(d, 80, 152, True); town(d, 210, 150); town(d, 252, 170); town(d, 150, 110)
    d.rectangle([164, 60, 178, 72], fill=E['rock'], outline=E['dark']);
    for k in range(3): d.rectangle([164 + k * 6, 56, 166 + k * 6, 60], fill=E['rock'], outline=E['dark'])  # a castle
    d.polygon([(168, 50), (171, 44), (174, 50)], fill=E['roof'])
    return img


def parchment():
    n = fbm(5)
    img = Image.new('RGB', (W, H)); px = img.load()
    for y in range(H):
        for x in range(W):
            edge = min(x, y, W - 1 - x, H - 1 - y)
            v = n(x * 3, y * 3)
            c = E['paper'] if v > 0.27 else E['paper2'] if v > 0.24 else E['sand2']
            if edge < 6: c = E['sand2'] if (x + y) % 2 else E['dirt']
            px[x, y] = c
    land = fbm(77)
    mask = [[land(x, y) - (((x - W / 2) / (W * 0.42)) ** 2 + ((y - H / 2) / (H * 0.40)) ** 2) * 0.55 > 0.16 for x in range(W)] for y in range(H)]
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if mask[y][x] and not (mask[y - 1][x] and mask[y + 1][x] and mask[y][x - 1] and mask[y][x + 1]): px[x, y] = E['ink']
            elif not mask[y][x] and 8 < x < W - 8 and 8 < y < H - 8 and (x % 6 == 0 and y % 9 == 0): px[x, y] = E['sand2']  # sea hatching
    d = ImageDraw.Draw(img)
    ink = E['ink']
    for x, y in [(110, 80), (122, 74), (134, 82), (200, 96), (212, 90)]:
        d.line([(x - 7, y + 4), (x, y - 6), (x + 7, y + 4)], fill=ink); d.line([(x, y - 6), (x + 2, y + 4)], fill=ink)
    for x, y in [(96, 136), (104, 142), (90, 146), (186, 150), (194, 144)]:
        d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=ink); d.line([(x, y + 3), (x, y + 6)], fill=ink)
    dashed(d, [(140, 172), (150, 140), (160, 116), (176, 100)], E['roof2'], 3, 3, 1)
    dashed(d, [(150, 140), (196, 130), (228, 140)], E['roof2'], 3, 3, 1)
    for x, y in [(140, 176), (228, 142), (176, 98)]:
        d.rectangle([x - 3, y - 3, x + 3, y + 3], outline=ink); d.point((x, y), fill=E['roof2'])
    d.line([(214, 176), (222, 186)], fill=E['roof2'], width=2); d.line([(222, 176), (214, 186)], fill=E['roof2'], width=2)  # X marks the spot
    # compass rose
    cx, cy = 270, 196
    d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], outline=ink)
    d.polygon([(cx, cy - 16), (cx + 3, cy), (cx, cy + 16), (cx - 3, cy)], fill=ink)
    d.polygon([(cx - 16, cy), (cx, cy - 3), (cx + 16, cy), (cx, cy + 3)], outline=ink)
    d.polygon([(cx - 2, cy - 22), (cx + 2, cy - 22), (cx, cy - 26)], fill=E['roof2'])
    return img


ORIGIN = 'Original pixel art made for Pocket-Game-Maker (generated by its built-in asset generator, 2026). Colours from the Endesga 32 palette.'
MAPS = [('worldmap-island.png', 'World map: island', island, 'An island with a town in the south, a road north to a lake, mountains with a cave, forests and a harbour town. Matches the sample project.'),
        ('worldmap-continent.png', 'World map: continent', continent, 'A continent with a snowy north, forests in the west, a desert in the east, a river, towns and a castle.'),
        ('worldmap-parchment.png', 'World map: parchment', parchment, 'An old hand-drawn map on parchment: ink coastline, mountains, trees, dashed routes, an X and a compass rose.')]
meta_f = os.path.join(LIB, 'library.json')
meta = json.load(open(meta_f, encoding='utf-8'))
for f, name, fn, desc in MAPS:
    img = fn()
    img.save(os.path.join(LIB, 'pictures', f), optimize=True)
    meta['pictures']['pictures/' + f] = {'origin': ORIGIN, 'author': 'Pocket-Designs', 'licence': 'CC0 1.0 (public domain)', 'status': 'Placeholder', 'name': name, 'description': desc}
    print('wrote pictures/' + f)
json.dump(meta, open(meta_f, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
open(meta_f, 'a').write('\n')
