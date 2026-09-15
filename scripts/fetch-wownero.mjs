import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..');
const DESTINATION = join(PROJECT_DIRECTORY, 'resources', 'wownero');

const RELEASE = Object.freeze({
  version: 'v0.11.4.0',
  file: 'wownero-x86_64-w64-mingw32-v0.11.4.0.zip',
  url: 'https://codeberg.org/wownero/wownero/releases/download/v0.11.4.0/wownero-x86_64-w64-mingw32-v0.11.4.0.zip',
  sha256: '67c74840f7ddafa9ac6f039e5423c298345038adba9da7db0444753cc7af2b25'
});

function findFile(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(candidate, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return candidate;
    }
  }
  return null;
}

async function download(url, filePath) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(filePath, bytes, { mode: 0o600 });
  return bytes;
}

function extractArchive(archivePath, outputDirectory) {
  mkdirSync(outputDirectory, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
      archivePath, outputDirectory
    ], { stdio: 'inherit' });
    return;
  }
  execFileSync('unzip', ['-q', archivePath, '-d', outputDirectory], { stdio: 'inherit' });
}

async function main() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'wow-miner-'));
  try {
    const archivePath = join(temporaryDirectory, basename(RELEASE.file));
    const extractDirectory = join(temporaryDirectory, 'extracted');
    console.log(`Downloading official Wownero ${RELEASE.version} for Windows x64…`);
    const bytes = await download(RELEASE.url, archivePath);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== RELEASE.sha256) {
      throw new Error(`Checksum mismatch. Expected ${RELEASE.sha256}, received ${digest}.`);
    }
    console.log('SHA-256 verified.');
    extractArchive(archivePath, extractDirectory);
    const daemonPath = findFile(extractDirectory, 'wownerod.exe');
    if (!daemonPath) throw new Error('The verified archive does not contain wownerod.exe.');

    mkdirSync(DESTINATION, { recursive: true });
    const daemonDirectory = dirname(daemonPath);
    for (const entry of readdirSync(daemonDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const isDaemon = entry.name.toLowerCase() === 'wownerod.exe';
      const isRuntimeLibrary = entry.name.toLowerCase().endsWith('.dll');
      const isLicense = /^LICENSE/i.test(entry.name);
      if (isDaemon || isRuntimeLibrary || isLicense) {
        copyFileSync(join(daemonDirectory, entry.name), join(DESTINATION, entry.name));
      }
    }
    writeFileSync(join(DESTINATION, 'RUNTIME_VERSION.txt'), `${RELEASE.version}\n${RELEASE.sha256}  ${RELEASE.file}\n`, 'utf8');
    if (!existsSync(join(DESTINATION, 'wownerod.exe'))) throw new Error('Runtime installation did not complete.');
    console.log(`Wownero runtime is ready in ${DESTINATION}`);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
