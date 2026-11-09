# Pocket-Game-Maker Developer Guide

Version 0.9.6 · 9 November 2026 · Pocket-Designs

## About this guide

This guide is for anyone changing Pocket-Game-Maker's own code. It describes version 0.9.6. If you make games with Pocket-Game-Maker, read the User Guide instead.

It covers setting up, how the code is laid out, the tests, the asset generators, building installers, **every place the version number is written**, a release checklist, and recipes for adding features.

Pocket-Game-Maker is an Electron desktop app (Windows, macOS, Linux) under the MIT Licence. Copyright is held by Pocket-Designs (pocket-designs@proton.me). The app icons are by MJO-Art and can't be altered or reused without the artist's permission. Repository: [github.com/Pocket-Designs/pocket-game-maker](https://github.com/Pocket-Designs/pocket-game-maker).

## Contents

1. [Setting up](#setting-up)
2. [How the project is laid out](#how-the-project-is-laid-out)
3. [How it fits together](#how-it-fits-together)
4. [Tests](#tests)
5. [Asset generators and the sample project](#asset-generators-and-the-sample-project)
6. [Building installers](#building-installers)
7. [Where the version number is](#where-the-version-number-is)
8. [Release checklist](#release-checklist)
9. [Adding features](#adding-features)

## Setting up

You need Node.js 24 or newer, npm, and Git. Python 3 with Pillow is only needed to re-run the picture generators.

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 24 or newer (`engines` in package.json) | Running the editor, the tests and the build |
| Electron | 44 (`^44.9.3`, a dev dependency) | The desktop app and the Electron tests |
| electron-builder | 26 (`^26.15.3`, a dev dependency) | Making installers |
| Python 3 + Pillow | Any recent | `tools/gen-worldmaps.py`, `gen-art-templates.py` |
| ffmpeg | Any recent | `tools/gen-movie.py` (the sample TV movie) |

To get going:

1. Clone the repository: `git clone https://github.com/Pocket-Designs/pocket-game-maker.git`
2. Install the dependencies: `npm ci` (or `npm install`)
3. Start the editor: `npm start`
4. Run the quick tests: `npm test`

On Linux without a screen (a server or WSL), run Electron through a virtual screen: `xvfb-run -a npx electron --no-sandbox .`

## How the project is laid out

The code is plain JavaScript with no bundler: the editor and the game load their files with `<script>` tags.

| Path | What it holds |
| --- | --- |
| `main.js` | Electron main process: windows, the menu bar, file access, projects, saves, the asset library, playtest and export (IPC handlers) |
| `preload.js` | The safe bridge `window.api` that the editor and playtest pages call |
| `src/editor/` | The editor page (`index.html`, `editor.css`) and its modules: `editor.js` (App, toolbar, actions), `mapeditor.js`, `layers-panel.js`, `events.js` (event commands), `quickevents.js`, `database.js`, `library.js`, `importer.js`, `export.js`, `pixel-editor.js`, `scenes-editor.js`, `ui.js` (the UI toolkit) |
| `src/runtime/` | The game engine that playtests and exported games run: `play.html`, `play.css`, `game.js`, `menus.js`, `battleScene.js`, `shop.js`, `home.js`, `scenes.js`, `worldmap.js`, `touch.js`, `audio.js`, `ui.js`, `web-api.js`, `debugger.js` (playtest only) |
| `src/shared/` | Code used by both the editor and the game: `core.js`, `battle.js`, `tiles.js`, `layers.js`, `quick.js` (quick event builders), `gameconfig.js` (Database defaults), `credits.js`, `audio.js` |
| `lib/exporter.js` | Exports a game for Windows, macOS, Linux, the web and Android, plus store upload scripts |
| `library/` | The built-in Asset Library (tilesets, characters, monsters, pictures, music, sounds) with `library.json`, `CREDITS.md` and `credits.csv` |
| `templates/sample/` | The sample project, made by `tools/gen-sample.js` |
| `templates/art-templates/` | The art templates, made by `tools/gen-art-templates.py` |
| `tools/` | Generators for the library, the sample, audio, the movie, art templates and world maps, plus `check-project.js` |
| `test/` | Node tests and Electron tests (see [Tests](#tests)) |
| `build/` | Icons, `adhoc-sign.js` (macOS ad-hoc signing) and `build-win.sh` |
| `.github/workflows/build.yml` | Tests and installers on GitHub |

## How it fits together

Pocket-Game-Maker has one Electron main process and two kinds of window, the editor and the playtest. Neither window can touch files directly: both call `window.api`, which `preload.js` sets up and `main.js` answers.

```
+----------------------------------------------+        +--------------------------+
| Main process · main.js                       | -----> | lib/exporter.js          |
| Windows, menu bar, projects, saves, asset    |        | Windows, macOS, Linux,   |
| library, playtest and export (IPC handlers)  |        | web and Android builds   |
+----------------------------------------------+        +--------------------------+
                      ^                                              |
                      v                                              v
+----------------------------------------------+        +--------------------------+
| preload.js · window.api                      |        | Exported game            |
|          (the pages' only way to files)      |        | runtime + shared code,   |
+----------------------------------------------+        | no editor, no debugger   |
          ^                         ^                    +--------------------------+
          v                         v                                |
+---------------------+   +---------------------+                    |
| Editor · src/editor |   | Playtest ·          |                    |
| Maps, events,       |   |   src/runtime       |                    |
| Database, pixel     |   | The game: maps,     |                    |
| editor, scenes,     |   | battles, menus,     |                    |
| export              |   | scenes; F9 debugger |                    |
+---------------------+   +---------------------+                    |
          |                         |                                |
+------------------------------------------------------------------------------------+
| src/shared · used by the editor, the playtest and exported games                   |
| core, battle maths, tiles, layers, quick event builders, Database defaults, credits|
+------------------------------------------------------------------------------------+
```

- **Main process (`main.js`):** creates the windows and the menu bar, and handles every file job through IPC: projects, saves (slot 0 is the autosave), the Asset Library, imports and exports. A menu item sends an action string (such as `'scenes'`) to the editor, which handles it in `App.action`.
- **Editor (`src/editor`):** one page, `index.html`. `editor.js` holds `App` and the project in memory (`App.proj`); other modules add global objects such as `DB`, `QuickEvent` and `ScenesEditor`. `ui.js` provides `UI.field`, `UI.modal`, the pickers and `h()` for building elements.
- **Playtest (`src/runtime`):** `play.html` loads the engine. `game.js` holds `G` (the game state, maps, events and commands); other files add `Menus`, `BattleScene`, `Scenes`, `WorldMap`, `Home` and the UI helpers `RUI`. `debugger.js` (F9, F10) is only loaded for playtests.
- **Shared (`src/shared`):** code both sides need, loaded as `MF.*` in the browser and with `require` in Node tests. `gameconfig.js` (`withDefaults`) is where every Database setting gets its default.
- **Exported games:** `lib/exporter.js` copies the runtime and shared files listed in `RUNTIME_FILES` into a small Electron app, a web folder or an Android project. In the web version, `web-api.js` provides its own `window.api` that saves to browser storage.

## Tests

Run `npm test` after every change; run the Electron tests before a release. `npm test` takes seconds and needs no screen. The Electron tests open real windows, take screenshots into an output folder and print a JSON summary ending in `ERRORS: none`.

| Test | Run it with | What it checks |
| --- | --- | --- |
| Engine + exporter | `npm test` | Battle maths, tiles, layers, quick events, Database defaults, the sample project, the exporter |
| Smoke | `npx electron test/smoke-main.js smoke-out` | Opens the editor and plays the sample (also run on GitHub) |
| Editing | `npm run test:editing` | Painting, layers, maps, undo |
| Home | `npm run test:home` | Decorating and the wardrobe |
| Debugger | `npm run test:debugger` | The F9 playtest debugger finds broken events |
| Pixel editor | `npm run test:pixel` | Tools, layers, saving pictures |
| Cut scenes | `npm run test:cutscene` | The Cut scene quick event and movies |
| Features (0.9.6) | `npm run test:features` | Scenes window, World map tab, pockets, Options, saving, autosave, world map travel, the bed save point, the ending, Continue |
| Export | `npx electron test/export-main.js export-out` | Exports the sample to every platform |

On Linux without a screen, put `xvfb-run -a` in front and add `--no-sandbox --disable-gpu`, for example:

```
xvfb-run -a npx electron --no-sandbox --disable-gpu test/features-main.js features-out
```

The last argument is the folder for the screenshots. Output folders ending in `-out` are left out of the source zip.

`node tools/check-project.js` checks that every file the app needs is present; GitHub runs it first.

## Asset generators and the sample project

All the built-in art, music and the sample game are made by scripts in `tools/`, so they can be remade or changed in code. The results are committed, so you only run a generator when you change it.

| Script | Run it with | Makes |
| --- | --- | --- |
| `gen-library.js` + `gen-library-sprites.js` | `npm run gen-library` | The Asset Library: tilesets, characters, monsters, battle backgrounds, `library.json` and its credits |
| `gen-audio.js` | `npm run gen-audio` (needs ffmpeg with MP3) | The preset music and sound effects |
| `gen-worldmaps.py` | `python3 tools/gen-worldmaps.py` | The three world map pictures and their `library.json` entries |
| `gen-movie.py` | `python3 tools/gen-movie.py` | The *Monster News* movie and the TV sprite |
| `gen-art-templates.py` | `python3 tools/gen-art-templates.py` | The tileset and sprite art templates |
| `gen-sample.js` | `node tools/gen-sample.js` | `templates/sample`, the sample game, copying art from the library |

`npm run gen-sample` remakes the library and then the sample. `pixel.js` (the Endesga 32 palette and drawing helpers) and `png.js` (a small PNG writer) are shared by the JavaScript generators.

Two things to keep in mind:

- `gen-library-sprites.js` rewrites `library.json`. It keeps picture entries added by other generators (such as the world maps) as long as their files exist.
- After changing the library's credits, regenerate `library/CREDITS.md` and `credits.csv` with `CR.fromLibraryMeta` from `src/shared/credits.js`. `npm run gen-library` does this itself; after `gen-worldmaps.py`, re-run `npm run gen-library` or call it by hand.

Everything in the library is original work, CC0, credited to Pocket-Designs with the status *Placeholder*.

## Building installers

Installers are made by electron-builder, configured in the `build` section of package.json. Their file names come from the package.json version.

| System | Command | Files in `dist/` |
| --- | --- | --- |
| Windows | `npm run dist:win` | `Pocket-Game-Maker-Setup-<version>.exe` (installer) and `Pocket-Game-Maker-Portable-<version>.exe` |
| macOS | `npm run dist:mac` (on a Mac) | `Pocket-Game-Maker-<version>-mac-<arch>.dmg` / `.zip`, Intel and Apple Silicon |
| Linux | `npm run dist:linux` | `Pocket-Game-Maker-<version>-linux-<arch>.AppImage` and `.deb` |

Windows installers can be built on Linux with `build/build-win.sh` (it needs wine64 and wine32 installed). Without signing certificates the builds are unsigned; on macOS, `build/adhoc-sign.js` gives the app a basic ad-hoc signature so it opens on Apple Silicon.

**On GitHub** (`.github/workflows/build.yml`):

- **Push to main or a pull request:** tests, then a build on all three systems. Nothing is kept.
- **Actions → Build → Run workflow:** the installers go to a draft release called *Test build N* on the Releases page. Only the newest 3 are kept.
- **Push a version tag** (`git tag v0.9.6 && git push origin v0.9.6`): the installers go to a draft release named after the tag. Check it, then click **Publish**.

Installers are never stored as Actions artifacts, so they don't use the account's Actions storage. Each run also deletes old artifacts. To sign builds, add the secrets listed at the top of the workflow: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## Where the version number is

The app's version is in **six places**. Places 1–4 must change for every release; 5 and 6 are only examples, worth updating. Everything else reads package.json.

| # | File | Where | Example | How to change it |
| --- | --- | --- | --- | --- |
| 1 | `package.json` | Line 4, `"version"` | `"version": "0.9.6"` | By hand, or `npm version 0.9.7 --no-git-tag-version` (also does #2) |
| 2 | `package-lock.json` | The first two `"version"` lines (top level and `packages[""]`) | `"version": "0.9.6"` | `npm install` after #1, or by hand. Leave the other `"version"` lines alone: they belong to dependencies |
| 3 | `src/editor/editor.js` | Line 40, the **Help → About** message | `Version 0.9.6 · © 2026 Pocket-Designs` | By hand (also update the year when it changes) |
| 4 | User Guide doc | The line under the title | `Version 0.9.6 · date · author` | By hand in the doc, and update the date |
| 5 | `README.md` | Line 28, the example tag | `git tag v0.9.6` | Optional: it is only an example |
| 6 | `.github/workflows/build.yml` | Line 8, a comment with the example tag | `git tag v0.9.6` | Optional: it is only an example |

This guide's own version line (at the top) is worth updating too.

**What reads the version for you:**

- **Installer file names**, through `${version}` in package.json's `build` section (for example `Pocket-Game-Maker-Setup-0.9.6.exe`).
- **The GitHub release:** a tag release is named after the tag (`v0.9.6`), and a test build's title shows `v` + package.json's version.
- **The app at run time:** Electron's `app.getVersion()` returns package.json's version (nothing uses it yet; the About box has its own copy, place 3).

**Version numbers that are not the app's version** (don't change these for a release):

| Name | Where | Value | Meaning |
| --- | --- | --- | --- |
| `formatVersion` | `project.json` in each game project (written by `main.js` and `tools/gen-sample.js`) | 1 | The project file format. Raise it only when old projects need converting |
| Asset Library `version` | `library/library.json` (from `tools/gen-library-sprites.js`; `main.js` defaults to 1) | 1 | The library format |
| Game version | Each game's Export window (`src/editor/export.js` default, used by `lib/exporter.js`) | 1.0.0 | The version of a game someone exports, not of Pocket-Game-Maker |
| Node.js | package.json `engines` and `NODE_VERSION` in build.yml | 24 | The Node.js the build uses |
| Electron / electron-builder | package.json `devDependencies` | ^44.9.3 / ^26.15.3 | Tool versions |

Test comments such as "Electron test for 0.9.6" in `test/features-main.js` and `test/engine.test.js` record when a test was added; leave them.

## Release checklist

A release is a version bump, a full test run, a tag push and a check of the draft release.

- [ ] Bump the version in places 1–4 (see [Where the version number is](#where-the-version-number-is)), and 5–6 if you like
- [ ] Update the README, the User Guide and this guide for anything new
- [ ] `npm test` passes
- [ ] Every Electron test passes and its screenshots look right (smoke, editing, home, debugger, pixel editor, cut scenes, features, export)
- [ ] If a generator changed, re-run it and commit what it made
- [ ] Commit, push to main and check the GitHub build is green on all three systems
- [ ] Tag and push: `git tag v0.9.7 && git push origin v0.9.7`
- [ ] Open the draft release, try the installers, then click **Publish**

To try installers before tagging, use **Actions → Build → Run workflow** and download them from the *Test build N* draft.

## Adding features

Most features touch the same handful of files. Each recipe lists them in the order to work through them, using a 0.9.6 feature as the example.

**A new event command** (example: `saveGame`, *Save the game (save point)*)

1. `src/editor/events.js`: add an entry to `COMMANDS` with `label`, `make()` (the new command's default fields), `form(c)` (its fields, built with `field` and `row`) and `sum(c)` (the one-line summary in the command list).
2. `src/runtime/game.js`: add a `case` for it in the command switch inside `exec`. Throw `new Abort()` to stop the event.
3. `src/runtime/debugger.js`: add its name to the command names, and a `case` in the event check if it can be set up wrongly (for example, an empty list).
4. A test: an assertion in `test/engine.test.js`, or a step in an Electron test.

**A new quick event** (example: `savepoint`)

1. `src/editor/quickevents.js`: add it to the types list (`label`, `icon`, `blurb`), its defaults, and its form branch. If it has no sprite to copy in, add it to the list that skips `ensureSprites`.
2. `src/shared/quick.js`: add a branch to `build()` that turns the settings into event pages and commands. It is shared, so the editor and the tests use the same code.
3. Test `Quick.build` in `test/engine.test.js`.

**A new Database tab** (example: `worldmap`, *World map*)

1. `src/shared/gameconfig.js`: give its settings defaults in `withDefaults`, so old projects get them too.
2. `src/editor/database.js`: add `[id, 'Name']` to `TABS` and write a `tab_<id>(layout)` method. Use `UI.field`, `UI.section` and the pickers in `src/editor/ui.js`.
3. `main.js`: add it to the **Database** menu in `buildMenu`.
4. `src/editor/editor.css`: any styles it needs.

**A new in-game screen** (example: `worldmap.js`)

1. Create `src/runtime/<name>.js` that adds one global object (`WorldMap.open(G)`), using `RUI.choose` and `RUI.message` from `src/runtime/ui.js`.
2. Add a `<script>` for it in `src/runtime/play.html`, before `game.js`.
3. Add it to `RUNTIME_FILES` in `lib/exporter.js`, or exported games won't have it.
4. Open it from `Menus.open()` in `src/runtime/menus.js`. If it belongs in the menu, add an entry to `MAIN_ITEMS` in `gameconfig.js`; to open it from events, add it to the `openScreen` command's options.
5. Styles go in `src/runtime/play.css`.

**A new editor window** (example: `scenes-editor.js`)

1. Create `src/editor/<name>.js` with a global object and an `open()` that calls `UI.modal`.
2. Add a `<script>` in `src/editor/index.html`, and a toolbar button with `data-act` if it needs one.
3. Handle the action in `App.action` in `src/editor/editor.js`, and add a menu item in `main.js` that sends the same action.

**Good habits:** keep `withDefaults` as the one place defaults live; new files under `src/` are packaged automatically; run `node --check` on a changed file before running the tests.
