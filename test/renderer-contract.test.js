'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'src', 'renderer', 'index.html'), 'utf8');
const script = readFileSync(join(root, 'src', 'renderer', 'app.js'), 'utf8');

test('every direct renderer id reference exists in the document', () => {
  const references = [...script.matchAll(/\$\('#([A-Za-z][\w-]*)'\)/g)].map((match) => match[1]);
  const missing = [...new Set(references)].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
  assert.deepEqual(missing, []);
});

test('every declared UI action has an implementation', () => {
  const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
  const handled = ['start-node', 'stop-node', 'toggle-mining', 'clear-logs', 'choose-directory', 'open-directory', 'save-settings'];
  assert.deepEqual([...new Set(actions)].filter((action) => !handled.includes(action)), []);
});

test('desktop page contains no remote scripts, styles, or images', () => {
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(?:src|href)="https?:/i);
});

