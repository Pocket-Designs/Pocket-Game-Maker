// electron-builder "afterPack" hook: gives an unsigned macOS build a basic (ad-hoc) signature.
// Apple Silicon Macs refuse to open an app with no signature at all, so without a Developer ID
// certificate the GitHub build sets PGM_ADHOC_SIGN=1 and turns electron-builder's own signing off
// (-c.mac.identity=null); this then signs the finished .app before the .dmg and .zip are made.
// Players see a Gatekeeper warning the first time (see "Building on GitHub" in the README).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin' || process.env.PGM_ADHOC_SIGN !== '1') return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  const run = (cmd, args) => { console.log('  • ' + cmd + ' ' + args.join(' ')); execFileSync(cmd, args, { stdio: 'inherit' }); };
  run('xattr', ['-cr', app]); // stray file attributes make codesign fail
  run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
};
