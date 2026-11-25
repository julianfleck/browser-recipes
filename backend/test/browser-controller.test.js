import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserController } from '../src/browser-controller.js';

function harness() {
  const calls = [];
  const bb = {
    contexts: {
      async create() { calls.push(['create-context']); return { id: 'context-new' }; },
      async delete(id) { calls.push(['delete-context', id]); },
    },
    sessions: {
      async create(options) { calls.push(['create-session', options]); return { id: 'session-1', connectUrl: 'wss://test.example/session' }; },
      async debug(id) { calls.push(['debug', id]); return { debuggerFullscreenUrl: 'https://test.example/live' }; },
    },
  };
  const browser = {
    contexts() { return [{ pages() { return [{ async goto(url) { calls.push(['goto', url]); }, async evaluate() {} }]; } }]; },
    async close() { calls.push(['close-browser']); },
  };
  const chromium = {
    async connectOverCDP(url) { calls.push(['connect', url]); return browser; },
  };
  return { controller: new BrowserController({ bb, chromium, settleMs: 0 }), calls };
}

test('creates a cloud context, exposes its live view, and persists it after login', async () => {
  const { controller, calls } = harness();
  const session = await controller.open('vestiaire', null);
  assert.equal(session.liveViewUrl, 'https://test.example/live');
  assert.deepEqual(await session.snapshot(), { contextId: 'context-new' });
  assert.equal(calls.find(([name]) => name === 'create-session')[1].timeout, 900);
  assert.deepEqual(calls.find(([name]) => name === 'create-session')[1].browserSettings, {
    context: { id: 'context-new', persist: true },
    recordSession: false,
    logSession: false,
  });
  assert.ok(calls.some(([name, url]) => name === 'goto' && url === 'https://www.vestiairecollective.com/'));
  await session.close();
  assert.ok(calls.some(([name]) => name === 'close-browser'));
  assert.ok(!calls.some(([name]) => name === 'delete-context'));
});

test('reopens an existing cloud context without creating a new one', async () => {
  const { controller, calls } = harness();
  const session = await controller.open('vinted', { contextId: 'context-saved' });
  assert.equal(calls.find(([name]) => name === 'create-session')[1].browserSettings.context.id, 'context-saved');
  assert.ok(!calls.some(([name]) => name === 'create-context'));
  await session.close();
  assert.ok(!calls.some(([name]) => name === 'delete-context'));
});

test('deletes a new cloud context when the user abandons login', async () => {
  const { controller, calls } = harness();
  const session = await controller.open('vinted', null);
  await session.close();
  assert.ok(calls.some(([name, id]) => name === 'delete-context' && id === 'context-new'));
});
