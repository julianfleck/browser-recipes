import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowUpRight, CheckCheck, ChevronRight, CircleDashed, Globe2, Menu, Puzzle, RefreshCw, Workflow, Server, X } from 'lucide-react';
import { ResizablePanels, ResizablePanel } from './components/arc/resizable-panels/resizable-panels';
import { Tooltip } from './components/arc/tooltip/tooltip';
import { domain, sidebarLayout, mcpRows } from './lib/workspace-model';
import {useWorkspace} from './workspace-data';
import BridgeMark from './BridgeMark';
import {TreeView} from './components/arc/tree-view/tree-view';
import './workspace.css';

function NavLink({ href, icon: Icon, children, count, active, compact }) {
  const link = <a className={`workspace-nav-link${active ? ' is-active' : ''}`} href={href} aria-label={children} aria-current={active ? 'page' : undefined}>
    <Icon size={17} strokeWidth={1.7} aria-hidden="true"/><span className="nav-label">{children}</span>{count != null && <span className="workspace-nav-count">{count}</span>}
  </a>;
  return compact ? <Tooltip content={children} side="right">{link}</Tooltip> : link;
}

export default function WorkspaceChrome({ page, workflowCount, siteCount, extension = 'neutral', onRefresh, workflows = [], sessions = [], servers: serverProp, activeOrigin = null, activeMcpId = null, children }) {
  const workspace=useWorkspace();
  const navWorkflows=workflows.length?workflows:workspace.items;
  const [navOpen, setNavOpen] = useState(false);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 700px)').matches);
  const [initialWidth, setInitialWidth] = useState(() => { try { return sidebarLayout(localStorage.getItem('bridge.sidebar.width')).width; } catch { return 236; } });
  const [compact, setCompact] = useState(sidebarLayout(initialWidth).compact);
  const sidebarRef = useRef(null);
  const menuRef = useRef(null);
  const groupRef = useRef(null);
  const params = new URLSearchParams(location.search);
  useEffect(() => {
    const media = matchMedia('(max-width: 700px)');
    const change = () => { setMobile(media.matches); setNavOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (mobile || !sidebarRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCompact(sidebarLayout(sidebarRef.current.getBoundingClientRect().width).compact));
    observer.observe(sidebarRef.current);
    return () => observer.disconnect();
  }, [mobile]);
  useEffect(() => {
    if (!navOpen) return;
    const previous = document.activeElement;
    sidebarRef.current?.querySelector('button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { setNavOpen(false); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...sidebarRef.current.querySelectorAll('a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"])')];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [navOpen]);
  const servers=useMemo(()=>serverProp??mcpRows(navWorkflows,sessions.length?sessions:workspace.sessions,workspace.reports,workspace.mcps),[serverProp,navWorkflows,sessions,workspace.mcps,workspace.sessions,workspace.reports]);
  const iconMode = compact && !mobile;
  const browserLabel = extension === 'ready' ? 'Extension ready' : extension === 'checking' ? 'Checking extension' : extension === 'reload_required' ? 'Reload tab to reconnect' : extension === 'unpaired' ? 'Extension needs pairing' : extension === 'missing' ? 'Extension not connected' : 'Browser extension';
  const [expanded,setExpanded]=useState(()=>{try{return JSON.parse(localStorage.getItem('bridge.sidebar.tree'))??['mcps','sites'];}catch{return ['mcps','sites'];}});
  const activeServer=servers.find(server=>server.id===activeMcpId)||servers.find(server=>server.origin===activeOrigin);
  const treeNodes=[
    {id:'mcps',label:'MCPs',href:'/mcps',icon:<Server size={16}/>,count:servers.length,children:servers.map(server=>({id:`mcp:${server.id}`,label:server.name,href:server.href,icon:<Server size={15}/>,children:navWorkflows.filter(tool=>!tool.archived&&(tool.mcpId?tool.mcpId===server.id:tool.recording.origin===server.origin&&!server.duplicatedFrom)).map(tool=>({id:`tool:${tool.id}`,label:tool.recording.title,href:`${server.href}/tools/${tool.id}`,icon:<Workflow size={14}/>}))}))},
    {id:'sites',label:'Sites',href:'/sites',icon:<Globe2 size={16}/>,count:new Set(servers.map(server=>server.origin)).size,children:servers.filter((server,index,list)=>list.findIndex(other=>other.origin===server.origin)===index).map(server=>({id:`site:${server.id}`,label:domain(server.origin),href:server.href,icon:<Globe2 size={15}/>}))},
  ];
  const selectedTool=location.pathname.match(/\/tools\/([^/]+)/)?.[1];
  const selectedTree=activeServer?selectedTool?`tool:${selectedTool}`:`mcp:${activeServer.id}`:page==='Sites'?'sites':page==='MCPs'?'mcps':null;
  const treeExpanded=[...new Set([...expanded,...(activeServer?[`mcp:${activeServer.id}`]:[])])];
  const sidebar = <aside ref={sidebarRef} id="workspace-sidebar" className={`workspace-sidebar${iconMode ? ' is-compact' : ''}${navOpen ? ' is-open' : ''}`} data-compact={iconMode} aria-label="Main navigation">
    <div className="workspace-sidebar-head"><a className="workspace-brand" href="/mcps" aria-label="Browser Recipes workspace"><span className="workspace-brand-mark"><BridgeMark/></span><span className="nav-label">Browser Recipes<span className="workspace-brand-sub">Website tools</span></span></a>{mobile && <button className="workspace-nav-close" aria-label="Close navigation" onClick={() => setNavOpen(false)}><X size={18}/></button>}</div>
    {iconMode?<nav className="workspace-nav" aria-label="Workspace"><NavLink compact href="/mcps" icon={Server} active={page==='MCPs'||Boolean(activeServer)}>MCPs</NavLink><NavLink compact href="/sites" icon={Globe2} active={page==='Sites'}>Sites</NavLink></nav>:<nav className="workspace-tree" aria-label="Workspace"><TreeView nodes={treeNodes} selectedId={selectedTree} expandedIds={treeExpanded} onExpandedChange={ids=>{setExpanded(ids);try{localStorage.setItem('bridge.sidebar.tree',JSON.stringify(ids));}catch{}}} aria-label="MCPs and sites"/></nav>}
    <div className="workspace-sidebar-spacer"/>
    <div className="workspace-sidebar-footer">
      <NavLink compact={iconMode} href="/install" icon={Puzzle} active={page === 'Extension setup'}>Extension setup</NavLink>
      <Tooltip content={browserLabel} side={iconMode ? 'right' : 'top'}><span className={`workspace-presence ${extension}`} role="status" tabIndex={iconMode ? 0 : undefined}><span className="workspace-presence-dot"/><span className="nav-label">{browserLabel}</span></span></Tooltip>
    </div>
  </aside>;
  const body = <div className="workspace-body" inert={mobile && navOpen}>
    <header className="workspace-topbar">{mobile && <button ref={menuRef} className="workspace-mobile-menu" aria-label="Open navigation" aria-controls="workspace-sidebar" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Menu size={19}/></button>}<div className="workspace-breadcrumb">{activeServer?<><a href="/mcps">MCPs</a><ChevronRight size={13}/><a href={activeServer.href}>{activeServer.name}</a><ChevronRight size={13}/><strong>Tools</strong></>:<><span>Workspace</span><ChevronRight size={13} aria-hidden="true"/><strong>{page}</strong></>}</div><div className="workspace-top-actions">{onRefresh && <Tooltip content="Refresh workspace"><button className="workspace-icon-button" aria-label="Refresh workspace" onClick={onRefresh}><RefreshCw size={15}/></button></Tooltip>}<a href="/install" className="workspace-extension-link"><Puzzle size={14}/><span>Browser extension</span><ArrowUpRight size={12}/></a></div></header>
    {children}
  </div>;
  return <div className={`workspace-shell${mobile ? ' is-mobile' : ''}`} ref={groupRef}>
    <a className="workspace-skip" href="#main-content">Skip to content</a>
    {mobile ? <>{navOpen && <><button className="workspace-nav-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)}/>{sidebar}</>}{body}</> : <ResizablePanels className="workspace-layout" label="Website tools" onLayoutChange={shares => { try { const width = sidebarLayout(shares[0] / 100 * (groupRef.current.clientWidth - 1)).width; localStorage.setItem('bridge.sidebar.width', String(width)); setInitialWidth(width); } catch {} }}>
      <ResizablePanel id="navigation-panel" label="Navigation" defaultSize={initialWidth} minSize={64} maxSize={360}>{sidebar}</ResizablePanel>
      <ResizablePanel id="workspace-panel" label="Workspace" defaultSize={Math.max(400, innerWidth - initialWidth)} minSize={340}>{body}</ResizablePanel>
    </ResizablePanels>}
  </div>;
}
