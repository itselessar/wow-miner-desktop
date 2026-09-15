'use strict';

const MAX_THREADS = 256;

function assertPrimaryAddress(value) {
  const address = String(value || '').trim();
  // Mainnet Wownero standard addresses are 97 Base58 characters and begin Wo.
  // The daemon remains the final authority and rejects subaddresses/wrong nets.
  if (!/^Wo[1-9A-HJ-NP-Za-km-z]{95}$/.test(address)) {
    throw new Error('Enter a valid 97-character primary Wownero address beginning with Wo.');
  }
  return address;
}

function assertThreadCount(value, logicalCpuCount) {
  const count = Number(value);
  const detectedLimit = Math.max(1, Math.min(MAX_THREADS, Number(logicalCpuCount) || 1));
  if (!Number.isInteger(count) || count < 1 || count > detectedLimit) {
    throw new Error(`CPU threads must be between 1 and ${detectedLimit}.`);
  }
  return count;
}

function sanitizeSettings(input, logicalCpuCount) {
  const source = input && typeof input === 'object' ? input : {};
  const defaultThreads = Math.max(1, Math.floor((Number(logicalCpuCount) || 2) / 2));
  const threads = Number.isInteger(Number(source.threads))
    ? Math.max(1, Math.min(Number(logicalCpuCount) || 1, Number(source.threads)))
    : defaultThreads;

  return {
    address: typeof source.address === 'string' ? source.address.trim().slice(0, 200) : '',
    threads,
    dataDirectory: typeof source.dataDirectory === 'string' ? source.dataDirectory.slice(0, 1024) : '',
    pruneBlockchain: source.pruneBlockchain !== false,
    startNodeOnLaunch: source.startNodeOnLaunch === true,
    startWithWindows: source.startWithWindows === true,
    minimizeToTray: source.minimizeToTray === true,
    theme: source.theme === 'light' ? 'light' : 'dark'
  };
}

module.exports = {
  assertPrimaryAddress,
  assertThreadCount,
  sanitizeSettings
};

