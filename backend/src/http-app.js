import { createServer } from 'node:http';
import {randomUUID} from 'node:crypto';
import {serveDomainMcp} from './mcp-server.js';

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:8787',
  'http://localhost:8787',
]);

function reply(response, status, data, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(data));
}

const extensionOrigin = /^(chrome|moz|safari-web)-extension:\/\/[a-zA-Z0-9-]+$/;

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Snapshot too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createHttpApp(manager, browserSessions = null, browserWorkflows = null, teachings = null, workflowDirectory = null, headless = null, library = null, feedback = null, mcps = null, builder = null) {
  const testJobs = new Map();
  return createServer(async (request, response) => {
    const host = request.headers.host ?? '';
    if (!/^((localhost|127\.0\.0\.1):\d+)$/.test(host)) {
      return reply(response, 403, { error: 'Local host required' });
    }
    const url = new URL(request.url, `http://${host}`);
    const origin = request.headers.origin;
    const isExtensionRequest = (url.pathname === '/api/browser-sessions' || url.pathname.startsWith('/api/browser-workflows/') || url.pathname.startsWith('/api/teachings') || url.pathname.startsWith('/api/library') || url.pathname.startsWith('/api/mcps')) && extensionOrigin.test(origin ?? '');
    const cors = isExtensionRequest ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      vary: 'Origin',
    } : {};
    if (origin && !allowedOrigins.has(origin) && !isExtensionRequest) {
      return reply(response, 403, { error: 'Origin not allowed' });
    }
    if (request.method === 'OPTIONS' && isExtensionRequest) return reply(response, 204, {}, cors);
    try {
      if(mcps&&url.pathname.startsWith('/api/mcps')){
        if(!await browserSessions.authorized(request.headers.authorization))return reply(response,403,{error:'App pairing required'},cors);
        const tools=await teachings.list(),before=new Map(tools.map(tool=>[tool.id,tool.mcpId]));
        await mcps.ensure(tools,await browserSessions.list());for(const tool of tools)if(tool.mcpId!==before.get(tool.id))await teachings.save(tool);
        if(url.pathname==='/api/mcps'&&request.method==='GET')return reply(response,200,{mcps:await mcps.list()},cors);
        if(url.pathname==='/api/mcps'&&request.method==='POST')return reply(response,201,{mcp:await mcps.create(await readJson(request))},cors);
        const match=url.pathname.match(/^\/api\/mcps\/([^/]+)(?:\/(duplicate|delete|test))?$/);
        if(match){const item=await mcps.find(decodeURIComponent(match[1]));if(!item)throw new Error('Unknown MCP');
          if(request.method==='POST'&&!match[2])return reply(response,200,{mcp:await mcps.update(item.id,await readJson(request))},cors);
          if(request.method==='POST'&&match[2]==='delete')return reply(response,200,{mcp:await mcps.remove(item.id)},cors);
          if(request.method==='POST'&&match[2]==='duplicate'){const copy=await mcps.duplicate(item.id),mapping=new Map();for(const tool of tools.filter(tool=>tool.mcpId===item.id)){const cloned=await teachings.cloneForMcp(tool.id,copy.id);mapping.set(tool.id,cloned.id);}if(library){const layout=await library.load(),groups=layout.groups.filter(group=>group.mcpId===item.id),groupMap=new Map(groups.map(group=>[group.id,randomUUID()]));layout.groups.push(...groups.map(group=>({...group,id:groupMap.get(group.id),mcpId:copy.id,parentId:group.parentId?groupMap.get(group.parentId)??null:null})));layout.placements.push(...layout.placements.filter(placement=>mapping.has(placement.id)).map(placement=>({...placement,id:mapping.get(placement.id),groupId:groupMap.get(placement.groupId)??null})));await library.save(layout);}return reply(response,201,{mcp:copy},cors);}
          if(request.method==='POST'&&match[2]==='test')return reply(response,200,{mcp:await mcps.tested(item.id,await headless.checkConnection(item.origin))},cors);
        }
      }
      if(headless&&teachings&&url.pathname.startsWith('/mcp/')){
        const identity=decodeURIComponent(url.pathname.slice(5));let mcp=null,siteOrigin;
        if(mcps){mcp=(await mcps.list()).find(item=>item.endpoint===identity);if(!mcp||!mcp.enabled)return reply(response,403,{error:'MCP inactive or unavailable'});siteOrigin=mcp.origin;}
        else {const known=[...(await teachings.list()).map(item=>({origin:item.recording.origin})),...(await browserSessions.list?.()??[])];siteOrigin=known.find(item=>new URL(item.origin).host===identity)?.origin;}
        const authorized=mcp?await mcps.authorized(mcp.id,request.headers.authorization)||mcp.legacyAuthAllowed&&!mcp.duplicatedFrom&&!await mcps.hasToken(mcp.id)&&await browserSessions.authorizedMcp(siteOrigin,request.headers.authorization):siteOrigin&&await browserSessions.authorizedMcp(siteOrigin,request.headers.authorization);
        if(!authorized)return reply(response,403,{error:'MCP access required'});
        return await serveDomainMcp(request,response,{origin:siteOrigin,teachings,runner:headless,feedback,mcp},request.method==='POST'?await readJson(request):undefined);
      }
      if(feedback&&url.pathname.startsWith('/api/mcp-feedback')){
        if(!await browserSessions.authorized(request.headers.authorization))return reply(response,403,{error:'App pairing required'});
        if(request.method==='GET'&&url.pathname==='/api/mcp-feedback')return reply(response,200,{reports:await feedback.list()});
        const match=url.pathname.match(/^\/api\/mcp-feedback\/([0-9a-f-]{36})\/resolve$/);
        if(request.method==='POST'&&match)return reply(response,200,{report:await feedback.resolve(match[1])});
      }
      if(library&&url.pathname==='/api/library'){
        if(!await browserSessions.authorized(request.headers.authorization))return reply(response,403,{error:'App pairing required'},cors);
        if(request.method==='GET')return reply(response,200,{library:await library.load()},cors);
        if(request.method==='POST')return reply(response,200,{library:await library.save(await readJson(request))},cors);
      }
      if(headless&&url.pathname==='/api/mcp-access'&&request.method==='POST'){
        if(!await browserSessions.authorized(request.headers.authorization))return reply(response,403,{error:'App pairing required'});
        const body=await readJson(request);
        if(mcps){const mcp=body.mcpId?await mcps.find(body.mcpId):await mcps.forOrigin(body.origin);if(!mcp)throw new Error('Unknown MCP');return reply(response,200,{url:`http://${host}/mcp/${encodeURIComponent(mcp.endpoint)}`,token:await mcps.token(mcp.id,body.rotate===true)});}
        if(!(await teachings.list()).some(item=>item.recording.origin===body.origin)&&!(await browserSessions.list()).some(site=>site.origin===body.origin))throw new Error('Invalid MCP website');
        return reply(response,200,{url:`http://${host}/mcp/${encodeURIComponent(new URL(body.origin).host)}`,token:await browserSessions.mcpToken(body.origin,body.rotate===true)});
      }
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return reply(response, 200, { ok: true });
      }
      if (manager && request.method === 'GET' && url.pathname === '/api/connections') {
        return reply(response, 200, { connections: await manager.allStatuses() });
      }
      if (browserSessions && request.method === 'GET' && url.pathname === '/api/browser-sessions/pairing') {
        return reply(response, 200, { token: await browserSessions.pairingToken() });
      }
      if (browserSessions && request.method === 'GET' && url.pathname === '/api/browser-sessions') {
        return reply(response, 200, { sessions: await browserSessions.list() });
      }
      if (browserSessions && request.method === 'DELETE' && url.pathname === '/api/browser-sessions') {
        if (!await browserSessions.authorized(request.headers.authorization)) return reply(response, 403, { error: 'App pairing required' });
        await browserSessions.remove(url.searchParams.get('origin'));await mcps?.revokeOrigin(url.searchParams.get('origin'));
        return reply(response, 200, { sessions: await browserSessions.list() });
      }
      if (browserSessions && request.method === 'POST' && url.pathname === '/api/browser-sessions') {
        if (!isExtensionRequest || !await browserSessions.authorized(request.headers.authorization)) {
          return reply(response, 403, { error: 'Extension pairing required' }, cors);
        }
        const saved = await browserSessions.save(await readJson(request));
        await feedback?.resolveMatching(saved.origin,{issue:'login_expired'});
        return reply(response, 200, { session: saved }, cors);
      }
      if (browserSessions && browserWorkflows && url.pathname.startsWith('/api/browser-workflows/')) {
        if (!await browserSessions.authorized(request.headers.authorization)) {
          return reply(response, 403, { error: 'App pairing required' }, cors);
        }
        if (request.method === 'POST' && url.pathname === '/api/browser-workflows/jobs' && !origin) {
          const body = await readJson(request);
          return reply(response, 202, { job: browserWorkflows.start(body.workflowId) });
        }
        if (request.method === 'GET' && url.pathname === '/api/browser-workflows/next' && (!origin || isExtensionRequest)) {
          return reply(response, 200, { job: browserWorkflows.next() }, cors);
        }
        const progressMatch = url.pathname.match(/^\/api\/browser-workflows\/jobs\/([0-9a-f-]{36})\/progress$/);
        if (request.method === 'POST' && progressMatch && (!origin || isExtensionRequest)) {
          const body = await readJson(request);
          return reply(response, 200, { job: browserWorkflows.progress(progressMatch[1], body.phase) }, cors);
        }
        const resultMatch = url.pathname.match(/^\/api\/browser-workflows\/jobs\/([0-9a-f-]{36})\/result$/);
        if (request.method === 'POST' && resultMatch && (!origin || isExtensionRequest || allowedOrigins.has(origin))) {
          return reply(response, 200, { job: browserWorkflows.complete(resultMatch[1], await readJson(request)) }, cors);
        }
        const statusMatch = url.pathname.match(/^\/api\/browser-workflows\/jobs\/([0-9a-f-]{36})$/);
        if (request.method === 'GET' && statusMatch && !origin) {
          return reply(response, 200, { job: browserWorkflows.get(statusMatch[1]) });
        }
      }

      if (browserSessions && browserWorkflows && teachings && url.pathname.startsWith('/api/teachings')) {
        if (!await browserSessions.authorized(request.headers.authorization)) return reply(response, 403, { error: 'App pairing required' }, cors);
        if(request.method==='POST'&&url.pathname==='/api/teachings/infer')return reply(response,200,{inference:await teachings.infer(await readJson(request))},cors);
        if (request.method === 'GET' && url.pathname === '/api/teachings') return reply(response, 200, { teachings: (await teachings.list()).map(item=>({...item,...(item.test?{test:{state:item.test.state}}:{})})) }, cors);
        if (request.method === 'POST' && url.pathname === '/api/teachings' && isExtensionRequest) {
          const body=await readJson(request);if(mcps){let mcp=body.mcpId?await mcps.find(body.mcpId):await mcps.forOrigin(body.origin);if(!mcp&&!body.mcpId)mcp=await mcps.create({origin:body.origin});if(!mcp||mcp.origin!==body.origin)throw new Error('Invalid recording MCP');body.mcpId=mcp.id;}
          return reply(response, 201, { teaching: await teachings.create(body) }, cors);
        }
        const match = url.pathname.match(/^\/api\/teachings\/([0-9a-f-]{36})(?:\/(generate|test|save|archive|restore|recipe|build))?$/);
        if (match) {
          const [, id, action] = match;
          if (request.method === 'GET' && !action) {
            if(headless){const teaching=await teachings.get(id),job=headless.forTeaching(id);if(builder&&['refining','testing'].includes(teaching.build?.state)&&!builder.isActive(id))teaching.build={...teaching.build,state:'interrupted',message:'Continue preparing this tool.'};return reply(response,200,{teaching,testJob:job?.revision===(teaching.revision??0)?job:null},cors);}
            const jobId = testJobs.get(id);
            let testJob = null;
            if (jobId) {
              testJob = browserWorkflows.get(jobId);
              if (['completed', 'timed_out'].includes(testJob.state)) {
                await teachings.tested(id, testJob.result ?? { state: 'timed_out' }, testJob);
                testJobs.delete(id);
              }
            }
            return reply(response, 200, { teaching: await teachings.get(id), testJob }, cors);
          }
          if(request.method==='POST'&&action==='build'&&builder){const build=await builder.start(id,await readJson(request).catch(()=>({})));return reply(response,202,{build,teaching:await teachings.get(id)},cors);}
          if(request.method==='POST'&&action==='recipe')return reply(response,200,{teaching:await teachings.update(id,await readJson(request))},cors);
          if (request.method === 'POST' && action === 'generate') return reply(response, 200, { teaching: await teachings.generate(id) }, cors);
          if (request.method === 'POST' && action === 'test') {
            if(headless){const body=await readJson(request).catch(()=>({}));return reply(response,202,{job:await headless.start(id,body.arguments??{},true)},cors);}
            let item = await teachings.get(id);
            if (item.state !== 'draft' && item.state !== 'tested') throw new Error('Draft not ready');
            const existingId = testJobs.get(id);
            if (existingId) {
              const existing = browserWorkflows.get(existingId);
              if (['queued', 'running'].includes(existing.state)) return reply(response, 200, { job: existing }, cors);
            }
            item = await teachings.prepareTest(id);
            browserWorkflows.register(item.workflow);
            const job = browserWorkflows.start(item.workflow.id);
            testJobs.set(id, job.id);
            return reply(response, 202, { job }, cors);
          }
          if (request.method === 'POST' && action === 'save') return reply(response, 200, { teaching: await teachings.publish(id, workflowDirectory) }, cors);
          if (request.method === 'POST' && (action === 'archive' || action === 'restore')) return reply(response, 200, { teaching: await teachings.archive(id, action === 'archive') }, cors);
        }
      }

      const match = url.pathname.match(/^\/api\/connections\/(vestiaire|vinted)\/(connect|save|verify|verify\/confirm|verify\/reject|disconnect|cancel)$/);
      if (!manager || request.method !== 'POST' || !match) {
        return reply(response, 404, { error: 'Not found' });
      }
      const [, platform, action] = match;
      const operation = {
        connect: () => manager.connect(platform),
        save: () => manager.saveLogin(platform),
        verify: () => manager.openVerification(platform),
        'verify/confirm': () => manager.finishVerification(platform, true),
        'verify/reject': () => manager.finishVerification(platform, false),
        disconnect: () => manager.disconnect(platform),
        cancel: () => manager.cancel(platform),
      }[action];
      return reply(response, 200, { connection: await operation() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      const status = /Snapshot too large/.test(message) ? 413 : /Invalid|HTTPS required|Unexpected token|Unknown browser workflow|Missing tool argument|Unknown tool argument|Choose what the agent should read/.test(message) ? 400 : /BROWSERBASE_API_KEY/.test(message) ? 503 : /No login window|No saved session|No verification window|Unsupported marketplace|Finish the open|not running|Draft not ready|Test the workflow|Teaching already saved/.test(message) ? 409 : 500;
      return reply(response, status, { error: message }, cors);
    }
  });
}
