import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Globe2,LogIn,Search,Server,Workflow,X,Plus,Power,Play,Ellipsis,Copy,Settings2,Trash2} from 'lucide-react';
import {SortableDataTable} from './components/arc/sortable-data-table/sortable-data-table';
import {FilterToolbar} from './components/arc/filter-toolbar/filter-toolbar';
import {ButtonGroup} from './components/arc/button-group/button-group';
import {McpEditorDrawer,DeleteMcpDrawer} from './McpDrawer';
import {BottomSheet} from './components/arc/bottom-sheet/bottom-sheet';
import {Button} from './components/arc/button/button';
import WorkspaceChrome from './WorkspaceChrome';
import {ConnectionStatus,ReconnectSheet,FeedbackSheet} from './McpConnection';
import {useWorkspace,workspaceRequest,refreshWorkspace} from './workspace-data';
import {navigate} from './navigation';
import {mcpRows,mcpLocation} from './lib/workspace-model';
import './teachings.css';
export default function McpsPage(){
 const isSites=location.pathname==='/sites',label=isSites?'Sites':'MCPs';
 const {items,sessions,reports,mcps,token,loading,error:loadError,extension}=useWorkspace();const [error,setError]=useState('');
 const [editing,setEditing]=useState(null),[addOpen,setAddOpen]=useState(false),[deleting,setDeleting]=useState(null),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
 const [issueServer,setIssueServer]=useState(null);
 const [query,setQuery]=useState(''),[filters,setFilters]=useState([]),[reconnect,setReconnect]=useState(null);const searchRef=useRef(null);
 const request=(path,options={})=>workspaceRequest(path,options);
 const refresh=()=>refreshWorkspace();
 useEffect(()=>{const shortcut=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus();}};document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut);},[]);
 const servers=useMemo(()=>mcpRows(items,sessions,reports,mcps),[items,sessions,reports,mcps]);
 const rows=servers.map(server=>({...server,usage:server.savedTools?'With published tools':'Without published tools'}));
 const visible=rows.filter(row=>`${row.name} ${row.origin}`.toLowerCase().includes(query.trim().toLowerCase())&&filters.every(filter=>row[filter.id]===filter.value));
 async function manage(row,action,body){setBusy(`${action}:${row.id}`);setError('');try{const data=await request(`/api/mcps/${row.id}${action==='update'?'':`/${action}`}`,{method:'POST',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});await refresh();if(action==='test')setNotice(data.mcp.lastTest.state==='reachable'?'Website reachable. Test a tool to verify the full recipe.':data.mcp.lastTest.state==='login_required'?'This website needs a fresh login.':'The website could not be reached.');return data;}catch(error){setError(error.message);throw error;}finally{setBusy('');}}
 const columns=[
  {key:'name',label:isSites?'Website':'MCP',render:(value,row)=><a className="mcp-name-link" href={row.href}>{value}</a>},
  {key:'status',label:'Connection',width:180,render:(value,row)=><div className="mcp-status-cell"><ConnectionStatus status={value}/>{row.issueCount>0&&<button className="mcp-report-link" onClick={()=>setIssueServer(row.id)}>{row.issueCount} agent {row.issueCount===1?'report':'reports'}</button>}{row.needsLogin&&<button className="mcp-login-link" onClick={()=>setReconnect(row)}><LogIn size={12}/> Log in again</button>}</div>},
  {key:'tools',label:'Tools',width:90,render:(value,row)=><a className="table-count-link" href={row.href}>{value}</a>},
  {key:'savedTools',label:'Available to agents',width:150,render:value=><span className="table-muted">{value} published</span>},
  {key:'action',label:'Actions',sortable:false,width:190,render:(_,row)=><ButtonGroup className="mcp-row-actions" size="sm" label={`Actions for ${row.name}`} disabled={Boolean(busy)} items={[
    {id:'create',label:'Create new tool',icon:<Plus size={14}/>,iconOnly:true,href:`${row.href}?record=1`},
    {id:'power',label:row.enabled?'Deactivate MCP':'Activate MCP',icon:<Power size={14}/>,iconOnly:true,onSelect:()=>void manage(row,'update',{enabled:!row.enabled}).catch(()=>{})},
    {id:'test',label:'Test connection',icon:<Play size={14}/>,iconOnly:true,onSelect:()=>void manage(row,'test').catch(()=>{})},
  ]} menu={{label:`More actions for ${row.name}`,icon:<Ellipsis size={15}/>,items:[{id:'edit',label:'Edit name and endpoint',icon:<Settings2 size={14}/>,onSelect:()=>setEditing(row)},{id:'duplicate',label:'Duplicate MCP',icon:<Copy size={14}/>,onSelect:()=>void manage(row,'duplicate').catch(()=>{})},{id:'delete',label:'Delete MCP',icon:<Trash2 size={14}/>,destructive:true,onSelect:()=>setDeleting(row)}]}}/>},
 ];
 return <WorkspaceChrome page={label} workflows={items} sessions={sessions} servers={servers} extension={extension} onRefresh={()=>void refresh().catch(error=>setError(error.message))}>
  <main className="collection-page mcps-overview" id="main-content" tabIndex={-1}>
   <header className="collection-heading"><div><h1>{label}</h1><p>{isSites?'Your websites and their agent tools.':'Your websites, organized as MCPs.'}</p></div><Button variant="secondary" onClick={()=>setAddOpen(true)}><Plus size={14}/> Add new MCP</Button></header>
   {(error||loadError)&&<div className="studio-error" role="alert">{error||loadError}</div>}
   {notice&&<p className="mcp-management-notice" role="status">{notice}</p>}
   <div className="collection-content"><section className="workflows-list" aria-label={`${label} overview`}>
    <div className="collection-toolbar"><div className="collection-tabs"><span>All {label} <b>{servers.length}</b></span></div><div className="collection-search"><Search size={15}/><input ref={searchRef} type="search" aria-label={`Search ${label}`} placeholder={`Search ${isSites?'sites':'MCPs'}…`} value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={13}/></button>}</div></div>
    <div className="collection-filters"><FilterToolbar filters={filters} onRemove={id=>setFilters(filters.filter(filter=>filter.id!==id))} onClearAll={()=>setFilters([])} label={`${label} filters`} addFilter={{fields:[{id:'status',label:'Connection',options:['Ready','Login saved','Login required','Repair required','Public access','Needs attention','Inactive','Unreachable']},{id:'usage',label:'Tools',options:['With published tools','Without published tools']}],align:'start',onAdd:filter=>setFilters(current=>[...current.filter(item=>item.id!==filter.id),filter])}}/><span className="collection-result-count">{visible.length} {label}</span></div>
    <div className="workflow-table mcp-overview-table"><SortableDataTable rows={visible} columns={columns} rowKey="id" caption={label} defaultSort={{key:'name',direction:'asc'}} emptyMessage={loading?'Loading MCPs…':query||filters.length?'No matches. Try another search or filter.':'Record a website task to create your first MCP.'}/></div>
    <div className="collection-footer"><span><Server size={13}/> Each website has its own endpoint and access token</span><span>Runs headlessly on this computer</span></div>
   </section></div>
   <McpEditorDrawer open={addOpen||Boolean(editing)} mcp={editing} onClose={()=>{setAddOpen(false);setEditing(null);}} onSave={async value=>{if(editing)await manage(editing,'update',value);else{const data=await request('/api/mcps',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});await refresh();navigate(mcpLocation(data.mcp));}}}/>
   <DeleteMcpDrawer mcp={deleting} onClose={()=>setDeleting(null)} onDelete={row=>manage(row,'delete')}/>
   <FeedbackSheet server={servers.find(server=>server.id===issueServer)} onClose={()=>setIssueServer(null)} onReconnect={server=>{setIssueServer(null);setReconnect(server);}} onResolve={async id=>{const response=await fetch(`/api/mcp-feedback/${id}/resolve`,{method:'POST',headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Could not resolve report');await refresh();}}/>
   <ReconnectSheet server={reconnect?servers.find(server=>server.id===reconnect.id)??reconnect:null} onClose={()=>setReconnect(null)} onRefresh={()=>refresh()}/>
  </main>
 </WorkspaceChrome>;
}
