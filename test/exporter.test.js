// Checks the exporter's archive and icon helpers. Run: node test/exporter.test.js
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { makeIco, tarGz, zipDir, unzip, slugify } = require('../lib/exporter');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-exp-'));
  const src = path.join(tmp, 'src');
  fs.mkdirSync(path.join(src, 'a/very/deep/folder/with/a/long/name/so/the/tar/header/needs/its/prefix/field'), { recursive: true });
  fs.writeFileSync(path.join(src, 'game'), '#!/bin/sh\necho hi\n'); fs.chmodSync(path.join(src, 'game'), 0o755);
  fs.writeFileSync(path.join(src, 'a/very/deep/folder/with/a/long/name/so/the/tar/header/needs/its/prefix/field/data.json'), '{"x":1}');
  // tar.gz: system tar can read it and the program stays runnable
  await tarGz(src, path.join(tmp, 'out.tar.gz'), 'my-game', rel => rel === 'game' ? 0o755 : 0o644);
  const ex = path.join(tmp, 'tar'); fs.mkdirSync(ex);
  execFileSync('tar', ['xzf', path.join(tmp, 'out.tar.gz'), '-C', ex]);
  assert.strictEqual(fs.statSync(path.join(ex, 'my-game/game')).mode & 0o777, 0o755);
  assert.strictEqual(fs.readFileSync(path.join(ex, 'my-game/a/very/deep/folder/with/a/long/name/so/the/tar/header/needs/its/prefix/field/data.json'), 'utf8'), '{"x":1}');
  // zip round trip
  await zipDir(src, path.join(tmp, 'out.zip'), 'G');
  const uz = path.join(tmp, 'unz'); fs.mkdirSync(uz);
  await unzip(path.join(tmp, 'out.zip'), uz);
  assert.ok(fs.existsSync(path.join(uz, 'G/game')));
  // .ico header
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const ico = makeIco([{ size: 16, png }, { size: 256, png }]);
  assert.strictEqual(ico.readUInt16LE(2), 1); assert.strictEqual(ico.readUInt16LE(4), 2);
  assert.strictEqual(ico[6 + 16], 0); // 256 is stored as 0
  assert.strictEqual(ico.readUInt32LE(6 + 12), 6 + 32);
  assert.strictEqual(slugify('My Great Game!'), 'my-great-game');
  // Exported index.html: no playtest debugger, and every engine script it loads is one the exporter copies.
  const { webIndexHtml, RUNTIME_FILES } = require('../lib/exporter');
  const html = webIndexHtml(fs.readFileSync(path.join(__dirname, '..', 'src', 'runtime', 'play.html'), 'utf8'), 'A <Game>');
  assert.ok(!/debugger/.test(html), 'debugger left out of exported games');
  [...html.matchAll(/src="engine\/runtime\/([^"]+)"/g)].forEach(m => assert.ok(RUNTIME_FILES.includes(m[1]), m[1] + ' is copied'));
  assert.ok(html.includes('<title>A Game></title>'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('All exporter tests passed.');
})().catch(e => { console.error(e); process.exit(1); });
