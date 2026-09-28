import { chmod, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const extensionDir = resolve(root, 'chrome-extension');

await build({
  entryPoints: [resolve(root, 'content.js')],
  outfile: resolve(extensionDir, 'content.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
});

if (!process.argv.includes('--build-only')) {
  await mkdir(resolve(root, 'release'), { recursive: true });
  const archive = resolve(root, 'release/video-pro-finder.zip');
  const crx = resolve(root, 'release/video-pro-finder.crx');
  const key = resolve(root, 'release/video-pro-finder.pem');
  await execFileAsync(resolve(root, 'node_modules/.bin/crx3'), [
    '--key',
    key,
    '--crx',
    crx,
    '--zip',
    archive,
    extensionDir,
  ]);
  await chmod(key, 0o600);
  console.log(`Packed Chrome extension: ${crx}`);
  console.log(`Created companion ZIP: ${archive}`);
}
