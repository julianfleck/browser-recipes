import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';
import{McpFeedbackStore}from'../src/mcp-feedback-store.js';
test('feedback is scoped to its MCP, stored durably and resolved after repair',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'mcp-feedback-'));try{
  const tools=[{id:'a',recording:{origin:'https://example.org'},workflow:{id:'example_org.list_customers'}}];
  const store=new McpFeedbackStore(root,async()=>tools);
  const report=await store.report('https://example.org',{tool_name:'list_customers',issue:'page_changed',message:'The customer table selector no longer matches.'});
  assert.equal(report.teachingId,'a');assert.equal((await store.list())[0].state,'open');
  await assert.rejects(store.report('https://other.org',{tool_name:'list_customers',issue:'login_expired',message:'Login expired'}),/tool/);
  assert.equal((await new McpFeedbackStore(root,async()=>tools).list()).length,1);
  await store.resolveMatching('https://example.org',{teachingId:'a'});assert.equal((await store.list())[0].state,'resolved');
 }finally{await rm(root,{recursive:true,force:true});}
});
