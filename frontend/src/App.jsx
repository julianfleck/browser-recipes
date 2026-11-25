import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Globe2, Search, Trash2, Workflow, X } from 'lucide-react';
import { SortableDataTable } from './components/arc/sortable-data-table/sortable-data-table';
import { FilterToolbar } from './components/arc/filter-toolbar/filter-toolbar';
import WorkspaceChrome from './WorkspaceChrome';
import RecordMenu from './RecordMenu';
import { requestExtension } from './extension-bridge';
import { domain } from './lib/workspace-model';
import './teachings.css';

export default function App() {
  const [sessions,setSessions]=useState([]);
  const [teachings,setTeachings]=useState([]);
  const [token,setToken]=useState('');
  const [extension,setExtension]=useState('checking');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [filters,setFilters]=useState([]);
  const [removing,setRemoving]=useState('');
  const searchRef=useRef(null);
  async function request(path,options={}) {
    const response=await fetch(path,options);const body=await response.json();
    if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);
    return body;
  }
  async function refresh(auth=token){
    const [sites,workflows]=await Promise.all([request('/api/browser-sessions'),request('/api/teachings',{headers:{authorization:`Bearer ${auth}`}})]);
    setSessions(sites.sessions??[]);setTeachings(workflows.teachings??[]);setError('');
  }
  useEffect(()=>{
    let live=true;
    request('/api/browser-sessions/pairing').then(async({token})=>{
      if(!live)return;setToken(token);
      await refresh(token);const ping=await requestExtension('ping');
      if(!live)return;
      if(ping.ok){const paired=await requestExtension('pair',token);if(live)setExtension(paired.ok?'ready':'unpaired');}
      else setExtension(ping.reason==='reload_required'?'reload_required':'missing');
    }).catch(cause=>{if(live)setError(cause.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    const shortcut=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus();}};
    document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut);
  },[]);
  async function remove(origin){
    if(!confirm(`Remove the saved session for ${domain(origin)}?`))return;
    setRemoving(origin);setError('');
    try{const result=await request(`/api/browser-sessions?origin=${encodeURIComponent(origin)}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`}});setSessions(result.sessions??[]);}
    catch(cause){setError(cause.message);}finally{setRemoving('');}
  }
  const rows=useMemo(()=>sessions.map(item=>{
    const workflows=teachings.filter(workflow=>!workflow.archived&&workflow.recording.origin===item.origin).length;
    return {...item,site:domain(item.origin),saved:Date.parse(item.savedAt)||null,workflows,usage:workflows?'With tools':'Without tools'};
  }),[sessions,teachings]);
  const visible=rows.filter(row=>row.site.toLowerCase().includes(query.trim().toLowerCase())&&filters.every(filter=>row[filter.id]===filter.value));
  const columns=[
    {key:'site',label:'Website',render:(value,row)=><a className="table-workflow-link" href={row.origin} target="_blank" rel="noopener noreferrer"><span className="table-workflow-icon"><Globe2 size={17}/></span><span><strong>{value}</strong><small>{row.origin}</small></span><ArrowUpRight className="table-external" size={13}/></a>},
    {key:'workflows',label:'Tools',width:140,render:(value,row)=><a className="table-count-link" href={`/teachings?site=${encodeURIComponent(row.site)}`}><Workflow size={13}/>{value}</a>},
    {key:'saved',label:'Session saved',width:170,render:value=><span className="table-muted">{value?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value):'—'}</span>},
    {key:'state',label:'Session',width:130,sortable:false,render:()=> <span className="workflow-status state-draft"><i/>Login saved</span>},
    {key:'actions',label:'Actions',width:48,sortable:false,render:(_,row)=><RecordMenu label={row.site} disabled={Boolean(removing)} actions={[{label:'Remove session',icon:Trash2,danger:true,onSelect:()=>void remove(row.origin)}]}/>},
  ];
  return <WorkspaceChrome page="Sites" siteCount={sessions.length} workflowCount={teachings.filter(item=>!item.archived).length} extension={extension} workflows={teachings} onRefresh={()=>void refresh().catch(cause=>setError(cause.message))}>
    <main className="collection-page sites-page" id="main-content" tabIndex={-1}>
      <header className="collection-heading"><div><h1>Sites</h1><p>Encrypted website logins for your headless tools.</p></div><a className="workspace-text-button" href="/install"><Globe2 size={15}/> Browser setup <ArrowUpRight size={13}/></a></header>
      {error&&<div className="studio-error" role="alert">{error}</div>}
      <div className="collection-content"><section className="workflows-list">
        <div className="collection-toolbar"><div className="collection-tabs"><span>Saved sessions <b>{sessions.length}</b></span></div><div className="collection-search"><Search size={15}/><input ref={searchRef} type="search" aria-label="Search sites" placeholder="Search websites…" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={13}/></button>}</div></div>
        <div className="collection-filters"><FilterToolbar filters={filters} label="Site filters" onRemove={id=>setFilters(filters.filter(filter=>filter.id!==id))} onClearAll={()=>setFilters([])} addFilter={{fields:[{id:'usage',label:'Tools',options:['With tools','Without tools']}],align:'start',onAdd:filter=>setFilters([filter])}}/><span className="collection-result-count">{visible.length} {visible.length===1?'site':'sites'}</span></div>
        <div className="workflow-table"><SortableDataTable rows={visible} columns={columns} rowKey="origin" caption="Saved sites" defaultSort={{key:'saved',direction:'desc'}} emptyMessage={loading?'Loading sites…':query||filters.length?'No sites match your filters.':'No saved sessions yet.'}/></div>
        <div className="collection-footer"><span><Globe2 size={13}/> Login reuse depends on the website. Update expired logins from the extension.</span><span>Manage sessions from the row menu</span></div>
      </section></div>
    </main>
  </WorkspaceChrome>;
}
