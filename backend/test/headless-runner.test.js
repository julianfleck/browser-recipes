import test from 'node:test';import assert from 'node:assert/strict';
import {HeadlessRunner,replayMacro} from '../src/headless-runner.js';import {compileMacro} from '../src/macro-recipe.js';
const recording={origin:'https://example.org',title:'Find value',description:'',events:[{type:'navigation',path:'/account'},{type:'input',path:'/account',selector:'#query',label:'Query',value:'example',inputKind:'text'},{type:'copy',path:'/account',selector:'#result',start:0,end:5}]};
test('backend replays variable inputs and returns copied text without an extension',async()=>{
 const recipe=compileMacro(recording,{}),filled=[];
 const page={setDefaultTimeout(){},setDefaultNavigationTimeout(){},url:()=> 'https://example.org/account',locator:selector=>({filter(){return this;},first(){return this;},waitFor:async()=>{},count:async()=>1,fill:async value=>filled.push([selector,value]),evaluate:async()=> 'Total'})};
 const result=await replayMacro(page,recipe,{query:'new query'});assert.equal(result.result,'Total');assert.deepEqual(result.copied,['Total']);assert.deepEqual(filled,[['#query','new query']]);
});
test('backend restores encrypted session, checkpoints refreshed state, closes browser and persists test without UI polling',async()=>{
 const recipe=compileMacro({...recording,events:[{type:'navigation',path:'/account'},{type:'output',path:'/account',selector:'#result',mode:'one'}]},{});
 let loaded=false,saved=false,closed=false,tested=false;
 const page={setDefaultTimeout(){},setDefaultNavigationTimeout(){},url:()=> 'https://example.org/account',evaluate:async()=>({}),locator:()=>({first(){return this;},waitFor:async()=>{},count:async()=>1,innerText:async()=> 'Found'}),mainFrame(){return this;}};
 const runner=new HeadlessRunner({sessions:{load:async origin=>{loaded=true;return {origin,cookies:[],localStorage:{},savedAt:'now'};},save:async()=>{saved=true;}},teachings:{get:async()=>({id:'test',revision:1,state:'draft',workflow:recipe,recording}),tested:async()=>{tested=true;}},browserFactory:async()=>({context:{route:async()=>{},newPage:async()=>page,storageState:async()=>({cookies:[],origins:[]})},browser:{close:async()=>{closed=true;}}})});
 const job=await runner.start('test');const completed=await runner.wait(job.id);assert.equal(completed.result.state,'found');assert(loaded&&saved&&closed&&tested);
});

test('a run cannot approve a recipe edited while the browser was working',async()=>{
 const recipe=compileMacro({...recording,events:[{type:'navigation',path:'/account'},{type:'output',path:'/account',selector:'#result',mode:'one'}]},{});
 let revision=0,release,tested=false;const wait=new Promise(resolve=>{release=resolve;});
 const page={setDefaultTimeout(){},setDefaultNavigationTimeout(){},url:()=> 'https://example.org/account',locator:()=>({first(){return this;},waitFor:async()=>wait,count:async()=>1,innerText:async()=> 'Found'}),mainFrame(){return this;}};
 const runner=new HeadlessRunner({sessions:{load:async()=>null},teachings:{get:async()=>({id:'test',revision,state:'draft',workflow:recipe,recording}),tested:async()=>{tested=true;}},browserFactory:async()=>({context:{route:async()=>{},newPage:async()=>page},browser:{close:async()=>{}}})});
 const job=await runner.start('test');revision=1;release();await runner.wait(job.id);assert.equal(tested,false);
});

test('failed runs expose a copyable redacted browser error and persist their log',async()=>{
 const recipe=compileMacro(recording,{});let persisted;
 const runner=new HeadlessRunner({sessions:{load:async()=>({origin:recording.origin,cookies:[{name:'session',value:'secret-cookie'}],localStorage:{token:'secret-storage'}})},teachings:{get:async()=>({id:'test',workflow:recipe,recording}),tested:async(_id,_result,job)=>{persisted=structuredClone(job);}},browserFactory:async()=>{throw new Error('Browser failed: secret-cookie secret-storage https://example.org/?token=private "page contents"\nCall log: private data');}});
 const job=await runner.start('test');const completed=await runner.wait(job.id);
 assert.equal(completed.result.state,'backend_run_failed');assert.match(completed.logText,/Browser failed/);assert.match(completed.logText,/ERROR/);assert.match(completed.logText,/loading_session/);assert.match(completed.logText,new RegExp(job.id));
 for(const secret of ['secret-cookie','secret-storage','token=private','page contents','Call log: private data'])assert(!completed.logText.includes(secret),secret);
 assert.equal(persisted.logText,completed.logText);
});
