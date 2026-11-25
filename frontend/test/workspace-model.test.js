import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/lib/workspace-model.js';
const items = [
 { id:'draft', state:'draft', createdAt:'2026-10-24T12:00:00Z', recording:{title:'Read invoices',description:'Latest invoice',origin:'https://www.example.org',events:[{type:'navigation'},{type:'output',mode:'list'}]}, test:{state:'browser_read_timeout'} },
 { id:'saved', state:'saved', createdAt:'2026-10-25T12:00:00Z', recording:{title:'Read messages',origin:'https://mail.example.net',events:[]},test:{state:'found'} },
 { id:'archived',state:'tested',archived:true,recording:{title:'Old action',origin:'https://example.org',events:[]} },
];
test('workflow rows preserve the distinction between draft state and failed last test',()=>{
 assert.equal(typeof model.workflowRows,'function');
 const rows=model.workflowRows(items);
 assert.equal(rows[0].status,'Ready to test');
 assert.equal(rows[0].lastTest,'Failed');
 assert.equal(rows[0].site,'example.org');
 assert.equal(rows[0].steps,1);
});
test('search, website and status filters compose within the chosen archive view',()=>{
 assert.equal(typeof model.filterWorkflows,'function');
 const rows=model.workflowRows(items);
 assert.deepEqual(model.filterWorkflows(rows,{query:'invoice',filters:[{id:'site',value:'example.org'},{id:'status',value:'Ready to test'}],view:'active'}).map(x=>x.id),['draft']);
 assert.deepEqual(model.filterWorkflows(rows,{query:'',filters:[{id:'site',value:'example.org'},{id:'status',value:'Saved'}],view:'active'}),[]);
 assert.deepEqual(model.filterWorkflows(rows,{view:'archived'}).map(x=>x.id),['archived']);
});
test('sidebar preferences reject invalid widths, clamp extremes and identify icon mode',()=>{
 assert.equal(typeof model.sidebarLayout,'function');
 assert.deepEqual(model.sidebarLayout('broken'),{width:236,compact:false});
 assert.deepEqual(model.sidebarLayout(-12),{width:64,compact:true});
 assert.deepEqual(model.sidebarLayout(150),{width:150,compact:true});
 assert.deepEqual(model.sidebarLayout(900),{width:360,compact:false});
});
test('recorded steps retain demonstration order without inventing timestamps',()=>{
 assert.equal(typeof model.recordingTimeline,'function');
 const events=model.recordingTimeline([{type:'navigation',path:'/account'},{type:'input',path:'/account',redacted:true},{type:'output',mode:'page',path:'/account'}],'2026-10-25T12:00:00Z');
 assert.deepEqual(events.map(x=>x.title),['1. Opened page','2. Changed a field','3. Read page']);
 assert.ok(events.every(x=>x.meta.includes('/account')));
 assert.ok(events[1].meta.includes('Private value hidden'));
 assert.ok(events.every(x=>x.at==='2026-10-25T12:00:00Z'));
});
test('workflow deep links remove legacy selection parameters while retaining collection filters',()=>{
 assert.equal(typeof model.workflowLocation,'function');
 assert.equal(model.workflowLocation('next','?teaching=old&site=example.org&q=invoice'),'/teachings/next?site=example.org&q=invoice');
 assert.equal(model.workflowLocation(null,'?teaching=old&view=archived'),'/teachings?view=archived');
});

test('MCP overview unifies sites and tools while preserving exact website identities',()=>{
 assert.equal(typeof model.mcpRows,'function');
 const rows=model.mcpRows(items,[{origin:'https://login.example.net',savedAt:'2026-10-25T12:00:00Z',needsReconnect:true}]);
 assert.equal(rows.length,4);
 assert.equal(rows.find(row=>row.origin==='https://www.example.org').tools,1);
 assert.equal(rows.find(row=>row.origin==='https://example.org').tools,0);
 assert.equal(rows.find(row=>row.origin==='https://login.example.net').status,'Login required');
 assert.equal(rows.find(row=>row.origin==='https://mail.example.net').status,'Ready');
});
test('MCP routes retain filters and tool selection without losing website identity',()=>{
 assert.equal(typeof model.mcpLocation,'function');
 assert.equal(model.mcpLocation('https://www.example.org','tool-id','?q=invoice'),'/mcps/www.example.org/tools/tool-id?q=invoice');
 assert.equal(model.readMcpRoute('/mcps/www.example.org/tools/tool-id').toolId,'tool-id');
 assert.equal(model.readMcpRoute('/mcps/www.example.org').host,'www.example.org');
});

test('open agent reports surface login or repair needs and resolved reports no longer override connection state',()=>{
 const reports=[{origin:'https://mail.example.net',state:'open',issue:'page_changed',teachingId:'saved',toolName:'read_messages'}];
 let row=model.mcpRows(items,[],reports).find(row=>row.origin==='https://mail.example.net');
 assert.equal(row.status,'Repair required');assert.equal(row.repairToolId,'saved');
 reports[0].issue='login_expired';row=model.mcpRows(items,[],reports).find(row=>row.origin==='https://mail.example.net');assert.equal(row.status,'Login required');
 reports[0].state='resolved';row=model.mcpRows(items,[],reports).find(row=>row.origin==='https://mail.example.net');assert.equal(row.status,'Ready');
});
