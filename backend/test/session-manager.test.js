import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../src/session-manager.js';

function harness() {
  const records = new Map();
  const opened = [];
  const vault = {
    async load(platform) { return records.get(platform) ?? null; },
    async save(platform, value) { records.set(platform, structuredClone(value)); },
    async remove(platform) { records.delete(platform); },
  };
  const browser = {
    async open(platform, savedState) {
      const session = {
        platform,
        savedState,
        liveViewUrl: `https://live.example/${platform}`,
        closed: false,
        async snapshot() { return { cookies: [{ name: 'test', value: platform }], origins: [] }; },
        async close() { this.closed = true; },
      };
      opened.push(session);
      return session;
    },
  };
  const manager = new SessionManager({ vault, browser, now: () => '2026-10-25T12:00:00.000Z' });
  return { manager, records, opened };
}

test('saves login state and reopens it in a fresh browser before verification', async () => {
  const { manager, records, opened } = harness();
  assert.equal((await manager.status('vinted')).state, 'not_connected');
  await manager.connect('vinted');
  assert.equal((await manager.status('vinted')).state, 'login_open');
  assert.equal((await manager.status('vinted')).liveViewUrl, 'https://live.example/vinted');
  await manager.saveLogin('vinted');
  assert.equal(opened[0].closed, true);
  assert.equal((await manager.status('vinted')).state, 'saved_unverified');
  assert.equal((await manager.status('vinted')).liveViewUrl, null);
  assert.equal(records.get('vinted').lastVerifiedAt, null);

  await manager.openVerification('vinted');
  assert.deepEqual(opened[1].savedState, records.get('vinted').storageState);
  assert.equal((await manager.status('vinted')).state, 'verification_open');
  await manager.finishVerification('vinted', true);
  assert.equal(opened[1].closed, true);
  assert.equal((await manager.status('vinted')).state, 'previously_verified');
  assert.equal(records.get('vinted').lastVerifiedAt, '2026-10-25T12:00:00.000Z');
});

test('a failed reopen keeps the reconnect warning after a manager restart', async () => {
  const { manager, records, opened } = harness();
  await manager.connect('vestiaire');
  await manager.saveLogin('vestiaire');
  await manager.openVerification('vestiaire');
  await manager.finishVerification('vestiaire', false);
  assert.equal((await manager.status('vestiaire')).state, 'needs_reconnect');
  assert.ok(records.has('vestiaire'));
  const vault = {
    async load(platform) { return records.get(platform) ?? null; },
  };
  const restarted = new SessionManager({ vault, browser: { open: () => opened.push('unexpected') } });
  assert.equal((await restarted.status('vestiaire')).state, 'needs_reconnect');
});

test('disconnect closes the active browser and removes saved session state', async () => {
  const { manager, records, opened } = harness();
  await manager.connect('vinted');
  await manager.saveLogin('vinted');
  await manager.openVerification('vinted');
  await manager.disconnect('vinted');
  assert.equal(opened[1].closed, true);
  assert.equal(records.has('vinted'), false);
  assert.equal((await manager.status('vinted')).state, 'not_connected');
});

test('rejects unknown marketplaces and save without a login window', async () => {
  const { manager } = harness();
  await assert.rejects(manager.connect('grailed'), /Unsupported marketplace/);
  await assert.rejects(manager.saveLogin('vinted'), /No login window/);
});

test('only one hosted login view runs at once and cancellation closes it', async () => {
  const { manager, opened } = harness();
  await manager.connect('vinted');
  await assert.rejects(manager.connect('vestiaire'), /Finish the open/);
  await manager.cancel('vinted');
  assert.equal(opened[0].closed, true);
  assert.equal((await manager.status('vinted')).state, 'not_connected');
  await manager.connect('vestiaire');
  assert.equal((await manager.status('vestiaire')).state, 'login_open');
});

test('does not report a saved login if the hosted session cannot close and persist', async () => {
  const { manager, records, opened } = harness();
  await manager.connect('vinted');
  opened[0].close = async () => { throw new Error('Remote session could not persist'); };
  await assert.rejects(manager.saveLogin('vinted'), /could not persist/);
  assert.equal(records.has('vinted'), false);
  assert.equal((await manager.status('vinted')).state, 'not_connected');
});
