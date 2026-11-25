import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReadWorkflow, runBrowserWorkflow } from '../extension/workflows.js';

const workflow = {
  schemaVersion: 1,
  id: 'other.latest_notice',
  provider: 'other',
  origin: 'https://other.example',
  effect: 'read',
  signedInSelector: '[data-account]',
  path: '/messages',
  readySelector: '[data-messages]',
  checks: [{ selector: '[data-message]', equals: 1, otherwise: 'ambiguous' }],
  extract: [{ field: 'text', selector: '[data-message]', pick: 'last', maxLength: 1000 }],
};

test('generic read evaluator extracts a named field and refuses ambiguous layouts', () => {
  const previousDocument = globalThis.document;
  const previousLocation = globalThis.location;
  try {
    globalThis.location = { origin: workflow.origin, pathname: '/messages' };
    let messageCount = 1;
    globalThis.document = {
      querySelector(selector) { return selector === '[data-messages]' ? {} : null; },
      querySelectorAll(selector) { return selector === '[data-message]' ? Array.from({ length: messageCount }, () => ({ innerText: ' Hello ' })) : []; },
    };
    assert.deepEqual(evaluateReadWorkflow(workflow), { state: 'found', text: 'Hello' });
    messageCount = 2;
    assert.deepEqual(evaluateReadWorkflow(workflow), { state: 'ambiguous' });
  } finally {
    globalThis.document = previousDocument;
    globalThis.location = previousLocation;
  }
});

test('a taught list returns bounded text for each repeated item', () => {
  const previousDocument = globalThis.document;
  const previousLocation = globalThis.location;
  try {
    globalThis.location = { origin: workflow.origin, pathname: '/messages' };
    globalThis.document = {
      querySelector: () => ({}),
      querySelectorAll: () => [{ innerText: ' First ' }, { innerText: ' Second ' }],
    };
    const list = { ...workflow, checks: [], extract: [{ field: 'result', selector: 'article', pick: 'all', maxItems: 10, maxLength: 100 }] };
    assert.deepEqual(evaluateReadWorkflow(list), { state: 'found', result: ['First', 'Second'] });
  } finally {
    globalThis.document = previousDocument;
    globalThis.location = previousLocation;
  }
});

test('generic runner uses the supplied provider workflow in an existing tab', async () => {
  const calls = [];
  const phases = [];
  const api = { tabs: {}, scripting: {} };
  const call = async (_owner, method, ...args) => {
    calls.push(method);
    if (method === 'query') {
      assert.equal(args[0].url, 'https://other.example/*');
      return [{ id: 42, url: 'https://other.example/' }];
    }
    if (method === 'executeScript' && args[0].func.name === 'hasSignedInSelector') return [{ result: true }];
    if (method === 'update') {
      assert.equal(args[0], 42);
      assert.equal(args[1].url, 'https://other.example/messages');
      return {};
    }
    if (method === 'executeScript' && args[0].func.name === 'evaluateReadWorkflow') return [{ result: { state: 'found', text: 'Hello' } }];
    throw new Error('Unexpected browser call');
  };
  const result = await runBrowserWorkflow({ workflowId: workflow.id, sessionOrigin: workflow.origin, workflow }, api, call, async phase => { phases.push(phase); });
  assert.deepEqual(result, { state: 'found', text: 'Hello' });
  assert.deepEqual(calls, ['query', 'update', 'executeScript']);
  assert.deepEqual(phases, ['finding_tab', 'opening_page', 'preparing_page', 'reading_page']);
  assert.deepEqual(await runBrowserWorkflow({ workflowId: 'other.another', sessionOrigin: workflow.origin, workflow }, api, call), { state: 'unsupported_workflow' });
});

test('generated workflow can use a same-origin tab when the teaching sign-in selector is absent', async () => {
  const calls = [];
  const api = { tabs: {}, scripting: {} };
  const call = async (_owner, method, ...args) => {
    calls.push(method);
    if (method === 'query') return [{ id: 7, url: 'https://other.example/member/inbox' }];
    if (method === 'executeScript' && args[0].func.name === 'hasSignedInSelector') return [{ result: false }];
    if (method === 'update') {
      assert.equal(args[0], 7);
      assert.equal(args[1].url, 'https://other.example/messages');
      return {};
    }
    if (method === 'executeScript' && args[0].func.name === 'evaluateReadWorkflow') return [{ result: { state: 'found', text: 'Hello' } }];
    throw new Error('Unexpected browser call');
  };
  const result = await runBrowserWorkflow({ workflowId: workflow.id, sessionOrigin: workflow.origin, workflow }, api, call);
  assert.deepEqual(result, { state: 'found', text: 'Hello' });
  assert.deepEqual(calls, ['query', 'update', 'executeScript']);
});

test('runner distinguishes missing site access from a missing tab', async () => {
  const api = { permissions: { contains() {} }, tabs: {} };
  const calls = [];
  const result = await runBrowserWorkflow({ workflowId: workflow.id, sessionOrigin: workflow.origin, workflow }, api, async (_owner, method) => {
    calls.push(method);
    return false;
  });
  assert.deepEqual(result, { state: 'site_permission_required' });
  assert.deepEqual(calls, ['contains']);
});

test('runner fills a recorded field before reading the page', async () => {
  const calls = [];
  const withFill = { ...workflow, fill: [{ selector: 'input[name="query"]', inputKind: 'text', value: 'vintage jacket' }] };
  const api = { tabs: {}, scripting: {} };
  const call = async (_owner, method, ...args) => {
    calls.push(method === 'executeScript' ? args[0].func.name : method);
    if (method === 'query') return [{ id: 42, url: 'https://other.example/messages' }];
    if (args[0]?.func?.name === 'hasSignedInSelector') return [{ result: true }];
    if (args[0]?.func?.name === 'applyFillSteps') return [{ result: { state: 'filled' } }];
    if (args[0]?.func?.name === 'evaluateReadWorkflow') return [{ result: { state: 'found', text: 'Hello' } }];
    throw new Error('Unexpected browser call');
  };
  const result = await runBrowserWorkflow({ workflowId: withFill.id, sessionOrigin: withFill.origin, workflow: withFill }, api, call);
  assert.deepEqual(result, { state: 'found', text: 'Hello' });
  assert.deepEqual(calls, ['query', 'applyFillSteps', 'evaluateReadWorkflow']);
});

test('runner chooses the recorded page before probing unrelated same-origin tabs', async () => {
  const scripts = [], navigations = [];
  const api = { tabs: {}, scripting: {} };
  const call = async (_owner, method, ...args) => {
    if (method === 'query') return [{ id: 1, url: 'https://other.example/old', status: 'loading' }, { id: 2, url: 'https://other.example/messages', active: true }];
    if (method === 'update') { navigations.push(args); return {}; }
    if (method === 'executeScript') {
      scripts.push(args[0]);
      return [{ result: args[0].func.name === 'hasSignedInSelector' ? false : {state:'found',text:'Hello'} }];
    }
  };
  assert.deepEqual(await runBrowserWorkflow({workflowId:workflow.id,sessionOrigin:workflow.origin,workflow},api,call),{state:'found',text:'Hello'});
  assert.equal(scripts[0].target.tabId,2);
  assert.equal(scripts[0].injectImmediately,true);
  assert.equal(navigations.length,0);
});

test('the read evaluator does not mistake a prefix-sibling URL for the recorded page', () => {
  const previousDocument=globalThis.document,previousLocation=globalThis.location;
  try {
    globalThis.location={origin:workflow.origin,pathname:'/messages-archive'};
    globalThis.document={querySelector:()=>({}),querySelectorAll:()=>[{innerText:'Wrong page'}]};
    assert.deepEqual(evaluateReadWorkflow(workflow),{state:'loading'});
  } finally {globalThis.document=previousDocument;globalThis.location=previousLocation;}
});

test('a hung script call terminates without more browser actions', async () => {
  const calls=[];
  const api={tabs:{},scripting:{}};
  const call=async(_owner,method,...args)=>{
    calls.push(method);
    if(method==='query')return[{id:2,url:'https://other.example/messages'}];
    return new Promise(()=>{});
  };
  const result=await runBrowserWorkflow({workflowId:workflow.id,sessionOrigin:workflow.origin,workflow},api,call,async()=>{}, {callTimeoutMs:15,timeoutMs:100});
  assert.deepEqual(result,{state:'browser_read_failed',reason:'browser_api_timeout'});
  assert.deepEqual(calls,['query','executeScript']);
});

test('a test opens the recorded site in the same browser profile when no tab exists', async () => {
 const calls=[];
 const api={tabs:{},scripting:{}};
 const call=async(_owner,method,...args)=>{
  calls.push(method);
  if(method==='query')return[];
  if(method==='create'){assert.deepEqual(args[0],{url:'https://other.example/messages',active:false});return{id:9,pendingUrl:'https://other.example/messages'};}
  if(method==='get')return{id:9,url:'https://other.example/messages',status:'loading'};
  if(method==='executeScript'){assert.equal(args[0].target.tabId,9);return[{result:{state:'found',text:'Hello'}}];}
 };
 assert.deepEqual(await runBrowserWorkflow({workflowId:workflow.id,sessionOrigin:workflow.origin,workflow},api,call),{state:'found',text:'Hello'});
 assert.deepEqual(calls,['query','create','get','executeScript']);
});
