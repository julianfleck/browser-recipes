import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';import path from 'node:path';
export class ToolLibrary {
 constructor(directory,list){this.file=path.join(directory,'library.json');this.directory=directory;this.list=list;}
 async load(){try{return JSON.parse(await readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return {groups:[],placements:[]};throw error;}}
 async save(value){
  if(!value||!Array.isArray(value.groups)||value.groups.length>300||!Array.isArray(value.placements)||value.placements.length>1000)throw new Error('Invalid library');
  const groups=new Map(),items=new Map((await this.list()).map(item=>[item.id,item]));
  for(const group of value.groups){if(!group||typeof group.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(group.id)||groups.has(group.id)||typeof group.name!=='string'||!group.name.trim()||group.name.length>80||new URL(group.origin).origin!==group.origin)throw new Error('Invalid group');groups.set(group.id,group);}
  for(const group of groups.values()){
   const visited=new Set([group.id]);let current=group;
   while(current.parentId){const parent=groups.get(current.parentId);if(!parent||parent.origin!==group.origin||group.mcpId&&parent.mcpId&&parent.mcpId!==group.mcpId)throw new Error('Invalid group website');if(visited.has(parent.id))throw new Error('Invalid group cycle');visited.add(parent.id);current=parent;}
  }
  const seen=new Set();for(const placement of value.placements){const item=items.get(placement.id),group=placement.groupId?groups.get(placement.groupId):null;if(!item||seen.has(placement.id)||!Number.isInteger(placement.order)||placement.order<0)throw new Error('Invalid tool placement');if(placement.groupId&&(!group||group.origin!==item.recording.origin||group.mcpId&&item.mcpId&&group.mcpId!==item.mcpId))throw new Error('Invalid tool website');seen.add(placement.id);}
  const clean={groups:value.groups.map(({id,name,origin,parentId,mcpId})=>({id,name:name.trim(),origin,parentId:parentId??null,...(mcpId?{mcpId}:{})})),placements:value.placements.map(({id,groupId,order})=>({id,groupId:groupId??null,order}))};
  await mkdir(this.directory,{recursive:true});const tmp=`${this.file}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(clean),{mode:0o600});await rename(tmp,this.file);return clean;
 }
}
