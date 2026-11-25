const namePattern = /^[a-z][a-z0-9_]{0,63}$/;
const reserved = new Set(['constructor','prototype','__proto__','report_tool_issue']);
export const slug = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,50);
export const validName = name => namePattern.test(name) && !reserved.has(name);
const text = (value,max) => typeof value === 'string' && value.length <= max;
export function validPath(value,origin) {
  return text(value,1000) && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && new URL(value,origin).origin===origin;
}
export function validateMacro(value) {
  if (!value || value.schemaVersion!==2 || !text(value.title,100) || !value.title.trim() || !text(value.description,1000) || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(value.id)) throw new Error('Invalid macro recipe');
  if(!validName(value.id.split('.')[1]))throw new Error('Invalid MCP command name');
  const url=new URL(value.origin);
  if(url.protocol!=='https:' || url.origin!==value.origin) throw new Error('Invalid macro origin');
  if(typeof value.allowWrites!=='boolean'||!Array.isArray(value.steps)||!value.steps.length||value.steps.length>100)throw new Error('Invalid macro steps');
  const ids=new Set(), variables=new Set();
  for(const step of value.steps){
    if(!step||!text(step.id,80)||!step.id||ids.has(step.id)||!['navigation','click','input','key','copy','output'].includes(step.type)||!validPath(step.path,value.origin))throw new Error('Invalid macro step or path');
    ids.add(step.id);
    if(step.type!=='navigation'&&(!text(step.selector,500)||!step.selector.trim()))throw new Error('Invalid macro selector');
    if(step.label!==undefined&&!text(step.label,120))throw new Error('Invalid macro label');
    if(step.type==='key'&&!['Enter','Tab','Escape','ArrowDown','ArrowUp','Space'].includes(step.key))throw new Error('Invalid macro key');
    if(step.type==='input'){
      if(!['text','select','checkbox','contenteditable'].includes(step.inputKind)||!['variable','static'].includes(step.binding))throw new Error('Invalid macro input');
      if(step.binding==='variable'){
        if(!validName(step.variable)||variables.has(step.variable))throw new Error('Invalid or duplicate macro variable');
        variables.add(step.variable);
      }
      if(step.value!==undefined&&(step.inputKind==='checkbox'?typeof step.value!=='boolean':!text(step.value,500)))throw new Error('Invalid macro value');
      if(step.binding==='static'&&step.value===undefined)throw new Error('Invalid static input value');
      if(step.redacted&&step.value!==undefined)throw new Error('Invalid private input value');
    }
    if(step.type==='output'&&!['one','page','list','selection'].includes(step.mode))throw new Error('Invalid macro output');
    if(step.type==='navigation'&&step.follow!==undefined&&typeof step.follow!=='boolean')throw new Error('Invalid navigation follow');
    if(step.type==='output'&&step.mode==='selection'){if(!Array.isArray(step.targets)||!step.targets.length||step.targets.length>20)throw new Error('Invalid output selection');for(const target of step.targets)if(!target||!text(target.selector,500)||!target.selector.trim()||!['text','image','link','element'].includes(target.kind)||target.label!==undefined&&!text(target.label,80)||target.index!==undefined&&(!Number.isInteger(target.index)||target.index<0||target.index>99)||target.recordedSelector!==undefined&&(!text(target.recordedSelector,500)||!target.recordedSelector.trim())||target.collection!==undefined&&(!text(target.collection.selector,500)||!target.collection.selector.trim()||!Number.isInteger(target.collection.index)||target.collection.index<0||target.collection.index>99))throw new Error('Invalid output selection');}
    if(step.type==='copy'&&((step.start!==undefined&&(!Number.isInteger(step.start)||step.start<0))||(step.end!==undefined&&(!Number.isInteger(step.end)||step.end<step.start||step.end>1000000))))throw new Error('Invalid copy range');
  }
  for(const step of value.steps)if(step.queryBindings!==undefined){
    if(step.type!=='navigation'||!Array.isArray(step.queryBindings)||step.queryBindings.length>20)throw new Error('Invalid navigation query binding');
    const parameters=new Set();for(const binding of step.queryBindings){if(!binding||!text(binding.parameter,100)||!binding.parameter||parameters.has(binding.parameter)||!value.steps.some(input=>input.type==='input'&&input.variable===binding.variable&&validName(input.variable))||!new URL(step.path,value.origin).searchParams.has(binding.parameter))throw new Error('Invalid navigation query binding');parameters.add(binding.parameter);}
  }
  for(const step of value.steps)if(step.waitForQuery!==undefined&& (step.type!=='navigation'||!Array.isArray(step.waitForQuery)||step.waitForQuery.length>20||step.waitForQuery.some(key=>!text(key,100)||!new URL(step.path,value.origin).searchParams.has(key))))throw new Error('Invalid navigation query wait');
  if(!value.steps.some(step=>['copy','output'].includes(step.type)))throw new Error('Choose a result or copy text before creating a tool');
  return value;
}
export function compileMacro(recording,choice={}) {
  const host=slug(new URL(recording.origin).hostname), title=choice.title?.trim().slice(0,100)||recording.title||'Recorded action';
  const provider=/^[a-z]/.test(host)?host:`site_${host}`;
  const candidate=choice.command??recording.command??slug(title);
  const command=validName(candidate)?candidate:`action_${slug(candidate)||'recorded'}`;
  const names=new Set();
  const steps=recording.events.map((event,index)=>{
    const step={...event,id:`step_${index+1}`};
    if(step.type==='navigation'&&index>0&&step.follow===undefined){let previous=index-1;while(previous>=0&&recording.events[previous].type==='navigation')previous--;if(previous>=0&&['click','key','input'].includes(recording.events[previous].type))step.follow=true;}
    if(step.type==='input'){
      step.binding=event.binding??'variable';
      let base=slug(event.variable||event.label||event.selector.match(/(?:name|id)=["']([^"']+)/)?.[1]||`input_${index+1}`);
      if(!validName(base))base=`input_${index+1}`;
      let name=base,n=2;while(names.has(name))name=`${base.slice(0,45)}_${n++}`;names.add(name);
      step.variable=name;step.inputKind??='text';
    }
    if(step.type==='output'){step.mode??='one';if(step.mode==='selection')step.targets=step.targets.map(target=>{const collection=target.collection;if(!collection||step.targets.filter(other=>other.collection?.selector===collection.selector).length<2)return target;return {...target,recordedSelector:target.recordedSelector??target.selector,selector:collection.selector,index:target.index??collection.index};});}
    return step;
  });
  for(const [index,step] of steps.entries())if(step.type==='navigation'&&step.queryBindings===undefined){
    const bindings=[];for(const [parameter,value] of new URL(step.path,recording.origin).searchParams){if(value.length<2)continue;const matches=steps.slice(0,index).filter(input=>input.type==='input'&&input.binding==='variable'&&!input.redacted&&input.inputKind!=='checkbox'&&input.value===value);const names=[...new Set(matches.map(input=>input.variable))];if(names.length===1&&!bindings.some(binding=>binding.parameter===parameter))bindings.push({parameter,variable:names[0]});}if(bindings.length)step.queryBindings=bindings;
  }
  for(const [index,step] of steps.entries())if(step.type==='navigation'&&step.follow&&step.waitForQuery===undefined){
    const previous=steps[index-1],params=new URL(step.path,recording.origin).searchParams,keys=new Set((step.queryBindings??[]).map(binding=>binding.parameter));
    if(previous?.type==='navigation'&&previous.follow){for(const key of previous.waitForQuery??[])if(params.has(key))keys.add(key);}
    else if(previous){const before=new URL(previous.path,recording.origin).searchParams;for(const key of params.keys())if(!/^(?:search_id|request_id|session_id|time|timestamp|ts|nonce|token|utm_.*)$/i.test(key)&&!steps.slice(0,index).some(input=>input.type==='input'&&input.binding==='variable'&&params.get(key)===input.value&&!step.queryBindings?.some(binding=>binding.parameter===key))&&JSON.stringify(params.getAll(key))!==JSON.stringify(before.getAll(key)))keys.add(key);}
    if(keys.size)step.waitForQuery=[...keys];
  }
  return validateMacro({schemaVersion:2,source:'recording',id:`${provider}.${command}`,provider,origin:recording.origin,title,description:choice.description?.slice(0,1000)||recording.description||title,effect:'interaction',allowWrites:recording.allowWrites===true,steps});
}
export function navigationUrl(step,recipe,inputs){const url=new URL(step.path,recipe.origin);for(const binding of step.queryBindings??[]){const input=recipe.steps.find(input=>input.type==='input'&&input.variable===binding.variable);url.searchParams.set(binding.parameter,String(input?.binding==='static'?input.value:inputs[binding.variable]));}return url.href;}
export function legacyMacro(workflow,recording) {
  return {...compileMacro({...recording,events:[{type:'navigation',path:workflow.path},...(workflow.fill??[]).map(step=>({...step,type:'input',path:workflow.path,binding:'static'})),...workflow.extract.map(item=>({type:'output',path:workflow.path,selector:item.selector,mode:item.pick==='all'?'list':'one'}))]},{}),source:'legacy_read'};
}
export function toolSchema(recipe) {
  const properties=Object.create(null),required=[];
  for(const step of recipe.steps.filter(step=>step.type==='input'&&step.binding==='variable')){
    properties[step.variable]={type:step.inputKind==='checkbox'?'boolean':'string',description:step.label||step.variable,...(step.inputKind==='checkbox'?{}:{maxLength:500})};
    required.push(step.variable);
  }
  return {type:'object',properties,required,additionalProperties:false};
}
export function resolveInputs(recipe,args={},useExamples=false) {
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid tool arguments');
  const schema=toolSchema(recipe),result=Object.create(null);
  for(const name of Object.keys(args))if(!Object.hasOwn(schema.properties,name))throw new Error(`Unknown tool argument: ${name}`);
  for(const step of recipe.steps.filter(step=>step.type==='input'&&step.binding==='variable')){
    const value=Object.hasOwn(args,step.variable)?args[step.variable]:useExamples?step.value:undefined;
    if(value===undefined)throw new Error(`Missing tool argument: ${step.variable}`);
    if(step.inputKind==='checkbox'?typeof value!=='boolean':!text(value,500))throw new Error(`Invalid tool argument: ${step.variable}`);
    result[step.variable]=value;
  }
  return result;
}
