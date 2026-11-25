import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpSessionTransport } from '../src/workflows/http-session-transport.js';
import { createWorkflowRunner } from '../src/workflows/runner.js';
import { vinted } from '../src/providers/vinted.js';

const snapshot = {
  origin: 'https://www.vinted.de',
  cookies: [
    { name: 'session', value: 'PRIVATE-COOKIE', domain: '.www.vinted.de', path: '/', secure: true },
    { name: 'other', value: 'DO-NOT-SEND', domain: 'another.example', path: '/', secure: true },
  ],
  localStorage: { token: 'PRIVATE-STORAGE' },
};

test('HTTP session transport sends only matching cookies to the saved origin and never follows redirects', async () => {
  let called = 0;
  const transport = createHttpSessionTransport(snapshot, {
    fetchImpl: async (url, options) => {
      called++;
      assert.equal(url.toString(), 'https://www.vinted.de/');
      assert.equal(options.headers.cookie, 'session=PRIVATE-COOKIE');
      assert.equal(options.redirect, 'manual');
      return { status: 302, headers: new Headers({ location: 'https://other.example/login' }) };
    },
  });
  assert.deepEqual(await transport.get('/', { followSameOrigin: 2 }), { status: 302, redirected: true, sameOriginRedirect: false, redirectHops: 0 });
  await assert.rejects(transport.get('https://other.example/'));
  await assert.rejects(transport.get('//other.example/'));
  assert.equal(called, 1);
});

test('Vinted message workflow checkpoints the refreshed session and returns one message', async () => {
  let checkpointed = false;
  const page = {
    async goto() {},
    locator(selector) {
      if (selector === '[data-testid="header-conversations-button"]') return { async waitFor() {}, async click() {} };
      if (selector === '[data-testid="conversation-content"]') return { async waitFor() {} };
      if (selector.includes('inbox-list-item')) return { async count() { return 1; } };
      if (selector.includes('braze-message-text')) return { async count() { return 1; }, last() { return { async innerText() { return 'Welcome to Vinted'; } }; } };
      throw new Error(`Unknown selector: ${selector}`);
    },
  };
  const runner = createWorkflowRunner({
    store: { load: async () => snapshot, async save(updated) { checkpointed = true; assert.equal(updated.origin, snapshot.origin); } },
    workflows: vinted.workflows,
    browserFactory: (saved, { onCheckpoint }) => ({ withPage: run => run(page, { checkpoint: () => onCheckpoint(saved) }) }),
  });
  const result = await runner.run('vinted.latest_received_message');
  assert.equal(checkpointed, true);
  assert.equal(result.state, 'found');
  assert.equal(result.message, 'Welcome to Vinted');
  assert.equal(JSON.stringify(result).includes('PRIVATE-'), false);
});

test('Vinted message workflow reports unavailable session without exposing browser errors', async () => {
  let checkpointed = false;
  const runner = createWorkflowRunner({
    store: { load: async () => snapshot, async save() { checkpointed = true; } },
    workflows: vinted.workflows,
    browserFactory: () => ({ withPage: run => run({
      async goto() {},
      locator(selector) {
        if (selector === '[data-testid="header-conversations-button"]') return {
          async waitFor() { throw new Error('private navigation details'); },
        };
        throw new Error(`Unexpected selector: ${selector}`);
      },
    }, { checkpoint: async () => { checkpointed = true; } }) }),
  });
  const result = await runner.run('vinted.latest_received_message');
  assert.equal(result.state, 'session_unavailable');
  assert.equal(JSON.stringify(result).includes('private navigation details'), false);
  assert.equal(checkpointed, false);
});

test('HTTP transport follows only bounded same-origin redirects', async () => {
  let calls = 0;
  const transport = createHttpSessionTransport(snapshot, {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(options.headers.cookie, 'session=PRIVATE-COOKIE');
      return calls === 1
        ? { status: 307, headers: new Headers({ location: '/catalog' }) }
        : { status: 200, headers: new Headers() };
    },
  });
  assert.deepEqual(await transport.get('/', { followSameOrigin: 2 }), { status: 200, redirected: false, sameOriginRedirect: false, redirectHops: 1 });
  assert.equal(calls, 2);
});

test('runner composes named steps and returns redacted results', async () => {
  const workflow = {
    id: 'example.session_probe', provider: 'example', sessionOrigin: 'https://www.vinted.de', effect: 'read',
    steps: [
      { id: 'request', run: context => context.http.get('/') },
      { id: 'assessment', run: (_context, results) => ({ state: results.request.status === 200 ? 'reachable' : 'blocked' }) },
    ],
    result: results => ({ state: results.assessment.state, httpStatus: results.request.status }),
  };
  const runner = createWorkflowRunner({
    store: { load: async () => snapshot },
    workflows: [workflow],
    fetchImpl: async () => ({ status: 200, headers: new Headers() }),
  });
  const result = await runner.run('example.session_probe');
  assert.deepEqual(result, { workflowId: 'example.session_probe', provider: 'example', sessionOrigin: 'https://www.vinted.de', state: 'reachable', httpStatus: 200 });
  assert.equal(JSON.stringify(result).includes('PRIVATE-'), false);
  await assert.rejects(runner.run('unknown'));
});
