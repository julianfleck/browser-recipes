import { randomUUID } from 'node:crypto';

const timeoutMs = 60_000;
const phases = ['checking_access', 'finding_tab', 'opening_page', 'preparing_page', 'reading_page', 'saving_result'];

export class BrowserWorkflowQueue {
  constructor(workflows, now = () => Date.now()) {
    this.workflows = new Map(workflows.map(item => [item.id, item]));
    this.jobs = new Map();
    this.now = now;
  }

  register(workflow) { this.workflows.set(workflow.id, workflow); }

  expire(job) {
    if (['queued', 'running'].includes(job.state) && this.now() - job.createdAt > timeoutMs) {
      job.failedPhase = job.phase;
      job.state = 'timed_out';
      job.phase = 'timed_out';
      job.finishedAt = this.now();
      job.events.push({ phase: 'timed_out', at: job.finishedAt });
    }
  }

  start(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Unknown browser workflow');
    const createdAt = this.now();
    const job = { id: randomUUID(), workflowId, sessionOrigin: workflow.origin, state: 'queued', phase: 'queued', createdAt, events: [{ phase: 'queued', at: createdAt }] };
    this.jobs.set(job.id, job);
    return this.publicStatus(job);
  }

  next() {
    for (const job of this.jobs.values()) {
      this.expire(job);
      if (job.state !== 'queued') continue;
      job.state = 'running';
      job.claimedAt = this.now();
      this.progress(job.id, 'checking_access');
      return { jobId: job.id, workflowId: job.workflowId, sessionOrigin: job.sessionOrigin, workflow: this.workflows.get(job.workflowId) };
    }
    return null;
  }

  progress(id, phase) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Unknown browser workflow job');
    this.expire(job);
    if (job.state !== 'running' || !phases.includes(phase)) throw new Error('Invalid browser workflow progress');
    const current = phases.indexOf(job.phase);
    const next = phases.indexOf(phase);
    if (next < current) throw new Error('Browser workflow progress moved backwards');
    if (next > current) {
      if (phase === 'saving_result') job.workPhase = job.phase;
      job.phase = phase;
      job.events.push({ phase, at: this.now() });
    }
    return this.publicStatus(job);
  }

  complete(id, value) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Unknown browser workflow job');
    this.expire(job);
    if (job.state !== 'running') throw new Error('Browser workflow job is not running');
    job.result = this.validateResult(this.workflows.get(job.workflowId), value);
    if (job.result.state !== 'found') job.failedPhase = job.workPhase ?? job.phase;
    job.state = 'completed';
    job.phase = 'completed';
    job.finishedAt = this.now();
    job.events.push({ phase: 'completed', at: job.finishedAt });
    return this.publicStatus(job);
  }

  get(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Unknown browser workflow job');
    this.expire(job);
    return this.publicStatus(job);
  }

  publicStatus(job) {
    return { id: job.id, workflowId: job.workflowId, state: job.state, phase: job.phase, createdAt: job.createdAt,
      ...(job.claimedAt ? { claimedAt: job.claimedAt } : {}), ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
      ...(job.failedPhase ? { failedPhase: job.failedPhase } : {}),
      events: job.events.map(event => ({ ...event })), ...(job.result ? { result: job.result } : {}) };
  }

  validateResult(workflow, value) {
    if (!value || typeof value !== 'object') throw new Error('Invalid browser workflow result');
    if (value.state === 'found') {
      const result = { state: 'found' };
      for (const item of workflow.extract) {
        const text = value[item.field];
        if (item.pick === 'all') {
          if (!Array.isArray(text) || text.length < 1 || text.length > item.maxItems || text.some(part => typeof part !== 'string' || !part.trim() || part.length > item.maxLength)) throw new Error('Invalid browser workflow result');
        } else if (typeof text !== 'string' || !text.trim() || text.length > item.maxLength) throw new Error('Invalid browser workflow result');
        result[item.field] = text;
      }
      return result;
    }
    const states = new Set([
      'browser_tab_unavailable', 'site_permission_required', 'session_unavailable', 'browser_read_timeout', 'browser_read_failed', 'unsupported_workflow', 'extraction_failed', 'input_unavailable',
      ...workflow.checks.flatMap(check => [check.ifZero, check.otherwise]).filter(Boolean),
    ]);
    if (!states.has(value.state)) throw new Error('Invalid browser workflow result');
    return { state: value.state, ...(value.state === 'browser_read_failed' && ['browser_api_timeout', 'script_error'].includes(value.reason) ? { reason: value.reason } : {}) };
  }
}
