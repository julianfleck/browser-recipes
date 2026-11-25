import{randomUUID}from'node:crypto';import{mkdir,readFile,writeFile,rename}from'node:fs/promises';import path from'node:path';
export class McpFeedbackStore{
 constructor(directory,listTools){this.directory=directory;this.file=path.join(directory,'reports.json');this.listTools=listTools;this.pending=Promise.resolve();}
 async list(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
 async mutate(change){const work=this.pending.then(async()=>{const reports=await this.list(),result=await change(reports);await mkdir(this.directory,{recursive:true,mode:0o700});const tmp=`${this.file}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(reports,null,2),{mode:0o600});await rename(tmp,this.file);return result;});this.pending=work.catch(()=>{});return work;}
 async report(origin,value,mcpId=null){
  if(!value||!['login_expired','page_changed','execution_failed'].includes(value.issue)||typeof value.message!=='string'||!value.message.trim()||value.message.length>1000)throw new Error('Invalid tool feedback');
  const tools=await this.listTools();let tool;
  if(value.tool_name!==undefined){if(typeof value.tool_name!=='string')throw new Error('Invalid feedback tool');tool=tools.find(tool=>tool.recording.origin===origin&&(!mcpId||tool.mcpId===mcpId)&&tool.workflow?.id.split('.')[1]===value.tool_name);if(!tool)throw new Error('Unknown feedback tool for this website');}
  if(value.issue!=='login_expired'&&!tool)throw new Error('Choose the affected tool');
  return this.mutate(reports=>{
   const now=new Date().toISOString(),existing=reports.find(report=>report.origin===origin&&report.mcpId===mcpId&&report.teachingId===(tool?.id??null)&&report.issue===value.issue&&report.state==='open');
   if(existing){existing.message=value.message.trim();existing.lastSeenAt=now;existing.count++;return existing;}
   const report={id:randomUUID(),origin,mcpId,teachingId:tool?.id??null,toolName:tool?.workflow.id.split('.')[1]??null,issue:value.issue,message:value.message.trim(),source:'agent',state:'open',createdAt:now,lastSeenAt:now,count:1};
   if(reports.length>=500){const index=reports.findIndex(report=>report.state==='resolved');if(index<0)throw new Error('Feedback capacity reached');reports.splice(index,1);}
   reports.unshift(report);return report;
  });
 }
 async resolve(id){return this.mutate(reports=>{const report=reports.find(report=>report.id===id);if(!report)throw new Error('Invalid feedback id');report.state='resolved';report.resolvedAt=new Date().toISOString();return report;});}
 async resolveMatching(origin,{issue,teachingId}={}){return this.mutate(reports=>{for(const report of reports)if(report.origin===origin&&report.state==='open'&&(!issue||report.issue===issue)&&(!teachingId||report.teachingId===teachingId)){report.state='resolved';report.resolvedAt=new Date().toISOString();}return true;});}
}
