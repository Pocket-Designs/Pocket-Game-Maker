// Checks that the repository has every folder Pocket-Game-Maker needs before testing or building.
// Run: node tools/check-project.js  (the GitHub build runs it first, so a missing folder gives a clear message)
// A common cause of missing files: uploading through the GitHub website, which takes at most 100 files at a time.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const inCI = !!process.env.GITHUB_ACTIONS;
const count = rel => { const p = path.join(ROOT, rel); if (!fs.existsSync(p)) return 0; if (fs.statSync(p).isFile()) return 1; let n = 0; for (const e of fs.readdirSync(p, { withFileTypes: true })) n += e.isDirectory() ? count(path.join(rel, e.name)) : 1; return n; };
// [path, minimum number of files, what it is]
const NEED = [
  ['package.json', 1, 'project settings'],
  ['package-lock.json', 1, 'exact package versions (needed by npm ci)'],
  ['main.js', 1, 'the app\'s main program'],
  ['preload.js', 1, 'the app\'s bridge script'],
  ['lib/exporter.js', 1, 'the game exporter'],
  ['src/editor', 10, 'the editor'],
  ['src/runtime', 10, 'the game engine'],
  ['src/shared', 8, 'shared code'],
  ['templates/sample/project.json', 1, 'the sample project'],
  ['templates/sample/data/maps', 4, 'the sample project\'s maps'],
  ['templates/sample/assets', 80, 'the sample project\'s pictures, music and sounds'],
  ['templates/sample/assets/music', 5, 'the sample project\'s music'],
  ['templates/sample/assets/tilesets', 2, 'the sample project\'s tilesets'],
  ['library/library.json', 1, 'the asset library list'],
  ['library/tilesets', 8, 'the asset library\'s tilesets'],
  ['library/characters', 30, 'the asset library\'s characters'],
  ['library/music', 10, 'the asset library\'s music'],
  ['library', 120, 'the asset library'],
  ['build/icon.ico', 1, 'the Windows icon'],
  ['build/icon.png', 1, 'the Linux icon'],
  ['build/icon-1024.png', 1, 'the macOS icon'],
  ['build/adhoc-sign.js', 1, 'the macOS signing step for unsigned builds'],
  ['LICENSE', 1, 'the licence'],
  ['THIRD-PARTY-NOTICES.txt', 1, 'third-party notices'],
  ['test/engine.test.js', 1, 'the tests']
];
let bad = 0;
for (const [rel, min, what] of NEED) {
  const n = count(rel);
  if (n >= min) continue;
  bad++;
  const msg = n === 0 ? `${rel} is missing (${what}).` : `${rel} has only ${n} file${n === 1 ? '' : 's'}; expected at least ${min} (${what}).`;
  console.log(inCI ? `::error title=Missing project files::${msg}` : 'MISSING: ' + msg);
}
if (bad) {
  console.log('\n' + bad + ' problem' + (bad === 1 ? '' : 's') + ' found. Make sure every file from the project folder is in the repository.');
  console.log('The GitHub website uploads at most 100 files at a time, and this project has about 300, so use GitHub Desktop or git to push it:');
  console.log('  git add -A && git commit -m "Add all project files" && git push');
  process.exit(1);
}
console.log('All project files are present.');
