Pocket-Game-Maker art templates
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
