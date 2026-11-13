# Pocket-Game-Maker

A desktop game maker for monster-taming and monster-capturing RPGs, in the spirit of RPG Maker MZ but built around wild encounters, capture, parties and turn-based monster battles.

Pocket-Game-Maker was called MonsterForge before version 0.8.1. Projects made under the old name open as they are, and on first start it moves the old `Documents/MonsterForge` asset library folder and recent projects list across.

## Run it

Requires Node.js 24 or newer (Windows, macOS or Linux). The app runs on Electron 44, which also uses Node.js 24. An `.nvmrc` file is included, so `nvm use` picks the right version.

```
npm install
npm start
```

Choose **New project…**, pick *Sample project* (playable immediately) or *Blank project*, then choose a parent folder. Press **F5** to playtest.

`npm test` runs the rules-engine and exporter tests (formulas, capture, 3,000 randomised battles, archives and icons).
`npm run dist:win` / `npm run dist:mac` / `npm run dist:linux` build the installers with electron-builder on that system: a Windows installer and portable .exe, a macOS .dmg and .zip for Intel and for Apple Silicon, or a Linux AppImage and .deb.

### Building on GitHub (Windows, macOS and Linux)

`.github/workflows/build.yml` builds all three on GitHub's computers, so you don't need a Mac or a Windows PC:

1. Push the project to a GitHub repository (the `homepage` in package.json assumes `Pocket-Designs/pocket-game-maker`; change it if yours is different).
2. Every push to `main` and every pull request runs the tests and builds on Windows, macOS and Linux, to check everything still builds. These runs don't keep the installers, so they don't use up the account's Actions storage.
3. To download installers, use **Actions → Build → Run workflow**. When it finishes, the installers are on the repository's **Releases** page as a draft called **Test build N** (drafts are only visible to people who can push to the repository). The newest 3 test builds are kept; older ones are deleted automatically.
4. To make a release, push a version tag: `git tag v0.9.7` then `git push origin v0.9.7`. The installers are attached to a **draft release**; check it and click **Publish**.

Installers are never stored as Actions "artifacts", so they don't use the account's Actions storage quota (release files don't count). Each run also deletes artifacts left by earlier runs. If you ever see **"Artifact storage quota has been hit"** again, it only affects the small build logs kept when a build fails, and it won't stop the build; GitHub recounts the space used every 6–12 hours. To free it at once, delete old runs (Actions → a run → **…** → Delete workflow run).

All the actions it uses run on Node.js 24 (GitHub removed Node.js 20 from its runners in September 2026), and the app is built with Node.js 24.

The builds are unsigned unless you add certificates as repository secrets (listed at the top of the workflow). Unsigned builds work, but Windows shows a SmartScreen warning (**More info → Run anyway**), and macOS needs a right-click on the app and **Open** the first time. If macOS says the app is damaged, run `xattr -cr /Applications/Pocket-Game-Maker.app` in Terminal.

## The editor

| Area | What it does |
|---|---|
| **Map mode** | Paint with Pencil, Rect, Fill, Erase on the layer selected in the **Layers** panel (see below). Drag in the tileset palette to pick a multi-tile stamp. Right-click the map to pick a tile. Ctrl+Z / Ctrl+Y undo/redo. |
| **Height mode (2.5D)** | Raise the ground into hills, cliffs and ledges, add stairs, and drag ready-made shapes onto the map. See *2.5D: height levels and the tilted camera* below. |
| **Events mode** | Double-click a tile to create an event, drag to move, Enter to edit, Ctrl+C then right-click to paste. Right-click → *Set player start here* or *Playtest from here*. |
| **Inspector** | Map name, size (**Change size…**), tileset, battle background, **music**, **map edges** and the **wild encounter table** (monster, level range, weight, chance per step). Click a section's heading to fold it away. Tick **One at a time** to keep just one section open (opening one closes the others), or use **Expand all** / **Collapse all**. The editor remembers your choice. |
| **Database (F9, or the Database menu)** | Monsters (types, base stats, growth, catch rate, sprites, learnset, evolution), Moves (power, accuracy, EP, priority, targets, status/stat/heal/drain/recoil effects), Types (click-to-cycle effectiveness chart), Items (balls, healing, revives, EP restores, evolution stones, tools, key items), Tilesets (passability, encounter, autotile and animation settings), **Music & sounds** (game music, jingles, sound effects, volumes), Menus & screens, System (screen size, start, blackout point, starting party/bag, battle rules, switches) and Credits. The **Database** menu in the menu bar opens any tab directly (Ctrl+Shift+1 to 9). |
| **Passability** toggle | Red = blocked, green = wild-encounter tiles. |
| **Zoom** | **−** and **+** either side of the zoom box (100–400%), the **−** / **+** keys, or Ctrl + mouse wheel over the map. Zoom only changes how big the map looks while you edit. |

Keyboard: `M`/`E`/`H` modes · `B` `R` `F` `X` tools · `1`–`9` layers · `D` dim other layers · `P` passability · `Ctrl+S` save · `F5` playtest · `F9` database.

### Layers

New maps start with three layers. Add as many more as you like, or delete the ones you don't need (**Delete** under the Layers panel, or right-click a layer) down to a single layer; Ctrl+Z brings a deleted layer back. The Layers panel (left side, under the tileset) lists them top first. Click one to paint on it; double-click (or **Properties…**) to change its settings.

| Default layer | Collision | Drawn above player | Wild encounters |
|---|---|---|---|
| 1. **Ground** | Walkable | No | Where the tile is marked ♣ |
| 2. **Obstacles** (walls, trees, boulders) | Blocks | No | None |
| 3. **Grass & overhead** (grass, flowers, tree tops, roofs) | Walkable | Yes | Where the tile is marked ♣ |

Each layer has its own properties:

- **Collision**: *Walkable* (never blocks), *Blocks* (anything painted here blocks) or *Tile setting* (uses the tileset's ○/× flags). If any layer blocks a square, the player can't walk there.
- **Drawn above the player**: the layer is drawn over the player and characters.
- **Wild encounters**: *None*, *Where the tile is marked*, or *Every painted square*.
- **Hidden in the game**: not drawn when playing, but still blocks and triggers encounters (handy for invisible walls).
- Editor-only: **Visible** (eye), **Locked** (padlock, stops painting), **Opacity**, plus **Dim other layers** (`D`) in the toolbar.

**+ Add** inserts a new layer above the selected one, ▲/▼ reorder, **Delete** removes one (never below three). All of these can be undone. Maps from older versions keep their old behaviour.

### Map sizes

**New map** asks for a name, tileset and size: pick Small (20×15), Medium (30×20), Large (40×30), Huge (64×48) or type any width and height from 5 to 256 squares. **Change size…** (map properties, or right-click a map in the Maps list) resizes a map later. **Delete map…** (the **－** button in the Maps panel, the map properties, or right-click a map) removes a map after listing anything that leads to it; if the game started there, the start and blackout points move to the next map. A project always keeps at least one map. A 3×3 anchor chooses which side stays put; events, the start position and encounter areas move with the map, the ground is extended from the nearest edge, and Ctrl+Z undoes it.

### 2.5D: height levels and the tilted camera

Any map can have **height levels** (0 is the ground, up to 4) and a **tilted camera** that leans the ground away from the player.

- **Height mode** (`H`, or **Height** on the toolbar) paints levels. Pick a level and paint, or use **Raise**, **Lower**, **Stairs** and **Flatten**, with a 1×1, 2×2 or 3×3 brush. Right-click a square to pick its level. Levels are coloured (blue 1, yellow 2, orange 3, red 4) and cliff faces show as thick dark lines; the cliff lines stay visible in Map and Events mode.
- **Drag and drop shapes** from the Height panel onto the map: small hill, big hill, plateau, cliff wall, jump-down ledge, stairs up and lookout. Each is placed relative to the level of the square it lands on. Or click a shape, then click the map.
- **Walking:** players walk between squares of the same level; **stairs** join squares one level apart; walking down the screen off a ledge is a one-way **jump** (with its own sound); anything else is a cliff. Events can only be talked to from the same level or across stairs.
- **Map properties → 2.5D view:** the camera (**Top-down** or **Tilted 2.5D**), how far it tilts, mist in the distance, how tall each level is, the look of cliff faces (rock, earth, stone wall, wood, grassy bank), the colour beyond the map's edge, ledge jumps on or off, and character shadows. **▶ Preview in 2.5D** playtests the map straight away.
- In the game, raised ground is drawn with cliff faces and shading, characters stand on it and walk behind higher ground, and everyone casts a small shadow. The playtest debugger warns about stairs that join nothing and events nobody can reach, and its F10 overlay shows each square's level.
- Undo, redo and **Change size…** all keep the heights. Maps without heights and with the top-down camera look and play exactly as before.

The sample game's **Hilltop Trail** (east of Lakeside) shows it all: a plateau with a jump-down ledge, a three-level hill with a lookout, and the tilted camera.

### Autotiles and animated tiles

- An **autotile** is a 2×3 block of tiles in the RPG Maker A2 layout (preview tile and inner corners on top, a 2×2 patch with edges below). Paint with its first tile and every square picks the right edge, corner or inner corner from its neighbours.
- An **animated tile** has 2–8 frames side by side to the right (2 tiles apart for autotiles). The tileset's *Animation speed* sets the pace; frames play back and forth.
- Set both in **Database → Tilesets → Autotiles & animation** (click a tile). Autotile parts and later frames are dimmed in the palette and marked **A** / **▶**.
- The Outdoor tileset includes an animated **water** autotile and a **dirt path** autotile.

### Moving between maps

Two separate options:

- **Map edges** (map properties): pick a map for the top, bottom, left or right edge. Walking off that edge takes the player straight there, keeping their position along the edge (plus an optional shift). Linking one map also links the other map back if its matching edge is free. Linked edges show as yellow bands in the editor.
- **Exit / door** quick event: a square that sends the player to any map, square and facing. *Walk onto the square* for doorways, stairs and cave mouths, or *face it and press the action button* for doors. Optional door sound and fade.

### Music & sounds

- Import your own music and sound effects as **MP3 or FLAC**; they're copied into `assets/music` and `assets/sounds`.
- **Database → Music & sounds** sets the title, wild battle, trainer battle and victory music, three jingles (healing, item, new monster), 19 sound effects (menus, hits, capture, level up, doors, shops, saving…) and the music and sound volumes. Every picker has a ▶ preview.
- Each map can play its own music, keep what's playing, or go silent. A trainer battle can use its own battle music.
- Event commands **Play music** (or stop it) and **Play sound** (optionally wait for it to finish).
- Background music loops seamlessly and picks up where it left off after a battle.
- Pocket-Game-Maker comes with 10 original music tracks and jingles and 19 sound effects (CC0). Projects without them can add them with one click in the Music & sounds tab.

### Menus & screens (Database → Menus & screens)

- **Title (start) screen:** show or hide the title or use your own logo picture, a subtitle, text colour, a background picture, the menu position and style (a window, or plain words on the picture), a "Press any key" line, and the start menu itself: tick, rename and reorder New Game, Continue, Load Game, Options, Replay Opening, Credits, Licence and Quit. **Continue** loads the latest save straight away, or asks which one.
- **Options screen:** players set the music and sound volume and the text speed (kept on their computer or phone). On the title screen and in the menu.
- **Credits and Licence screens:** credits can be built automatically from Database → Credits or come from your own `.txt` / `.md` file; the licence screen shows your own file. Import a file, or write one in Pocket-Game-Maker (saved in `assets/text`).
- **In-game menu:** tick, rename and reorder DB, Monsters, Bag, Map, Storage, Save, Options and Close, and choose whether money is shown.
- **Bag shortcuts:** put Storage, the DB, Monsters or Save at the top of the bag. Items of the kind **Tool** open one of these screens when used (e.g. a Storage Box).
- **Words used in the game:** the monster database is called **DB** (Database) and move energy **EP** (Energy Points) by default. Change them per game.
- **Touch screens:** on-screen direction pad and A/B buttons for web and Android builds: shown automatically on touch devices, or always / never.
- **Following monster:** the first monster in the party walks behind the player, and the player can talk to it. Give a species a walking sprite (3×4 sheet) or it hops along using its front picture.

### Saving

In **Database → Menus & screens → Saving**:
- **Number of save slots** (1–12), and whether to ask before saving over a game.
- **Where players can save:** the menu's **Save**, **save points** (the **Save point** quick event: a bed, a diary, a save crystal; it can heal the party first), and items: **+ Add a Journal save item** makes a Tool item that opens the save screen from the bag.
- **Autosave** into its own **Autosave** slot: when arriving on a new map, after winning a battle, and/or every few minutes, with an optional "Saved" note. Players can load the autosave like any other slot.
- The event command **Save the game (save point)** opens the save screen or saves quietly into the Autosave slot.

The sample's bed in Your Room is a save point, and it autosaves on every new map.

### Bag pockets

In **Database → Menus & screens → Bag pockets**, split the bag into pockets: add, rename, reorder and remove them, give each an icon, and tick which item kinds go in each (e.g. a **Potions** pocket for healing items, or no **Battle items** pocket at all). One pocket takes "everything else". An item can also choose its pocket in **Items → Bag pocket**. In the game, ← → changes pocket. Untick **The bag has pockets** for one simple list.

### World map

**Database → World map** turns on a map of your game's world. Use one of the three ready-made maps (an island, a continent, an old parchment map), import a picture or draw one in the pixel editor. Click the picture to add a place and drag pins to move them; each place lists the game maps that count as "being there" and, optionally, where travelling there puts the player. Players open it from the menu (**Map**), a **Town Map** Tool item (**+ Add a Town Map item**), or the **Open a screen** event command. Places not yet visited can be shown as "???" or hidden, and **Travel** lets players go straight to places they have visited.

### Opening and ending scenes (Scenes → Opening & Ending Scenes…)

The **Scenes** menu (and the **Scenes** button on the toolbar) opens a window with three lists of scenes, each played in order:
- **Before the title:** when the game starts (a studio logo, an intro movie, a story crawl). "Replay Opening" on the title screen plays it again.
- **New game starts:** after New Game, before the first map (a prologue).
- **Ending & credits:** played by the event command **Play the ending (or other story scenes)**, e.g. after the final battle. Afterwards the game goes back to the title screen, or players carry on playing.

Add any number of scenes of four kinds: a **movie**; **picture slides** with captions (each for some seconds, or until a key is pressed; fade or cut); **story text** that scrolls or shows a page at a time; and a **credits roll** built from Database → Credits or written yourself, ending with "The End". Each scene can change the music, use a background colour or picture and text colour, and be skippable or not. Reorder, duplicate or turn scenes off, and **▶ Preview** one scene or **▶ Play all**.

### Optional features: decorating a home and changing clothes

Both are off until you turn them on in **Database → Menus & screens → Optional features for players**. The sample game has them on: go through the door of the house in the bottom-left of Starter Town.

**Decorating.** Players buy furniture and place it in their home, turning it to face any way.
- Make furniture in **Items** with the kind **Decoration**: a picture from `assets/decorations` (facing down, one 16-pixel tile per square), its size in squares, whether it blocks the player (untick for rugs, which can also have furniture on top) and how it turns (four quarter turns, flip left/right, or not at all). **Add the library's furniture as items** creates twelve ready-made pieces.
- Tick **Players can decorate this map** in a map's properties (the player's room or house).
- Sell decorations in a shop, or give them with an event.
- In the game, **Decorate** appears in the menu on those maps, and decorations can be used from the bag. A cursor shows where the item goes (green if it fits, red if not); arrow keys move it, **R** turns it, **Z** places it (or opens Place / Turn / Cancel, which also works on touch screens). Face a placed item and press **Z** to turn it, move it or put it back in the bag. Furniture blocks the player, rugs don't, and nothing can cover an event, a wall or another piece. Placed items are saved with the game, per map.

**Wardrobe.** Players change the player character's clothes.
- Make clothes in **Items** with the kind **Clothing**: either a **whole outfit** (a full character sheet that replaces the player's sprite) or a **top**, **bottoms**, **hat** or **extra** (a sheet the same size, transparent except for the clothing, drawn over the outfit). **Add the library's clothes as items** creates outfits, caps, shirts and trousers that fit the library's Hero.
- Choose what the player starts wearing; starting clothes are added to the bag.
- In the game, **Wardrobe** in the menu (or using clothes from the bag) shows each slot with a turning preview; ← → changes it. Clothes are never used up, a shop sells each piece only once, and selling worn clothes takes them off.
- The new event command **Open a screen** opens the Wardrobe (or Decorate, Storage, Bag and so on) from an event, such as a wardrobe in the player's room.

### People, switches and cut scenes

- **Person (NPC)** quick event: talks, **gives an item once**, or **battles once** (by sight or when spoken to); stands still, wanders, looks around, or **walks a set route** at slow, normal or fast speed.
- **Routes** are built from steps (move, turn, wait) with presets: back and forth, walk a square, look around. Blocked steps are retried and then skipped. The selected event's route is drawn on the map.
- **Switch / lever** quick event: flips a game switch ON or OFF, with on/off sprites, messages and a sound; can be one-way. Pages can now require a switch to be **ON or OFF**, and **Set switch** can flip a switch.
- **Cut scene** quick event (right-click a square in Events mode → Quick event → Cut scene):
  - **When it plays:** when the player steps into an area, as soon as they arrive on the map, when they talk to a person or examine an object (action button), or when a switch turns ON. Step and action scenes can play once or every time; the others play once. It can turn a switch ON when it has finished, so other events react.
  - **The scene** is either **a movie file** (MP4 or WebM, skippable or not; the music pauses and carries on afterwards, stops, or keeps playing) or **built from your game**: a list of steps added with one click (text, move someone, speech bubble, camera, fade / flash / shake / tint, picture, music, sound, wait, movie, switch), with black cinema bars if you like.
  - **▶ Preview** opens a playtest next to the event and plays the scene straight away.
- Cut-scene commands (in any event): **move a character** (player, this event, another event or the following monster) along a route, **speech bubble icon**, **move the camera**, **screen effects** (fade, flash, shake, tint), **show / hide pictures**, **black bars on / off** and **play a movie**.
- **Movies** are imported like other assets (Import → Movies, into `assets/movies/`). MP4 with H.264 video and AAC sound plays everywhere a game runs; WebM plays on computers and Android. The Asset Library has a short sample movie, *Monster News*, which the sample project's TV in Your Room plays.

### Events

Each event has **pages**. The highest-numbered page whose conditions are met (a global switch and/or the event's self switch) is the active one, exactly like RPG Maker.

Triggers: **Action button**, **Player touch**, **Trainer sight** (the trainer spots the player in a straight line, shows "!", walks over, then runs the page) and **Autorun**.

Commands: Show text, **Yes / No choice**, cut-scene commands (move a character, speech bubble, camera, screen effect, picture, black bars), Give monster, Give/take item, Give/take money, Heal party, Set switch, Set self switch, Transfer player, **Open shop**, **Play music**, **Play sound**, **Trainer battle**, Scripted wild battle, Wait, Erase event.

**Yes / No choice** asks a question with two answers you can rename (e.g. "Yes please" / "No thanks"). Each answer has its own list of commands, which can contain more choices. Pressing cancel can count as the second answer.

**Open shop** sells a list of items (each at its usual price or a price set for that shop) and, if you allow it, buys items back at a percentage of their price. Key items and items with no price can't be sold.

### Quick events

In Events mode, right-click an empty square and choose a **Quick event**:

- **Treasure chest**: holds an item (and how many) or money. It opens when the player presses Z, shows your message, gives the contents and stays open.
- **Item on the ground**: any item and amount, shown with a sprite or hidden. It disappears once picked up.
- **Sign**: your own title and text (an empty line starts a new message box), shown as a sign post sprite or invisible on a sign tile you painted. It can be set to only read from the front.
- **Shopkeeper**: a shop with a sprite, greeting, goodbye, items for sale with optional price overrides, and whether the player can sell items back.
- **Exit / door**: see *Moving between maps* above.
- **Monster encounter area**: drag across a block of squares (or pick one square), then list the monsters that can appear there with their level range and how often each one appears (Very common to Very rare, or an exact weight). Set the chance of a battle per step, how many monsters appear at once, an optional message, whether it only works on encounter tiles, and whether it happens only once. Inside the area this list replaces the map's own table. Areas show as pink dashed boxes on the map.

Double-click a quick event to change its settings later. **Full event editor** opens the normal pages. If you change those by hand, the event becomes an ordinary event.

### Battles of any size

- **Database → System → Battle rules** sets the default *Trainer battle size* (1 = singles, 2 = doubles, 3 = triples) and *Wild battle size* (2+ = wild hordes; you can only throw a ball when one is left).
- Each **Trainer battle** command can override the size, so one game can mix singles and doubles.
- Damage uses the familiar formula with STAB, type effectiveness (dual types multiply), critical hits, random spread, stat stages (−6…+6), accuracy/evasion, priority and speed order. Spread moves do 75% each when hitting more than one target.
- Status: poison, burn (halves physical attack), paralysis (half speed, 25% full-para), sleep (1–3 turns). Per-type immunities are configurable.
- Capture uses a shake-check formula driven by catch rate, remaining HP, status and the ball's multiplier.
- Exp is shared between monsters that fought, with a trainer bonus. Level-ups learn moves (with a forget-a-move prompt when full) and trigger level or item evolutions.

## Importing your own art

Click **Import** in the toolbar (or **File → Import Assets…**, Ctrl+I) to add your own tilesets, character sheets, monster pictures, battle backgrounds, pictures, music, sound effects or text files. Pick the kind, choose the files, and they're copied into the project's `assets/` folder and listed in Database → Credits as Custom. New tileset images can be added to Database → Tilesets in the same step. The Asset Library window has an **Import your own…** button too, and every picker has its own **Import…** button. PNG with transparency is recommended.

### The pixel editor

**Draw** in the toolbar (or **Tools → Pixel Editor: New Picture…**, Ctrl+Shift+N) starts a new tileset, character sheet, monster picture, piece of furniture, clothes or background, at the right size with the matching art template underneath as a guide. **✎** on the Tileset panel edits the current map's tileset, and every picture picker has **New…** and **✎ Edit** buttons.

| Tool | Key | What it does |
| --- | --- | --- |
| Pencil | B | Draws in the current colour, 1–4 pixels wide (`[` and `]`). Shift+click draws a straight line from the last point. Right-click erases. |
| Eraser | E | Makes pixels transparent. |
| Fill | G | Fills touching pixels of the same colour on the current layer. |
| Colour picker | I | Takes a colour from the picture (all visible layers). Alt+click does this with any tool. |
| Line | L | Shift keeps it straight or at 45°. |
| Rectangle, circle/ellipse, triangle | U, O, T | Outline or filled (X switches). Shift makes a square or circle. Drag downwards for a triangle pointing up. |
| Select | M | Drag to select; drag inside to move; Ctrl+C / X / V, Delete, flip, rotate, Ctrl+A. Enter or Esc drops it in place. Pictures copied in other programs paste in too. |

Colours: a palette (the library's 32 colours to start with; add or right-click to remove, saved with the project), a colour chooser with opacity, and recently used colours. Layers: add, duplicate, hide, rename (double-click), opacity, move up and down, merge down and delete; the template is a separate guide that is never saved in the picture. Undo and redo (Ctrl+Z / Ctrl+Y), zoom with the mouse wheel, pan with the middle button or Space+drag, and a tile or frame grid (#).

The preview shows the picture at actual size, a character sheet walking in all four directions (optionally over the player, for clothes) and, for tilesets, any autotile block joined up as a small lake. **Save** writes the PNG to `assets/<kind>/` (what the game uses, added to Database → Credits as Custom) and keeps the layers in `art-src/` so they are there next time; the map and Database update straight away.

**Art templates.** **Help → Art Templates…** (or **Open art templates…** in the Import window) opens a folder of templates for every kind of art, copied to `Documents/Pocket-Game-Maker/Art Templates`: tilesets (16 and 32 px), autotile blocks, character sheets (16×16, 16×24 and 32×32 frames), monster pictures (64 and 96 px), furniture, clothes and battle backgrounds. Each `…-template.png` is the exact size, shaded one light square per tile or frame: open it, draw on a new layer above it, hide it and save your layer as PNG. Each `…-guide.png` explains the layout with an example from the library. They are made by `tools/gen-art-templates.py` (Python 3 with Pillow).

| Kind | Folder | Format |
|---|---|---|
| Tilesets | `assets/tilesets` | A grid of square tiles, any number of rows and columns. Set **Tile size** in Database → Tilesets (16, 24, 32, 48…). Then click tiles to flag them ○ walkable / × blocked / ☆ drawn above the player, and ♣ wild-encounter. |
| Characters | `assets/characters` | One character per file: **3 columns × 4 rows** of frames. Columns: step, stand, step. Rows: down, left, right, up. This is the RPG Maker single-character layout (files starting with `$` in MZ), so those work directly. MZ's 8-characters-per-sheet files need to be cut into one character per file first. Frames may be taller than a tile; they're drawn bottom-aligned. |
| Monsters | `assets/monsters` | One **front** image (how enemies look) and one **back** image (how your monsters look) per species. Any size; square with transparency looks best (64×64, 96×96, 128×128). |
| Battle backgrounds | `assets/battlebacks` | Any image; it's stretched to cover the screen. Set a default in System, override per map or per trainer battle. |
| Pictures | `assets/pictures` | Any image. Used for the title screen background and logo, the world map, opening and ending scenes, and the Show picture cut-scene command. |
| Decorations | `assets/decorations` | Furniture for the Decorating feature, facing down: one 16-pixel tile per square (a 2×1 table is 32×16). |
| Text | `assets/text` | `.txt` or `.md` files for the Credits and Licence screens. |
| Music | `assets/music` | MP3 or FLAC. Background music loops; jingles play once. |
| Sound effects | `assets/sounds` | MP3 or FLAC. Short sounds work best. |

For 16 px tiles, a 320×240 screen at ×2 scale gives a classic handheld look. For 32 px or 48 px tiles, raise the screen size (e.g. 640×480 at ×1 or ×2).

## Playing

Arrow keys / WASD move · **Z**, Enter or Space confirm · **X** or Esc cancel and open the menu · hold **Shift** to run · hold **Ctrl** in playtest to walk through walls and skip encounters.

### The playtest debugger

Every playtest runs a debugger that looks for things that don't work. A small 🐞 badge in the bottom-left corner counts the problems it has found; click it or press **F9** to open the panel (the game shrinks to fit beside it).

- **Project check** when the playtest starts: maps, items, monsters and files that are missing, transfers to a map that was deleted or onto a blocked square, events the player can't reach, pages that can never appear (they need a switch that nothing turns on), and autorun events that never stop.
- **While you play**: whenever you press the action button and nothing happens, it says why. For example, the event there has no active page (and which switch each page is waiting for), it starts by touch instead, or it only works from the front. It also reports commands that were skipped because what they point at is missing, move routes that got stuck, and pictures or sounds that wouldn't load.
- Every problem says where it is (map, event, square, page, command) and how to fix it. **Problems** lists only those; **Activity** is a log of what happened (maps entered, events run, switches changed); **Copy report** copies everything, for notes or a bug report.
- **F10** (or **Overlay**) draws a box round every event, coloured by how it starts (green action button, blue touch, orange trainer sight, purple autorun, teal encounter area, grey dashed for no active page), with its name, and shades the squares that block the player red. The panel also shows the player's square, what's in front of them and which switches are on.

The debugger is only in playtests: exported games leave it out.

The field menu has the DB (monster database: seen / caught), Monsters (summary, reorder), Bag (use items, evolution stones, tools and shortcuts), Storage (withdraw / deposit; captures go there when the party is full) and Save; each can be renamed, reordered or turned off. Saves are written to `<project>/saves/slot1-4.json`. If every monster faints you return to the blackout point, healed, with half your money.

## Exporting your game (File → Export Game…, Ctrl+E)

The **Export** button turns the project into games players can run without Pocket-Game-Maker. Fill in the title, version, publisher and app ID (like `com.yourname.gamename`), pick an icon and key art, tick what to make, and press **Export**. Everything goes into `<project>/exports/<game>-<version>/` (or a folder you choose):

| Folder | What it is |
|---|---|
| `windows/<Game>/` | `<Game>.exe` with its runtime, your icon and name built in. Zipped in `zips/`. |
| `linux/<game>/` | The Linux program (also runs on Steam Deck), a `.desktop` file and icon. `zips/` has a `.tar.gz` that keeps permissions. |
| `web/` | HTML5 build for itch.io, Newgrounds or your own site. Saves go in the browser. On-screen touch controls appear on phones and tablets. |
| `android/<Game>/` | An Android Studio project (target API 36, as Google Play requires). Open it in Android Studio to build the APK or the .aab bundle, or push it to GitHub and let the included workflow build it. |
| `steam/`, `epic/`, `itch/`, `gog/`, `google-play/` | Upload scripts and step-by-step notes for each store you ticked (SteamPipe for steamcmd, BuildPatchTool for Epic, butler for itch.io). |
| `store-art/` | Capsules, banners, logos and icons in every size the stores ask for, drawn from your key art, title and monsters. |
| `RELEASE-CHECKLIST.md` | What to check before you release. |

Windows and Linux games can be exported from either system. The first export for the other system downloads its runtime (Electron, about 100 MB) from GitHub once and checks it against Electron's published checksums. Press **F12** while playtesting to save 1920×1080 screenshots for store pages. The engine in exported games is MIT-licensed; your game's own art, music and story stay yours.

## Project format

Plain JSON so it diffs well in Git:

```
MyGame/
  project.json
  data/system.json  types.json  moves.json  monsters.json  items.json  tilesets.json  mapinfos.json
  data/maps/map001.json …
  assets/tilesets  characters  monsters  battlebacks  music  sounds
  saves/
```

## Code layout

```
main.js, preload.js        Electron main process + secure bridge (file IO, import, playtest windows, saves)
lib/exporter.js            Game export: web, Windows, Linux, Android, store scripts
src/shared/core.js         Formulas: stats, growth curves, exp, evolution, capture
src/shared/battle.js       Battle engine (pure state machine, any number of active slots)
src/editor/                Editor UI: map editor, event editor, database
src/shared/tiles.js        Tile drawing: autotiles and animated tiles (editor and game)
src/shared/audio.js        Music and sound slots and their presets
src/runtime/               Game runtime: map, events, battle scene, menus, shop, audio
src/runtime/debugger.js    Playtest debugger (F9 panel, F10 overlay); left out of exported games
src/runtime/scenes.js      Opening, new-game and ending scenes (movies, slides, text, credits roll)
src/runtime/worldmap.js    The world map screen and fast travel
src/shared/heights.js      2.5D: height levels, stairs, ledges, shapes and view settings (editor, game and tests)
src/runtime/view25.js      2.5D drawing: raised ground, cliff faces, shadows, ledge jumps, the tilted camera
src/editor/heights-panel.js  Height mode: painting levels, dragging shapes, the 2.5D view settings
src/editor/scenes-editor.js  The Opening & Ending Scenes window
templates/sample/          Sample project (regenerate with npm run gen-sample)
test/                      Engine and exporter tests, an Electron smoke test and an export test
.github/workflows/build.yml  GitHub build for Windows, macOS and Linux (tests, installers, draft releases)
```

## Not in this version yet

Coming next: day and night, seasons, held items, abilities, character creation and multiple player characters (stage 2); fishing, mining, foraging, farming, crafting and building, breeding and merging (stage 3). Also not yet: natures, variables, and an in-editor sprite cutter. The engine and data format were laid out so these slot in without breaking projects.

## Asset library

Pocket-Game-Maker comes with a free library of original pixel art, music and sound effects (CC0, no credit needed):

| Kind | Contents |
|---|---|
| Tilesets (16 px) | Outdoor (64 tiles, including an animated water autotile and a dirt path autotile), Town buildings (32), Interior (32), Cave (24) |
| Characters | 13 people plus a capture orb, chest, boulder, sign post, a lever (off and on) and a television |
| Pictures | A sunrise title screen, a starry night sky for cut scenes, and three world maps (island, continent, parchment; remake them with `python3 tools/gen-worldmaps.py`) |
| Monsters | 16 species, front and back sprites |
| Battle backgrounds | Field, forest, town, beach, cave, indoor |
| Music | 7 looping tracks (title, town, route, cave, wild battle, trainer battle, victory) and 3 jingles |
| Sound effects | 20 effects for menus, battles, capture, doors, shops, saving and jumping down ledges |
| Movies | *Monster News*, a 7-second TV clip (MP4 with sound) for cut scenes; remake it with `python3 tools/gen-movie.py` |

Every tileset has a `.tiles.json` **mapping file** naming each tile and saying whether it's walkable, has wild encounters, is drawn above the player and which layer it belongs on. Adding a tileset to a project copies those settings in.

The library lives in `Documents/Pocket-Game-Maker/Asset Library`, so you can edit the images, add your own, and change the mappings. Open it with **Assets** (F10). Database → Tilesets has **Load settings from library** and **Save settings to library**. Regenerate the originals with `npm run gen-library` (music and sounds need ffmpeg; `npm run gen-audio` rebuilds just those).

**Credits.** Every asset is listed with its origin, author, licence and status (Placeholder, Custom or Third-party) in the library's `CREDITS.md` / `credits.csv` and in each project's `CREDITS.md`. Edit library credits with **Edit credits** on any Asset Library card, and a game's credits in **Database → Credits**. Imported images are recorded automatically as Custom with the licence *Not set* until you fill it in.

## Licence

Pocket-Game-Maker is © 2026 Pocket-Designs (pocket-designs@proton.me) and released under the MIT Licence (see `LICENSE`). Games you make with it are yours. Bundled third-party components are listed in `THIRD-PARTY-NOTICES.txt`.

The product icon is by MJO-Art (workmjo@gmail.com). It is not covered by the MIT Licence and can't be altered or used without the artist's permission; see `LICENSE`.
