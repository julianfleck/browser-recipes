import assert from 'node:assert/strict';
import test from 'node:test';

test('discard clears an unfinished recording and tells its tab to close the overlay', async () => {
  const originalChrome = globalThis.chrome;
  const listeners = [];
  const messages = [];
  const data = { activeRecording: { tabId: 12, origin: 'https://example.org', state: 'review', events: [] } };
  globalThis.chrome = {
    storage: { local: {
      get(key, done) { done({ [key]: data[key] }); },
      set(value, done) { Object.assign(data, value); done(); },
      remove(key, done) { delete data[key]; done(); },
    } },
    tabs: { sendMessage(tabId, message, done) { messages.push({ tabId, message }); done(); }, onUpdated: { addListener() {} } },
    runtime: { lastError: null, onMessage: { addListener(listener) { listeners.push(listener); } }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
  };
  try {
    await import('../extension/background.js?recorder-discard-test');
    const result = await new Promise(resolve => listeners[1]({ type: 'recorder:discard' }, {}, resolve));
    assert.deepEqual(result, { ok: true });
    assert.equal(data.activeRecording, undefined);
    assert.deepEqual(messages, [{ tabId: 12, message: { type: 'recorder:discarded' } }]);
  } finally { globalThis.chrome = originalChrome; }
});

test('review from the popup expands the original page recorder',async()=>{
 const originalChrome=globalThis.chrome;const listeners=[],messages=[];
 const data={activeRecording:{tabId:12,origin:'https://example.org',state:'recording',events:[]}};
 globalThis.chrome={storage:{local:{get(key,done){done({[key]:data[key]});},set(value,done){Object.assign(data,value);done();}}},tabs:{sendMessage(tabId,message,done){messages.push({tabId,message});done();},onUpdated:{addListener(){}}},runtime:{lastError:null,onMessage:{addListener(listener){listeners.push(listener);}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}}};
 try{
  await import('../extension/background.js?popup-review-test');
  const result=await new Promise(resolve=>listeners[1]({type:'recorder:finish'},{},resolve));
  assert.equal(result.recording.state,'review');
  assert.deepEqual(messages,[{tabId:12,message:{type:'recorder:state',state:'review'}}]);
 }finally{globalThis.chrome=originalChrome;}
});
