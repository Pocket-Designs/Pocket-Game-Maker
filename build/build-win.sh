#!/usr/bin/env bash
# Builds Windows installer + portable exe from Linux (needs wine64 + wine32).
set -e
cd "$(dirname "$0")/.."
export WINEDEBUG=-all
rm -rf dist
npx electron-builder --win dir --x64
wine ~/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe dist/win-unpacked/Pocket-Game-Maker.exe \
  --set-icon build/icon.ico --set-version-string FileDescription Pocket-Game-Maker --set-version-string ProductName Pocket-Game-Maker \
  --set-version-string CompanyName Pocket-Designs --set-version-string LegalCopyright "Copyright (c) 2026 Pocket-Designs" --set-file-version "$(node -p 'require("./package.json").version')" \
  --set-product-version "$(node -p 'require("./package.json").version')"
npx electron-builder --win --x64 --prepackaged dist/win-unpacked
ls -la dist/*.exe
