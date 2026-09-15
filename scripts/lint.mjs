import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'scripts', 'test'];

function collect(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collect(candidate));
    else if (/\.[cm]?js$/.test(entry.name)) result.push(candidate);
  }
  return result;
}

for (const directory of roots) {
  for (const file of collect(join(root, directory))) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
console.log('JavaScript syntax checks passed.');

