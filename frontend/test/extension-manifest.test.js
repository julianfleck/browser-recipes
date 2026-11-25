import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('Chromium package uses an MV3 service worker and has no marketplace assumptions', () => {
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.match(manifest.name, /agent.*session/i);
  assert.equal(JSON.stringify(manifest).includes('vinted'), false);
  assert.equal(JSON.stringify(manifest).includes('vestiaire'), false);
});

test('the local app bridge uses cross-browser match patterns', () => {
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://127.0.0.1/*', 'http://localhost/*']);
});
