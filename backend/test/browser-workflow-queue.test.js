import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserWorkflowQueue } from '../src/browser-workflow-queue.js';
import { loadBrowserWorkflows, validateBrowserWorkflow } from '../src/browser-workflow-definitions.js';

const workflows = await loadBrowserWorkflows(new URL('./fixtures/workflows/', import.meta.url));

test('queues only named read actions and exposes only their validated result', () => {
  let now = 1000;
  const queue = new BrowserWorkflowQueue(workflows, () => now);
  assert.throws(() => queue.start('example_org.session_probe'));
  const started = queue.start('example_org.latest_notice');
  assert.equal(started.state, 'queued');
  assert.equal(JSON.stringify(started).includes('sessionOrigin'), false);
  const job = queue.next();
  assert.equal(queue.get(started.id).phase, 'checking_access');
  queue.progress(job.jobId, 'finding_tab');
  queue.progress(job.jobId, 'opening_page');
  assert.deepEqual(queue.get(started.id).events.map(event => event.phase), ['queued', 'checking_access', 'finding_tab', 'opening_page']);
  assert.throws(() => queue.progress(job.jobId, 'finding_tab'), /backwards/);
  assert.equal(job.workflowId, 'example_org.latest_notice');
  assert.equal(job.sessionOrigin, 'https://example.org');
  assert.equal(job.workflow.path, '/inbox');
  assert.equal(queue.next(), null);
  assert.throws(() => queue.complete(job.jobId, { state: 'found', message: '' }));
  const completed = queue.complete(job.jobId, { state: 'found', message: 'Welcome', cookies: 'PRIVATE' });
  assert.equal(completed.phase, 'completed');
  assert.equal(completed.events.at(-1).phase, 'completed');
  assert.deepEqual(completed.result, { state: 'found', message: 'Welcome' });
  assert.equal(JSON.stringify(completed).includes('PRIVATE'), false);
  assert.throws(() => queue.complete(job.jobId, { state: 'found', message: 'Again' }));
  now += 1;
});

test('expires unclaimed browser jobs', () => {
  let now = 1000;
  const queue = new BrowserWorkflowQueue(workflows, () => now);
  const started = queue.start('example_org.latest_notice');
  now += 60_001;
  assert.equal(queue.get(started.id).state, 'timed_out');
  assert.equal(queue.get(started.id).failedPhase, 'queued');
  assert.equal(queue.next(), null);
});

test('reports the phase where a browser read failed even after saving the result', () => {
  const queue = new BrowserWorkflowQueue(workflows);
  const started = queue.start('example_org.latest_notice');
  const job = queue.next();
  queue.progress(job.jobId, 'finding_tab');
  queue.progress(job.jobId, 'saving_result');
  const completed = queue.complete(job.jobId, { state: 'browser_tab_unavailable' });
  assert.equal(completed.failedPhase, 'finding_tab');
  assert.equal(completed.events.at(-1).phase, 'completed');
});

test('a different provider can use the same read workflow schema', () => {
  const other = validateBrowserWorkflow({
    schemaVersion: 1, id: 'other.latest_notice', provider: 'other', origin: 'https://other.example', effect: 'read',
    signedInSelector: '[data-account]', path: '/messages', readySelector: '[data-messages]',
    checks: [{ selector: '[data-message]', equals: 1, otherwise: 'ambiguous' }],
    extract: [{ field: 'text', selector: '[data-message]', pick: 'last', maxLength: 1000 }],
  });
  const queue = new BrowserWorkflowQueue([other]);
  queue.start(other.id);
  const job = queue.next();
  assert.equal(job.workflow.provider, 'other');
  assert.deepEqual(queue.complete(job.jobId, { state: 'found', text: 'Hello', secret: 'SKIP' }).result, { state: 'found', text: 'Hello' });
  assert.throws(() => validateBrowserWorkflow({ ...other, path: '//outside.example/' }));
});

test('list workflow result is validated and drops unexpected fields', () => {
  const list = validateBrowserWorkflow({
    schemaVersion: 1, id: 'other.list', provider: 'other', origin: 'https://other.example', effect: 'read',
    signedInSelector: 'main', path: '/items', readySelector: 'main',
    checks: [], extract: [{ field: 'result', selector: 'article', pick: 'all', maxItems: 3, maxLength: 30 }],
  });
  const queue = new BrowserWorkflowQueue([list]);
  queue.start(list.id);
  const job = queue.next();
  assert.throws(() => queue.complete(job.jobId, { state: 'found', result: ['One', '', 'Three'] }), /Invalid/);
  assert.deepEqual(queue.complete(job.jobId, { state: 'found', result: ['One', 'Two'], cookie: 'secret' }).result, { state: 'found', result: ['One', 'Two'] });
});

test('execution diagnostics preserve only approved reason codes',()=>{
 const queue=new BrowserWorkflowQueue(workflows);queue.start('example_org.latest_notice');const job=queue.next();
 assert.deepEqual(queue.complete(job.jobId,{state:'browser_read_failed',reason:'browser_api_timeout',secret:'skip'}).result,{state:'browser_read_failed',reason:'browser_api_timeout'});
});
