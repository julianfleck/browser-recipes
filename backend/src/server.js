import path from 'node:path';
import {McpRegistry} from './mcp-registry.js';
import {McpFeedbackStore} from './mcp-feedback-store.js';
import {HeadlessRunner} from './headless-runner.js';
import {ToolLibrary} from './tool-library.js';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHttpApp } from './http-app.js';
import { BrowserSessionStore } from './browser-session-store.js';
import { BrowserWorkflowQueue } from './browser-workflow-queue.js';
import { loadBrowserWorkflows } from './browser-workflow-definitions.js';
import { TeachingStore } from './teaching-store.js';
import { createOpenRouterTeacher } from './openrouter-teacher.js';
import {createOpenRouterRefiner}from'./workflow-refinement.js';
import {ToolBuilder}from'./tool-builder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  loadEnvFile(path.resolve(here, '../.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const dataDir = process.env.CONNECTOR_DATA_DIR ?? path.resolve(here, '../data');
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

const sessions=new BrowserSessionStore(path.join(dataDir,'browser-sessions'));
const teachings=new TeachingStore(path.join(dataDir,'teachings'),createOpenRouterTeacher());
const feedback=new McpFeedbackStore(path.join(dataDir,'mcp-feedback'),()=>teachings.list());
const mcps=new McpRegistry(path.join(dataDir,'mcps'));
const existing=await teachings.list();await mcps.ensure(existing,await sessions.list());for(const item of existing)await teachings.save(item);
const headless=new HeadlessRunner({sessions,teachings,feedback});
const builder=new ToolBuilder({teachings,runner:headless,refine:createOpenRouterRefiner(),destination:path.resolve(here,'../workflows')});
const library=new ToolLibrary(path.join(dataDir,'teachings'),()=>teachings.list());
const layout=await library.load();for(const group of layout.groups)if(!group.mcpId)group.mcpId=(await mcps.forOrigin(group.origin))?.id;await library.save(layout);
const server = createHttpApp(
  null,
  sessions,
  new BrowserWorkflowQueue(await loadBrowserWorkflows()),
  teachings,
  path.resolve(here, '../workflows'),headless,library,feedback,mcps,builder,
);
server.listen(port, '127.0.0.1', () => {
  console.log(`Connector backend listening at http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
