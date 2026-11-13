Pocket-Game-Maker - Third-Party Notices
==================================

Pocket-Game-Maker is Copyright (c) 2026 Pocket-Designs
(pocket-designs@proton.me), released under the MIT Licence.

Pocket-Game-Maker's editor uses a few small open-source libraries for exporting
games (listed under "Libraries used by the game exporter" below). The desktop
application is built on Electron, which bundles the components listed below.
Each remains under its own licence, and the full licence texts ship with the
application:

  LICENSE.electron.txt     Electron's licence
  LICENSES.chromium.html   Licences for Chromium and every component it bundles

Both files are in the Pocket-Game-Maker install folder and must be kept with any
copy of the application you distribute.


Components included in the application
--------------------------------------

Electron                     MIT License
                             Copyright (c) Electron contributors,
                             Copyright (c) 2013-2020 GitHub Inc.
                             https://www.electronjs.org/

Chromium                     BSD 3-Clause License, plus the licences of its
                             bundled components (see LICENSES.chromium.html)
                             https://www.chromium.org/

Node.js                      MIT License
                             https://nodejs.org/

V8 JavaScript Engine         BSD 3-Clause License
                             https://v8.dev/

FFmpeg (ffmpeg.dll)          GNU Lesser General Public License v2.1 or later
                             Electron's build of FFmpeg contains no GPL-only
                             parts. ffmpeg.dll is a separate, replaceable
                             library. Source: https://ffmpeg.org/

ANGLE (libEGL.dll,           BSD 3-Clause License
libGLESv2.dll)               https://chromium.googlesource.com/angle/angle

SwiftShader                  Apache License 2.0
(vk_swiftshader.dll)         https://github.com/google/swiftshader

Vulkan Loader                Apache License 2.0
(vulkan-1.dll)               https://github.com/KhronosGroup/Vulkan-Loader

ICU                          Unicode License (ICU)
(icudtl.dat)                 https://icu.unicode.org/

D3DCompiler                  Microsoft DirectX redistributable
(d3dcompiler_47.dll)         Distributed under Microsoft's redistribution terms


Libraries used by the game exporter
-----------------------------------

yazl 2.5.1, yauzl 3.4.0      MIT License, Copyright (c) 2014 Josh Wolfe
  (zip files)
buffer-crc32 0.2.13          MIT License, Copyright (c) 2013 Brian J. Brennan
pend 1.2.0                   MIT License, Copyright (c) 2014 Andrew Kelley
rcedit 4.0.1                 MIT License, Copyright (c) 2013 GitHub, Inc.
  (sets the icon and name    https://github.com/electron/node-rcedit
  of exported .exe files)
cross-spawn-windows-exe      Apache License 2.0, Copyright (c) Mark Lee
  1.2.0, @malept/cross-      https://github.com/malept/cross-spawn-windows-exe
  spawn-promise 1.1.1
cross-spawn 7.0.6,           MIT License (cross-spawn: Copyright (c) 2018 Made
  is-wsl 2.2.0, is-docker    With MOXY Lda; the others: Copyright (c) Sindre
  2.2.1, path-key 3.1.1,     Sorhus / Kevin Mårtensson)
  shebang-command 2.0.0,
  shebang-regex 3.0.0
which 2.0.2, isexe 2.0.0     ISC License, Copyright (c) Isaac Z. Schlueter and
                             contributors

Their licence texts are in each package's folder under node_modules.


Games exported with Pocket-Game-Maker
--------------------------------

An exported game contains the Pocket-Game-Maker game engine (MIT, notice in the
game's LICENCES.txt) and the game's own art, music and data (listed in its
CREDITS.md). Windows and Linux builds also contain the Electron runtime and
everything listed in "Components included in the application" above; their
licence files (LICENSE and LICENSES.chromium.html) are copied into every
desktop build and must stay with it. Web and Android builds contain no
Electron or Chromium files. Android builds use AndroidX WebKit (Apache
License 2.0), which Gradle downloads when the game is built.


Components in the Windows installer only
----------------------------------------

NSIS (Nullsoft Scriptable    zlib/libpng License; the LZMA compression module
Install System)              is under the Common Public License 1.0
                             https://nsis.sourceforge.io/


Asset Library and sample project artwork, music and sounds
-----------------------------------------------------------

All tilesets, tile mappings, characters, monster sprites and battle
backgrounds, and all music, jingles and sound effects, in the Asset Library
and the sample project were created specifically for Pocket-Game-Maker by
Pocket-Designs and are released under CC0 1.0 (public domain). The colours
come from the Endesga 32 palette (free to use). The music and sounds were
synthesised from scratch and contain no third-party samples; the full list is
in LICENSE.

MP3 and FLAC playback uses the FFmpeg library already included in Electron
(listed above). The preset MP3 files were encoded with LAME (via FFmpeg) when
Pocket-Game-Maker was built; no encoder is shipped with the application.

A full list of every asset with its origin, author, licence and status is in:
  library/CREDITS.md and library/credits.csv   (the Asset Library)
  CREDITS.md in each game project               (that game's images and audio)
These lists are kept up to date by Pocket-Game-Maker as you add or replace art.
