import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import { workflows } from '../src/workflows/catalog.js';
import { createWorkflowRunner } from '../src/workflows/runner.js';

const backend = fileURLToPath(new URL('..', import.meta.url));
const dataDir = process.env.CONNECTOR_DATA_DIR ?? path.join(backend, 'data');
const runner = createWorkflowRunner({
  store: new BrowserSessionStore(path.join(dataDir, 'browser-sessions')),
  workflows,
});

const id = process.argv[2];
if (id === '--list') {
  console.log(JSON.stringify(runner.list(), null, 2));
} else if (id) {
  try {
    console.log(JSON.stringify(await runner.run(id), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ workflowId: id, error: error.message }));
    process.exitCode = 1;
  }
} else {
  console.error('Usage: node scripts/run-workflow.mjs <workflow-id|--list>');
  process.exitCode = 2;
}
