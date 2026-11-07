#!/usr/bin/env python3
"""Makes the art templates in templates/art-templates/ (run: python3 tools/gen-art-templates.py; needs Pillow).

Two kinds of picture for each kind of art:
  *-template.png  The exact size the game expects, shaded in light squares (one shade per tile or frame).
                  Open it in your art program, draw on a new layer above it, then hide the template layer
                  and save your layer as a PNG with a transparent background.
  *-guide.png     A large labelled picture that explains the layout, with an example from the asset library.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'templates', 'art-templates')
LIB = os.path.join(ROOT, 'library')
os.makedirs(OUT, exist_ok=True)

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(size, bold=False):
    try: return ImageFont.truetype(BOLD if bold else FONT, size)
    except OSError: return ImageFont.load_default()

# Template shades (light, so they are easy to draw over and obviously not part of the art).
PLAIN = [(232, 233, 240, 255), (214, 217, 230, 255)]
AUTO = [(214, 230, 248, 255), (190, 214, 242, 255)]
ANIM = [(222, 244, 222, 255), (198, 232, 200, 255)]
WARM = [(250, 236, 214, 255), (240, 220, 190, 255)]
INK, MUTED, PAPER, LINE = (34, 38, 52), (96, 102, 124), (255, 255, 255), (150, 156, 180)
ACCENT = {'auto': (40, 110, 200), 'anim': (40, 150, 70), 'warm': (196, 120, 30), 'red': (200, 60, 60)}

def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, img.size)

def checker(w, h, cell_w, cell_h, palette=PLAIN, overrides=None):
    """A template: w×h cells of cell_w×cell_h pixels in alternating shades. overrides[(col,row)] = palette."""
    im = Image.new('RGBA', (w * cell_w, h * cell_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for r in range(h):
        for c in range(w):
            pal = (overrides or {}).get((c, r), palette)
            d.rectangle([c * cell_w, r * cell_h, (c + 1) * cell_w - 1, (r + 1) * cell_h - 1], fill=pal[(c + r) % 2])
    return im

def enlarge(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)

def grid(d, x, y, cols, rows, cw, ch, color=LINE, width=1):
    for c in range(cols + 1): d.line([x + c * cw, y, x + c * cw, y + rows * ch], fill=color, width=width)
    for r in range(rows + 1): d.line([x, y + r * ch, x + cols * cw, y + r * ch], fill=color, width=width)

def text(d, xy, s, size=18, bold=False, fill=INK, anchor='la'):
    d.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor)

def para(d, x, y, lines, size=17, fill=INK, gap=7, bold_first=False):
    for i, s in enumerate(lines):
        text(d, (x, y), s, size, bold_first and i == 0, fill)
        y += size + gap
    return y

def page(w, h, title, subtitle):
    im = Image.new('RGB', (w, h), PAPER)
    d = ImageDraw.Draw(im)
    text(d, (40, 30), title, 30, True)
    text(d, (40, 72), subtitle, 18, False, MUTED)
    d.line([40, 104, w - 40, 104], fill=(220, 223, 232), width=2)
    return im, d

def lib(rel):
    return Image.open(os.path.join(LIB, rel)).convert('RGBA')

def paste_on_checker(base, img, xy):
    """Paste art over a small grey checkerboard so transparent parts are visible."""
    x, y = xy
    bg = Image.new('RGBA', img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bg)
    s = max(4, img.width // 16)
    for yy in range(0, img.height, s):
        for xx in range(0, img.width, s):
            bd.rectangle([xx, yy, xx + s - 1, yy + s - 1], fill=(236, 236, 240, 255) if (xx // s + yy // s) % 2 else (250, 250, 252, 255))
    bg.alpha_composite(img)
    base.paste(bg, (x, y))

# ------------------------------------------------------------------ tilesets
def tileset_layout(T):
    """8 tiles across, 8 down: plain tiles on top, then an animated row, then autotile blocks."""
    over = {}
    for c in range(4): over[(c, 3)] = ANIM                      # animated tile: 4 frames, left to right
    for bx in (0, 2, 4, 6):                                      # four autotile blocks (2 across, 3 down)
        for c in (bx, bx + 1):
            for r in (5, 6, 7): over[(c, r)] = AUTO
    return checker(8, 8, T, T, PLAIN, over)

for T in (16, 32):
    save(tileset_layout(T), 'tileset-%dpx-template.png' % T)
save(checker(2, 3, 16, 16, AUTO), 'autotile-16px-template.png')
save(checker(8, 3, 16, 16, AUTO, {(c, r): AUTO if (c // 2) % 2 == 0 else ANIM for c in range(8) for r in range(3)}), 'autotile-animated-16px-template.png')

def tileset_guide():
    K = 8; T = 16 * K
    im, d = page(1620, 1290, 'Tileset template', 'tileset-16px-template.png (128 × 128) · tileset-32px-template.png (256 × 256) · any number of rows')
    tpl = enlarge(tileset_layout(16), K).convert('RGB')
    x0, y0 = 40, 130
    im.paste(tpl, (x0, y0))
    grid(d, x0, y0, 8, 8, T, T)
    for i in range(64):
        c, r = i % 8, i // 8
        text(d, (x0 + c * T + 6, y0 + r * T + 4), str(i), 15, False, MUTED)
    # labels on the template
    d.rectangle([x0, y0, x0 + 8 * T, y0 + 3 * T], outline=INK, width=3)
    text(d, (x0 + 4 * T, y0 + 1.5 * T), 'Plain tiles', 34, True, INK, 'mm')
    d.rectangle([x0, y0 + 3 * T, x0 + 4 * T, y0 + 4 * T], outline=ACCENT['anim'], width=4)
    for f in range(4): text(d, (x0 + f * T + T // 2, y0 + 3.5 * T), 'frame %d' % (f + 1), 18, True, ACCENT['anim'], 'mm')
    for b, label in enumerate(['autotile 1', 'autotile 2', 'autotile 3', 'autotile 4']):
        bx = x0 + b * 2 * T
        d.rectangle([bx, y0 + 5 * T, bx + 2 * T, y0 + 8 * T], outline=ACCENT['auto'], width=4)
        text(d, (bx + T, y0 + 5 * T + 26), label, 20, True, ACCENT['auto'], 'mm')
        text(d, (bx + T // 2, y0 + 5.5 * T + 18), 'paint', 15, False, ACCENT['auto'], 'mm')
        text(d, (bx + T // 2, y0 + 5.5 * T + 38), 'with this', 15, False, ACCENT['auto'], 'mm')
    # explanation
    x = x0 + 8 * T + 50; y = 140
    y = para(d, x, y, ['Size', 'Squares are 16 × 16 pixels (or 24, 32 or 48:', 'choose in Database → Tilesets). Keep the', 'picture 8 squares wide; add as many rows', 'as you need. Square numbers count left to', 'right, top to bottom, starting at 0.'], bold_first=True)
    y = para(d, x, y + 18, ['Plain tiles (grey)', 'Grass, floors, walls, trees, roofs, signs.', 'Any square can be any tile. Whether it blocks', 'the player, is grass with wild monsters, or is', 'drawn above the player is set per square in', 'Database → Tilesets, not in the picture.'], bold_first=True)
    y = para(d, x, y + 18, ['Animated tiles (green)', 'Put frames side by side, left to right.', 'In Database → Tilesets, select the first frame', 'and set Frames (2–8). The other frames are', 'used automatically and are not painted with.'], bold_first=True)
    y = para(d, x, y + 18, ['Autotiles (blue)', 'Water, paths, cliffs and fences that join up', 'by themselves. Each is a block 2 squares wide', 'and 3 tall (see autotile-guide.png). Tick', 'Autotile on its top-left square, the one you', 'paint with.'], bold_first=True)
    y = para(d, x, y + 18, ['Where things go is up to you', 'This layout is only a suggestion. The engine', 'only needs autotile blocks to be 2 × 3 and', 'animation frames to sit to the right.'], bold_first=True)
    para(d, 40, y0 + 8 * T + 26, ['How to use: open the template, add a new layer above it, draw your tiles on that layer, then hide the template layer and save as PNG',
                                  'with a transparent background. Import it with File → Import Assets → Tilesets, and it is added to Database → Tilesets.'], 17, MUTED)
    save(im, 'tileset-guide.png')
tileset_guide()

def autotile_guide():
    K = 10; T = 16 * K
    im, d = page(1500, 1000, 'Autotile template', 'autotile-16px-template.png (32 × 48) · autotile-animated-16px-template.png (128 × 48, 4 frames)')
    x0, y0 = 40, 140
    # the block, enlarged, with quarter lines
    tpl = enlarge(checker(2, 3, 16, 16, AUTO), K).convert('RGB')
    im.paste(tpl, (x0, y0))
    for i in range(5): d.line([x0 + i * T // 2, y0, x0 + i * T // 2, y0 + 3 * T], fill=(170, 190, 220), width=1)
    for i in range(7): d.line([x0, y0 + i * T // 2, x0 + 2 * T, y0 + i * T // 2], fill=(170, 190, 220), width=1)
    grid(d, x0, y0, 2, 3, T, T, ACCENT['auto'], 3)
    text(d, (x0 + T // 2, y0 + T // 2 - 14), 'Preview', 22, True, ACCENT['auto'], 'mm')
    text(d, (x0 + T // 2, y0 + T // 2 + 16), '(paint with this)', 15, False, ACCENT['auto'], 'mm')
    text(d, (x0 + 1.5 * T, y0 + T // 2 - 14), 'Inner', 22, True, ACCENT['auto'], 'mm')
    text(d, (x0 + 1.5 * T, y0 + T // 2 + 14), 'corners', 22, True, ACCENT['auto'], 'mm')
    labels = [['top-left', 'top', 'top', 'top-right'], ['left', 'middle', 'middle', 'right'], ['left', 'middle', 'middle', 'right'], ['bottom-left', 'bottom', 'bottom', 'bottom-right']]
    for r in range(4):
        for c in range(4):
            text(d, (x0 + c * T // 2 + T // 4, y0 + T + r * T // 2 + T // 4), labels[r][c], 12, False, ACCENT['auto'], 'mm')
    # real examples
    ex = lib('tilesets/outdoor.png')
    path = ex.crop((6 * 16, 5 * 16, 8 * 16, 8 * 16))
    water = ex.crop((0, 5 * 16, 6 * 16, 8 * 16))
    ex_x = x0 + 2 * T + 60
    text(d, (ex_x, y0 - 8), 'Example: the path autotile from the Outdoor tileset', 18, True)
    paste_on_checker(im, enlarge(path, 6), (ex_x, y0 + 20))
    text(d, (ex_x + 220, y0 + 30), 'Draw the 2 × 2 lower block as one', 17)
    text(d, (ex_x + 220, y0 + 54), 'patch of path with its edges and', 17)
    text(d, (ex_x + 220, y0 + 78), 'corners. Draw the top-right square', 17)
    text(d, (ex_x + 220, y0 + 102), 'as the four inside corners (path all', 17)
    text(d, (ex_x + 220, y0 + 126), 'round, with grass just in the corner).', 17)
    text(d, (ex_x + 220, y0 + 150), 'The top-left square is the picture', 17)
    text(d, (ex_x + 220, y0 + 174), 'shown in the tile palette.', 17)
    text(d, (ex_x, y0 + 330), 'Example: animated water (3 frames, each a 2 × 3 block)', 18, True)
    paste_on_checker(im, enlarge(water, 4), (ex_x, y0 + 360))
    for f in range(3): text(d, (ex_x + f * 128 + 64, y0 + 360 + 192 + 18), 'frame %d' % (f + 1), 16, True, ACCENT['anim'], 'mm')
    para(d, ex_x + 420, y0 + 370, ['Put the frames side by side:', 'the next block 2 squares to the', 'right. Tick Autotile and set', 'Frames on the first block\'s', 'top-left square.'], 17)
    para(d, 40, y0 + 3 * T + 140, ['How it works', 'Each map square is built from four quarter-squares (the thin lines), chosen by looking at the eight squares around it.',
                                  'So the lower block must line up as one seamless patch, and the inner-corner square must match its edges.',
                                  'The layout is the same as RPG Maker\'s A2 autotiles, so many existing tilesets work as they are.'], 17, INK, 7, True)
    save(im, 'autotile-guide.png')
autotile_guide()

# ------------------------------------------------------------------ characters
ROWS = ['Down', 'Left', 'Right', 'Up']; COLS = ['Step 1', 'Standing', 'Step 2']
def char_template(fw, fh):
    im = checker(3, 4, fw, fh, PLAIN, {(1, r): WARM for r in range(4)})
    d = ImageDraw.Draw(im)
    for r in range(4):  # a faint line where the feet go
        d.line([0, (r + 1) * fh - 2, 3 * fw - 1, (r + 1) * fh - 2], fill=(200, 160, 120, 255))
    return im
save(char_template(16, 16), 'character-16px-template.png')
save(char_template(16, 24), 'character-16x24px-template.png')
save(char_template(32, 32), 'character-32px-template.png')

def char_guide():
    K = 9; fw = 16 * K
    im, d = page(1500, 960, 'Character template (people, objects, walking monsters)',
                 'character-16px-template.png (48 × 64) · character-16x24px-template.png (48 × 96) · character-32px-template.png (96 × 128)')
    x0, y0 = 150, 170
    tpl = enlarge(char_template(16, 16), K).convert('RGB')
    im.paste(tpl, (x0, y0))
    grid(d, x0, y0, 3, 4, fw, fw, INK, 2)
    for c, s in enumerate(COLS): text(d, (x0 + c * fw + fw // 2, y0 - 22), s, 18, True, ACCENT['warm'] if c == 1 else INK, 'mm')
    for r, s in enumerate(ROWS): text(d, (x0 - 16, y0 + r * fw + fw // 2), 'Facing ' + s.lower(), 17, True, INK, 'rm')
    hero = lib('characters/hero.png')
    hx = x0 + 3 * fw + 60
    text(d, (hx, y0 - 30), 'Example: hero.png', 18, True)
    paste_on_checker(im, enlarge(hero, K), (hx, y0))
    grid(d, hx, y0, 3, 4, fw, fw, (210, 212, 222), 1)
    x = hx + 3 * fw + 40
    y = para(d, x, y0 - 30, ['Layout', '3 frames across, 4 rows down.', 'Rows: facing down, left, right, up.', 'Middle column: standing still.', 'Walking plays step 1, standing,', 'step 2, standing.'], bold_first=True)
    y = para(d, x, y + 16, ['Size', 'Each frame is a square on the map', '(16 × 16), or taller for bigger', 'characters: 16 × 24 or 32 × 32.', 'The game works out the frame size', 'from the picture (width ÷ 3,', 'height ÷ 4).'], bold_first=True)
    y = para(d, x, y + 16, ['Feet', 'Frames stand on the bottom of the', 'square (the orange line), centred,', 'so tall characters grow upwards.'], bold_first=True)
    para(d, 40, y0 + 4 * fw + 30, ['Also used for objects that sit on the map (chests, signs, levers: draw the same picture in every frame if it never moves),',
                                   'for a monster\'s walking sheet when it follows the player, and for clothes in the wardrobe (see wardrobe-guide.png).',
                                   'Import: File → Import Assets → Characters (or Monster pictures for a walking sheet).'], 17, MUTED)
    save(im, 'character-guide.png')
char_guide()

# ------------------------------------------------------------------ monsters
def monster_template(S=64):
    im = checker(1, 1, S, S, PLAIN)
    d = ImageDraw.Draw(im)
    d.line([0, S - 3, S - 1, S - 3], fill=(200, 160, 120, 255))       # ground
    d.line([S // 2, 0, S // 2, S - 1], fill=(205, 208, 222, 255))     # centre
    return im
save(monster_template(64), 'monster-64px-template.png')
save(monster_template(96), 'monster-96px-template.png')

def monster_guide():
    K = 6; S = 64 * K
    im, d = page(1500, 800, 'Monster pictures (battle)', 'monster-64px-template.png (64 × 64) · monster-96px-template.png (96 × 96) · one front and one back picture per monster')
    x0, y0 = 40, 160
    front, back = lib('monsters/sproutle_front.png'), lib('monsters/sproutle_back.png')
    for i, (img, label, note) in enumerate([(front, 'Front: sproutle_front.png', 'what the player sees of a wild or trainer\'s monster'), (back, 'Back: sproutle_back.png', 'the player\'s own monster, seen from behind')]):
        x = x0 + i * (S + 60)
        text(d, (x, y0 - 34), label, 18, True)
        tpl = enlarge(monster_template(64), K).convert('RGBA')
        tpl.alpha_composite(enlarge(img, K))
        im.paste(tpl.convert('RGB'), (x, y0))
        d.rectangle([x, y0, x + S, y0 + S], outline=INK, width=2)
        text(d, (x, y0 + S + 14), note, 15, False, MUTED)
    x = x0 + 2 * (S + 60)
    y = para(d, x, y0 - 34, ['Size', 'Square pictures. 64 × 64 matches the', 'library; 96 × 96 gives more detail.', 'Battles scale them to fit (bigger when', 'one monster a side, smaller in', 'double and triple battles).'], bold_first=True)
    y = para(d, x, y + 16, ['Standing', 'Stand the monster on the bottom edge', '(the orange line), centred: battles', 'line monsters up by their feet.', 'Leave the background transparent.'], bold_first=True)
    y = para(d, x, y + 16, ['Following the player', 'Without a walking sheet, the front', 'picture is used, shrunk to one', 'square. For a proper walking', 'animation, draw one with the', 'character template.'], bold_first=True)
    para(d, 40, y0 + S + 60, ['Import: File → Import Assets → Monster pictures. Then choose them in Database → Monsters (Front and Back).'], 17, MUTED)
    save(im, 'monster-guide.png')
monster_guide()

# ------------------------------------------------------------------ decorations
for (w, h) in [(1, 1), (2, 1), (1, 2), (2, 2), (3, 2)]:
    save(checker(w, h, 16, 16, WARM), 'decoration-%dx%d-template.png' % (w, h))

def decoration_guide():
    K = 8; T = 16 * K
    im, d = page(1500, 940, 'Furniture and decorations (Decorating)', 'decoration-1x1, 2x1, 1x2, 2x2 and 3x2 templates · 16 pixels per square')
    x, y0 = 40, 190
    for (w, h) in [(1, 1), (2, 1), (1, 2), (2, 2)]:
        tpl = enlarge(checker(w, h, 16, 16, WARM), K).convert('RGB')
        im.paste(tpl, (x, y0))
        grid(d, x, y0, w, h, T, T, INK, 2)
        text(d, (x, y0 - 52), '%d × %d squares' % (w, h), 17, True)
        text(d, (x, y0 - 28), '%d × %d px' % (w * 16, h * 16), 15, False, MUTED)
        x += max(w * T, 150) + 40
    ex_y = y0 + 2 * T + 70
    text(d, (40, ex_y - 34), 'Examples from the library', 18, True)
    xx = 40
    for rel, label in [('decorations/bed.png', 'Bed: 1 × 2'), ('decorations/table.png', 'Table: 2 × 1'), ('decorations/rug.png', 'Rug: 2 × 2, walk-over'), ('decorations/plant.png', 'Plant: 1 × 1')]:
        img = lib(rel)
        paste_on_checker(im, enlarge(img, 5), (xx, ex_y))
        text(d, (xx, ex_y + img.height * 5 + 10), label, 15, False, MUTED)
        xx += img.width * 5 + 50
    # turning illustration with the table
    tx = 820
    text(d, (tx, ex_y - 34), 'Turning (R while placing)', 18, True)
    table = lib('decorations/table.png')
    for i, (lab, op) in enumerate([('as drawn', None), ('a quarter turn', 'rot'), ('mirrored', 'flip')]):
        img = table.rotate(-90, expand=True) if op == 'rot' else table.transpose(Image.FLIP_LEFT_RIGHT) if op == 'flip' else table
        paste_on_checker(im, enlarge(img, 5), (tx + i * 200, ex_y))
        text(d, (tx + i * 200, ex_y + img.height * 5 + 10), lab, 15, False, MUTED)
    x = 40 + 150 + 2 * T + 150 + 2 * T + 4 * 40 + 10
    para(d, x, y0 - 52, ['Size', 'One square is 16 × 16 pixels, so a', 'table 2 squares wide is 32 × 16.', 'Set the size in squares on the item', '(Database → Items → Decoration).'], bold_first=True)
    para(d, 40, ex_y + 220, ['Draw it facing down, the way the player sees it from the front of the room. Each item has a Turning setting:',
                             'Rotate (quarter turns: the picture is turned, and a 2 × 1 table becomes 1 × 2), Mirror (flipped left/right only, for',
                             'things like a sofa with a front), or None. Untick Blocks for rugs and mats the player can walk over: they are drawn under',
                             'the player. Import: File → Import Assets → Decorations.'], 17, INK)
    save(im, 'decoration-guide.png')
decoration_guide()

# ------------------------------------------------------------------ wardrobe
def wardrobe_template():
    im = char_template(16, 16)
    hero = lib('characters/hero.png')
    ghost = hero.copy(); ghost.putalpha(ghost.getchannel('A').point(lambda a: 70 if a else 0))
    im.alpha_composite(ghost)
    return im
save(wardrobe_template(), 'clothing-overlay-16px-template.png')

def wardrobe_guide():
    K = 8; fw = 16 * K
    im, d = page(1500, 900, 'Clothes (Wardrobe)', 'clothing-overlay-16px-template.png (48 × 64): the hero shown faintly, so the clothes line up')
    x0, y0 = 40, 170
    tpl = enlarge(wardrobe_template(), K).convert('RGB')
    im.paste(tpl, (x0, y0)); grid(d, x0, y0, 3, 4, fw, fw, INK, 2)
    text(d, (x0, y0 - 30), 'Template (faint hero to trace over)', 17, True)
    cap = lib('characters/wear-cap-blue.png'); hero = lib('characters/hero.png')
    x1 = x0 + 3 * fw + 50
    text(d, (x1, y0 - 30), 'wear-cap-blue.png (just the cap)', 17, True)
    paste_on_checker(im, enlarge(cap, K), (x1, y0)); grid(d, x1, y0, 3, 4, fw, fw, (210, 212, 222), 1)
    x2 = x1 + 3 * fw + 50
    both = hero.copy(); both.alpha_composite(cap)
    text(d, (x2, y0 - 30), 'In the game: hero + cap', 17, True)
    paste_on_checker(im, enlarge(both, K), (x2, y0)); grid(d, x2, y0, 3, 4, fw, fw, (210, 212, 222), 1)
    para(d, 40, y0 + 4 * fw + 30, ['Same size and layout as the player\'s walking sheet. Draw only the clothes and leave everything else transparent;',
                                   'hide the template before saving. Layers go on in this order: bottoms, top, extra, hat. An Outfit is a whole new',
                                   'walking sheet instead (use the character template). Set the slot on the item in Database → Items → Clothing.',
                                   'Import: File → Import Assets → Characters.'], 17, INK)
    save(im, 'wardrobe-guide.png')
wardrobe_guide()

# ------------------------------------------------------------------ battle backgrounds and full-screen pictures
W, H = 320, 240
def battleback_template(marks=True):
    im = Image.new('RGBA', (W, H), (226, 230, 240, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, int(H * 0.40)], fill=(214, 226, 244, 255))               # sky / far side
    if marks:
        # opponent (one monster): 84 px, centred at 70% across, feet at 40% down
        d.ellipse([int(W * 0.70) - 46, int(H * 0.40) - 7, int(W * 0.70) + 46, int(H * 0.40) + 7], fill=(196, 206, 226, 255))
        d.rectangle([int(W * 0.70) - 42, int(H * 0.40) - 84, int(W * 0.70) + 42, int(H * 0.40)], outline=(170, 120, 120, 255))
        # player's monster: 104 px at 27% across, feet just above the message box
        base = H - 52 + 6
        d.ellipse([int(W * 0.27) - 56, base - 8, int(W * 0.27) + 56, base + 8], fill=(196, 206, 226, 255))
        d.rectangle([int(W * 0.27) - 52, base - 104, int(W * 0.27) + 52, base], outline=(120, 140, 180, 255))
        d.rectangle([0, H - 52, W - 1, H - 1], fill=(206, 208, 216, 255))               # message box
    return im
save(battleback_template(), 'battleback-320x240-template.png')
save(checker(10, 10, 32, 24, PLAIN), 'screen-320x240-template.png')

def battle_guide():
    K = 3
    im, d = page(1500, 960, 'Battle backgrounds and full-screen pictures', 'battleback-320x240-template.png · screen-320x240-template.png (title screens, cut-scene pictures)')
    x0, y0 = 40, 150
    tpl = enlarge(battleback_template(), K).convert('RGB')
    im.paste(tpl, (x0, y0)); d.rectangle([x0, y0, x0 + W * K, y0 + H * K], outline=INK, width=2)
    text(d, (x0 + int(W * 0.70) * K, y0 + int(H * 0.40) * K - 84 * K // 2), 'Opponent', 22, True, (150, 80, 80), 'mm')
    text(d, (x0 + int(W * 0.27) * K, y0 + (H - 46) * K - 104 * K // 2), 'Your monster', 22, True, (70, 90, 150), 'mm')
    text(d, (x0 + W * K // 2, y0 + (H - 26) * K), 'Message box and menus (bottom 52 px)', 20, True, MUTED, 'mm')
    ex = lib('battlebacks/field.png')
    ex_x = x0 + W * K + 50
    text(d, (ex_x, y0 - 30), 'Example: field.png', 18, True)
    im.paste(enlarge(ex, 1).convert('RGB').resize((W * 5 // 4, H * 5 // 4), Image.NEAREST), (ex_x, y0))
    para(d, ex_x, y0 + H * 5 // 4 + 30, ['Size', 'The game screen: 320 × 240 by default', '(Database → System). Bigger pictures', 'are scaled down to fit.'], bold_first=True)
    para(d, ex_x, y0 + H * 5 // 4 + 160, ['Where monsters stand', 'Draw a patch of ground under each box:', 'the opponent on the far side, yours in', 'front. The bottom 52 pixels are covered', 'by the message box.'], bold_first=True)
    para(d, 40, y0 + H * K + 30, ['Boxes show one monster a side. In double and triple battles they are smaller and spread out along the same lines.',
                                  'Import: File → Import Assets → Battle backgrounds (or Pictures for title screens and cut scenes).'], 17, MUTED)
    save(im, 'battle-guide.png')
battle_guide()

# ------------------------------------------------------------------ overview (one picture of everything)
def overview():
    im, d = page(1500, 960, 'Pocket-Game-Maker art templates', 'Each template shown 3× larger (the battle background at real size), with what it is for')
    items = [('tileset-16px-template.png', 'Tileset', '8 squares wide, 16 px'), ('autotile-16px-template.png', 'Autotile block', '2 × 3 squares'),
             ('character-16px-template.png', 'Character', '3 frames × 4 directions'), ('character-16x24px-template.png', 'Tall character', '16 × 24 frames'),
             ('monster-64px-template.png', 'Monster', 'front or back, 64 px'), ('decoration-2x1-template.png', 'Furniture', '16 px per square'),
             ('decoration-1x2-template.png', 'Furniture', 'e.g. a bed'), ('clothing-overlay-16px-template.png', 'Clothes', 'traced over the hero'),
             ('battleback-320x240-template.png', 'Battle background', '320 × 240 screen, real size')]
    x, y, rowh = 40, 150, 0
    for f, name, note in items:
        src = Image.open(os.path.join(OUT, f)).convert('RGBA')
        img = enlarge(src, 1 if src.width > 200 else 3)  # the full-screen template is shown at real size
        if x + img.width > 1460: x = 40; y += rowh + 90; rowh = 0
        paste_on_checker(im, img, (x, y))
        d.rectangle([x, y, x + img.width, y + img.height], outline=LINE)
        text(d, (x, y + img.height + 10), name, 17, True)
        text(d, (x, y + img.height + 34), note, 15, False, MUTED)
        x += max(img.width, 190) + 40; rowh = max(rowh, img.height)
    save(im, 'overview.png')
overview()

with open(os.path.join(OUT, 'README.txt'), 'w', encoding='utf-8') as f:
    f.write('''Pocket-Game-Maker art templates
================================

*-template.png  The exact size the game expects, shaded in light squares (one shade per tile or frame).
*-guide.png     A large, labelled explanation with an example from the asset library.

How to use a template
1. Open the template in your art program (Clip Studio Paint, Aseprite, Krita, Photoshop, GIMP...).
2. Add a new layer above it and draw your art on that layer.
3. Hide or delete the template layer, so the background is transparent.
4. Save (export) as PNG. Keep the picture the same size as the template.
5. In Pocket-Game-Maker: File > Import Assets, and pick the kind of art.

Templates
  tileset-16px-template.png            Tileset, 16 px squares, 8 across (add rows as needed)      tileset-guide.png
  tileset-32px-template.png            The same with 32 px squares                                tileset-guide.png
  autotile-16px-template.png           One autotile block (water, paths, cliffs)                  autotile-guide.png
  autotile-animated-16px-template.png  An animated autotile, 4 frames side by side                autotile-guide.png
  character-16px-template.png          People and objects: 3 frames x 4 directions, 16 x 16       character-guide.png
  character-16x24px-template.png       Taller characters, 16 x 24 frames                          character-guide.png
  character-32px-template.png          Big characters, 32 x 32 frames                             character-guide.png
  monster-64px-template.png            Monster front or back battle picture                       monster-guide.png
  monster-96px-template.png            The same with more detail                                  monster-guide.png
  decoration-1x1 / 2x1 / 1x2 / 2x2 / 3x2-template.png  Furniture, 16 px per square               decoration-guide.png
  clothing-overlay-16px-template.png   Wardrobe clothes, traced over the hero                     wardrobe-guide.png
  battleback-320x240-template.png      Battle background, showing where monsters stand            battle-guide.png
  screen-320x240-template.png          Title screens and cut-scene pictures                       battle-guide.png

overview.png shows every template together.
Regenerate with: python3 tools/gen-art-templates.py (needs Pillow)
''')
print('wrote README.txt')
