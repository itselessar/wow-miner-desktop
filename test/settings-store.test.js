'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { SettingsStore } = require('../src/main/settings-store');

test('writes sanitized settings atomically', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wow-settings-'));
  try {
    const file = join(directory, 'nested', 'settings.json');
    const store = new SettingsStore(file, 8);
    const saved = store.write({ threads: 4, address: ' public ', startNodeOnLaunch: true });
    assert.equal(saved.address, 'public');
    assert.equal(saved.threads, 4);
    assert.equal(saved.startNodeOnLaunch, true);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).threads, 4);
    assert.deepEqual(store.read(), saved);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

