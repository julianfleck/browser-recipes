import React,{useState} from 'react';
import {Archive,ArrowDown,ArrowUp,ArrowUpRight,ChevronDown,ChevronRight,Copy,Folder,FolderPlus,Globe2,GripVertical,KeyRound,Plus,RotateCcw,Server,Trash2,Workflow} from 'lucide-react';
import {SortableDataTable} from './components/arc/sortable-data-table/sortable-data-table';
import {Button} from './components/arc/button/button';
import {Tooltip} from './components/arc/tooltip/tooltip';
import RecordMenu from './RecordMenu';
import {domain,workflowLocation,mcpLocation} from './lib/workspace-model';
export default function ToolLibrary({rows,allItems,library,onChange,onSelect,onArchive,onConnect,sessions,busy,scopeOrigin,scopeServer}){
 const [closed,setClosed]=useState(new Set()),[drag,setDrag]=useState(null),[form,setForm]=useState(null),[name,setName]=useState(''),[announcement,setAnnouncement]=useState('');
 const origins=(scopeOrigin?[scopeOrigin]:[...new Set([...rows.map(item=>item.recording.origin),...library.groups.map(group=>group.origin)])].filter(origin=>rows.some(item=>item.recording.origin===origin)||!rows.length).sort());
 const groups=library.groups.filter(group=>!scopeServer||group.mcpId===scopeServer.id||!group.mcpId&&!scopeServer.duplicatedFrom);
 const placement=id=>library.placements.find(item=>item.id===id)??{id,groupId:null,order:100000+allItems.findIndex(item=>item.id===id)};
 function persist(next,message){setAnnouncement(message);void onChange(next);}
 function placeTool(id,groupId,beforeId=null){
  const item=allItems.find(item=>item.id===id),group=library.groups.find(item=>item.id===groupId);
  if(group&&group.origin!==item?.recording.origin)return;
  const siblings=allItems.filter(other=>other.id!==id&&other.recording.origin===item.recording.origin&&(!scopeServer||(other.mcpId?other.mcpId===scopeServer.id:!scopeServer.duplicatedFrom))&&placement(other.id).groupId===groupId).sort((a,b)=>placement(a.id).order-placement(b.id).order).map(item=>item.id);
  const index=beforeId?siblings.indexOf(beforeId):-1;siblings.splice(index<0?siblings.length:index,0,id);
  const ids=new Set(siblings),placements=library.placements.filter(item=>!ids.has(item.id));
  siblings.forEach((id,order)=>placements.push({id,groupId,order}));persist({...library,placements},'Tool moved');
 }
 function moveGroup(id,parentId,beforeId=null){
  const groups=structuredClone(library.groups),group=groups.find(item=>item.id===id);if(!group||id===parentId)return;
  let parent=groups.find(item=>item.id===parentId);while(parent){if(parent.id===id)return;parent=groups.find(item=>item.id===parent.parentId);}
  if(parentId){const target=groups.find(item=>item.id===parentId);if(target?.origin!==group.origin||target?.mcpId!==group.mcpId)return;}
  group.parentId=parentId;groups.splice(groups.indexOf(group),1);const index=beforeId?groups.findIndex(item=>item.id===beforeId):-1;groups.splice(index<0?groups.length:index,0,group);persist({...library,groups},'Group moved');
 }
 function shiftGroup(group,direction){
  const siblings=library.groups.filter(item=>item.origin===group.origin&&item.mcpId===group.mcpId&&item.parentId===group.parentId),index=siblings.findIndex(item=>item.id===group.id);
  if(direction<0&&index>0)moveGroup(group.id,group.parentId,siblings[index-1].id);
  if(direction>0&&index<siblings.length-1)moveGroup(group.id,group.parentId,siblings[index+2]?.id);
 }
 function drop(event,origin,groupId=null,beforeId=null){event.preventDefault();event.stopPropagation();if(!drag||busy)return;const source=drag.type==='tool'?allItems.find(item=>item.id===drag.id)?.recording.origin:library.groups.find(item=>item.id===drag.id)?.origin;if(source!==origin)return;if(drag.type==='tool')placeTool(drag.id,groupId,beforeId);else moveGroup(drag.id,groupId,beforeId);setDrag(null);}
 function dragProps(type,id){return {draggable:!busy,onDragStart:event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);setDrag({type,id});},onDragEnd:()=>setDrag(null)};}
 function addGroup(event){event.preventDefault();if(!name.trim())return;
  const groups=form.id?library.groups.map(group=>group.id===form.id?{...group,name:name.trim()}:group):[...library.groups,{id:crypto.randomUUID(),origin:form.origin,parentId:form.parentId??null,name:name.trim(),...(scopeServer?{mcpId:scopeServer.id}:{})}];persist({...library,groups},form.id?'Group renamed':'Group created');setForm(null);setName('');
 }
 function removeGroup(group){persist({groups:library.groups.filter(item=>item.id!==group.id).map(item=>item.parentId===group.id?{...item,parentId:group.parentId}:item),placements:library.placements.map(item=>item.groupId===group.id?{...item,groupId:group.parentId}:item)},'Group removed; tools kept');}
 function groupPath(group){const names=[group.name];let parent=library.groups.find(item=>item.id===group.parentId);const seen=new Set([group.id]);while(parent&&!seen.has(parent.id)){seen.add(parent.id);names.unshift(parent.name);parent=library.groups.find(item=>item.id===parent.parentId);}return names.join(' / ');}
 function toolTable(origin,groupId){
  const children=rows.filter(row=>row.recording.origin===origin&&placement(row.id).groupId===groupId).map(row=>({...row,libraryOrder:placement(row.id).order}));
  if(!children.length)return null;
  const columns=[
   {key:'libraryOrder',label:'Order',width:38,sortable:false,render:(_,row)=><Tooltip content="Drag to move. Use the move menu for keyboard access."><button className="library-grip" aria-label={`Move ${row.name}`} {...dragProps('tool',row.id)}><GripVertical size={15}/></button></Tooltip>},
   {key:'name',label:'Tool',render:(value,row)=><a className="table-workflow-link" href={scopeOrigin?mcpLocation(scopeServer??scopeOrigin,row.id,location.search):workflowLocation(row.id,location.search)} onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,origin,groupId,row.id)} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey)return;event.preventDefault();onSelect(row.id,event.currentTarget);}}><span><strong>{value}</strong><small>{row.recording.description||`${row.steps} recorded steps`}</small></span></a>},
   {key:'status',label:'Status',width:135,render:(value,row)=><span className={`workflow-status state-${row.state}`}><i/>{value}</span>},
   {key:'lastTest',label:'Last run',width:110,render:value=><span className={`test-outcome ${value==='Passed'?'is-passed':value==='Failed'?'is-failed':''}`}>{value}</span>},
   {key:'move',label:'Group',width:145,sortable:false,render:(_,row)=><select className="library-move-select" aria-label={`Group for ${row.name}`} disabled={busy} value={placement(row.id).groupId??''} onChange={event=>placeTool(row.id,event.target.value||null)}><option value="">Ungrouped</option>{groups.filter(group=>group.origin===origin).map(group=><option key={group.id} value={group.id}>{groupPath(group)}</option>)}</select>},
   {key:'actions',label:'Actions',width:42,sortable:false,render:(_,row)=><RecordMenu label={row.name} disabled={busy} actions={[
    {label:'Move up',icon:ArrowUp,onSelect:()=>{const siblings=[...children].sort((a,b)=>a.libraryOrder-b.libraryOrder),index=siblings.findIndex(item=>item.id===row.id);if(index>0)placeTool(row.id,groupId,siblings[index-1].id);}},
    {label:'Move down',icon:ArrowDown,onSelect:()=>{const siblings=[...children].sort((a,b)=>a.libraryOrder-b.libraryOrder),index=siblings.findIndex(item=>item.id===row.id);if(index<siblings.length-1)placeTool(row.id,groupId,siblings[index+2]?.id);}},
    {label:row.archived?'Restore':'Archive',icon:row.archived?RotateCcw:Archive,onSelect:()=>onArchive(row.archived?'restore':'archive',row.id)}]}/>},
  ];
  return <div className="workflow-table library-table"><SortableDataTable rows={children} columns={columns} rowKey="id" caption={`${domain(origin)} ${groupId?'group tools':'tools'}`} defaultSort={{key:'libraryOrder',direction:'asc'}}/></div>;
 }
 function folder(group,depth=0){const isClosed=closed.has(group.id),tools=rows.filter(row=>placement(row.id).groupId===group.id).length;
  return <section key={group.id} className="library-folder" style={{'--group-depth':Math.min(depth,8)}} onDragOver={event=>{event.preventDefault();event.stopPropagation();}} onDrop={event=>drop(event,group.origin,group.id)}>
   <header className="library-folder-head" onDrop={event=>{const rect=event.currentTarget.getBoundingClientRect();if(drag?.type==='group'&&event.clientY<rect.top+rect.height*.3)drop(event,group.origin,group.parentId,group.id);else drop(event,group.origin,group.id);}}><button className="library-grip" aria-label={`Reorder group ${group.name}. Use arrow keys.`} onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();shiftGroup(group,event.key==='ArrowUp'?-1:1);}}} {...dragProps('group',group.id)}><GripVertical size={14}/></button><button className="library-folder-toggle" aria-expanded={!isClosed} onClick={()=>setClosed(current=>{const next=new Set(current);next.has(group.id)?next.delete(group.id):next.add(group.id);return next;})}>{isClosed?<ChevronRight size={15}/>:<ChevronDown size={15}/>}<Folder size={15}/><strong>{group.name}</strong><small>{tools}</small></button><RecordMenu label={group.name} disabled={busy} actions={[
    {label:'Move group up',icon:ArrowUp,onSelect:()=>shiftGroup(group,-1)},
    {label:'Move group down',icon:ArrowDown,onSelect:()=>shiftGroup(group,1)},
    {label:'New nested group',icon:FolderPlus,onSelect:()=>{setForm({origin:group.origin,parentId:group.id});setName('');}},
    {label:'Rename group',icon:Folder,onSelect:()=>{setForm({origin:group.origin,id:group.id});setName(group.name);}},
    {label:'Move to website root',icon:ArrowUp,onSelect:()=>moveGroup(group.id,null)},
    ...groups.filter(target=>target.origin===group.origin&&target.id!==group.id).map(target=>({label:`Move into ${target.name}`,icon:Folder,onSelect:()=>moveGroup(group.id,target.id)})),
    {label:'Ungroup contents',icon:Trash2,onSelect:()=>removeGroup(group)}]}/></header>
   {!isClosed&&<div className="library-folder-body">{toolTable(group.origin,group.id)}{groups.filter(item=>item.parentId===group.id).map(child=>folder(child,depth+1))}{!tools&&!groups.some(item=>item.parentId===group.id)&&<p className="library-empty-group">Drop a tool here, or choose this group from a tool’s Group menu.</p>}</div>}
  </section>;
 }
 return <div className="tool-library"><span className="sr-only" role="status">{announcement}</span>
  {form&&<form className="library-group-form" onSubmit={addGroup}><FolderPlus size={16}/><label>{form.id?'Rename group':form.parentId?'New nested group':'New group'}<input autoFocus value={name} maxLength={80} onChange={event=>setName(event.target.value)} placeholder="e.g. Invoices" required/></label><Button size="sm" type="submit" disabled={busy}>Save</Button><button type="button" className="workspace-text-button" onClick={()=>setForm(null)}>Cancel</button></form>}
  {origins.map(origin=>{const session=sessions.find(item=>item.origin===origin),count=rows.filter(item=>item.recording.origin===origin).length;
   return <section className={`library-server ${drag?'is-dragging':''}`} key={origin} onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,origin,null)}>
    <header className={`library-server-head ${scopeOrigin?'is-scoped':''}`}>{!scopeOrigin&&<><span className="library-site-icon"><Globe2 size={21}/></span><div><h2>{domain(origin)}</h2><p><Server size={12}/> MCP server <span>·</span> {count} {count===1?'tool':'tools'} <span>·</span> <span className={session?'session-saved':''}>{session?'Login saved':'Public access'}</span></p></div></>}<div className="library-server-actions"><Button variant="ghost" size="sm" onClick={()=>{setForm({origin,parentId:null});setName('');}}><FolderPlus size={14}/> New group</Button>{!scopeOrigin&&<Button variant="secondary" size="sm" onClick={()=>onConnect(origin)}><Plus size={14}/> Connect agent</Button>}</div></header>
    {toolTable(origin,null)}{groups.filter(group=>group.origin===origin&&!group.parentId).map(group=>folder(group))}
    {!count&&!groups.some(group=>group.origin===origin)&&<p className="library-empty-group">No tools match these filters.</p>}
   </section>;
  })}
 </div>;
}
