'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPrimaryAddress, assertThreadCount, sanitizeSettings } = require('../src/main/validation');

const VALID_ADDRESS = 'Wo3MWeKwtA918DU4c69hVSNgejdWFCRCuWjShRY66mJkU2Hv58eygJWDJS1MNa2Ge5M1WjUkGHuLqHkweDxwZZU42d16v94mP';

test('accepts a valid mainnet primary mining address', () => {
  assert.equal(assertPrimaryAddress(` ${VALID_ADDRESS} `), VALID_ADDRESS);
});

test('rejects malformed and non-Wownero addresses', () => {
  assert.throws(() => assertPrimaryAddress('4' + VALID_ADDRESS.slice(1)), /valid 97-character/);
  assert.throws(() => assertPrimaryAddress('Wo123'), /valid 97-character/);
});

test('bounds CPU thread selection to detected logical CPUs', () => {
  assert.equal(assertThreadCount(8, 24), 8);
  assert.throws(() => assertThreadCount(25, 24), /between 1 and 24/);
  assert.throws(() => assertThreadCount(1.5, 24), /between 1 and 24/);
});

test('sanitizes persisted settings and preserves safe defaults', () => {
  assert.deepEqual(sanitizeSettings({ threads: 99, theme: 'unknown', pruneBlockchain: false }, 16), {
    address: '', threads: 16, dataDirectory: '', pruneBlockchain: false,
    startNodeOnLaunch: false, startWithWindows: false, minimizeToTray: false, theme: 'dark'
  });
});

