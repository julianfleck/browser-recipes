const api = globalThis.chrome ?? globalThis.browser;
const server = 'http://127.0.0.1:8787';
const recordingKey = 'activeRecording';

async function recording() { return (await call(api.storage.local, 'get', recordingKey))[recordingKey] ?? null; }
async function putRecording(value) { await call(api.storage.local, 'set', { [recordingKey]: value }); return value; }
function publicRecording(value) { return value ? { tabId: value.tabId, origin: value.origin,goal:value.goal, mcpId:value.mcpId, mcpName:value.mcpName, state: value.state, startedAt: value.startedAt, events: value.events } : null; }
async function captureSite(tabId,origin,pairingToken){
 const host=new URL(origin).hostname;
 const cookies=(await call(api.cookies,'getAll',{})).filter(cookie=>{const domain=cookie.domain.replace(/^\./,'').toLowerCase();return host===domain||host.endsWith(`.${domain}`);});
 const captured=await call(api.scripting,'executeScript',{target:{tabId},injectImmediately:true,func:()=>({origin:location.origin,localStorage:Object.fromEntries(Object.entries(localStorage)),sessionStorage:Object.fromEntries(Object.entries(sessionStorage))})});
 const snapshot=captured[0]?.result;if(snapshot?.origin!==origin)throw new Error('The page changed sites before its login could be saved.');
 const response=await fetch(`${server}/api/browser-sessions`,{method:'POST',headers:{authorization:`Bearer ${pairingToken}`,'content-type':'application/json'},body:JSON.stringify({...snapshot,cookies}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Could not save the website login. Your recording is still available.');return response.json();
}
async function injectRecorder(tabId) {
  await call(api.scripting, 'executeScript', { target: { tabId }, world:'MAIN', files:['clipboard-hook.js'], injectImmediately:true });
  await call(api.scripting, 'executeScript', { target: { tabId }, files: ['recorder.js'], injectImmediately:true });
}
async function handleRecorder(message, sender) {
  const current = await recording();
  if (message.type === 'recorder:status') return { recording: publicRecording(current), lastTeaching: (await call(api.storage.local, 'get', 'lastTeaching')).lastTeaching ?? null };
  if (message.type === 'recorder:start') {
    if (current) throw new Error('Finish or discard the current recording first.');
    const tab = await call(api.tabs, 'get', message.tabId);
    const url = new URL(tab.url);
    if (url.protocol !== 'https:') throw new Error('Open an HTTPS website to teach an action.');
    let target=null;
    if(message.mcpId){const {pairingToken}=await call(api.storage.local,'get','pairingToken');const response=await fetch(`${server}/api/mcps`,{headers:{authorization:`Bearer ${pairingToken}`}});const {mcps}=await response.json();target=mcps?.find(item=>item.id===message.mcpId&&item.origin===url.origin);if(!target)throw new Error('This MCP does not match the current website.');}
    if(message.goal!==undefined&&(typeof message.goal!=='string'||message.goal.length>1500))throw Error('Describe what the tool should do.');
    const value = await putRecording({ tabId: tab.id, origin: url.origin,goal:message.goal?.trim()||'', ...(target?{mcpId:target.id,mcpName:target.name}:{}), state: 'recording', startedAt: Date.now(), events: [{ type: 'navigation', path: `${url.pathname}${url.search}` }] });
    await injectRecorder(tab.id);
    return { recording: publicRecording(value) };
  }
  if(message.type==='recorder:save-login'){
    const tab=await call(api.tabs,'get',message.tabId),url=new URL(tab.url);if(url.protocol!=='https:')throw new Error('Open an HTTPS website first.');
    const {pairingToken}=await call(api.storage.local,'get','pairingToken');if(!pairingToken)throw new Error('Open Bridge to pair the extension.');
    return captureSite(tab.id,url.origin,pairingToken);
  }
  if(message.type==='recorder:tool'){
    const recent=(await call(api.storage.local,'get','lastTeaching')).lastTeaching;
    if(!recent||message.id!==recent.id||!['status','test','save','recipe','build'].includes(message.action))throw new Error('Unknown recent tool');
    const {pairingToken}=await call(api.storage.local,'get','pairingToken');
    const response=await fetch(`${server}/api/teachings/${recent.id}${message.action==='status'?'':`/${message.action}`}`,{method:message.action==='status'?'GET':'POST',headers:{authorization:`Bearer ${pairingToken}`,'content-type':'application/json'},...(message.action==='recipe'?{body:JSON.stringify(message.recipe)}:message.action==='build'?{body:JSON.stringify({goal:message.goal,answers:message.answers})}:{}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update tool');
    if(data.teaching){recent.state=data.teaching.state;recent.title=data.teaching.recording.title;await call(api.storage.local,'set',{lastTeaching:recent});}
    return data;
  }
  if (!current) throw new Error('No recording is active.');
  if(message.type==='recorder:infer'){
    const {pairingToken}=await call(api.storage.local,'get','pairingToken');
    if(!pairingToken)throw new Error('Open Bridge once to pair the extension.');
    const events=message.output?[...current.events.filter(event=>event.type!=='output'),message.output]:current.events;
    const response=await fetch(`${server}/api/teachings/infer`,{method:'POST',headers:{authorization:`Bearer ${pairingToken}`,'content-type':'application/json'},body:JSON.stringify({origin:current.origin,title:'Recorded action',description:'',events}),signal:AbortSignal.timeout(100000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not suggest a name');return data;
  }
  if (message.type === 'recorder:discard') {
    await call(api.storage.local, 'remove', recordingKey);
    await call(api.tabs, 'sendMessage', current.tabId, { type: 'recorder:discarded' }).catch(() => {});
    return { ok: true };
  }
  if (message.type === 'recorder:toggle') {
    if (current.state === 'review') throw new Error('This recording is ready for review.');
    current.state = current.state === 'recording' ? 'paused' : 'recording';
    await putRecording(current);
    await call(api.tabs, 'sendMessage', current.tabId, { type: 'recorder:state', state: current.state, count: current.events.length }).catch(() => {});
    return { recording: publicRecording(current) };
  }
  if (message.type === 'recorder:finish') {
    current.state = 'review';
    await putRecording(current);
    if (!sender.tab) await call(api.tabs, 'sendMessage', current.tabId, { type: 'recorder:state', state: 'review' }).catch(() => {});
    return { recording: publicRecording(current) };
  }
  if (message.type === 'recorder:event') {
    if (sender.tab?.id !== current.tabId || (current.state !== 'recording' && !(current.state === 'review' && message.event?.type === 'output'))) throw new Error('Recording is paused or this tab is not being recorded.');
    const tab = await call(api.tabs, 'get', current.tabId);
    if (new URL(tab.url).origin !== current.origin) throw new Error('The tab changed sites.');
    const event = message.event;
    if (!event || !['click', 'input', 'output', 'copy', 'key'].includes(event.type) || typeof event.selector !== 'string' || event.selector.length > 500 ||
        typeof event.path !== 'string' || !event.path.startsWith('/') || event.path.startsWith('//') || event.path.includes('\\') || event.path.length > 500) throw new Error('Invalid recording step');
    if (current.events.length >= 100 && event.type !== 'output') throw new Error('Recording reached 100 steps. Finish this workflow.');
    if (event.type === 'output' && !['page', 'one', 'list','selection'].includes(event.mode ?? 'one')) throw new Error('Invalid output mode');
    if (event.type === 'input' && (
      !['text', 'select', 'checkbox', 'contenteditable'].includes(event.inputKind) ||
      event.redacted != null && event.redacted !== true ||
      event.redacted && event.value !== undefined ||
      event.value !== undefined && (event.inputKind === 'checkbox' ? typeof event.value !== 'boolean' : typeof event.value !== 'string' || event.value.length > 500)
    )) throw new Error('Invalid recorded input');
    if(event.type==='output'&&event.mode==='selection'&&(!Array.isArray(event.targets)||event.targets.length<1||event.targets.length>20||event.targets.some(target=>!target||typeof target.selector!=='string'||target.selector.length>500||!['text','image','link','element'].includes(target.kind))))throw new Error('Invalid output selection');
    if(event.type==='output'&&event.mode==='selection'&&event.targets.some(target=>target.collection&&(typeof target.collection.selector!=='string'||!target.collection.selector||target.collection.selector.length>500||!Number.isInteger(target.collection.index)||target.collection.index<0||target.collection.index>99)))throw new Error('Invalid output collection');
    if (event.type === 'output') current.events = current.events.filter(item => item.type !== 'output');
    if(event.type==='key'&&!['Enter','Tab','Escape','ArrowDown','ArrowUp','Space'].includes(event.key))throw new Error('Invalid recorded key');
    if(event.alternatives!==undefined&&(!Array.isArray(event.alternatives)||event.alternatives.length>8||event.alternatives.some(value=>typeof value!=='string'||!value||value.length>500)))throw Error('Invalid recorded alternatives');
    const saved = { ...(event.alternatives?{alternatives:event.alternatives}:{}),...(typeof event.label==='string'?{label:event.label.slice(0,120)}:{}),...(event.type==='key'?{key:event.key}:{}),...(event.type==='copy'?{...(event.clipboard?{clipboard:true}:{}),...(Number.isInteger(event.start)&&Number.isInteger(event.end)?{start:event.start,end:event.end}:{})}:{}),type: event.type, selector: event.selector, path: event.path,
      ...(event.type === 'output' ? { mode: event.mode ?? 'one',...(event.mode==='selection'?{targets:event.targets}: {}) } : {}),
      ...(event.type === 'input' ? { inputKind: event.inputKind, ...(event.redacted ? { redacted: true } : {}), ...(event.value !== undefined ? { value: event.value } : {}) } : {}) };
    if (event.type === 'input' && current.events.at(-1)?.type === 'input' && current.events.at(-1).selector === event.selector && current.events.at(-1).path === event.path) current.events[current.events.length - 1] = saved;
    else current.events.push(saved);
    await putRecording(current);
    return { count: current.events.length, events: current.events };
  }
  if (message.type === 'recorder:submit') {
    if (sender.tab?.id !== current.tabId || current.state !== 'review') throw new Error('Review the recording in its original tab.');
    const tab = await call(api.tabs, 'get', current.tabId);
    if (new URL(tab.url).origin !== current.origin) throw new Error('The tab changed sites.');
    const output = message.output;
    if ((!output && !current.events.some(event=>event.type==='copy')) || output && (output.type !== 'output' || !['page', 'one', 'list','selection'].includes(output.mode) ||
        typeof output.selector !== 'string' || !output.selector || output.selector.length > 500 ||
        typeof output.path !== 'string' || !output.path.startsWith('/') || output.path.startsWith('//') ||
        output.path.includes('\\') || output.path.length > 500 ||
        new URL(output.path, current.origin).origin !== current.origin)) throw new Error('Choose what the agent should read.');
    current.events = current.events.filter(item => item.type !== 'output');
    if(output)current.events.push({ type: 'output', mode: output.mode, selector: output.selector, path: output.path,...(output.mode==='selection'?{targets:output.targets}:{}) });
    if(Array.isArray(message.inputs))for(const input of message.inputs){const event=current.events[input.index];if(event?.type==='input'){event.binding=input.binding;event.variable=input.variable;}}
    await putRecording(current);
    const { pairingToken } = await call(api.storage.local, 'get', 'pairingToken');
    if (!pairingToken) throw new Error('Open the local app once to pair this extension.');
    await captureSite(current.tabId,current.origin,pairingToken);
    const response = await fetch(`${server}/api/teachings`, {
      method: 'POST', headers: { authorization: `Bearer ${pairingToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ origin: current.origin,goal:current.goal||message.goal||'', mcpId:current.mcpId, title: message.title, command:message.command||undefined, description: message.description, allowWrites:message.allowWrites===true, events: current.events }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Could not create a workflow draft.');
    await call(api.storage.local, 'set', { lastTeaching: { id: data.teaching.id, title: data.teaching.recording?.title??message.title, origin: current.origin, state: data.teaching.state ?? 'draft' } });
    await call(api.storage.local, 'remove', recordingKey);
    return data;
  }
  throw new Error('Unknown recorder action');
}

function call(owner, method, ...args) {
  return new Promise((resolve, reject) => {
    owner[method](...args, value => {
      const error = api.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    });
  });
}

async function poll(){return {ok:true,state:'backend_execution'};}

api.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'agent-session:health') { respond({ ok: true }); return false; }
  if (message?.type !== 'agent-session:poll-workflows') return false;
  poll().then(respond);
  return true;
});
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message?.type?.startsWith('recorder:')) return false;
  handleRecorder(message, sender).then(respond, error => respond({ error: error.message }));
  return true;
});
api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' && !changeInfo.url) return;
  const current = await recording();
  if (!current || current.tabId !== tabId) return;
  let url;
  try { url = new URL(changeInfo.url ?? tab.url); } catch { return; }
  if (url.origin !== current.origin) return;
  const last = current.events.at(-1);
  if (current.state === 'recording' && (last?.type !== 'navigation' || last.path !== `${url.pathname}${url.search}`)) {
    if (current.events.length >= 100) return;
    current.events.push({ type: 'navigation', path: `${url.pathname}${url.search}` });
    await putRecording(current);
  }
  if (changeInfo.status === 'complete') await injectRecorder(tabId).catch(() => {});
});
api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'agent-session:poll-workflows') poll();
});
api.runtime.onStartup.addListener(() => {
  api.alarms.create('agent-session:poll-workflows', { periodInMinutes: 0.5 });
  poll();
});
api.runtime.onInstalled.addListener(() => {
  api.alarms.create('agent-session:poll-workflows', { periodInMinutes: 0.5 });
  poll();
});
api.alarms.create('agent-session:poll-workflows', { periodInMinutes: 0.5 });
