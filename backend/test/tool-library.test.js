import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {ToolLibrary} from '../src/tool-library.js';
test('nested groups persist and cannot cycle or move tools across websites',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tool-groups-'));try{
 const items=[{id:'a',recording:{origin:'https://example.org'}},{id:'b',recording:{origin:'https://other.org'}}];
 const lib=new ToolLibrary(root,async()=>items);
 await lib.save({groups:[{id:'g1',name:'Finance',origin:'https://example.org',parentId:null},{id:'g2',name:'Invoices',origin:'https://example.org',parentId:'g1'}],placements:[{id:'a',groupId:'g2',order:0}]});
 assert.equal((await lib.load()).groups[1].parentId,'g1');
 await assert.rejects(lib.save({groups:[{id:'g1',name:'x',origin:'https://example.org',parentId:'g2'},{id:'g2',name:'y',origin:'https://example.org',parentId:'g1'}],placements:[]}),/cycle/);
 await assert.rejects(lib.save({groups:[{id:'g1',name:'x',origin:'https://example.org',parentId:null}],placements:[{id:'b',groupId:'g1',order:0}]}),/website/);
 }finally{await rm(root,{recursive:true,force:true});}
});
