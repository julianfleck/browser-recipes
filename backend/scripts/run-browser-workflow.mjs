import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import { loadBrowserWorkflows } from '../src/browser-workflow-definitions.js';

const workflowId = process.argv[2];
if (!workflowId) {
  console.error('Usage: node scripts/run-browser-workflow.mjs <workflow-id>');
  process.exit(2);
}
if (workflowId === '--list') {
  console.log(JSON.stringify((await loadBrowserWorkflows()).map(({ id, provider, origin, effect, description }) => ({ id, provider, origin, effect, description })), null, 2));
  process.exit(0);
}

const backend = fileURLToPath(new URL('..', import.meta.url));
const dataDir = process.env.CONNECTOR_DATA_DIR ?? path.join(backend, 'data');
const token = await new BrowserSessionStore(path.join(dataDir, 'browser-sessions')).pairingToken();
const base = `http://127.0.0.1:${process.env.PORT ?? 8787}/api/browser-workflows`;
const headers = { authorization: `Bearer ${token}` };

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

try {
  const started = await json(await fetch(`${base}/jobs`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ workflowId }),
  }));
  const id = started.job.id;
  for (let attempt = 0; attempt < 70; attempt++) {
    await delay(1000);
    const { job } = await json(await fetch(`${base}/jobs/${id}`, { headers }));
    if (job.state === 'completed') {
      console.log(JSON.stringify({ workflowId, ...job.result }, null, 2));
      process.exit(0);
    }
    if (job.state === 'timed_out') throw new Error('Browser workflow timed out; keep the local app open and the extension enabled.');
  }
  throw new Error('Browser workflow did not complete in time.');
} catch (error) {
  console.error(JSON.stringify({ workflowId, error: error.message }));
  process.exitCode = 1;
}
