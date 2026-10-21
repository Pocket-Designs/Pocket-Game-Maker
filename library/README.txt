Pocket-Game-Maker Asset Library
==========================

This folder is your asset library. Pocket-Game-Maker reads it every time you open
the Asset Library window, so anything you change or add here shows up there.

Folders
  tilesets/     Tileset images, each with a matching .tiles.json mapping file.
  characters/   Character sheets: 3 columns x 4 rows of 16x16 frames
                (rows: down, left, right, up; columns: step, stand, step).
  monsters/     Monster sprites in pairs: name_front.png and name_back.png.
  battlebacks/  Battle backgrounds, 320x240.
  pictures/     Full-screen pictures for the title screen and cut scenes.
  decorations/  Furniture players can buy and place in a house: one 16x16 tile
                per square (a 2x1 table is 32x16). Pictures face down; the game
                turns them for the other directions.
  music/        Background music and short jingles (MP3). Tracks marked
                "loops" repeat seamlessly.
  sounds/       Sound effects (MP3).

Tile mapping files (.tiles.json)
  Each tile in a tileset has an entry with:
    name    what the tile is
    pass    true if the player can walk on it
    enc     true if wild monsters appear on it
    over    true if it is drawn above the player (tree tops, lamp tops)
    layer   which map layer it's meant for: ground, detail or above
    group   for objects made of several tiles, e.g. "Big tree 2x2"
  When you add a tileset to a project, Pocket-Game-Maker copies these settings into
  the project. Change them in Database > Tilesets and click "Save to library"
  to write them back here.

Adding your own art and audio
  Drop PNG files into the right folder, and MP3 or FLAC files into music/ or
  sounds/. For a new tileset, Pocket-Game-Maker creates
  the .tiles.json file the first time you save its settings to the library.

Restoring the original files
  Use "Restore missing files" in the Asset Library window. It puts back any
  original file you deleted and never overwrites your changes.

Licence: CC0 (public domain). See LICENSE.txt.
