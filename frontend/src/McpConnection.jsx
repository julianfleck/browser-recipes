import React,{useState} from 'react';
import {ArrowUpRight,Globe2,RefreshCw} from 'lucide-react';
import {Button} from './components/arc/button/button';
import {CopyButton} from './components/arc/copy-button/copy-button';
import {BottomSheet} from './components/arc/bottom-sheet/bottom-sheet';
import {mcpUrl,mcpLocation} from './lib/workspace-model';
export function ConnectionStatus({status}){
 const tone=status==='Ready'?'ready':status==='Login required'?'login':['Needs attention','Repair required'].includes(status)?'attention':'neutral';
 return <span className={`mcp-connection-status status-${tone}`}><i/>{status}</span>;
}
export function McpUrlField({origin,server}){
 return <div className="mcp-url-field"><label htmlFor="mcp-server-url">MCP URL</label><div><input id="mcp-server-url" aria-label="MCP server URL" readOnly value={mcpUrl(server??origin)} onFocus={event=>event.currentTarget.select()}/><CopyButton value={mcpUrl(server??origin)} label="Copy URL" variant="plain"/></div></div>;
}
export function ReconnectSheet({server,onClose,onRefresh}){
 return <BottomSheet open={Boolean(server)} onOpenChange={open=>{if(!open)onClose();}} title={server?.needsLogin?'Log in again':'Update website login'} description={server?.name} detents={[.7,.93]} className="workflow-sheet"><div className="connect-content"><h2>Reconnect {server?.name}</h2><p>Your tools keep their recipes. Sign in on the website, then update the saved login from Bridge’s extension.</p><ol className="reconnect-steps"><li>Open the website in the browser where Bridge is installed.</li><li>Sign in, then open the Bridge extension.</li><li>Choose <strong>Save / update website login</strong>.</li></ol><div className="reconnect-actions"><a className="workspace-text-button" href={server?.origin} target="_blank" rel="noopener noreferrer"><Globe2 size={14}/> Open website <ArrowUpRight size={13}/></a><Button variant="secondary" onClick={()=>void onRefresh()}><RefreshCw size={14}/> Check status</Button></div><p className="inspector-section-note">After updating the login, test a tool to verify the connection.</p></div></BottomSheet>;
}

export function FeedbackSheet({server,onClose,onReconnect,onResolve}){
 const [busy,setBusy]=useState(null),[error,setError]=useState('');
 async function resolve(id){setBusy(id);setError('');try{await onResolve(id);}catch(error){setError(error.message);}finally{setBusy(null);}}
 return <BottomSheet open={Boolean(server)} onOpenChange={open=>{if(!open)onClose();}} title="Agent reports" description={server?.name} detents={[.8,.94]} className="workflow-sheet"><div className="feedback-sheet-content"><p className="feedback-intro">Agents can report a failed tool using <code>report_tool_issue</code>. These are agent reports; test a repaired recipe to verify it works again.</p>{error&&<p className="studio-error" role="alert">{error}</p>}{!server?.issues.length&&<p className="inspector-message">No open agent reports for this MCP.</p>}{server?.issues.map(report=><article className="feedback-report" key={report.id}><header><strong>{report.issue==='login_expired'?'Login expired':report.issue==='page_changed'?'Page structure changed':'Tool execution failed'}</strong><span>Agent report</span></header>{report.toolName&&<code className="feedback-tool-name">{report.toolName}</code>}<p>{report.message}</p><small>{new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(report.lastSeenAt))}{report.count>1?` · Reported ${report.count} times`:''}</small><div className="feedback-actions">{report.issue==='login_expired'?<Button variant="secondary" size="sm" onClick={()=>onReconnect(server)}>Log in again</Button>:<a className="workspace-text-button" href={mcpLocation(server,report.teachingId,'?rerecord=1')}>Re-record tool <ArrowUpRight size={13}/></a>}{report.teachingId&&<a className="mcp-view-tools" href={mcpLocation(server,report.teachingId)}>Review recipe</a>}<Button variant="ghost" size="sm" loading={busy===report.id} onClick={()=>void resolve(report.id)}>Mark resolved</Button></div></article>)}</div></BottomSheet>;
}
