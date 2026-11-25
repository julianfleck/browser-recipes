import { randomUUID } from 'node:crypto';
import { readdir, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { toBrowserStorageState, fromBrowserStorageState } from './workflows/browser-session-transport.js';
import { validateMacro, resolveInputs, legacyMacro,navigationUrl } from './macro-recipe.js';
import {safeRunError,formatRunLog} from './run-log.js';

async function executable() {
  if(process.env.CONNECTOR_CHROMIUM_PATH)return process.env.CONNECTOR_CHROMIUM_PATH;
  const candidates=[chromium.executablePath(),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
  for(const dir of await readdir(cache).catch(()=>[]))if(/^chromium-\d+$/.test(dir))candidates.push(path.join(cache,dir,'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
  for(const candidate of candidates)try{await access(candidate);return candidate;}catch{}
  throw new Error('browser_not_installed');
}
export async function openHeadless(snapshot) {
  const browser=await chromium.launch({headless:true,executablePath:await executable()});
  try {
    const context=await browser.newContext({storageState:toBrowserStorageState(snapshot),viewport:{width:1440,height:1000},serviceWorkers:'block'});
    // The clipboard belongs to this run. It never reads or changes the user's OS clipboard.
    await context.addInitScript(({origin,sessionStorage:session})=>{
      if(location.origin===origin)for(const [key,value] of Object.entries(session??{}))sessionStorage.setItem(key,value);
      globalThis.__bridgeClipboard='';
      try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{globalThis.__bridgeClipboard=String(text);},readText:async()=>globalThis.__bridgeClipboard}});}catch{}
      document.addEventListener('copy',event=>{globalThis.__bridgeClipboard=event.clipboardData?.getData('text/plain')||getSelection()?.toString()||'';});
    },{origin:snapshot.origin,sessionStorage:snapshot.sessionStorage??{}});
    return {context,browser};
  } catch(error){await browser.close();throw error;}
}
export async function replayMacro(page,recipe,args={},progress=async()=>{}) {
  validateMacro(recipe);
  const inputs=resolveInputs(recipe,args);
  const copied=[];let result;
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(20000);
  for(let index=0;index<recipe.steps.length;index++){
    const step=recipe.steps[index];
    await progress({phase:'replaying',stepIndex:index,stepLabel:step.label||step.type});
    if(step.type==='navigation'){
      const target=navigationUrl(step,recipe,inputs);
      if(step.follow){const expected=new URL(target);await page.waitForURL(url=>url.origin===recipe.origin&&url.pathname===expected.pathname&&(step.waitForQuery??[]).every(key=>JSON.stringify(url.searchParams.getAll(key))===JSON.stringify(expected.searchParams.getAll(key))),{waitUntil:'domcontentloaded'});}
      else if(page.url()!==target)await page.goto(target,{waitUntil:'domcontentloaded'});
      continue;
    }
    if(new URL(page.url()).origin!==recipe.origin)throw new Error('site_changed');
    let target=page.locator(step.selector);
    if(['click','input','key'].includes(step.type)){target=target.filter({visible:true});await target.first().waitFor({state:'visible'});const count=await target.count();if(count!==1)throw Object.assign(new Error(`ambiguous_result: The action selector matched ${count} visible elements.`),{code:'ambiguous_result'});}
    if(step.type==='click')await target.click();
    if(step.type==='input'){
      const value=step.binding==='variable'?inputs[step.variable]:step.value;
      if(step.inputKind==='checkbox')await target.setChecked(value);
      else if(step.inputKind==='select')await target.selectOption(value);
      else await target.fill(value);
    }
    if(step.type==='key')await target.press(step.key==='Space'?' ':step.key);
    if(step.type==='copy'){
      let value;
      if(step.clipboard){await page.waitForFunction(()=>Boolean(globalThis.__bridgeClipboard));value=await page.evaluate(()=>globalThis.__bridgeClipboard);}
      else {value=await target.evaluate((node,{start,end})=>{const text=node.textContent??'';return start!==undefined?text.slice(start,end):node.innerText??text;},{start:step.start,end:step.end});}
      if(typeof value!=='string'||!value.trim()||value.length>10000)throw new Error('copy_unavailable');
      copied.push(value);
    }
    if(['copy','output'].includes(step.type)&&/\/(login|signin|sign-in)([/?#]|$)/i.test(new URL(page.url()).pathname))throw new Error('login_required');
    if(step.type==='output'&&step.mode==='selection'){result=await readSelections(page,step.targets);continue;}
    if(step.type==='output'){
      await target.first().waitFor({state:'attached'});
      if(step.mode==='list'){
        const values=await target.allInnerTexts();
        if(!values.length||values.length>100||values.some(text=>!text.trim()||text.length>1000))throw new Error('extraction_failed');
        result=values.map(text=>text.trim());
      }else{
        if(step.mode==='one'&&await target.count()!==1)throw new Error('ambiguous_result');
        const value=await target.first().innerText();
        if(!value.trim()||value.length>10000)throw new Error('extraction_failed');
        result=value.trim();
      }
    }
  }
  return {state:'found',...(result!==undefined?{result}:{}),...(copied.length?{copied}:{}),...(result===undefined&&copied.length?{result:copied.at(-1)}:{})};
}
export async function readSelections(page,targets){
 const selections=[];let imageCount=0,totalBytes=0;
 const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
 for(const [index,target] of targets.entries()){
  let locator=page.locator(target.selector);if(target.index!==undefined)locator=locator.filter({visible:true}).nth(target.index);
  await locator.first().waitFor({state:target.kind==='image'||target.index!==undefined?'visible':'attached'});if(await locator.count()!==1)throw new Error('ambiguous_result');
  const item={index:index+1,label:target.label||`Result ${index+1}`,kind:target.kind};
  if(target.kind!=='image'){const text=(await locator.innerText()).trim();if(text.length>10000)throw new Error('output_too_large');if(text)item.text=text;}
  if(target.kind==='link'){item.href=safeUrl(await locator.evaluate(node=>node.href));}
  const imageNodes=target.kind==='image'?[locator]:target.kind==='element'?await locator.locator('img').all():[];
  for(const imageNode of imageNodes){
   if(target.kind==='element'&&!await imageNode.isVisible())continue;
   if(++imageCount>5)throw new Error('output_too_large');
   await imageNode.waitFor({state:'visible'});
   const loaded=await imageNode.evaluate(node=>!('complete' in node)||node.complete&&node.naturalWidth?true:new Promise(resolve=>{node.addEventListener('load',()=>resolve(true),{once:true});node.addEventListener('error',()=>resolve(false),{once:true});setTimeout(()=>resolve(false),7000);}));if(!loaded)throw new Error('image_unavailable');
   const metadata=await imageNode.evaluate(node=>({url:node.currentSrc||node.src||null,alt:node.alt||node.getAttribute('aria-label')||'',width:node.naturalWidth||Math.round(node.getBoundingClientRect().width),height:node.naturalHeight||Math.round(node.getBoundingClientRect().height)}));
   if(!metadata.width||!metadata.height)throw new Error('image_unavailable');
   const bytes=await imageNode.screenshot({type:'jpeg',quality:80,animations:'disabled',timeout:10000});totalBytes+=bytes.length;if(bytes.length>1000000||totalBytes>4000000)throw new Error('output_too_large');
   (item.images??=[]).push({...metadata,url:safeUrl(metadata.url),alt:metadata.alt.slice(0,500),mimeType:'image/jpeg',data:bytes.toString('base64')});
  }
  if(!item.text&&!item.images?.length&&!item.href)throw new Error('extraction_failed');selections.push(item);
 }
 return {selections};
}
export class HeadlessRunner {
  constructor({sessions,teachings,browserFactory=openHeadless,timeoutMs=90000,feedback=null}){this.feedback=feedback;this.sessions=sessions;this.teachings=teachings;this.browserFactory=browserFactory;this.timeoutMs=timeoutMs;this.jobs=new Map();this.active=new Map();}
  async checkConnection(origin) {
    const snapshot=await this.sessions.load(origin)??{origin,cookies:[],localStorage:{}};let resources;
    try{
      resources=await this.browserFactory(snapshot);
      await resources.context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
      const page=await resources.context.newPage();page.setDefaultNavigationTimeout(20000);
      const response=await page.goto(origin,{waitUntil:'domcontentloaded'});
      const login=/\/(login|signin|sign-in)([/?#]|$)/i.test(new URL(page.url()).pathname)||await page.locator('input[type=password]').first().isVisible().catch(()=>false)||response?.status()===401;
      if(login)await this.sessions.markConnection?.(origin,'login_required');
      return {state:login?'login_required':response?.status()>=400?'unreachable':'reachable'};
    }catch{return {state:'unreachable'};}finally{await resources?.browser.close().catch(()=>{});}
  }
  get(id){const job=this.jobs.get(id);if(!job)throw new Error('Unknown backend run');return {...structuredClone(job),logText:formatRunLog(job)};}
  forTeaching(id){const job=[...this.jobs.values()].reverse().find(job=>job.teachingId===id);return job?this.get(job.id):null;}
  async start(id,args={},useExamples=true){
    const item=await this.teachings.get(id);
    if(item.archived)throw new Error('Tool is archived');
    const active=this.forTeaching(id);if(active?.state==='running'){if(!useExamples)throw new Error('Tool already running');return active;}
    if([...this.jobs.values()].some(job=>job.state==='running'&&job.origin===item.recording.origin))throw new Error('Website already running a tool');
    if(this.active.size>=4)throw new Error('Backend is busy');
    const recipe=item.workflow?.schemaVersion===2?validateMacro(item.workflow):legacyMacro(item.workflow,item.recording);
    const inputs=resolveInputs(recipe,args,useExamples);
    const job={id:randomUUID(),teachingId:id,revision:item.revision??0,origin:item.recording.origin,state:'running',phase:'loading_session',createdAt:Date.now(),events:[]};this.jobs.set(job.id,job);
    const task=this.execute(job,recipe,inputs);this.active.set(job.id,task);task.finally(()=>this.active.delete(job.id));
    return this.get(job.id);
  }
  async wait(id){await this.active.get(id);return this.get(id);}
  async execute(job,recipe,inputs){
    let resources,timer,expired=false,blockedWrite=false;const origin=recipe.origin;
    const privateValues=[...Object.values(inputs),...recipe.steps.flatMap(step=>[step.value,step.example])];
    const phase=async event=>{if(expired)throw new Error('run_timeout');Object.assign(job,event);job.events.push({...event,...(Number.isInteger(event.stepIndex)?{action:recipe.steps[event.stepIndex]?.type}:{}),at:Date.now()});};
    try{
      await phase({phase:'loading_session'});
      const snapshot=await this.sessions.load(origin)??{origin,cookies:[],localStorage:{}};
      privateValues.push(...(snapshot.cookies??[]).map(cookie=>cookie.value),...Object.values(snapshot.localStorage??{}),...Object.values(snapshot.sessionStorage??{}));
      const run=async()=>{
        resources=await this.browserFactory(snapshot);
        if(expired){await resources.browser.close();throw new Error('run_timeout');}
        await resources.context.route('**/*',async route=>{
          const request=route.request();let url;try{url=new URL(request.url());}catch{return route.abort();}
          if(request.isNavigationRequest()&&request.frame()===page.mainFrame()&&url.origin!==origin)return route.abort();
          if(!['GET','HEAD','OPTIONS'].includes(request.method())){if(!recipe.allowWrites){if(url.origin===origin)blockedWrite=true;return route.abort();}if(url.origin===origin)job.sentWrite=true;}
          return route.fallback();
        });
        if(!recipe.allowWrites&&resources.context.routeWebSocket)await resources.context.routeWebSocket('**/*',socket=>socket.close());
        const page=await resources.context.newPage();
        await phase({phase:'opening_page'});
        const result=await replayMacro(page,recipe,inputs,phase);
        if(blockedWrite&&!recipe.allowWrites)throw new Error('write_permission_required');
        await phase({phase:'saving_result'});
        if(snapshot.savedAt&&(await this.sessions.load(origin))?.savedAt===snapshot.savedAt){
          const state=fromBrowserStorageState(await resources.context.storageState(),origin);
          state.sessionStorage=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage))).catch(()=>snapshot.sessionStorage??{});
          await this.sessions.save(state);
        }
        return result;
      };
      job.result=await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;void resources?.browser.close();reject(new Error('run_timeout'));},this.timeoutMs);})]);
    }catch(error){
      job.diagnostic=safeRunError(error,privateValues);
      let code=error?.code??error?.message;
      const currentPage=resources?.context.pages?.()[0];if(error?.name==='TimeoutError'&&currentPage&&/\/(login|signin|sign-in|auth)([/?#]|$)/i.test(currentPage.url()))code='login_required';
      const known=['image_unavailable','output_too_large','write_permission_required','login_required','site_changed','copy_unavailable','extraction_failed','ambiguous_result','browser_not_installed','run_timeout'];
      job.result={state:known.includes(code)?code:blockedWrite?'write_permission_required':error?.name==='TimeoutError'?'element_not_found':'backend_run_failed',...(Number.isInteger(job.stepIndex)?{stepIndex:job.stepIndex}:{})};
      job.failedPhase=job.phase;
    }finally{
      clearTimeout(timer);await resources?.browser.close().catch(()=>{});
      if(job.result?.state==='login_required')await this.sessions.markConnection?.(origin,'login_required')?.catch(()=>{});
      else if(job.result?.state==='found')await this.sessions.markConnection?.(origin,'verified')?.catch(()=>{});
      job.state='completed';job.phase='completed';job.finishedAt=Date.now();job.events.push({phase:'completed',at:job.finishedAt});
      job.logText=formatRunLog(job);
      try{const latest=await this.teachings.get(job.teachingId);if((latest.revision??0)===job.revision){await this.teachings.tested(job.teachingId,job.result,job);if(job.result.state==='found'){await this.feedback?.resolveMatching(origin,{teachingId:job.teachingId});}}}catch{/* A revised/archived recipe cannot inherit an old run's approval. */}
    }
  }
}
