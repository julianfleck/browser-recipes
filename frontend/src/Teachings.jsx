import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleDashed, Globe2, ListOrdered, Play, Puzzle, RotateCcw, Search, Sparkles, MessageSquareWarning, Workflow, X } from 'lucide-react';
import { Button } from './components/arc/button/button';
import { FilterToolbar } from './components/arc/filter-toolbar/filter-toolbar';
import { BottomSheet } from './components/arc/bottom-sheet/bottom-sheet';
import WorkflowProgress from './WorkflowProgress';
import BrowserTestRun from './BrowserTestRun';
import ToolPreparation from './ToolPreparation';
import ToolResult from './ToolResult';
import RecipeEditor from './RecipeEditor';
import ToolLibrary from './ToolLibrary';
import {McpEditorDrawer} from './McpDrawer';
import {ConnectionStatus,McpUrlField,ReconnectSheet,FeedbackSheet} from './McpConnection';
import WorkspaceChrome from './WorkspaceChrome';
import {useWorkspace,workspaceRequest,refreshWorkspace,setWorkspace} from './workspace-data';
import { domain, workflowRows, filterWorkflows, workflowStatuses, recordingTimeline, workflowLocation, mcpRows, mcpLocation, readMcpRoute } from './lib/workspace-model';
import './teachings.css';

const readId = () => readMcpRoute().toolId || (location.pathname.startsWith('/teachings/') ? decodeURIComponent(location.pathname.split('/')[2] || '') : new URLSearchParams(location.search).get('teaching'));
const dateLabel = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value) : '—';
const initialFiltersFor = initialParams => ['status', 'site', 'lastTest'].filter(id => initialParams.has(id)).map(id => ({ id, label: {status:'Status',site:'Website',lastTest:'Last test'}[id], value:initialParams.get(id) }));
function Status({ state, children }) { return <span className={`workflow-status state-${state}`}><i/>{children}</span>; }

export default function Teachings() {
  const initialParams=new URLSearchParams(location.search);
  const {token,items,sessions,reports,mcps,library,loading,extension}=useWorkspace();
  const [selectedId, setSelectedId] = useState(readId);
  const selectedRef = useRef(selectedId);
  const [current, setCurrent] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [testError, setTestError] = useState('');
  const [view, setView] = useState(initialParams.get('view') === 'archived' ? 'archived' : 'active');
  const [query, setQuery] = useState(initialParams.get('q') ?? '');
  const [filters, setFilters] = useState(()=>initialFiltersFor(initialParams));
  const [siteCount, setSiteCount] = useState(null);
  const [libraryBusy,setLibraryBusy]=useState(false),[dirty,setDirty]=useState(false),[connect,setConnect]=useState(null),[copied,setCopied]=useState(false);
  const [guide, setGuide] = useState(initialParams.has('rerecord')||initialParams.has('record'));
  const [showFeedback,setShowFeedback]=useState(false);
  const [reconnect,setReconnect]=useState(false),[editMcp,setEditMcp]=useState(false);
  const servers=useMemo(()=>mcpRows(items,sessions,reports,mcps),[items,sessions,reports,mcps]);
  const server=servers.find(server=>current?.mcpId===server.id)||servers.find(server=>server.id===readMcpRoute().host)||servers.find(server=>server.endpoint===readMcpRoute().host)||servers.find(server=>!server.duplicatedFrom&&new URL(server.origin).host===readMcpRoute().host)||servers.find(server=>!server.duplicatedFrom&&current?.recording.origin===server.origin)||servers.find(server=>domain(server.origin)===initialParams.get('site'))||servers[0];
  const activeOrigin=server?.origin;
  const scopedItems=items.filter(item=>item.mcpId?item.mcpId===server?.id:item.recording.origin===activeOrigin&&!server?.duplicatedFrom);
  const toolLocation=(id,search=location.search)=>activeOrigin?mcpLocation(server,id,search):workflowLocation(id,search);
  const searchRef = useRef(null);
  const sheetReturnRef = useRef(null);
  const guideReturnRef = useRef(null);

  const request=(path,options={},auth=token)=>workspaceRequest(path,options,auth);
  const setLibrary=value=>setWorkspace({library:value});
  const setSessions=value=>setWorkspace({sessions:value});
  async function refresh(auth=token,id=selectedId){await refreshWorkspace(auth);if(id&&selectedRef.current===id){const result=await request(`/api/teachings/${id}`);if(selectedRef.current===id){setCurrent(result.teaching);setJob(result.testJob);}}}
  useEffect(() => {
    if (!token || !selectedId) { setJob(null); return; }
    let alive = true;
    request(`/api/teachings/${selectedId}`).then(data => { if (alive) { setCurrent(data.teaching); setJob(data.testJob); } }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [token, selectedId]);
  useEffect(() => {
    if (!token || !(['queued','running'].includes(job?.state)||['refining','testing'].includes(current?.build?.state))) return;
    const timer = setInterval(() => { void refresh().catch(cause => setError(cause.message)); }, 1200);
    return () => clearInterval(timer);
  }, [token, job?.state, current?.build?.state, selectedId]);
  useEffect(() => {
    if (!token || !items.some(item => item.state === 'recorded')) return;
    const timer = setInterval(() => { void refresh().catch(cause => setError(cause.message)); }, 2000);
    return () => clearInterval(timer);
  }, [token, items.some(item => item.state === 'recorded'), selectedId]);
  useEffect(() => {
    const pop = () => {
      const id = readId();
      if (id !== selectedRef.current) { selectedRef.current = id; setSelectedId(id); setCurrent(null); setTestError(''); }
      const params = new URLSearchParams(location.search);setGuide(params.has('record')||params.has('rerecord'));
      setQuery(params.get('q') ?? ''); setView(params.get('view') === 'archived' ? 'archived' : 'active');
      setFilters(['status','site','lastTest'].filter(key => params.has(key)).map(key => ({id:key,label:{status:'Status',site:'Website',lastTest:'Last test'}[key],value:params.get(key)})));
    };
    const shortcut = event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } };
    addEventListener('popstate', pop);addEventListener('bridge:navigate',pop); document.addEventListener('keydown', shortcut);
    return () => { removeEventListener('popstate', pop);removeEventListener('bridge:navigate',pop); document.removeEventListener('keydown', shortcut); };
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    ['status','site','lastTest','q','view'].forEach(key => url.searchParams.delete(key));
    filters.forEach(filter => url.searchParams.set(filter.id, filter.value));
    if (query) url.searchParams.set('q', query);
    if (view === 'archived') url.searchParams.set('view', view);
    if(activeOrigin&&(!selectedId||current?.id===selectedId))history.replaceState(null,'',toolLocation(selectedId,url.search));
  }, [filters, query, view, selectedId, activeOrigin, current?.id]);

  function selectWorkflow(id) {
    if (id === selectedRef.current) return;
    selectedRef.current = id;
    history.pushState(null, '', toolLocation(id,location.search));
    setSelectedId(id);setDirty(false); if (id) setCurrent(null); setJob(null); setTestError(''); setError('');
  }
  async function action(kind, id = current?.id) {
    if (!id) return;
    setBusy(`${kind}:${id}`); setError(''); if (kind === 'test') setTestError('');
    try {
      const data = await request(`/api/teachings/${id}/${kind}`, { method: 'POST' });
      if (data.teaching && selectedRef.current === id) setCurrent(data.teaching);
      if (data.job && selectedRef.current === id) setJob(data.job);
      await refresh(token, selectedId);
    } catch (cause) { if (kind === 'test') setTestError(cause.message); else setError(cause.message); }
    finally { setBusy(''); }
  }

  async function prepareTool(options){setBusy(`build:${current.id}`);setError('');try{const data=await request(`/api/teachings/${current.id}/build`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(options)});setCurrent(data.teaching);setDirty(false);await refresh();}catch(cause){setError(cause.message);}finally{setBusy('');}}

  async function saveRecipe(recipe){
    setBusy(`recipe:${current.id}`);setError('');
    try{const data=await request(`/api/teachings/${current.id}/recipe`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(recipe)});setCurrent(data.teaching);setJob(null);setDirty(false);await request(`/api/teachings/${current.id}/build`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({useCurrentRecipe:true})});await refresh();}
    catch(cause){setError(cause.message);}finally{setBusy('');}
  }
  async function saveLibrary(next){
    const previous=library;setLibrary(next);setLibraryBusy(true);setError('');
    try{const data=await request('/api/library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(next)});setLibrary(data.library);}
    catch(cause){setLibrary(previous);setError(cause.message);}finally{setLibraryBusy(false);}
  }
  async function resetConnection(){setBusy('connect');try{await request('/api/mcp-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mcpId:server.id,origin:connect,rotate:true})});setCopied(false);setError('Previous access revoked. Copy the new configuration to reconnect your agent.');}catch(cause){setError(cause.message);}finally{setBusy('');}}
  async function copyConnection(){
    setBusy('connect');setError('');
    try{const data=await request('/api/mcp-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mcpId:server.id,origin:connect})});await navigator.clipboard.writeText(JSON.stringify({mcpServers:{[server.endpoint]:{url:data.url,headers:{Authorization:`Bearer ${data.token}`}}}},null,2));setCopied(true);}
    catch(cause){setError(cause.message);}finally{setBusy('');}
  }
  const rows = useMemo(() => workflowRows(scopedItems), [items,server?.id]);
  const visible = useMemo(() => filterWorkflows(rows, { query, filters, view }), [rows, query, filters, view]);
  const fields = [
    {id:'status',label:'Status',icon:<CircleDashed size={14}/>,options:Object.values(workflowStatuses)},
    {id:'lastTest',label:'Last test',icon:<Play size={14}/>,options:['Passed','Failed','Not tested']},
  ];
  const list = <section className="workflows-list scoped-tools-list" aria-label="MCP tools">
    <div className="collection-toolbar"><div className="collection-tabs" role="group" aria-label="Workflow view"><button aria-pressed={view==='active'} onClick={()=>setView('active')}>All tools <span>{scopedItems.filter(item=>!item.archived).length}</span></button><button aria-pressed={view==='archived'} onClick={()=>setView('archived')}>Archived <span>{scopedItems.filter(item=>item.archived).length}</span></button></div><div className="collection-search"><Search size={15}/><input ref={searchRef} type="search" aria-label="Search tools" placeholder="Search tools…" value={query} onChange={event=>setQuery(event.target.value)}/>{query && <button aria-label="Clear search" onClick={()=>setQuery('')}><X size={13}/></button>}</div><Button onClick={event=>{guideReturnRef.current=event.currentTarget;setGuide(true);}}><Workflow size={14}/> Record tool</Button></div>
    <div className="collection-filters"><FilterToolbar filters={filters} onRemove={id=>setFilters(filters.filter(item=>item.id!==id))} onClearAll={()=>setFilters([])} addFilter={{fields,onAdd:filter=>setFilters(current=>[...current.filter(item=>item.id!==filter.id),filter]),align:'start'}} label="Workflow filters"/><span className="collection-result-count">{visible.length} {visible.length===1?'tool':'tools'}</span></div>
    <ToolLibrary rows={visible} allItems={items} scopeOrigin={activeOrigin} scopeServer={server} library={library} sessions={sessions} busy={libraryBusy||Boolean(busy)} onChange={saveLibrary} onSelect={(id,opener)=>{sheetReturnRef.current=opener;selectWorkflow(id);}} onArchive={action} onConnect={origin=>{setConnect(origin);setCopied(false);}}/>
    {!loading && !scopedItems.length && <div className="collection-empty-guide"><Workflow size={22}/><h2>Record your first tool</h2><p>Demonstrate a task on a website, test its recipe, and make it available to your agent.</p><Button variant="secondary" onClick={event=>{guideReturnRef.current=event.currentTarget;setGuide(true);}}>How to record <ChevronRight size={14}/></Button></div>}
    <div className="mcp-builtin-tool"><MessageSquareWarning size={15}/><code>report_tool_issue</code><span>Agents can report broken tools or an expired login.</span><small>Built-in · Always available</small></div>
    <div className="collection-footer"><span><Globe2 size={13}/> Runs headlessly on this computer</span><span>Website → MCP server → tools</span></div>
  </section>;
  const run = job ?? current?.testRun;
  const result = job ? job.state==='completed' ? job.result : job.state==='timed_out' ? {state:'timed_out'} : null : current?.test;
  const active = ['queued','running'].includes(run?.state);
  const inspector = current ? <div className="tool-detail-content">
    {error&&<div className="studio-error" role="alert">{error}</div>}
    <div className="tool-detail-summary"><span className={`workflow-status state-${active?'recorded':current.state}`}><i/>{active?'Testing':workflowStatuses[current.state]}</span><span>{current.workflow?.schemaVersion===2?'Recorded macro':'Imported read recipe'}</span><a href={current.recording.origin} target="_blank" rel="noopener noreferrer">Open website <ArrowUpRight size={12}/></a></div>
    {current.archived&&<p className="inspector-message">Archived tools are hidden from the MCP server.</p>}
    {current.state==='needs_model'&&<Button loading={busy===`generate:${current.id}`} onClick={()=>action('generate')}>Build recipe</Button>}
    {!current.archived&&<ToolPreparation item={current} onPrepare={prepareTool} disabled={dirty} busy={busy===`build:${current.id}`}/>}
    {!dirty&&(run||result||testError)&&<BrowserTestRun run={run} result={result} error={testError} canRun={!dirty&&current.state==='saved'&&!current.archived} canSave={!dirty&&current.state==='tested'&&!active&&!current.archived} onRun={()=>action('test')} onSave={()=>action('save')} runBusy={busy===`test:${current.id}`} saveBusy={busy===`save:${current.id}`}/>}
    {!dirty&&current.state==='saved'&&<p className="saved-note"><Check size={14}/> Available in the {domain(current.recording.origin)} MCP server</p>}
    {!dirty&&result?.state==='found'&&<details className="tool-result" open><summary>Returned content</summary><div className="tool-result-content"><ToolResult result={result}/></div></details>}
    {dirty&&<p className="inspector-message">Apply your changes to check and update the tool.</p>}
    <RecipeEditor key={current.id} item={current} onSave={saveRecipe} busy={busy===`recipe:${current.id}`} onDirty={setDirty}/>
    <details className="tool-command-details"><summary>Agent command</summary><dl><dt>Command</dt><dd>{current.workflow?.id?.split('.')[1]}</dd><dt>MCP server</dt><dd>{domain(current.recording.origin)}</dd><dt>Execution</dt><dd>Backend · headless browser · saved website login</dd></dl><Button variant="secondary" size="sm" onClick={()=>{setConnect(current.recording.origin);setCopied(false);}}>Connect an agent <ArrowUpRight size={13}/></Button></details>
  </div>:<div className="inspector-empty">{error?'Could not open this tool.':'Opening tool…'}</div>;
  return <WorkspaceChrome page="Tools" activeOrigin={activeOrigin} activeMcpId={server?.id} sessions={sessions} servers={servers} workflowCount={items.filter(item=>!item.archived).length} siteCount={siteCount} extension={extension} workflows={items} onRefresh={()=>void refresh().catch(cause=>setError(cause.message))}>
    <main className="studio collection-page" id="main-content" tabIndex={-1}>
      <header className="collection-heading mcp-detail-heading"><div><span className="mcp-eyebrow">MCP server</span><h1>{server?.name??'Opening MCP…'}</h1><p>{server?.savedTools??0} {server?.savedTools===1?'tool':'tools'} available to agents · {scopedItems.filter(item=>!item.archived).length} {scopedItems.filter(item=>!item.archived).length===1?'tool':'tools'} in this MCP</p></div><div className="mcp-heading-actions">{server&&<ConnectionStatus status={server.status}/>}<Button variant="secondary" size="sm" onClick={()=>{setConnect(activeOrigin);setCopied(false);}}>Connect agent <ArrowUpRight size={13}/></Button>{server?.needsLogin&&<Button variant="secondary" size="sm" onClick={()=>setReconnect(true)}>Log in again</Button>}</div></header>{activeOrigin&&<div className="mcp-url-settings"><McpUrlField origin={activeOrigin} server={server}/><Button variant="ghost" size="sm" onClick={()=>setEditMcp(true)}>Edit MCP</Button></div>}
      {error && <div className="studio-error" role="alert">{error}</div>}
      {extension==='missing'||extension==='unpaired'||extension==='reload_required'?<div className="extension-strip"><Puzzle size={14}/><span>{extension==='reload_required'?'Reload this tab to reconnect the extension.':'Connect the extension to record tools. Saved tools run from the backend.'}</span><a href="/install">Set up <ArrowUpRight size={12}/></a></div>:null}
      {Boolean(server?.issueCount)&&<div className="mcp-issue-banner"><span>{server.issueCount} agent {server.issueCount===1?'report needs':'reports need'} attention.</span><Button variant="ghost" size="sm" onClick={()=>setShowFeedback(true)}>Review reports</Button></div>}
      <div className="collection-content">{list}</div>
      <BottomSheet open={Boolean(selectedId)} onOpenChange={open=>{if(!open)selectWorkflow(null);}} title={current?.recording.title ?? 'Opening workflow…'} description={current ? `${domain(current.recording.origin)} / MCP server / Tool` : 'Tool details'} detents={[.93]} closeLabel="Close workflow details" onCloseAutoFocus={event=>{event.preventDefault();(sheetReturnRef.current??searchRef.current)?.focus({preventScroll:true});}} className="workflow-sheet">{inspector}</BottomSheet>
      <BottomSheet open={guide} onOpenChange={open=>{setGuide(open);if(!open){const url=new URL(location.href);url.searchParams.delete('record');url.searchParams.delete('rerecord');history.replaceState(null,'',url.pathname+url.search);}}} title={initialParams.has('rerecord')?'Re-record tool':'Record a tool'} onCloseAutoFocus={event=>{event.preventDefault();guideReturnRef.current?.focus({preventScroll:true});}} description="From a website task to an agent command" detents={[.72,.93]} initialDetent={0} className="workflow-sheet recording-start-sheet">
        <WorkflowProgress phase={0}/><div className="recording-start-content"><h2>{initialParams.has('rerecord')?`Record ${current?.recording.title??'this tool'} again`:'Start on the website'}</h2>{initialParams.has('rerecord')&&<p>Record a replacement, test it, then archive the outdated tool. You can keep the original command name by assigning it to the replacement after archiving the old tool.</p>}<p>Open the website in the browser where Browser Recipes is installed. Click the Browser Recipes extension, then choose <strong>Start recording</strong>.</p><p>In the extension, choose <strong>{server?.name}</strong> as the MCP before starting.</p><ol><li>Demonstrate the action on the website.</li><li>Choose <strong>Review recording</strong> and select the content to read.</li><li>Choose variable or fixed inputs, then create and test the tool in the extension.</li></ol><p className="inspector-section-note">The website login is saved encrypted on this computer. Tests and agent calls run in an isolated headless browser on the backend.</p><div className="reconnect-actions"><a className="workspace-text-button" href={activeOrigin} target="_blank" rel="noopener noreferrer"><Globe2 size={14}/> Open website <ArrowUpRight size={13}/></a><a className="mcp-view-tools" href="/install">Extension setup</a></div></div>
      </BottomSheet>
      <McpEditorDrawer open={editMcp} mcp={server} onClose={()=>setEditMcp(false)} onSave={async value=>{await request(`/api/mcps/${server.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});await refresh();}}/>
      <FeedbackSheet server={showFeedback?server:null} onClose={()=>setShowFeedback(false)} onReconnect={()=>{setShowFeedback(false);setReconnect(true);}} onResolve={async id=>{await request(`/api/mcp-feedback/${id}/resolve`,{method:'POST'});await refresh();}}/>
      <ReconnectSheet server={reconnect?server:null} onClose={()=>setReconnect(false)} onRefresh={async()=>{const sites=await request('/api/browser-sessions');setSessions(sites.sessions);await refresh();}}/>
      <BottomSheet open={Boolean(connect)} onOpenChange={open=>{if(!open)setConnect(null);}} title="Connect your agent" description={connect?`${domain(connect)} MCP server`:''} detents={[.66,.93]} className="workflow-sheet connect-sheet"><div className="connect-content"><h2>One website. One MCP server.</h2><p>Every tested, saved tool in {server?.name??'this MCP'} is available from this server. Archived tools are hidden.</p><label>Server URL<code>http://127.0.0.1:8787/mcp/{connect?encodeURIComponent(server.endpoint):''}</code></label><p>Copy the configuration into an MCP client that supports Streamable HTTP. The configuration includes an access token scoped to this website.</p><Button loading={busy==='connect'} onClick={copyConnection}>{copied?<Check size={14}/>:<ArrowUpRight size={14}/>} {copied?'Configuration copied':'Copy MCP configuration'}</Button><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={resetConnection}>Revoke previous access</Button><p className="inspector-section-note">Browser Recipes’s backend must be running. Your browser and extension can be closed after recording.</p></div></BottomSheet>
    </main>
  </WorkspaceChrome>;
}
