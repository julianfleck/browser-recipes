import assert from 'node:assert/strict';
import test from 'node:test';

for (const mode of ['list','selection']) test(`submit saves the visible ${mode} target even when an earlier selection update was missed`, async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const listeners = [];
  const data = {
    pairingToken: 'paired',
    activeRecording: {
      tabId: 7, origin: 'https://example.org', state: 'review',
      events: [{ type: 'navigation', path: '/items' }],
    },
  };
  let posted;
  globalThis.chrome = {
    storage: { local: {
      get(key, done) { done({ [key]: data[key] }); },
      set(value, done) { Object.assign(data, value); done(); },
      remove(key, done) { delete data[key]; done(); },
    } },
    tabs: { get(_id, done) { done({ id: 7, url: 'https://example.org/items' }); }, onUpdated: { addListener() {} } },
    cookies:{getAll(_input,done){done([]);}},
    scripting: { executeScript(_input, done) { done([{result:{origin:'https://example.org',localStorage:{},sessionStorage:{}}}]); } },
    runtime: { lastError: null, onMessage: { addListener(listener) { listeners.push(listener); } }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
  };
  globalThis.fetch = async (_url, options) => {
    if(_url.endsWith('/api/browser-sessions'))return {ok:true,async json(){return {session:{origin:'https://example.org'}};}};
    posted = JSON.parse(options.body);
    return { ok: true, async json() { return { teaching: { id: 'draft-id' } }; } };
  };
  try {
    await import(`../extension/background.js?recorder-submit-${mode}-test`);
    const handler = listeners[1];
    const output = { type: 'output', mode, path: '/items', selector: 'main > article', ...(mode==='selection'?{targets:[{selector:'main > article',kind:'element',label:'Result 1'},{selector:'#photo',kind:'image',label:'Image 2'}]}:{}) };
    const result = await new Promise(resolve => { handler({ type: 'recorder:submit', title: 'Read items', description: '', output }, { tab: { id: 7 } }, resolve); });
    assert.equal(result.teaching.id, 'draft-id');
    assert.deepEqual(posted.events.at(-1), output);
    assert.equal(data.activeRecording, undefined);
    assert.equal(data.lastTeaching.id, 'draft-id');
    assert.equal(data.lastTeaching.origin, 'https://example.org');
    assert.equal(data.lastTeaching.title, 'Read items');
    assert.equal(data.lastTeaching.events, undefined);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});
