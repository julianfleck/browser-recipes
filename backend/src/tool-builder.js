import{applyRefinement}from'./workflow-refinement.js';
import{safeRunError}from'./run-log.js';
export class ToolBuilder {
 constructor({teachings,runner,refine,destination,maxAttempts=3}){Object.assign(this,{teachings,runner,refine,destination,maxAttempts});this.active=new Map();this.starting=new Map();}
 isActive(id){return this.active.has(id);}
 async state(id,patch){const item=await this.teachings.get(id);item.build={...(item.build??{}),...patch,updatedAt:Date.now()};await this.teachings.save(item);return item.build;}
 async start(id,options={}){if(this.starting.has(id))return this.starting.get(id);const task=this.begin(id,options);this.starting.set(id,task);try{return await task;}finally{this.starting.delete(id);}}
 async begin(id,{goal,answers={},useCurrentRecipe=false}={}){
  if(this.active.has(id))return (await this.teachings.get(id)).build;
  const item=await this.teachings.get(id);if(item.archived)throw Error('Restore this tool before preparing it.');if(this.runner.forTeaching?.(id)?.state==='running')throw Error('This tool is already being tested.');
  if(goal!==undefined){if(typeof goal!=='string'||!goal.trim()||goal.length>1500)throw Error('Describe what the tool should do.');item.recording.goal=goal.trim();await this.teachings.save(item);}
  if(Object.values(answers).some(answer=>!['variable','static','allow','deny'].includes(answer)))throw Error('Choose an available answer.');
  const previous=item.build,merged={...(previous?.answers??{}),...answers};
  if(merged.permission==='deny')return this.state(id,{state:'needs_attention',message:'The recorded form could not run with read-only access.',questions:[]});
  await this.state(id,{state:'refining',message:'Preparing your tool…',answers:merged,attempt:0,attempts:[],questions:[]});
  const task=this.execute(id,{answers:merged,plan:Object.keys(answers).length?previous?.plan:null,allowWrites:merged.permission==='allow'||(item.workflow?.allowWrites??item.recording.allowWrites),revision:item.revision??0,currentRecipe:useCurrentRecipe?item.workflow:null});this.active.set(id,task);void task.finally(()=>this.active.delete(id)).catch(()=>{});return (await this.teachings.get(id)).build;
 }
 async wait(id){await this.active.get(id);return (await this.teachings.get(id)).build;}
 async execute(id,{answers,plan,allowWrites,revision,currentRecipe}){
  let diagnostic=null;const attempts=[];
  try{
   for(let attempt=1;attempt<=this.maxAttempts;attempt++){
    let item=await this.teachings.get(id);if((item.revision??0)!==revision)throw Error('The recipe changed. Start preparation again.');
    await this.state(id,{state:'refining',attempt,message:attempt===1?'Understanding your recording…':'Adjusting the tool from its last test…'});
    const recording={...item.recording,events:item.recording.events.map(event=>event.type==='output'&&event.mode==='selection'?{...event,targets:event.targets.map(target=>{const current=item.workflow?.steps?.find(step=>step.type==='output')?.targets?.find(candidate=>candidate.recordedSelector===target.selector&&candidate.index!==undefined&&candidate.collection);return current?{...target,collection:{...current.collection,index:current.index}}:target;})}:event),allowWrites:allowWrites===true};
    const decision=currentRecipe&&attempt===1?null:plan??await this.refine(recording,{attempt,diagnostic,answers});plan=null;
    let result;try{result=currentRecipe&&attempt===1?{recipe:currentRecipe,summary:item.build?.summary||currentRecipe.description,questions:[]}:applyRefinement(recording,decision,answers);}catch(error){diagnostic={state:'invalid_refinement',error:safeRunError(error)};if(attempt<this.maxAttempts)continue;throw error;}
    item=await this.teachings.get(id);if((item.revision??0)!==revision)throw Error('The recipe changed. Start preparation again.');
    if(result.questions.length){await this.state(id,{state:'awaiting_answers',message:'A quick question before testing',summary:result.summary,questions:result.questions,plan:decision,answers});return;}
    if(currentRecipe)for(const input of result.recipe.steps.filter(step=>step.type==='input')){const matches=currentRecipe.steps.filter(old=>old.type==='input'&&old.selector===input.selector);if(matches.length===1)Object.assign(input,{binding:matches[0].binding,value:matches[0].value,variable:matches[0].variable});}
    const recipe=await this.teachings.uniqueRecipe(result.recipe,id,item.mcpId);item=await this.teachings.update(id,recipe,{fromBuilder:true});revision=item.revision??0;
    await this.state(id,{state:'testing',summary:result.summary,questions:[],plan:decision,attempt,message:`Testing your tool${attempt>1?` · attempt ${attempt}`:''}…`});
    const started=await this.runner.start(id,{},true),run=await this.runner.wait(started.id);attempts.push({attempt,runId:run.id,state:run.result?.state,logText:run.logText});
    await this.state(id,{attempts});
    if(run.result?.state==='found'){await this.teachings.publish(id,this.destination);await this.state(id,{state:'ready',message:'Ready for your agent',questions:[]});return;}
    if(run.result?.state==='write_permission_required'&&!allowWrites){await this.state(id,{state:'awaiting_answers',message:'One permission is needed',plan:decision,questions:[{eventIndex:'permission',prompt:'Allow this tool to submit the form you recorded?',options:[{value:'allow',label:'Allow the recorded form'},{value:'deny',label:'Keep read-only access'}]}]});return;}
    if(run.sentWrite||allowWrites||['login_required','browser_not_installed','site_changed','run_timeout'].includes(run.result?.state))break;
    diagnostic={state:run.result?.state,stepIndex:run.result?.stepIndex,error:run.diagnostic??null};
   }
   await this.state(id,{state:'needs_attention',message:'The tool still needs attention. Your recording is saved.',questions:[],attempts});
  }catch(error){await this.state(id,{state:'needs_attention',message:safeRunError(error).message,questions:[],attempts});}
 }
}
