import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserSessionTransport, fromBrowserStorageState, toBrowserStorageState } from '../src/workflows/browser-session-transport.js';

const snapshot = {
  origin: 'https://www.vinted.de',
  cookies: [
    { name: 'sid', value: 'SECRET', domain: '.www.vinted.de', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: 2000000000 },
    { name: 'other', value: 'SKIP', domain: 'other.example', path: '/', secure: true },
  ],
  localStorage: { one: 'PRIVATE' },
};

test('maps extension cookies and local storage into an isolated browser context', () => {
  const state = toBrowserStorageState(snapshot);
  assert.equal(state.cookies[0].sameSite, 'Lax');
  assert.equal(state.cookies[0].expires, 2000000000);
  assert.equal(state.cookies.length, 1);
  assert.deepEqual(state.origins, [{ origin: snapshot.origin, localStorage: [{ name: 'one', value: 'PRIVATE' }] }]);
});

test('checkpoints refreshed browser cookies and local storage only for the saved origin', () => {
  const updated = fromBrowserStorageState({
    cookies: [
      { name: 'sid', value: 'FRESH', domain: '.www.vinted.de', path: '/', expires: 2000000001, sameSite: 'Lax' },
      { name: 'third-party', value: 'SKIP', domain: 'other.example', path: '/', expires: -1 },
    ],
    origins: [
      { origin: snapshot.origin, localStorage: [{ name: 'one', value: 'FRESH-LOCAL' }] },
      { origin: 'https://other.example', localStorage: [{ name: 'token', value: 'SKIP' }] },
    ],
  }, snapshot.origin);
  assert.equal(updated.cookies.length, 1);
  assert.equal(updated.cookies[0].value, 'FRESH');
  assert.deepEqual(updated.localStorage, { one: 'FRESH-LOCAL' });
});

test('browser transport closes its isolated browser even when a workflow fails', async () => {
  let closed = false;
  let checkpointed = false;
  const chromium = {
    async launch() {
      return {
        async newContext(options) {
          assert.equal(options.storageState.cookies[0].value, 'SECRET');
          return {
            async newPage() { return { marker: 'page' }; },
            async storageState() { return { cookies: [], origins: [{ origin: snapshot.origin, localStorage: [] }] }; },
          };
        },
        async close() { closed = true; },
      };
    },
  };
  const transport = createBrowserSessionTransport(snapshot, { chromium, onCheckpoint: async updated => {
    checkpointed = true;
    assert.equal(updated.origin, snapshot.origin);
  } });
  await assert.rejects(transport.withPage(async (page, session) => {
    assert.equal(page.marker, 'page');
    await session.checkpoint();
    throw new Error('stop');
  }));
  assert.equal(checkpointed, true);
  assert.equal(closed, true);
});
