(() => {
  if (globalThis.__agentSessionRecorder) return;
  globalThis.__agentSessionRecorder = true;
  const api = globalThis.chrome ?? globalThis.browser;
  const host = document.createElement('div');
  host.id = 'agent-session-recorder';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  // Shadow-root palette mirrors product-theme.css; no page styles leak into the recorder.
  style.textContent = `
    :host { all: initial; position: fixed; z-index: 2147483647; top: 18px; right: 18px; color: #25272d; font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid #4b65b5; outline-offset: 3px; }
    .toolbar { display: flex; align-items: center; gap: 3px; width: max-content; margin-left: auto; padding: 5px; border: 1px solid #dce1e9; border-radius: 10px; background: #fff; box-shadow: 0 4px 20px #18202d14, 0 1px 3px #18202d08; }
    .tool { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 30px; height: 30px; padding: 0 8px; border: 0; border-radius: 5px; background: transparent; color: #626d7f; }
    .tool svg { width: 15px; height: 15px; }
    .tool.primary { background: #2d333e; color: #fff; padding: 0 10px; }
    .tool.close { min-width: 28px; width: 28px; padding: 0; color: #8a93a1; }
    .grab { cursor: grab; color: #a6aeba; letter-spacing: -2px; padding: 0 7px; user-select: none; touch-action: none; }
    .grab:active { cursor: grabbing; }
    .live { width: 6px; height: 6px; border-radius: 50%; background: #c77573; }
    .paused .live { background: #b38c4d; }
    .review .live { background: #6c85b1; }
    .count { padding: 0 8px 0 5px; border-right: 1px solid #e7e9ed; color: #687385; font-size: 11px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .panel { width: min(360px, calc(100vw - 24px)); max-height: calc(100dvh - 84px); overflow-y: auto; margin-top: 8px; padding: 22px; border: 1px solid #dfe4ec; border-radius: 12px; background: #fff; box-shadow: 0 12px 36px #18202d18, 0 2px 6px #18202d08; }
    h2 { margin: 0 0 8px; color: #25272d; font: 600 18px/1.3 -apple-system, BlinkMacSystemFont, sans-serif; letter-spacing: -.035em; }
    p { margin: 8px 0 0; color: #6b7483; line-height: 1.65; }
    .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 18px 0 14px; padding: 4px; border: 1px solid #e7e9ed; border-radius: 7px; background: #f7f8fa; }
    .choice { min-height: 32px; padding: 6px 4px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: #6a7483; font-size: 11px; font-weight: 500; line-height: 1.3; }
    .choice.active { border-color: #dce1e9; background: #fff; color: #3f536f; box-shadow: 0 1px 2px #18202d06; }
    .selection { padding: 12px; border: 1px solid #e7e9ed; border-radius: 6px; background: #fafbfc; color: #6e7a8e; font-size: 11px; overflow-wrap: anywhere; }
    .selection strong { color: #4b65b5; }
    details { margin-top: 16px; padding-top: 13px; border-top: 1px solid #e7e9ed; color: #747f90; font-size: 11px; }
    summary { cursor: pointer; color: #626f83; font-weight: 500; }
    ol { max-height: 140px; overflow: auto; padding-left: 20px; overflow-wrap: anywhere; }
    li { margin: 7px 0; }
    form { display: grid; gap: 7px; margin-top: 20px; }
    label { color: #505d71; font-size: 12px; font-weight: 500; }
    input, textarea { width: 100%; padding: 9px 10px; border: 1px solid #dce1e9; border-radius: 6px; background: #fff; color: #25272d; outline: none; }
    input:focus, textarea:focus { border-color: #94a5cf; box-shadow: 0 0 0 2px #4b65b50a; }
    input::placeholder, textarea::placeholder { color: #818b9b; }
    textarea { min-height: 76px; resize: vertical; }
    form label:not(:first-child) { margin-top: 7px; }
    .submit { min-height: 36px; margin-top: 8px; border: 0; border-radius: 6px; background: #2d333e; color: #fff; font-size: 12px; font-weight: 500; }
    .submit:disabled { opacity: .65; cursor: wait; }
    .privacy { color: #7b8696; font-size: 11px; }
    .error { padding: 10px 12px; border: 1px solid #efdcd7; border-radius: 6px; background: #fff7f5; color: #a15342; font-size: 12px; }
    a { color: #4b65b5; font-weight: 500; text-underline-offset: 3px; }
    @media (hover: hover) and (pointer: fine) { .tool:hover { background: #f0f2f6; color: #414d60; } .tool.primary:hover, .submit:hover { background: #454e5e; color: #fff; } .tool.close:hover { background: #fbefed; color: #aa6154; } .choice:hover { color: #3c506e; } }
    .panel { width: min(380px, calc(100vw - 24px)); padding: 22px; }
    .flow { display: flex; align-items: center; gap: 0; margin: 0 0 24px; padding: 0; list-style: none; }
    .flow li { display: flex; align-items: center; gap: 5px; margin: 0; color: #929aa7; font-size: 10px; white-space: nowrap; }
    .flow li + li::before { content: ''; width: 12px; height: 1px; margin: 0 7px; background: #e2e6ec; }
    .flow li > span { display: grid; place-items: center; width: 19px; height: 19px; border: 1px solid #e2e6ec; border-radius: 50%; background: #fff; font-size: 10px; }
    .flow strong { font-weight: 450; }.flow .current { color: #40546f; }.flow .current > span { border-color: #4b65b5; background: #4b65b5; color: #fff; }.flow .done { color: #6b8278; }.flow .done > span { border-color: #d6e5dc; background: #f3f8f5; }
    .scope-note { margin-top: 14px; padding: 10px 12px; border-radius: 6px; background: #f7f9fc; color: #78869a; font-size: 10px; line-height: 1.65; }
    .continue-link { display: flex; align-items: center; justify-content: center; min-height: 36px; margin-top: 22px; border-radius: 6px; background: #2d333e; color: #fff; text-decoration: none; font-size: 12px; }
    .submit:disabled { cursor: not-allowed; opacity: .5; }
    select{min-height:32px;border:1px solid #dce1e9;border-radius:5px;color:#40546f;background:#fff;max-width:100%;font:inherit;padding:5px;}
    .input-option{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0;}
    .full-button{width:100%;margin-top:12px;}
    .result-preview{max-height:240px;overflow:auto;overscroll-behavior:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#f7f8fa;border:1px solid #e7e9ed;border-radius:6px;color:#40546f;font:11px/1.65 ui-monospace,monospace;}
    .panel{overscroll-behavior:contain;}
    .write-rule{display:flex;align-items:flex-start;gap:8px;margin:9px 0;padding:10px;background:#f7f8fa;border-radius:5px;font-weight:400;line-height:1.5;}.write-rule input{width:14px;height:14px;flex:none;accent-color:#4b65b5;margin:2px 0 0;}
    .flow{max-height:none;overflow:visible;}
    .build-question{border:0;padding:0;margin:14px 0;display:grid;gap:7px;}.build-question legend{font-size:12px;color:#526b8e;margin-bottom:9px;}.build-question label{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid #dfe7f2;border-radius:6px;font-size:12px;}.build-question input{width:auto;}
    .run-logs{margin-top:14px;border:1px solid #e1e6ee;border-radius:7px;background:#fff;color:#52627b;font-size:12px;}.run-logs>summary{padding:10px 12px;cursor:pointer;font-weight:500;}.run-logs-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 10px 8px;font-size:11px;}.run-logs pre{margin:0;padding:12px;border-top:1px solid #e9edf3;background:#fafbfc;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;color:#4c5d77;user-select:text;}
    .selection-markers{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:-1;}.selection-box{position:fixed;border:2px solid #6285c9;background:#6285c912;border-radius:4px;pointer-events:none;}.selection-number{position:absolute;top:-1px;left:-1px;display:grid;place-items:center;min-width:22px;height:22px;border-radius:0 0 5px 0;background:#6285c9;color:white;font:bold 11px/1 system-ui;}.picked-results{display:grid;gap:5px;margin-top:10px;}.picked-results>div{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #e3e9f2;border-radius:5px;color:#74869e;font-size:11px;}.picked-results>div>span:first-child{display:grid;place-items:center;flex:none;width:18px;height:18px;background:#edf2fc;color:#6583ba;border-radius:4px;font-size:10px;}.picked-results strong{font-size:11px;font-weight:500;color:#556c8e;}.picked-results small{margin-left:auto;color:#9aa7b8;}.picked-results button{border:0;background:none;color:#9aa7b8;cursor:pointer;padding:0 3px;}.image-result{margin:12px 0;padding:10px;border:1px solid #e3e9f2;border-radius:6px;}.image-result img{display:block;max-width:100%;max-height:220px;object-fit:contain;margin-top:8px;}.image-result p{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;}.image-result strong{font-size:12px;color:#526b91;}.selection-action{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0;}.selection-action button{min-height:31px;}
  `;
  shadow.append(style);
  const root = document.createElement('div');
  shadow.append(root);
  document.documentElement.append(host);

  let mode = 'recording';
  let trace = [];
  let marking = '';
  let output = null;
  let selectionTargets=[];
  const markers=document.createElement('div');markers.className='selection-markers';shadow.append(markers);
  let expanded = false;
  let logsExpanded=false,logCopyStatus='';
  let submitting = false;
  let completedId = '';
  let completedState = 'draft';
  let completedTeaching=null, completedJob=null, testing=false, suggesting=false, inferred=false, lastClicked=null;
  const inputOptions=new Map();
  let error = '';
  let initialGoal='',buildAnswers={};
  let formTitle = '';
  let formCommand='';
  let formDescription = '';
  let allowWrites=false;
  let eventQueue = Promise.resolve();
  const recentInputs = new Map();
  const listeners = new AbortController();
  function closeOverlay() {
    listeners.abort();
    api.runtime.onMessage.removeListener(onRecorderMessage);
    host.remove();
    delete globalThis.__agentSessionRecorder;
  }
  async function cancelRecording() {
    try {
      if (!completedId) await send({ type: 'recorder:discard' });
      closeOverlay();
    } catch (cause) { error = cause.message; expanded = true; render(); }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem('agent-session-recorder-position') || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      host.style.left = `${Math.max(8, Math.min(saved.x, innerWidth - 72))}px`;
      host.style.top = `${Math.max(8, Math.min(saved.y, innerHeight - 45))}px`;
      host.style.right = 'auto';
    }
  } catch { /* Storage can be unavailable on restricted pages. */ }

  function send(message) {
    return new Promise((resolve, reject) => api.runtime.sendMessage(message, result => {
      const problem = api.runtime.lastError;
      if (problem) reject(new Error(problem.message));
      else if (result?.error) reject(new Error(result.error));
      else resolve(result);
    }));
  }
  const path = () => `${location.pathname||'/'}${location.search}`;
  const labelFor = element => (element?.getAttribute('aria-label') || element?.labels?.[0]?.textContent || element?.getAttribute('placeholder') || element?.getAttribute('title') || element?.getAttribute('name') || (element?.closest('button,a,[role=button]')?.textContent??'')).trim().slice(0,120);
  const safe = value => value && value.length < 100 && !value.includes('@') && !/[a-f0-9]{24,}/i.test(value);
  const attr = value => String(value).replace(/[\\"]/g, '\\$&');
  function selector(element, interactive = true) {
    if (!(element instanceof Element)) return null;
    const target = interactive ? element.closest('button,a,input,textarea,select,[role="button"],[data-testid]') ?? element : element;
    const tag = target.tagName.toLowerCase();
    if (safe(target.id)) return `#${CSS.escape(target.id)}`;
    for (const name of ['data-testid', 'data-test', 'name']) {
      const value = target.getAttribute(name);
      if (safe(value)) return `${tag}[${name}="${attr(value)}"]`;
    }
    const segments = [];
    let node = target;
    while (node && node !== document.body && segments.length < 7) {
      const siblings = [...(node.parentElement?.children ?? [])].filter(item => item.tagName === node.tagName);
      segments.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return segments.join(' > ') || 'body';
  }
  function observedAlternatives(element){
    if(!(element instanceof Element))return [];
    const node=element.closest('button,a,input,textarea,select,[role="button"]')??element,tag=node.tagName.toLowerCase(),candidates=[];
    for(const name of ['data-testid','name','aria-label','placeholder']){const value=node.getAttribute(name);if(safe(value))candidates.push(`${tag}[${name}="${attr(value)}"]`);}
    const segments=[];let parent=node;while(parent&&parent!==document.body&&segments.length<10){const siblings=[...(parent.parentElement?.children??[])].filter(other=>other.tagName===parent.tagName);segments.unshift(`${parent.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(parent)+1})`);parent=parent.parentElement;}if(segments.length)candidates.push('body > '+segments.join(' > '));
    return [...new Set(candidates)].filter(candidate=>{if(candidate.length>500)return false;try{const matches=[...document.querySelectorAll(candidate)].filter(element=>element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');return matches.length===1&&matches[0]===node;}catch{return false;}}).slice(0,8);
  }
  function inputStep(element) {
    const field = element instanceof Element ? element.closest('input,textarea,select,[contenteditable="true"]') : null;
    if (!field) return null;
    const input = field instanceof HTMLInputElement;
    const type = input ? field.type.toLowerCase() : '';
    if (input && ['hidden', 'file', 'submit', 'reset', 'button', 'image'].includes(type)) return null;
    const inputKind = input && ['checkbox', 'radio'].includes(type) ? 'checkbox' : field instanceof HTMLSelectElement ? 'select' : field.isContentEditable ? 'contenteditable' : 'text';
    const value = inputKind === 'checkbox' ? field.checked : inputKind === 'contenteditable' ? field.textContent ?? '' : field.value;
    const label = [field.name, field.id, field.getAttribute('autocomplete'), field.getAttribute('aria-label'), field.getAttribute('placeholder')].filter(Boolean).join(' ');
    const privateField = input && ['password', 'email', 'tel'].includes(type) || /pass(word)?|secret|token|otp|one.time|verification|card|cvv|cvc|iban|ssn|social.security|address|phone|e.mail/i.test(label) ||
      typeof value === 'string' && (value.length > 500 || /\S+@\S+\.\S+/.test(value) || /(?:\d[ -]*?){13,19}/.test(value));
    const target = selector(field, false);
    if (!target) return null;
    return { type: 'input', selector: target,alternatives:observedAlternatives(field), path: path(), inputKind, label:labelFor(field), ...(privateField ? { redacted: true } : { value }) };
  }
  function recordStep(event) {
    eventQueue = eventQueue.then(async () => {
      const result = await send({ type: 'recorder:event', event });
      trace = result.events ?? [...trace, event];
      render();
    }).catch(cause => { error = cause.message; expanded = true; render(); });
    return eventQueue;
  }
  function recordInput(element) {
    if (mode !== 'recording' || host.contains(element)) return;
    const event = inputStep(element);
    if (!event) return;
    const key = `${event.path}\n${event.selector}`;
    const signature = JSON.stringify([event.value, event.redacted]);
    if (recentInputs.get(key) === signature) return;
    recentInputs.set(key, signature);
    void recordStep(event);
  }
  function listSelector(element) {
    let row = element.closest('li,article,[role="listitem"],tr');
    if (!row) {
      let node = element;
      while (node?.parentElement && node !== document.body) {
        if ([...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName).length > 1) { row = node; break; }
        node = node.parentElement;
      }
    }
    if (!row?.parentElement) return null;
    const candidate = `${selector(row.parentElement, false)} > ${row.tagName.toLowerCase()}`;
    const matches = document.querySelectorAll(candidate).length;
    return matches >= 2 ? { selector: candidate, matches } : null;
  }
  function paintSelection(){
    markers.replaceChildren();
    if(!output||output.mode!=='selection'||completedId)return;
    selectionTargets.forEach((target,index)=>{let node;try{node=document.querySelector(target.selector);}catch{}if(!node)return;const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)return;const box=document.createElement('div');box.className='selection-box';Object.assign(box.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});const number=document.createElement('span');number.className='selection-number';number.textContent=String(index+1);box.append(number);markers.append(box);});
  }
  async function persistSelection(){
    selectionTargets=selectionTargets.map((target,index)=>({...target,label:/^(Image|Link|Result|Text) \d+$/.test(target.label)?target.label.replace(/\d+$/,String(index+1)):target.label}));
    if(!selectionTargets.length){output=null;paintSelection();render();return;}
    const event={type:'output',mode:'selection',path:path(),selector:selectionTargets[0].selector,targets:selectionTargets.map(target=>({...target}))};output=event;trace=trace.filter(event=>event.type!=='output').concat(event);render();
    try{const result=await send({type:'recorder:event',event});trace=result.events??trace;}catch(cause){error=cause.message;render();}
  }
  async function selectResult(element,additive=false){
    const node=element instanceof Element?element:null;if(!node)return;
    if(output?.mode!=='selection')selectionTargets=[];
    const targetSelector=selector(node,false);if(!targetSelector)return;
    const kind=node.matches('img,svg,canvas,[role=img]')?'image':node.closest('a')===node?'link':node.querySelector('img')?'element':'text';
    if(kind==='text'&&!node.innerText?.trim()){error='Choose text, an image, a link, or a result card.';render();return;}
    if(!additive)selectionTargets=[];
    const existing=selectionTargets.findIndex(target=>target.selector===targetSelector);
    if(existing>=0)selectionTargets.splice(existing,1);else{
      if(kind==='image'&&selectionTargets.filter(target=>target.kind==='image').length>=5){error='Select at most 5 images per tool result.';render();return;}
      if(selectionTargets.length>=20){error='Select at most 20 elements, including at most 5 images.';render();return;}
      const testId=node.getAttribute('data-testid'),parts=testId?.match(/^(.*?)(\d{3,})(\D*)$/);let collection;
      if(parts&&parts[1].length>=4){const candidate=`${node.tagName.toLowerCase()}[data-testid^="${attr(parts[1])}"]${parts[3]?`[data-testid$="${attr(parts[3])}"]`:''}`;const matches=[...document.querySelectorAll(candidate)].filter(element=>element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');const index=matches.indexOf(node);if(matches.length>1&&index>=0&&index<100)collection={selector:candidate,index};}
      selectionTargets.push({selector:targetSelector,kind,label:`${kind==='image'?'Image':kind==='link'?'Link':kind==='element'?'Result':'Text'} ${selectionTargets.length+1}`,...(collection?{collection}:{})});
    }
    error='';marking='selection';await persistSelection();
  }
  async function chooseOutput(kind, element) {
    const selection = kind === 'page' ? { selector: document.querySelector('main') ? 'main' : 'body', matches: 1 } :
      kind === 'list' ? listSelector(element) : { selector: selector(element, false), matches: 1 };
    if (!selection?.selector) { error = kind === 'list' ? 'Choose one item from a repeated list, such as a card or row.' : 'Choose an element on this page.'; render(); return; }
    const elements = [...document.querySelectorAll(selection.selector)];
    const limit = kind === 'list' ? 1000 : 10000;
    const texts = elements.map(node => node.innerText?.trim() ?? '');
    if (!texts.length || texts.some(text => !text)) {
      output = null; marking = ''; expanded = true; error = 'This selection has no readable text. Choose a text element, a list, or the page.'; render(); return;
    }
    if (texts.length > (kind === 'list' ? 100 : 1) || texts.some(text => text.length > limit)) {
      output = null; marking = ''; expanded = true; error = kind === 'list' ? 'Choose a smaller list: at most 100 items with 1,000 characters each.' : 'This selection is too large. Choose one text element or a smaller list instead.'; render(); return;
    }
    const event = { type: 'output', mode: kind, selector: selection.selector, path: path() };
    output = { ...event, matches: selection.matches };
    trace = trace.filter(item => item.type !== 'output').concat(event);
    marking = ''; error = ''; expanded = true; render();
    // The final submit carries this choice as well. A missed background update
    // must not erase a choice the user can already see in the review.
    try {
      const result = await send({ type: 'recorder:event', event });
      trace = result.events ?? trace;

    } catch (cause) {
      error = `The choice is ready and will be saved with the draft. ${cause.message}`;
      render();
    }
  }
  async function finish() {
    try {
      await eventQueue;
      const result = await send({ type: 'recorder:finish' });
      mode = 'review'; initialGoal=result.recording.goal||initialGoal; trace = result.recording.events; marking = ''; expanded = true;
      output = trace.find(item => item.type === 'output') ?? null;
      if (!formTitle)formTitle=trace.some(step=>step.type==='copy')?'Copy website content':`Read ${location.pathname.split('/').filter(Boolean).at(-1)||'page'}`;
      if (!output && !trace.some(step=>step.type==='copy')){marking='selection';expanded=true;render();}
      else {render();}
    } catch (cause) { error = cause.message; render(); }
  }
  async function suggest(){
    if(suggesting||(!output&&!trace.some(step=>step.type==='copy')))return;
    suggesting=true;inferred=true;const oldTitle=formTitle,oldDescription=formDescription,oldCommand=formCommand;render();
    try{const result=await send({type:'recorder:infer',output});if(formTitle===oldTitle)formTitle=result.inference.title;if(formDescription===oldDescription)formDescription=result.inference.description;if(formCommand===oldCommand)formCommand=result.inference.command||result.inference.title.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
    catch{ /* Keep the editable local suggestion if the model is unavailable. */ }
    suggesting=false;render();
  }
  async function buildTool(options={}){
    testing=true;error='';logCopyStatus='';buildAnswers={};render();
    try{await send({type:'recorder:tool',id:completedId,action:'build',goal:initialGoal||undefined,...options});
      while(!listeners.signal.aborted){const status=await send({type:'recorder:tool',id:completedId,action:'status'});completedTeaching=status.teaching;completedState=status.teaching.state;completedJob=status.testJob;render();if(!['refining','testing'].includes(completedTeaching.build?.state))break;await new Promise(resolve=>setTimeout(resolve,900));}
    }catch(cause){error=cause.message;}testing=false;render();
  }
  async function testTool(){
    testing=true;error='';logCopyStatus='';render();
    try{
      const started=await send({type:'recorder:tool',id:completedId,action:'test'});completedJob=started.job;render();
      while(!listeners.signal.aborted){
        const status=await send({type:'recorder:tool',id:completedId,action:'status'});completedTeaching=status.teaching;completedState=status.teaching.state;completedJob=status.testJob;
        render();if(!['queued','running'].includes(completedJob?.state))break;
        await new Promise(resolve=>setTimeout(resolve,800));
      }
    }catch(cause){error=cause.message;}
    testing=false;render();
  }
  async function saveTool(){
    submitting=true;error='';render();
    try{const result=await send({type:'recorder:tool',id:completedId,action:'save'});completedTeaching=result.teaching;completedState=result.teaching.state;}
    catch(cause){error=cause.message;}
    submitting=false;render();
  }
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function button(label, title, action, className = 'tool') {
    const node = el('button', className, label);
    const paths = {
      '▶': '<path d="m8 5 10 7-10 7Z"/>',
      'Ⅱ': '<path d="M9 5v14M15 5v14"/>',
      '✓': '<path d="m5 12 4 4L19 6"/>',
      '⌃': '<path d="m6 15 6-6 6 6"/>',
      '⌄': '<path d="m6 9 6 6 6-6"/>',
      '×': '<path d="m6 6 12 12M6 18 18 6"/>',
    };
    if (paths[label]) node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[label]}</svg>`;
    node.type = 'button'; node.title = title; node.setAttribute('aria-label', title); node.onclick = action;
    return node;
  }
  function progress(phase) {
    const list = el('ol', 'flow'); list.setAttribute('aria-label', 'Workflow progress');
    ['Record', 'Review', 'Test & save'].forEach((label, index) => {
      const item = el('li', index < phase ? 'done' : index === phase ? 'current' : '');
      if (index === phase) item.setAttribute('aria-current', 'step');
      item.append(el('span', '', index < phase ? '✓' : String(index + 1)), el('strong', '', label)); list.append(item);
    });
    return list;
  }
  function render() {
    root.replaceChildren();paintSelection();
    const bar = el('div', `toolbar ${mode === 'paused' ? 'paused' : mode === 'review' ? 'review' : ''}`);
    const grab = el('span', 'grab', '⋮⋮'); grab.title = 'Drag to move'; grab.setAttribute('aria-label', 'Drag toolbar to move');
    grab.onpointerdown = event => {
      const startX = event.clientX, startY = event.clientY, rect = host.getBoundingClientRect();
      grab.setPointerCapture(event.pointerId);
      grab.onpointermove = move => {
        host.style.left = `${Math.max(8, Math.min(rect.left + move.clientX - startX, innerWidth - 60))}px`;
        host.style.top = `${Math.max(8, Math.min(rect.top + move.clientY - startY, innerHeight - 45))}px`;
        host.style.right = 'auto';
      };
      grab.onpointerup = () => {
        grab.onpointermove = null; grab.onpointerup = null;
        try { sessionStorage.setItem('agent-session-recorder-position', JSON.stringify({ x: parseFloat(host.style.left), y: parseFloat(host.style.top) })); } catch {}
      };
    };
    bar.append(grab, el('span', 'live'));
    const stepCount = trace.filter(item => item.type !== 'output').length;
    bar.append(el('span', 'count', `${completedId ? completedState==='saved'?'Tool saved':testing?'Preparing':'Review result' : mode === 'review' ? 'Review' : mode === 'paused' ? 'Paused' : 'Recording'}  ·  ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`));
    if (!completedId && mode !== 'review') {
      bar.append(button(mode === 'paused' ? '▶' : 'Ⅱ', mode === 'paused' ? 'Resume recording' : 'Pause recording', async () => {
        try { const result = await send({ type: 'recorder:toggle' }); mode = result.recording.state; trace = result.recording.events; render(); }
        catch (cause) { error = cause.message; render(); }
      }));
      bar.append(button('Review', 'Review recording', finish, 'tool primary'));
    }
    bar.append(button(expanded ? '⌃' : '⌄', expanded ? 'Collapse details' : 'Open details', () => { expanded = !expanded; render(); }));
    bar.append(button('×', completedId ? 'Close recording overlay' : 'Cancel and discard recording', () => void cancelRecording(), 'tool close'));
    root.append(bar);
    if (!expanded) return;
    const panel = el('section', 'panel');
    root.append(panel);
    panel.append(progress(completedId ? 2 : mode === 'review' ? 1 : 0));
    if (completedId) {
      const build=completedTeaching?.build,questions=build?.state==='awaiting_answers'?build.questions??[]:[];
      const result=completedJob?.result??completedTeaching?.test,passed=result?.state==='found';
      panel.append(el('h2','',completedState==='saved'?'Tool ready for your agent':testing?'Preparing your tool…':questions.length?'A quick question':passed?'Test passed':'Tool needs attention'));
      panel.append(el('p','',completedState==='saved'?'Saved under this website’s MCP server.':testing?(build?.message||'Browser Recipes is refining your demonstration and checking that it works. You can keep using this page.'):questions.length?'Choose an answer, and Browser Recipes will finish preparing the tool.':passed?'Review the returned content, then add this tool to your website’s MCP server.':'Adjust the recipe or reconnect the website in Browser Recipes, then retry.'));
      if(build?.summary)panel.append(el('p','',build.summary));
      if(questions.length){const form=el('form'),continueButton=el('button','submit','Continue');continueButton.type='submit';continueButton.disabled=true;for(const question of questions){const field=el('fieldset','build-question');field.append(el('legend','',question.prompt));for(const option of question.options){const label=el('label'),radio=el('input');radio.type='radio';radio.name=`question-${question.eventIndex}`;radio.value=option.value;radio.checked=buildAnswers[question.eventIndex]===option.value;radio.onchange=()=>{buildAnswers[question.eventIndex]=option.value;continueButton.disabled=questions.some(item=>!buildAnswers[item.eventIndex]);};label.append(radio,el('span','',option.label));field.append(label);}form.append(field);}form.append(continueButton);form.onsubmit=event=>{event.preventDefault();void buildTool({answers:{...buildAnswers}});};panel.append(form);}
      if(testing&&completedJob?.stepLabel)panel.append(el('p','selection',`Step ${(completedJob.stepIndex??0)+1} · ${completedJob.stepLabel}`));
      if(result&&!questions.length){
        if(passed){if(result.result?.selections){for(const item of result.result.selections){const card=el('div','image-result');card.append(el('strong','',`${item.index}. ${item.label}`));if(item.text)card.append(el('p','',item.text));for(const image of item.images??[]){if(['image/jpeg','image/png'].includes(image.mimeType)){const img=el('img');img.src=`data:${image.mimeType};base64,${image.data}`;img.alt=image.alt||item.label;card.append(img);}}panel.append(card);}}else{const preview=el('pre','result-preview',typeof result.result==='string'?result.result:JSON.stringify(result.result??result.copied,null,2));panel.append(preview);}}
        else panel.append(el('p','error',({backend_run_failed:`The browser stopped${Number.isInteger(result.stepIndex)?` at step ${result.stepIndex+1}`:''}. Expand Run logs for details.`,write_permission_required:'This action needs permission to make changes. Enable it in the recipe and test again.',element_not_found:`A recorded element could not be found at step ${(result.stepIndex??0)+1}.`,browser_not_installed:'Install the backend Chromium browser to run this tool.'})[result.state]??`The test stopped: ${result.state.replaceAll('_',' ')}.`));
      }
      const logText=(completedJob??completedTeaching?.testRun)?.logText;
      if(logText){
        const logs=el('details','run-logs');logs.open=logsExpanded;logs.ontoggle=()=>{logsExpanded=logs.open;};logs.append(el('summary','','Run logs'));
        const toolbar=el('div','run-logs-toolbar'),status=el('span','',logCopyStatus);status.setAttribute('role','status');
        const copy=button('Copy logs','Copy logs',async()=>{try{await navigator.clipboard.writeText(logText);logCopyStatus='Copied';}catch{logCopyStatus='Could not copy. Select the log text below.';}status.textContent=logCopyStatus;},'tool');toolbar.append(status,copy);
        const pre=el('pre','',logText);pre.tabIndex=0;pre.setAttribute('aria-label','Backend run log');logs.append(toolbar,pre);panel.append(logs);
      }
      if(passed&&completedState!=='saved'&&!build)panel.append(button(submitting?'Saving…':'Save tool','Save tool',()=>void saveTool(),'submit full-button'));
      if(!testing&&!questions.length&&completedState!=='saved')panel.append(button('Try preparing again','Try preparing again',()=>void buildTool(),'tool full-button'));
      const link=el('a','continue-link',completedState==='saved'?'View tool in Browser Recipes ↗':'Edit recipe in Browser Recipes ↗');link.href=`http://127.0.0.1:5173/teachings/${encodeURIComponent(completedId)}`;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);
      if(build?.state==='needs_attention'&&build.message)panel.append(el('p','error',build.message));
      if(error)panel.append(el('p','error',error));return;
    }
    if (mode !== 'review') {
      panel.append(el('h2', '', mode === 'paused' ? 'Recording paused' : 'Show the action'));
      panel.append(el('p', '', mode === 'paused' ? 'Resume when you’re ready. Paused actions are left out.' : 'Use the website normally. When you’re finished, review the steps and choose the result to read.'));
    } else {
      panel.append(el('h2', '', 'Choose what to return'));
      panel.append(el('p', '', 'Choose the content the agent should receive. Browser Recipes will handle the recipe and testing.'));
      const choices = el('div', 'choices');
      for (const [kind, label] of [['selection','Select results'],['page', 'Page text'], ['list', 'Repeated list']]) {
        const choice = button(label, label, () => {
          if (kind === 'page') void chooseOutput('page');
          else {if(kind==='selection'&&output?.mode!=='selection'){selectionTargets=[];output=null;trace=trace.filter(event=>event.type!=='output');} marking = kind; error = ''; render(); }
        }, `choice ${output?.mode === kind && !marking ? 'active' : ''}`);
        choices.append(choice);
      }
      panel.append(choices);
      if(marking==='selection'||output?.mode==='selection'){const action=el('div','selection-action');action.append(el('p','',marking==='selection'?'Click a result. Shift-click to add or remove more.':'Numbered outputs are read again each time the tool runs.'));if(marking==='selection')action.append(button('Done selecting','Done selecting',()=>{if(!selectionTargets.length){error='Choose at least one output on the website.';render();return;}marking='';expanded=true;render();},'tool primary'));panel.append(action);const picked=el('div','picked-results');selectionTargets.forEach((target,index)=>{const row=el('div');row.append(el('span','',String(index+1)),el('strong','',target.label),el('small','',target.kind),button('×',`Remove output ${index+1}`,()=>{selectionTargets.splice(index,1);void persistSelection();},'tool close'));picked.append(row);});panel.append(picked);}
      const selected = output?.mode==='selection'?`${selectionTargets.length} selected outputs · up to 5 images`:output ? `${output.mode === 'page' ? 'Page content' : output.mode === 'list' ? `${output.matches ?? 'Multiple'} matching items` : 'One element'}` : trace.some(step=>step.type==='copy') ? 'Copied text · returns the last recorded copy' : 'No content chosen yet';
      panel.append(el('div', 'selection', marking==='selection'?'Shift-click additional results, then choose Done selecting.':marking ? `Click ${marking === 'list' ? 'one row or card in the list' : 'the element'} on this page. This click only selects it.` : selected));
      if(selectionTargets.some(target=>target.collection&&selectionTargets.filter(other=>other.collection?.selector===target.collection.selector).length>1))panel.append(el('p','privacy','Repeated results are read by their selected positions, so a different search can return different items.'));
      if(trace.some(step=>step.type==='copy'))panel.append(button(output?'Use copied text as the result':'✓ Copied text selected','Use copied text as the result',()=>{output=null;trace=trace.filter(step=>step.type!=='output');render();},output?'tool full-button':'choice active full-button'));
      panel.append(el('p','scope-note','Browser Recipes will work out which inputs should change each time and which choices should stay fixed.'));
      const details = el('details');
      const summary = el('summary', '', `Review ${trace.length} recorded steps`);
      const list = el('ol');
      for (const step of trace) list.append(el('li', '', `${step.type === 'output' ? 'Read' : step.type === 'input' ? step.redacted ? 'Filled private field' : 'Filled field' : step.type}: ${step.path}${step.selector ? ` · ${step.selector}` : ''}${step.type === 'input' && step.value !== undefined ? ` = ${String(step.value).slice(0, 60)}` : ''}`));
      details.append(summary, list);
      const form=el('form');
      const goalLabel=el('label','','Your task'),goalInput=el('textarea');goalInput.id='bridge-tool-goal';goalLabel.htmlFor=goalInput.id;goalInput.rows=3;goalInput.maxLength=1500;goalInput.placeholder='Search for men’s shoes using a query from the agent, and return the first 10 links.';goalInput.value=initialGoal;goalInput.oninput=()=>{initialGoal=goalInput.value;};form.append(goalLabel,goalInput);
      const submit=el('button','submit',submitting?'Saving your demonstration…':'Build my tool');submit.type='submit';submit.disabled=submitting||(!output&&!trace.some(step=>step.type==='copy'))||Boolean(marking);form.append(submit);
      form.onsubmit=async event=>{event.preventDefault();if(initialGoal.trim().length<5){error='Describe what you want this tool to do.';render();return;}if(marking||(!output&&!trace.some(step=>step.type==='copy')))return;submitting=true;error='';render();try{const result=await send({type:'recorder:submit',goal:initialGoal,title:initialGoal.trim().slice(0,100),description:initialGoal.slice(0,1000),output,allowWrites,inputs:[...inputOptions].map(([index,value])=>({index,...value}))});completedId=result.teaching.id;completedTeaching=result.teaching;completedState=result.teaching.state;submitting=false;render();void buildTool();}catch(cause){error=cause.message;submitting=false;render();}};
      form.append(el('p','privacy','Browser Recipes will refine the steps, ask only if needed, and test and save the tool for you.'));panel.append(form);
      const advanced=el('details','privacy');advanced.append(el('summary','','Advanced settings'),details);
      const rule=el('label','write-rule'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=allowWrites;checkbox.onchange=()=>{allowWrites=checkbox.checked;};rule.append(checkbox,el('span','','Allow the recorded form to make changes on this website'));advanced.append(rule,el('p','','Website login is stored encrypted on this computer. The model receives your task and action structure; field values and saved authentication stay local.'));panel.append(advanced);
    }
    if (error) { const alert = el('p', 'error', error); alert.setAttribute('role', 'alert'); panel.append(alert); }
  }
  document.addEventListener('click', async event => {
    if (host.contains(event.target)) return;
    if(mode==='review'&&(marking==='selection'||event.shiftKey)){event.preventDefault();event.stopImmediatePropagation();await selectResult(event.target,event.shiftKey);return;}
    if (marking) { event.preventDefault(); event.stopImmediatePropagation(); await chooseOutput(marking, event.target); return; }
    if (mode !== 'recording') return;
    const element=event.target.closest?.('button,a,[role=button],input[type=submit],input[type=button]');
    if(!element)return;lastClicked=element;
    const target=selector(element);if(!target)return;
    void recordStep({type:'click',selector:target,alternatives:observedAlternatives(element),path:path(),label:labelFor(element)});
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('copy',event=>{
    if(mode!=='recording'||host.contains(event.target))return;
    const selection=getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0);let node=range.commonAncestorContainer;const element=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
    if(!element||host.contains(element))return;
    const before=document.createRange();before.selectNodeContents(element);before.setEnd(range.startContainer,range.startOffset);
    const start=before.toString().length,end=start+range.toString().length;
    void recordStep({type:'copy',path:path(),selector:selector(element,false),start,end,label:'Selected text'});
  },{capture:true,signal:listeners.signal});
  document.addEventListener('bridge:website-copy',()=>{
    if(mode!=='recording'||!lastClicked)return;
    void recordStep({type:'copy',path:path(),selector:selector(lastClicked),clipboard:true,label:labelFor(lastClicked)||'Copied text'});
  },{signal:listeners.signal});
  document.addEventListener('keydown',event=>{
    if(mode!=='recording'||host.contains(event.target)||event.metaKey||event.ctrlKey||event.altKey||!['Enter','Escape','ArrowDown','ArrowUp'].includes(event.key))return;
    const target=selector(event.target,false);if(target)void recordStep({type:'key',key:event.key,path:path(),selector:target,alternatives:observedAlternatives(event.target),label:labelFor(event.target)});
  },{capture:true,signal:listeners.signal});
  document.addEventListener('keydown', event => {
    if (!event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey || host.contains(event.target)) return;
    if (event.key === 'Enter' && mode !== 'review') { event.preventDefault(); event.stopImmediatePropagation(); void finish(); }
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('input', event => {
    recordInput(event.target);
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('change', event => {
    recordInput(event.target);
  }, { capture: true, signal: listeners.signal });
  function onRecorderMessage(message) {
    if (message?.type === 'recorder:state') { mode = message.state; if (mode === 'review') { expanded = true; if (!output&&!trace.some(step=>step.type==='copy')){marking='selection';render();return;} } render(); }
    if (message?.type === 'recorder:discarded') closeOverlay();
  }
  window.addEventListener('scroll',paintSelection,{capture:true,passive:true,signal:listeners.signal});window.addEventListener('resize',paintSelection,{passive:true,signal:listeners.signal});
  api.runtime.onMessage.addListener(onRecorderMessage);
  send({ type: 'recorder:status' }).then(result => {
    initialGoal=result.recording?.goal||initialGoal; mode = result.recording?.state ?? 'recording'; trace = result.recording?.events ?? [];
    output = trace.find(item => item.type === 'output') ?? null;selectionTargets=output?.targets??[];
    expanded = mode === 'review';
    render();
  }).catch(() => render());
})();
