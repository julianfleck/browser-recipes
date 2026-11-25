import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TeachingStore, validateRecording, compileReadDraft } from '../src/teaching-store.js';
import { createOpenRouterTeacher } from '../src/openrouter-teacher.js';

const recording = {
  origin: 'https://example.org', title: 'Read status', description: 'Read the current status',
  events: [
    { type: 'navigation', path: '/account', query: 'SECRET' },
    { type: 'click', path: '/account', selector: 'a[data-testid="status"]', value: 'SECRET' },
    { type: 'output', path: '/account', selector: '[data-testid="result"]', text: 'SECRET' },
  ],
};
const choice = { path: '/account', signedInSelector: 'a[data-testid="status"]', readySelector: '[data-testid="result"]', outputSelector: '[data-testid="result"]' };

test('recording drops page values and model may select only observed elements', () => {
  const clean = validateRecording(recording);
  assert.equal(JSON.stringify(clean).includes('SECRET'), false);
  const workflow = compileReadDraft(clean, choice);
  assert.equal(workflow.id, 'example_org.read_status');
  assert.equal(workflow.extract[0].field, 'result');
  assert.throws(() => compileReadDraft(clean, { ...choice, outputSelector: '#invented' }), /unobserved/);
  assert.throws(() => validateRecording({ ...recording, events: recording.events.slice(0, 2) }), /Choose what the agent should read/);
});

test('ordinary filled values survive recording but stay out of the model request', async () => {
  const filled = validateRecording({ ...recording, events: [
    { type: 'navigation', path: '/account?q=hidden-route-query' },
    { type: 'input', path: '/account', selector: 'input[name="query"]', inputKind: 'text', value: 'vintage jacket' },
    { type: 'input', path: '/account', selector: 'input[name="password"]', inputKind: 'text', redacted: true },
    { type: 'output', mode: 'page', path: '/account', selector: 'main' },
  ] });
  assert.equal(filled.events[1].value, 'vintage jacket');
  assert.equal(filled.events[2].value, undefined);
  const workflow = compileReadDraft(filled, { path: '/account', signedInSelector: 'main', readySelector: 'main', outputSelector: 'main' });
  assert.deepEqual(workflow.fill, [{ selector: 'input[name="query"]', value: 'vintage jacket', inputKind: 'text' }]);
  let modelBody;
  const teacher = createOpenRouterTeacher({ key: 'test-key', model: 'test/model', fetcher: async (_url, options) => {
    modelBody = options.body;
    return { ok: true, async json() { return { choices: [{ message: { content: JSON.stringify({ path: '/account', signedInSelector: 'main', readySelector: 'main', outputSelector: 'main' }) } }] }; } };
  } });
  await teacher(filled);
  assert.equal(modelBody.includes('vintage jacket'), false);
  assert.equal(modelBody.includes('hidden-route-query'), false);
});

test('a recorded page or repeated list compiles to the appropriate read recipe', () => {
  const page = validateRecording({ ...recording, events: [
    { type: 'navigation', path: '/account' },
    { type: 'output', mode: 'page', path: '/account', selector: 'main' },
  ] });
  const pageRecipe = compileReadDraft(page, { path: '/account', signedInSelector: 'main', readySelector: 'main', outputSelector: 'main' });
  assert.equal(pageRecipe.extract[0].pick, 'first');
  assert.deepEqual(pageRecipe.checks, []);
  const list = validateRecording({ ...recording, events: [
    { type: 'navigation', path: '/account' },
    { type: 'output', mode: 'list', path: '/account', selector: 'main > article' },
  ] });
  const listRecipe = compileReadDraft(list, { path: '/account', signedInSelector: 'main > article', readySelector: 'main > article', outputSelector: 'main > article' });
  assert.equal(listRecipe.extract[0].pick, 'all');
  assert.equal(listRecipe.extract[0].maxItems, 100);
});

test('teaching remains a draft until a browser test succeeds, then saves as a recipe', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'teaching-test-'));
  try {
    const store = new TeachingStore(path.join(root, 'teachings'), async () => choice);
    const item = await store.create(recording);
    assert.equal(item.state, 'draft');
    await assert.rejects(store.publish(item.id, path.join(root, 'workflows')), /Test the workflow/);
    const failed = await store.tested(item.id, { state: 'ambiguous_result' });
    assert.equal(failed.state, 'draft');
    const passed = await store.tested(item.id, { state: 'found', result: 'Active' }, {
      id: 'run-1', state: 'completed', phase: 'completed', createdAt: 1000, claimedAt: 1100, finishedAt: 2500,
      events: [{ phase: 'queued', at: 1000 }, { phase: 'completed', at: 2500 }],
    });
    assert.equal(passed.state, 'tested');
    assert.equal((await store.get(item.id)).testRun.events.at(-1).phase, 'completed');
    const saved = await store.publish(item.id, path.join(root, 'workflows'));
    assert.equal(saved.state, 'saved');
    const file = JSON.parse(await readFile(path.join(root, 'workflows', 'example_org.read_status.json'), 'utf8'));
    assert.equal(file.origin, recording.origin);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('OpenRouter teacher requests structured output and does not require a key in the extension', async () => {
  let body;
  const teacher = createOpenRouterTeacher({ key: 'test-key', model: 'test/model', fetcher: async (_url, options) => {
    body = JSON.parse(options.body);
    assert.equal(options.headers.authorization, 'Bearer test-key');
    return { ok: true, async json() { return { choices: [{ message: { content: JSON.stringify(choice) } }] }; } };
  } });
  assert.deepEqual(await teacher(validateRecording(recording)), choice);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.provider.require_parameters, true);
});

test('OpenRouter teacher falls back to Kimi K2.5 after a timeout', async () => {
  const models = [];
  const teacher = createOpenRouterTeacher({ key: 'test-key', model: 'moonshotai/kimi-k3.1-pro', fetcher: async (_url, options) => {
    models.push(JSON.parse(options.body).model);
    if (models.length === 1) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    return { ok: true, async json() { return { choices: [{ message: { content: JSON.stringify(choice) } }] }; } };
  } });
  assert.deepEqual(await teacher(validateRecording(recording)), choice);
  assert.deepEqual(models, ['moonshotai/kimi-k3.1-pro', 'moonshotai/kimi-k2.5']);
});

test('readiness is anchored to the chosen result rather than an earlier transient control',()=>{
 const clean=validateRecording({...recording,events:[{type:'click',path:'/account',selector:'#temporary-menu'},{type:'output',path:'/account',mode:'one',selector:'#result'}]});
 const draft=compileReadDraft(clean,{path:'/account',signedInSelector:'#temporary-menu',readySelector:'#temporary-menu',outputSelector:'#result'});
 assert.equal(draft.readySelector,'#result');
});

test('testing an existing draft repairs only its readiness anchor without another model request',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'teaching-ready-'));
 try{
  let generations=0;
  const store=new TeachingStore(root,async()=>{generations++;return choice;});
  const item=await store.create(recording);
  item.workflow={...compileReadDraft(validateRecording(recording),choice),readySelector:'a[data-testid="status"]'};await store.save(item);
  assert.equal(typeof store.prepareTest,'function');
  const prepared=await store.prepareTest(item.id);
  assert.equal(prepared.workflow.readySelector,'[data-testid="result"]');
  assert.equal(prepared.workflow.id,item.workflow.id);
  assert.equal(generations,0);
  assert.equal((await store.get(item.id)).workflow.readySelector,'[data-testid="result"]');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('editing an approved recipe invalidates publication and its last test',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'macro-revision-'));try{
  const store=new TeachingStore(root,async()=>({}));let item=await store.create(recording);
  await store.tested(item.id,{state:'found',result:'Example'});await store.publish(item.id,path.join(root,'published'));
  item=await store.update(item.id,{...item.workflow,description:'Updated recipe',allowWrites:true});
  assert.equal(item.state,'draft');assert.equal(item.revision,1);assert.equal(item.test,undefined);
  await assert.rejects(store.publish(item.id,path.join(root,'published')),/Test the workflow/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('run logs survive reopening the teaching store and legacy failures explain missing diagnostics',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'teaching-logs-'));
 try{
  const store=new TeachingStore(dir),item=await store.create(recording);
  await store.tested(item.id,{state:'backend_run_failed'},{id:'run',state:'completed',phase:'completed',failedPhase:'replaying',stepIndex:1,createdAt:1000,finishedAt:1500,events:[{phase:'replaying',stepIndex:1,action:'input',at:1200}],logText:'Bridge backend run\nERROR replaying · step 2 · selector matched two elements'});
  const reopened=await new TeachingStore(dir).get(item.id);assert.match(reopened.testRun.logText,/selector matched two elements/);assert.equal(reopened.testRun.stepIndex,1);
  delete reopened.testRun.logText;await store.save(reopened);
  const legacy=await store.get(item.id);assert.match(legacy.testRun.logText,/step 2/);assert.match(legacy.testRun.logText,/Run again to capture it/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('model-generated commands remain unique when an existing draft is refined',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'teaching-command-'));try{const generator=async()=>({title:'Search products',command:'search_products',description:'Search products'}),store=new TeachingStore(dir,generator);const one=await store.create({...recording,command:'search_products'});const two=await store.create({...recording,command:'search_products'});const generated=await store.generate(two.id);assert.notEqual(generated.workflow.id,one.workflow.id);assert.equal(generated.workflow.id.split('.')[1],'search_products_2');}finally{await rm(dir,{recursive:true,force:true});}});

test('polling never reads a partially written recipe',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'teaching-atomic-'));try{const store=new TeachingStore(dir),item=await store.create(recording);await Promise.all([...(Array.from({length:50},(_,index)=>store.save({...item,revision:index}))),...(Array.from({length:100},()=>store.get(item.id)))]);assert.equal((await store.get(item.id)).id,item.id);}finally{await rm(dir,{recursive:true,force:true});}});
