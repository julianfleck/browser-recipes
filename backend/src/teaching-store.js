import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile,rename,rm } from 'node:fs/promises';
import path from 'node:path';
import { compileMacro, legacyMacro, validateMacro, validName } from './macro-recipe.js';
import { validateBrowserWorkflow } from './browser-workflow-definitions.js';
import {formatRunLog} from './run-log.js';

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const selector = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
const inputKinds = new Set(['text', 'select', 'checkbox', 'contenteditable']);

export function validateRecording(value) {
  if (!value || typeof value !== 'object' || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 ||
      typeof value.description !== 'string' || value.description.length > 1000 || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 100) {
    throw new Error('Invalid teaching recording');
  }
  if(value.goal!==undefined&&(typeof value.goal!=='string'||value.goal.length>1500))throw Error('Invalid tool description');
  let origin;
  try { origin = new URL(value.origin); } catch { throw new Error('Invalid teaching origin'); }
  if (origin.protocol !== 'https:' || origin.origin !== value.origin) throw new Error('Invalid teaching origin');
  for (const event of value.events) {
    if (!['click', 'input', 'navigation', 'output', 'copy', 'key'].includes(event?.type) || typeof event.path !== 'string' ||
        !event.path.startsWith('/') || event.path.startsWith('//') || event.path.includes('\\') || event.path.length > 500 ||
        new URL(event.path, value.origin).origin !== value.origin ||
        (event.type !== 'navigation' && !selector(event.selector))) throw new Error('Invalid teaching event');
    if (event.type === 'output' && event.mode != null && !['page', 'one', 'list','selection'].includes(event.mode)) throw new Error('Invalid output mode');
    if(event.type==='output'&&event.mode==='selection'&&(!Array.isArray(event.targets)||!event.targets.length||event.targets.length>20||event.targets.some(target=>!target||!selector(target.selector)||!['text','image','link','element'].includes(target.kind))))throw new Error('Invalid output selection');
    if(event.type==='output'&&event.mode==='selection'&&event.targets.some(target=>target.collection&&(!selector(target.collection.selector)||!Number.isInteger(target.collection.index)||target.collection.index<0||target.collection.index>99)))throw new Error('Invalid output collection');
    if(event.alternatives!==undefined&&(!Array.isArray(event.alternatives)||event.alternatives.length>8||event.alternatives.some(value=>!selector(value))))throw Error('Invalid recorded alternatives');
    if (event.type === 'input' && (event.inputKind != null && !inputKinds.has(event.inputKind) ||
      event.redacted != null && event.redacted !== true ||
      event.redacted && event.value !== undefined ||
      event.value !== undefined && (event.inputKind === 'checkbox' ? typeof event.value !== 'boolean' : typeof event.value !== 'string' || event.value.length > 500))) {
      throw new Error('Invalid recorded input');
    }
  }
  if (value.events.filter(event => event.type === 'output').length > 1 || !value.events.some(event => ['copy','output'].includes(event.type))) throw new Error('Choose what the agent should read before creating a draft');
  for(const event of value.events){if(event.type==='key'&&!['Enter','Tab','Escape','ArrowDown','ArrowUp','Space'].includes(event.key))throw new Error('Invalid recorded key');if(event.binding&&!['variable','static'].includes(event.binding))throw new Error('Invalid input binding');}
  if(value.command!==undefined&&!validName(value.command))throw new Error('Invalid MCP command name');
  return { ...(value.command?{command:value.command}:{}),...(value.goal?{goal:value.goal.trim()}:{}), origin: value.origin, allowWrites:value.allowWrites===true, title: value.title.trim(), description: value.description.trim(), events: value.events.map(event => ({
    type: event.type, path: event.path, ...(typeof event.label === 'string' ? {label:event.label.slice(0,120)}:{}), ...(event.type==='key'?{key:event.key}:{}), ...(event.type==='copy'?{...(event.clipboard?{clipboard:true}:{}),...(event.start!==undefined?{start:event.start,end:event.end}:{})}:{}), ...(event.selector ? { selector: event.selector } : {}), ...(event.type === 'output' ? { mode: event.mode ?? 'one',...(event.mode==='selection'?{targets:event.targets?.map(target=>({selector:target.selector,kind:target.kind,...(typeof target.label==='string'?{label:target.label.slice(0,80)}:{}),...(target.collection?{collection:{selector:target.collection.selector,index:target.collection.index}}:{})}))}:{}) } : {}),
    ...(event.alternatives?{alternatives:event.alternatives}:{}),...(event.type === 'input' ? { ...(event.inputKind ? { inputKind: event.inputKind } : {}), ...(event.binding?{binding:event.binding}:{}), ...(event.variable?{variable:event.variable}:{}), ...(event.redacted ? { redacted: true } : {}), ...(event.value !== undefined ? { value: event.value } : {}) } : {}),
  })) };
}

export function compileReadDraft(recording, choice) {
  const outputs = recording.events.filter(event => event.type === 'output');
  const observed = new Set(recording.events.map(event => event.selector).filter(Boolean));
  const paths = new Set(recording.events.map(event => event.path));
  if (!choice || !paths.has(choice.path) || !observed.has(choice.readySelector) || !observed.has(choice.signedInSelector) ||
      choice.outputSelector !== outputs[0].selector || choice.path !== outputs[0].path) throw new Error('Model selected unobserved page elements');
  const host = slug(new URL(recording.origin).hostname.replace(/^www\./, ''));
  const provider = /^[a-z]/.test(host) ? host : `site_${host}`;
  const title = slug(recording.title);
  const action = /^[a-z]/.test(title) ? title : `action_${title}`;
  const workflow = {
    schemaVersion: 1, id: `${provider}.${action}`, provider, origin: recording.origin, effect: 'read',
    description: recording.description || recording.title,
    signedInSelector: choice.signedInSelector, path: choice.path, readySelector: outputs[0].selector,
    checks: outputs[0].mode === 'one' ? [{ selector: choice.outputSelector, equals: 1, otherwise: 'ambiguous_result' }] : [],
    extract: [{ field: 'result', selector: choice.outputSelector, pick: outputs[0].mode === 'list' ? 'all' : 'first', maxLength: outputs[0].mode === 'list' ? 1000 : 10000, ...(outputs[0].mode === 'list' ? { maxItems: 100 } : {}) }],
  };
  const fill = new Map();
  for (const event of recording.events.slice(0, recording.events.indexOf(outputs[0]))) {
    if (event.type !== 'input' || event.path !== choice.path || event.redacted || event.value === undefined) continue;
    fill.delete(event.selector);
    fill.set(event.selector, { selector: event.selector, value: event.value, inputKind: event.inputKind ?? 'text' });
  }
  if (fill.size) workflow.fill = [...fill.values()];
  return validateBrowserWorkflow(workflow);
}

export class TeachingStore {
  constructor(directory, generator) { this.directory = directory; this.generator = generator; }
  file(id) { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid teaching id'); return path.join(this.directory, `${id}.json`); }
  async save(item) { await mkdir(this.directory, { recursive: true });const target=this.file(item.id),temporary=`${target}.${randomUUID()}.tmp`;try{await writeFile(temporary,JSON.stringify(item,null,2),{mode:0o600});await rename(temporary,target);}finally{await rm(temporary,{force:true});}return item; }
  async get(id) { try { const item=JSON.parse(await readFile(this.file(id), 'utf8'));if(item.testRun&&!item.testRun.logText)item.testRun.logText=formatRunLog(item.testRun,item.test);return item; } catch (error) { if (error.code === 'ENOENT') throw new Error('Unknown teaching'); throw error; } }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const files = (await readdir(this.directory)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name));
    return (await Promise.all(files.map(name => this.get(name.slice(0, -5))))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(value) {
    const recording = validateRecording(value);
    const item = { id: randomUUID(), state: 'recorded', createdAt: new Date().toISOString(), recording };
    item.workflow=compileMacro(recording,{});item.state='draft';
    item.mcpId=value.mcpId??null;
    item.workflow=await this.uniqueRecipe(item.workflow,item.id,item.mcpId);
    return this.save(item);
  }
  async uniqueRecipe(recipe,id,mcpId){const others=(await this.list()).filter(other=>other.id!==id&&!other.archived&&(mcpId?other.mcpId===mcpId:other.recording.origin===recipe.origin));const used=new Set(others.map(other=>other.workflow?.id.split('.')[1]));const [provider,base]=recipe.id.split('.');let command=base,n=2;while(used.has(command)){const suffix=`_${n++}`;command=base.slice(0,64-suffix.length)+suffix;}return {...recipe,id:`${provider}.${command}`};}
  async cloneForMcp(id,mcpId) {
    const source=await this.get(id),copy={...structuredClone(source),id:randomUUID(),mcpId,state:'draft',createdAt:new Date().toISOString(),copiedFrom:id};
    delete copy.test;delete copy.testRun;delete copy.archived;delete copy.error;return this.save(copy);
  }
  async generate(id) {
    const item = await this.get(id);
    if (item.state === 'saved') throw new Error('Teaching already saved');
    try {
      const choice = await this.generator(item.recording);
      item.workflow = await this.uniqueRecipe(compileMacro(item.recording, choice),id,item.mcpId);
      item.recording.title=item.workflow.title;item.recording.description=item.workflow.description;
      item.state = 'draft';
      delete item.error;
    } catch (error) {
      item.state = 'needs_model';
      item.error = error instanceof Error ? error.message : 'Could not generate workflow';
    }
    return this.save(item);
  }
  async prepareTest(id) {
    const item = await this.get(id);
    if (!['draft', 'tested'].includes(item.state)) throw new Error('Draft not ready');
    if(item.workflow?.schemaVersion===2)return item;
    const output = item.recording.events.find(event => event.type === 'output');
    // Repair pre-existing generated drafts on the user's explicit test request. Preserve every extraction and fill step.
    if (output && output.path === item.workflow.path && output.selector === item.workflow.extract[0]?.selector && item.workflow.readySelector !== output.selector) {
      item.workflow = validateBrowserWorkflow({ ...item.workflow, readySelector: output.selector });
      item.state = 'draft';
      await this.save(item);
    }
    return item;
  }
  async tested(id, result, job = null) {
    const item = await this.get(id);
    if (!['draft','tested','saved'].includes(item.state)) throw new Error('Draft not ready');
    item.test = result;
    if (job) item.testRun = { id: job.id, state: job.state, phase: job.phase, createdAt: job.createdAt,
      ...(job.claimedAt ? { claimedAt: job.claimedAt } : {}), ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
      ...(job.failedPhase ? { failedPhase: job.failedPhase } : {}),
      ...(Number.isInteger(job.stepIndex)?{stepIndex:job.stepIndex}:{}),
      logText:job.logText??formatRunLog(job,result),
      events: job.events };
    if(item.state!=='saved')item.state = result?.state === 'found' ? 'tested' : 'draft';
    return this.save(item);
  }
  async publish(id, destination) {
    const item = await this.get(id);
    if (item.state !== 'tested') throw new Error('Test the workflow before saving');
    await mkdir(destination, { recursive: true });
    if(item.workflow.schemaVersion!==2) item.workflow=legacyMacro(item.workflow,item.recording);
    // Published recipes live with the teaching; this is the compatibility catalog export.
    await writeFile(path.join(destination, `${item.workflow.id}.json`), JSON.stringify(item.workflow, null, 2) + '\n', { mode:0o600 });
    item.state = 'saved';
    return this.save(item);
  }
  async update(id, value,{fromBuilder=false}={}) {
    const item=await this.get(id);
    const recipe=validateMacro(value);
    if(recipe.origin!==item.recording.origin)throw new Error('Invalid recipe origin');
    if((await this.list()).some(other=>other.id!==id&&!other.archived&&(item.mcpId?other.mcpId===item.mcpId:other.recording.origin===recipe.origin)&&other.workflow?.id.split('.')[1]===recipe.id.split('.')[1]))throw new Error('Invalid duplicate command name');
    item.workflow=recipe;item.recording.title=recipe.title;item.recording.description=recipe.description;item.recording.command=recipe.id.split('.')[1];
    item.revision=(item.revision??0)+1;item.state='draft';delete item.test;delete item.testRun;delete item.error;if(!fromBuilder)delete item.build;
    return this.save(item);
  }
  async infer(value) {
    const recording=validateRecording({...value,title:value.title||'Recorded action',description:value.description||''});
    const choice=await this.generator(recording);
    return {command:compileMacro(recording,choice).id.split('.')[1],title:typeof choice.title==='string'?choice.title.slice(0,100):recording.title,description:typeof choice.description==='string'?choice.description.slice(0,1000):recording.description};
  }
  async archive(id, archived) {
    const item = await this.get(id);
    item.archived = archived;
    return this.save(item);
  }
}
