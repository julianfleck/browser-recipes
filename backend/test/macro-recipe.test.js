import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMacro, validateMacro, toolSchema, resolveInputs} from '../src/macro-recipe.js';
const recording={origin:'https://example.org',title:'Search invoices',description:'Find invoices and copy the total.',events:[
 {type:'navigation',path:'/invoices'},
 {type:'input',path:'/invoices',selector:'#search',inputKind:'text',value:'Acme',label:'Customer'},
 {type:'key',path:'/invoices',selector:'#search',key:'Enter'},
 {type:'click',path:'/invoices',selector:'#details',label:'Open invoice'},
 {type:'copy',path:'/invoices',selector:'#total',start:0,end:5},
 {type:'output',path:'/invoices',selector:'#total',mode:'one'}]};
test('compiler preserves macro order and promotes ordinary inputs to agent variables',()=>{
 const recipe=compileMacro(recording,{title:'Find invoice total',description:'Find a customer invoice and return its total.'});
 assert.deepEqual(recipe.steps.map(x=>x.type),['navigation','input','key','click','copy','output']);
 assert.equal(recipe.title,'Find invoice total');assert.equal(recipe.steps[1].binding,'variable');
 assert.equal(toolSchema(recipe).properties.customer.type,'string');
 assert.equal(resolveInputs(recipe,{customer:'Other'}).customer,'Other');
 assert.throws(()=>resolveInputs(recipe,{unknown:'x'}),/Unknown/);
});
test('static inputs are excluded from MCP and variables have validated unique names',()=>{
 const recipe=structuredClone(compileMacro(recording,{}));recipe.steps[1].binding='static';
 assert.equal(Object.keys(toolSchema(validateMacro(recipe)).properties).length,0);
 recipe.steps[1].binding='variable';recipe.steps[1].variable='__proto__';assert.throws(()=>validateMacro(recipe),/variable/);
});
test('recipe rejects cross-origin navigation and arbitrary script/key execution',()=>{
 const recipe=structuredClone(compileMacro(recording,{}));recipe.steps[0].path='//evil.example';assert.throws(()=>validateMacro(recipe),/path/);
 recipe.steps[0].path='/invoices';recipe.steps[2].key='Meta+V';assert.throws(()=>validateMacro(recipe),/key/);
});

test('LLM command suggestion becomes the callable MCP name and is validated independently of the display title',()=>{
 const recipe=compileMacro(recording,{title:'Customer invoices',command:'list_customers',description:'List customers'});
 assert.equal(recipe.id,'example_org.list_customers');
 assert.throws(()=>validateMacro({...recipe,id:'example_org.Invalid Name'}),/Invalid/);
 assert.throws(()=>validateMacro({...recipe,id:'example_org.constructor'}),/command/);
});

test('navigation chains follow the submitted action and bind matching query values to inputs',()=>{
 const recipe=compileMacro({...recording,events:[...recording.events.slice(0,3),{type:'navigation',path:'/catalog?search_text=Acme'},{type:'navigation',path:'/catalog?search_text=Acme&search_id=123'},{type:'navigation',path:'/catalog?search_text=Acme&search_id=123&page=1'},recording.events.at(-1)]});
 for(const step of recipe.steps.slice(3,6)){assert.equal(step.follow,true);assert.deepEqual(step.queryBindings,[{parameter:'search_text',variable:'customer'}]);}
 assert.throws(()=>validateMacro({...recipe,steps:recipe.steps.map(step=>step.type==='navigation'?{...step,queryBindings:[{parameter:'q',variable:'unknown'}]}:step)}),/query binding/);
});

test('repeated selected result IDs compile into positions in a reusable result collection',()=>{
 const recipe=compileMacro({...recording,events:[{type:'navigation',path:'/catalog'},{type:'output',path:'/catalog',mode:'selection',selector:'a[data-testid="product-item-id-123--link"]',targets:[{selector:'a[data-testid="product-item-id-123--link"]',kind:'link',collection:{selector:'a[data-testid^="product-item-id-"][data-testid$="--link"]',index:0}},{selector:'a[data-testid="product-item-id-456--link"]',kind:'link',collection:{selector:'a[data-testid^="product-item-id-"][data-testid$="--link"]',index:1}}]}]});
 assert.deepEqual(recipe.steps.at(-1).targets.map(target=>[target.selector,target.index]),[['a[data-testid^="product-item-id-"][data-testid$="--link"]',0],['a[data-testid^="product-item-id-"][data-testid$="--link"]',1]]);
 assert.throws(()=>validateMacro({...recipe,steps:recipe.steps.map(step=>step.type==='output'?{...step,targets:[{selector:'a',kind:'link',index:-1}]}:step)}),/selection/);
});

test('filter navigation waits for the new filter while generated query metadata stays unfrozen',()=>{
 const recipe=compileMacro({...recording,events:[...recording.events.slice(0,3),{type:'navigation',path:'/catalog?search_text=Acme'},{type:'navigation',path:'/catalog?search_text=Acme&search_id=old'},{type:'click',path:'/catalog?search_text=Acme&search_id=old',selector:'#category'},{type:'navigation',path:'/catalog?search_text=Acme&search_id=old&catalog[]=1231'},{type:'navigation',path:'/catalog?search_text=Acme&search_id=old&catalog[]=1231&time=123'},recording.events.at(-1)]});
 assert.deepEqual(recipe.steps[6].waitForQuery,['search_text','catalog[]']);assert.deepEqual(recipe.steps[7].waitForQuery,['search_text','catalog[]']);
});

test('query matching stays conservative when two variables share the recorded value',()=>{
 const recipe=compileMacro({...recording,events:[{type:'navigation',path:'/'},{type:'input',path:'/',selector:'#a',inputKind:'text',value:'same',label:'First'},{type:'input',path:'/',selector:'#b',inputKind:'text',value:'same',label:'Second'},{type:'key',path:'/',selector:'#b',key:'Enter'},{type:'navigation',path:'/search?q=same'},recording.events.at(-1)]});
 assert.equal(recipe.steps[4].queryBindings,undefined);assert.equal(recipe.steps[4].waitForQuery,undefined);assert.equal(recipe.steps[4].follow,true);
});

test('individual result IDs stay exact without recorded collection position evidence',()=>{
 const recipe=compileMacro({...recording,events:[{type:'navigation',path:'/catalog'},{type:'output',path:'/catalog',mode:'selection',selector:'a[data-testid="item-123"]',targets:[{selector:'a[data-testid="item-123"]',kind:'link'},{selector:'a[data-testid="item-456"]',kind:'link'}]}]});
 assert(recipe.steps.at(-1).targets.every(target=>target.index===undefined));
});

test('a fixed input keeps its URL connection while disappearing from the MCP parameters',async()=>{
 const {navigationUrl}=await import('../src/macro-recipe.js');const recipe=compileMacro({...recording,events:[...recording.events.slice(0,3),{type:'navigation',path:'/search?q=Acme'},recording.events.at(-1)]});recipe.steps[1].binding='static';recipe.steps[1].value='Fixed search';validateMacro(recipe);assert.equal(Object.keys(toolSchema(recipe).properties).length,0);assert.equal(new URL(navigationUrl(recipe.steps[3],recipe,{})).searchParams.get('q'),'Fixed search');
});
