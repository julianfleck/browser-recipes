import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/arc/button/button';
import { ArrowRight, ArrowUpRight, Check, Globe2, Pause, Play, X } from 'lucide-react';
import BridgeMark from './BridgeMark';
import ToolResult from './ToolResult';
import ToolPreparation from './ToolPreparation';
import RunLogs from './RunLogs';
import WorkflowProgress from './WorkflowProgress';
import '@/components/arc/foundation.css';
import './product-theme.css';
import './extension-popup.css';

declare const chrome: any;
const api = typeof chrome === 'undefined' ? null : chrome;
function call(owner: any, method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve,reject)=>owner[method](...args,(value:any)=>{
    const error=api.runtime.lastError;
    if(error)reject(new Error(error.message));else if(value?.error)reject(new Error(value.error));else resolve(value);
  }));
}
type Recording={tabId:number;origin:string;state:string;events:unknown[];startedAt?:number}|null;
type Recent={id:string;title:string;origin:string;state:string}|null;
export function Popup({preview=false}:{preview?:boolean}) {
  const [goal,setGoal]=useState(''),[showNew,setShowNew]=useState(false);
  const [mcps,setMcps]=useState<any[]>([]),[mcpId,setMcpId]=useState('');
  const [tab,setTab]=useState<any>(null);
  const [recording,setRecording]=useState<Recording>(null);
  const [recentData,setRecentData]=useState<any>(null);
  const [recent,setRecent]=useState<Recent>(null);
  const [paired,setPaired]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);const [loginSaved,setLoginSaved]=useState(false);
  async function refresh(){
    if(preview){
      setTab({id:1,url:'https://example.org/account'});setPaired(true);setLoaded(true);
      if(new URLSearchParams(location.search).get('state')==='handoff')setRecent({id:'preview',title:'Read latest invoices',origin:'https://example.org',state:'draft'});
      return;
    }
    try{
      const [[active],{pairingToken},status]=await Promise.all([call(api.tabs,'query',{active:true,currentWindow:true}),call(api.storage.local,'get','pairingToken'),call(api.runtime,'sendMessage',{type:'recorder:status'})]);
      setTab(active);setPaired(Boolean(pairingToken));
      if(pairingToken&&active?.url?.startsWith('https:')){try{const response=await fetch('http://127.0.0.1:8787/api/mcps',{headers:{authorization:`Bearer ${pairingToken}`}});if(response.ok){const data=await response.json();const matches=data.mcps.filter((mcp:any)=>mcp.origin===new URL(active.url).origin);setMcps(matches);setMcpId(previous=>matches.some((mcp:any)=>mcp.id===previous)?previous:matches[0]?.id??'');}}catch{}}setRecording(status.recording??null);setRecent(status.lastTeaching??null);
      if(!status.recording&&status.lastTeaching&&pairingToken){
        try{const response=await fetch(`http://127.0.0.1:8787/api/teachings/${encodeURIComponent(status.lastTeaching.id)}`,{headers:{authorization:`Bearer ${pairingToken}`},signal:AbortSignal.timeout(1500)});if(response.ok){const data=await response.json();setRecentData(data);const {teaching}=data;setRecent({...status.lastTeaching,state:teaching.state});}}catch{/* The saved continuation link remains usable when the workspace returns. */}
      }
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not check the extension.');}finally{setLoaded(true);}
  }
  useEffect(()=>{
    void refresh();
    const change=(changes:any)=>{if(changes.activeRecording||changes.lastTeaching||changes.pairingToken)void refresh();};
    if(!preview)api?.storage.onChanged?.addListener(change);
    return()=>{if(!preview)api?.storage.onChanged?.removeListener(change);};
  },[]);
  useEffect(()=>{if(!recent||!(['running','queued'].includes(recentData?.testJob?.state)||['refining','testing'].includes(recentData?.teaching?.build?.state)))return;const timer=setInterval(()=>void refresh(),1000);return()=>clearInterval(timer);},[recent?.id,recentData?.testJob?.state,recentData?.teaching?.build?.state]);
  async function toolAction(action:string,options:any={}){
    if(!recent)return;setBusy(true);setError('');
    try{if(!preview)await call(api.runtime,'sendMessage',{type:'recorder:tool',id:recent.id,action,...options});await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not run tool');}finally{setBusy(false);}
  }
  async function start(){
    setBusy(true);setError('');
    try{
      if(preview){setRecording({tabId:1,origin:'https://example.org',state:'recording',startedAt:Date.now(),events:[{type:'navigation',path:'/account'}]});return;}
      const url=new URL(tab.url);if(url.protocol!=='https:')throw new Error('Open an HTTPS website before recording.');
      if(!await call(api.permissions,'request',{origins:[`${url.origin}/*`]}))throw new Error('Allow access to this website to record a workflow.');
      const result=await call(api.runtime,'sendMessage',{type:'recorder:start',tabId:tab.id,mcpId:mcpId||undefined,goal:goal.trim()});setRecording(result.recording);window.close();
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not start recording.');}finally{setBusy(false);}
  }
  async function control(type:string){
    setBusy(true);setError('');
    try{
      if(type==='discard'){
        if(!preview)await call(api.runtime,'sendMessage',{type:'recorder:discard'});setRecording(null);return;
      }
      if(preview){setRecording(value=>value?{...value,state:type==='finish'?'review':value.state==='recording'?'paused':'recording'}:null);return;}
      const result=await call(api.runtime,'sendMessage',{type:`recorder:${type}`});setRecording(result.recording);
      if(type==='finish'&&recording){await call(api.tabs,'update',recording.tabId,{active:true});window.close();}
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not update the recording.');}finally{setBusy(false);}
  }
  async function saveLogin(){
    setBusy(true);setError('');
    try{if(!preview){const url=new URL(tab.url);if(!await call(api.permissions,'request',{origins:[`${url.origin}/*`]}))throw new Error('Allow access to save this website login.');await call(api.runtime,'sendMessage',{type:'recorder:save-login',tabId:tab.id});}setLoginSaved(true);}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save login');}finally{setBusy(false);}
  }
  async function returnToTab(){if(recording&&!preview){await call(api.tabs,'update',recording.tabId,{active:true});window.close();}}
  const site=(()=>{try{return new URL(recording?.origin??tab?.url).hostname;}catch{return 'Choose a website';}})();
  const canRecord=loaded&&paired&&Boolean(tab?.url?.startsWith('https:'));
  const steps=recording?.events.filter((event:any)=>event.type!=='output').length??0;
  const phase=recording?(recording.state==='review'?1:0):recent?2:0;
  const result=recentData?.testJob?.result??recentData?.teaching?.test;
  const testing=(['running','queued'].includes(recentData?.testJob?.state)||['refining','testing'].includes(recentData?.teaching?.build?.state));
  const workflowURL=recent?`http://127.0.0.1:5173/teachings/${encodeURIComponent(recent.id)}`:'';
  return <main className="popup-shell">
    <header className="popup-header"><div className="mark"><BridgeMark size={19}/></div><div className="popup-brand"><strong>Bridge</strong><span>Website tools</span></div><a href="http://127.0.0.1:5173/teachings" target="_blank" rel="noopener noreferrer" aria-label="Open workspace"><ArrowUpRight size={17}/></a></header>
    <div className="popup-content"><WorkflowProgress phase={phase} complete={!recording&&recent?.state==='saved'}/>
      {!paired&&loaded&&<div className="notice"><strong>Connect to your workspace</strong><p>Open Bridge once in this browser to connect the extension.</p><a href="http://127.0.0.1:5173" target="_blank" rel="noopener noreferrer">Open workspace <ArrowUpRight size={12}/></a></div>}
      {error&&<p className="error" role="alert">{error}</p>}{!recording&&mcps.length>0&&<label className="popup-mcp-choice">Save tools to MCP<select value={mcpId} onChange={event=>setMcpId(event.target.value)}>{mcps.map(mcp=><option value={mcp.id} key={mcp.id}>{mcp.name}{mcp.enabled===false?' (inactive)':''}</option>)}</select></label>}
      {recording?<>
        <section className={`popup-site ${recording.state}`} aria-live="polite"><Globe2 size={17}/><div><span>{recording.state==='review'?'Review on':recording.state==='paused'?'Paused on':'Recording on'}</span><strong>{site}</strong></div><span className="popup-step-count"><i/>{steps} {steps===1?'step':'steps'}</span></section>
        <h1>{recording.state==='review'?'Choose your result':recording.state==='paused'?'Recording paused':'Show the action'}</h1>
        <p className="popup-hint">{recording.state==='review'?'Review the steps on the website, choose what to read, and create and test your tool.':'Use the website normally. When you’re finished, review the recording and choose what to read.'}</p>
        {recording.state==='review'?<Button className="main-button" onClick={()=>void returnToTab()}>Continue review <ArrowRight size={14}/></Button>:<><Button className="main-button" disabled={busy} onClick={()=>void control('finish')}>Review recording <ArrowRight size={14}/></Button><div className="popup-actions"><Button variant="secondary" size="sm" disabled={busy} onClick={()=>void control('toggle')}>{recording.state==='paused'?<Play size={13}/>:<Pause size={13}/>} {recording.state==='paused'?'Resume':'Pause'}</Button><Button variant="ghost" size="sm" onClick={()=>void returnToTab()}>Return to website <ArrowUpRight size={13}/></Button></div></>}
        <button className="popup-discard" disabled={busy} onClick={()=>void control('discard')}><X size={12}/> Discard recording</button>
      </>:recent&&!showNew?<>
        <section className="popup-site"><Globe2 size={17}/><div><span>Latest workflow</span><strong>{new URL(recent.origin).hostname}</strong></div>{recent.state==='saved'&&<Check size={15}/>}</section>
        <h1>{recent.title}</h1><p className="popup-hint">{recent.state==='saved'?'Saved to your workflow catalog. You can review the recipe and its last result in Bridge.':recent.state==='needs_model'?'Your recording is saved. Open the draft to finish generating the read recipe.':'Your recipe runs headlessly with the saved website login. Test it here, then save it for your agent.'}</p>
        {recentData?.teaching&&<ToolPreparation item={recentData.teaching} onPrepare={(options:any)=>void toolAction('build',options)} busy={busy}/>}
        {testing?<p className="popup-hint" role="status">Testing headlessly… {recentData?.testJob?.stepLabel??''}</p>:result&&<p className={result.state==='found'?'popup-hint':'error'} role="status">{result.state==='found'?'Test passed':`Test stopped: ${result.state.replaceAll('_',' ')}`}</p>}
        {result?.state==='found'&&<div className="popup-result"><ToolResult result={result}/></div>}
        <RunLogs text={(recentData?.testJob??recentData?.teaching?.testRun)?.logText}/>
        <a className="popup-primary-link" href={workflowURL} target="_blank" rel="noopener noreferrer">{recent.state==='saved'?'View tool':'Edit recipe'} <ArrowRight size={14}/></a>
        <Button variant="secondary" className="popup-new-button" disabled={!canRecord} loading={busy} onClick={()=>setShowNew(true)}>Record another tool</Button>
      </>:<>
        <section className="popup-site"><Globe2 size={17}/><div><span>Current website</span><strong>{loaded?site:'Checking browser…'}</strong></div></section>
        <h1>What should your tool do?</h1><p className="popup-hint">Describe the task, then show it once. Bridge will turn it into a tool and check that it works.</p><label className="popup-goal-label">Your task<textarea aria-label="Your task" rows={4} maxLength={1500} value={goal} onChange={event=>setGoal(event.target.value)} placeholder="Search for men’s shoes using a query from the agent, and return the first 10 links."/></label>
        <Button className="main-button" disabled={!canRecord||goal.trim().length<5} loading={busy} onClick={start}><span className="record-glyph"/> Start recording</Button>
      </>}
      {paired&&loaded&&!canRecord&&!recording&&<p className="popup-requirement">Open an HTTPS website to start a new recording.</p>}
      {paired&&canRecord&&!recording&&<button className="popup-discard" disabled={busy} onClick={()=>void saveLogin()}>{loginSaved?'Website login saved':'Save / update website login'}</button>}
    </div><footer className="popup-footer"><span className={paired?'is-paired':''}><i/>{paired?'Workspace paired':'Not connected'}</span><span>Runs headlessly</span></footer>
  </main>;
}
const popupRoot=document.getElementById('popup-root');if(popupRoot)createRoot(popupRoot).render(<Popup/>);
