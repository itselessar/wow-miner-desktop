import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'assets/wownero.png',
  'src/main/index.js',
  'src/preload/index.js',
  'src/renderer/index.html',
  'src/renderer/styles.css',
  'src/renderer/app.js',
  'resources/wownero/LICENSE.wownero'
];

for (const relative of required) {
  const file = join(root, relative);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`Required file is missing: ${relative}`);
}

const logo = readFileSync(join(root, 'assets', 'wownero.png'));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (logo.length < 100 || !logo.subarray(0, 8).equals(pngSignature)) {
  throw new Error('assets/wownero.png must be a valid PNG image.');
}

const html = readFileSync(join(root, 'src', 'renderer', 'index.html'), 'utf8');
if (!html.includes("connect-src 'none'")) throw new Error('Renderer CSP must keep network access disabled.');
const main = readFileSync(join(root, 'src', 'main', 'index.js'), 'utf8');
for (const hardening of ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true']) {
  if (!main.includes(hardening)) throw new Error(`Electron hardening missing: ${hardening}`);
}
console.log('Application structure and security checks passed.');

