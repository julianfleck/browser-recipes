import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpApp} from '../src/http-app.js';import {compileMacro} from '../src/macro-recipe.js';
test('domain MCP exposes saved tools with variable schemas, calls backend, hides archived tools and rejects other tokens',async()=>{
 const recording={origin:'https://example.org',title:'Find invoice',description:'Find a customer invoice',events:[{type:'navigation',path:'/invoices'},{type:'input',path:'/invoices',selector:'#query',label:'Customer',inputKind:'text',value:'Acme'},{type:'output',path:'/invoices',selector:'#result',mode:'one'}]};
 const item={id:'one',state:'saved',recording,workflow:compileMacro(recording,{})},calls=[];
 const sessions={authorizedMcp:async(origin,auth)=>origin===recording.origin&&auth==='Bearer domain-token'};
 const reports=[];const feedback={report:async(origin,value)=>{reports.push({origin,...value});return {id:'report-1'};}};
 const runner={start:async(id,args,useExamples)=>{calls.push({id,args,useExamples});return {id:'run'};},wait:async()=>({result:item.workflow.id.endsWith('list_customers')?{state:'found',result:{selections:[{index:1,label:'Photo',kind:'image',images:[{mimeType:'image/jpeg',data:'aW1hZ2U=',width:1,height:1}]}]}}:{state:'found',result:'Invoice 1'}})};
 const server=createHttpApp(null,sessions,{}, {list:async()=>[item]},null,runner,null,feedback);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=new URL(`http://127.0.0.1:${server.address().port}/mcp/example.org`),client=new Client({name:'bridge-test',version:'1.0.0'});
 try{
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:'Bearer wrong','content-type':'application/json'},body:'{}'})).status,403);
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:'Bearer domain-token'}}}));
  const list=await client.listTools();assert.equal(list.tools[0].name,'find_invoice');assert.equal(list.tools[0].inputSchema.properties.customer.type,'string');assert.deepEqual(list.tools[0].inputSchema.required,['customer']);
  assert(list.tools.some(tool=>tool.name==='report_tool_issue'));
  const reported=await client.callTool({name:'report_tool_issue',arguments:{tool_name:'find_invoice',issue:'page_changed',message:'The invoice table changed.'}});assert.equal(reported.structuredContent.recorded,true);assert.equal(reports[0].origin,recording.origin);
  const result=await client.callTool({name:'find_invoice',arguments:{customer:'Other'}});assert.equal(result.structuredContent.result,'Invoice 1');assert.deepEqual(calls,[{id:'one',args:{customer:'Other'},useExamples:false}]);
  item.workflow.id='example_org.list_customers';item.workflow.steps.find(step=>step.type==='input').binding='static';
  const renamed=(await client.listTools()).tools.find(tool=>tool.name==='list_customers');assert(renamed);assert.deepEqual(renamed.inputSchema.required,[]);assert.equal(Object.keys(renamed.inputSchema.properties).length,0);
  const fixed=await client.callTool({name:'list_customers',arguments:{}});assert.equal(fixed.isError,false);assert.equal(fixed.content.filter(block=>block.type==='image').length,1);assert.equal(fixed.structuredContent.result.selections[0].images[0].data,undefined);assert.deepEqual(calls.at(-1).args,{});
  item.archived=true;assert.deepEqual((await client.listTools()).tools.map(tool=>tool.name),['report_tool_issue']);
 }finally{await client.close();await new Promise(resolve=>server.close(resolve));}
});
