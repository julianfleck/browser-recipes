import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHttpApp } from '../src/http-app.js';
import { BrowserWorkflowQueue } from '../src/browser-workflow-queue.js';
import { loadBrowserWorkflows } from '../src/browser-workflow-definitions.js';
import { compileReadDraft,validateRecording, TeachingStore } from '../src/teaching-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('a foreign web origin cannot trigger a login window', async () => {
  let opened = 0;
  const manager = {
    async connect() { opened++; return { state: 'login_open' }; },
    async allStatuses() { return []; },
  };
  const server = createHttpApp(manager);
  let status;
  const response = {
    writeHead(code) { status = code; },
    end() {},
  };
  server.emit('request', {
    method: 'POST',
    url: '/api/connections/vinted/connect',
    headers: { host: '127.0.0.1:8787', origin: 'https://untrusted.example' },
  }, response);
  assert.equal(status, 403);
  assert.equal(opened, 0);
});

test('only a paired extension can save a generic browser session', async () => {
  let saved = 0;
  const store = {
    async authorized(value) { return value === 'Bearer paired'; },
    async save(snapshot) { saved++; return { origin: snapshot.origin, cookieCount: snapshot.cookies.length }; },
  };
  const server = createHttpApp({}, store);
  async function send(origin, authorization) {
    return new Promise(resolve => {
      const request = Object.assign(Readable.from([Buffer.from(JSON.stringify({ origin: 'https://example.org', cookies: [], localStorage: {} }))]), {
        method: 'POST', url: '/api/browser-sessions',
        headers: { host: '127.0.0.1:8787', origin, authorization },
      });
      let status;
      server.emit('request', request, {
        writeHead(code) { status = code; },
        end() { resolve(status); },
      });
    });
  }
  assert.equal(await send('https://untrusted.example', 'Bearer paired'), 403);
  assert.equal(await send('chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'Bearer wrong'), 403);
  assert.equal(await send('chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'Bearer paired'), 200);
  assert.equal(saved, 1);
});

test('a paired extension completes a named browser workflow, while a foreign origin cannot claim it', async () => {
  const sessions = { async authorized(value) { return value === 'Bearer paired'; } };
  const server = createHttpApp(null, sessions, new BrowserWorkflowQueue(await loadBrowserWorkflows(new URL('./fixtures/workflows/', import.meta.url))));
  async function send(method, url, origin, body) {
    return new Promise(resolve => {
      const bytes = body ? [Buffer.from(JSON.stringify(body))] : [];
      const request = Object.assign(Readable.from(bytes), {
        method, url, headers: { host: '127.0.0.1:8787', ...(origin ? { origin } : {}), authorization: 'Bearer paired' },
      });
      let status;
      server.emit('request', request, {
        writeHead(code) { status = code; },
        end(data) { resolve({ status, body: JSON.parse(data) }); },
      });
    });
  }
  const started = await send('POST', '/api/browser-workflows/jobs', null, { workflowId: 'example_org.latest_notice' });
  assert.equal(started.status, 202);
  const foreign = await send('GET', '/api/browser-workflows/next', 'https://untrusted.example');
  assert.equal(foreign.status, 403);
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const claimed = await send('GET', '/api/browser-workflows/next', null);
  assert.equal(claimed.body.job.workflowId, 'example_org.latest_notice');
  const progress = await send('POST', `/api/browser-workflows/jobs/${claimed.body.job.jobId}/progress`, extensionOrigin, { phase: 'finding_tab' });
  assert.equal(progress.body.job.phase, 'finding_tab');
  const completed = await send('POST', `/api/browser-workflows/jobs/${claimed.body.job.jobId}/result`, null, { state: 'found', message: 'Hello', cookie: 'SECRET' });
  assert.deepEqual(completed.body.job.result, { state: 'found', message: 'Hello' });
  assert.equal((await send('GET', '/api/browser-workflows/next', extensionOrigin)).status, 200);
  const status = await send('GET', `/api/browser-workflows/jobs/${claimed.body.job.jobId}`, null);
  assert.equal(status.body.job.state, 'completed');
});

test('a teaching becomes a saved recipe only after a claimed browser test returns a result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'teaching-http-'));
  try {
    const sessions = { async authorized(value) { return value === 'Bearer paired'; } };
    const workflows = new BrowserWorkflowQueue([]);
    const teachings = new TeachingStore(path.join(root, 'teachings'), async () => ({
      path: '/inbox', signedInSelector: 'a[data-testid="inbox"]', readySelector: '[data-testid="message"]', outputSelector: '[data-testid="message"]',
    }));
    const server = createHttpApp(null, sessions, workflows, teachings, path.join(root, 'workflows'));
    const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    async function send(method, url, origin, body) {
      return new Promise(resolve => {
        const request = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
          method, url, headers: { host: '127.0.0.1:8787', authorization: 'Bearer paired', ...(origin ? { origin } : {}) },
        });
        let status;
        server.emit('request', request, { writeHead(code) { status = code; }, end(data) { resolve({ status, body: JSON.parse(data) }); } });
      });
    }
    const recording = { origin: 'https://example.org', title: 'Read message', description: '', events: [
      { type: 'navigation', path: '/inbox' }, { type: 'click', path: '/inbox', selector: 'a[data-testid="inbox"]' },
      { type: 'output', path: '/inbox', selector: '[data-testid="message"]' },
    ] };
    assert.equal((await send('POST', '/api/teachings', 'https://foreign.example', recording)).status, 403);
    const created = await send('POST', '/api/teachings', extensionOrigin, recording);
    assert.equal(created.status, 201);
    const id = created.body.teaching.id;
    // Retain coverage of the legacy extension-queue compatibility route. New tests use HeadlessRunner.
    const legacy=await teachings.get(id);legacy.workflow=compileReadDraft(validateRecording(recording),{path:'/inbox',signedInSelector:'a[data-testid="inbox"]',readySelector:'[data-testid="message"]',outputSelector:'[data-testid="message"]'});await teachings.save(legacy);
    assert.equal((await send('POST', `/api/teachings/${id}/save`, null)).status, 409);
    const testStarted = await send('POST', `/api/teachings/${id}/test`, null);
    assert.equal(testStarted.status, 202);
    const repeatedStart = await send('POST', `/api/teachings/${id}/test`, null);
    assert.equal(repeatedStart.status, 200);
    assert.equal(repeatedStart.body.job.id, testStarted.body.job.id);
    const job = await send('GET', '/api/browser-workflows/next', extensionOrigin);
    assert.equal(job.body.job.workflow.id, 'example_org.read_message');
    await send('POST', `/api/browser-workflows/jobs/${job.body.job.jobId}/result`, extensionOrigin, { state: 'found', result: 'Hello' });
    const checked = await send('GET', `/api/teachings/${id}`, null);
    assert.equal(checked.body.teaching.state, 'tested');
    assert.equal((await send('POST', `/api/teachings/${id}/save`, null)).body.teaching.state, 'saved');
  } finally { await rm(root, { recursive: true, force: true }); }
});
