import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/app-bridge.js', import.meta.url), 'utf8');

function bridge({ invalidated = false } = {}) {
  const handlers = new Map();
  const posted = [];
  const sent = [];
  const window = {
    addEventListener(type, handler) { handlers.set(type, handler); },
    postMessage(message) { posted.push(message); },
  };
  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      if (invalidated) throw new Error('Extension context invalidated.');
      sent.push(message);
      callback({ ok: true });
    },
  };
  const context = { window, chrome: { runtime, storage: { local: { set(_value, callback) { callback(); } } } },
    location: { origin: 'http://127.0.0.1:5173', port: '5173', hostname: '127.0.0.1' },
    setInterval() { return 1; }, clearInterval() {},
  };
  vm.runInNewContext(source, context);
  function request(type) {
    handlers.get('message')({ source: window, origin: context.location.origin, data: { channel: 'agent-session:request', type, requestId: type } });
    return posted.at(-1);
  }
  return { request, sent };
}

test('a stale extension bridge reports unavailable instead of claiming it is installed', () => {
  const { request } = bridge({ invalidated: true });
  assert.equal(request('ping').ok, false);
});

test('a healthy bridge can wake a browser test immediately', () => {
  const { request, sent } = bridge();
  assert.equal(request('ping').ok, true);
  const dispatched = request('run-test');
  assert.equal(dispatched.requestId, 'run-test');
  assert.equal(dispatched.ok, true);
  assert.equal(sent.at(-1).type, 'agent-session:poll-workflows');
});
