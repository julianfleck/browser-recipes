import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {toolSchema,legacyMacro} from './macro-recipe.js';
export function mcpResult(result){
 const images=[];
 function clean(value){if(Array.isArray(value))return value.map(clean);if(!value||typeof value!=='object')return value;if(['image/jpeg','image/png'].includes(value.mimeType)&&typeof value.data==='string'){images.push({type:'image',data:value.data,mimeType:value.mimeType});const{data,...metadata}=value;return metadata;}return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clean(item)]));}
 const structuredContent=clean(result);return {content:[{type:'text',text:JSON.stringify(structuredContent)},...images],structuredContent,isError:result.state!=='found'};
}
export async function serveDomainMcp(request,response,{origin,teachings,runner,feedback,mcp=null},body) {
 const eligible=async()=> (await teachings.list()).filter(item=>item.state==='saved'&&!item.archived&&item.recording.origin===origin&&(!mcp||item.mcpId===mcp.id||!item.mcpId&&!mcp.duplicatedFrom));
 const recipe=item=>item.workflow.schemaVersion===2?item.workflow:legacyMacro(item.workflow,item.recording);
 const server=new Server({name:mcp?.name??`Bridge · ${new URL(origin).host}`,version:'1.0.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...(await eligible()).map(item=>{
  const workflow=recipe(item);return {name:recipe(item).id.split('.')[1],title:workflow.title,description:workflow.description,inputSchema:toolSchema(workflow),annotations:{readOnlyHint:!workflow.allowWrites,destructiveHint:workflow.allowWrites,idempotentHint:!workflow.allowWrites,openWorldHint:true}};
 }),{name:'report_tool_issue',title:'Report a tool issue',description:'Report a failed tool to the website owner: an expired login, a changed page structure, or another execution failure. Include the affected tool name where possible. Do not include credentials, cookies, tokens, private page contents, or full HTML.',inputSchema:{type:'object',properties:{tool_name:{type:'string',description:'The affected callable command name from tools/list. Optional for a site-wide expired login.'},issue:{type:'string',enum:['login_expired','page_changed','execution_failed']},message:{type:'string',minLength:1,maxLength:1000,description:'A brief explanation without secrets or private page contents.'}},required:['issue','message'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}}]}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  if(request.params.name==='report_tool_issue'){
   if(!feedback)return {content:[{type:'text',text:'Feedback is unavailable.'}],isError:true};
   try{const report=await feedback.report(origin,request.params.arguments,mcp?.id??null);return {content:[{type:'text',text:'Issue reported in Bridge. The owner can reconnect the website or repair the tool.'}],structuredContent:{recorded:true,report_id:report.id}};}catch(error){return {content:[{type:'text',text:error.message}],isError:true};}
  }
  const item=(await eligible()).find(item=>recipe(item).id.split('.')[1]===request.params.name);
  if(!item)throw new Error('Unknown or disabled tool');
  try{
   const job=await runner.start(item.id,request.params.arguments??{},false),finished=await runner.wait(job.id);
   return mcpResult(finished.result);
  }catch{return {content:[{type:'text',text:'The tool could not run. Check its inputs and saved website login in Bridge.'}],isError:true};}
 });
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 response.on?.('close',()=>{void transport.close();void server.close();});
 await server.connect(transport);await transport.handleRequest(request,response,body);
}
