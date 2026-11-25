import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SessionVault } from '../src/session-vault.js';

test('persists browser state encrypted and reads it after a new vault instance starts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'connector-vault-'));
  const first = new SessionVault(root);
  const record = {
    storageState: { cookies: [{ name: 'session', value: 'sensitive-cookie' }], origins: [] },
    savedAt: '2026-10-25T12:00:00.000Z',
    lastVerifiedAt: null,
  };
  await first.save('vinted', record);
  const raw = await readFile(path.join(root, 'vinted.enc'), 'utf8');
  assert.equal(raw.includes('sensitive-cookie'), false);
  const second = new SessionVault(root);
  assert.deepEqual(await second.load('vinted'), record);
  await second.remove('vinted');
  assert.equal(await second.load('vinted'), null);
});
