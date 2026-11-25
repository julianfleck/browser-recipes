function validWorkflow(job) {
  const workflow = job?.workflow;
  if (!workflow || workflow.schemaVersion !== 1 || workflow.effect !== 'read' || workflow.id !== job.workflowId || workflow.origin !== job.sessionOrigin) return false;
  try {
    const origin = new URL(workflow.origin);
    if (origin.protocol !== 'https:' || origin.origin !== workflow.origin || !workflow.path.startsWith('/') || workflow.path.startsWith('//') || new URL(workflow.path, workflow.origin).origin !== workflow.origin) return false;
  } catch { return false; }
  const selector = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
  return selector(workflow.signedInSelector) && selector(workflow.readySelector) &&
    (workflow.fill === undefined || Array.isArray(workflow.fill) && workflow.fill.length <= 20 && workflow.fill.every(step => selector(step.selector) && ['text', 'select', 'checkbox', 'contenteditable'].includes(step.inputKind) && (step.inputKind === 'checkbox' ? typeof step.value === 'boolean' : typeof step.value === 'string' && step.value.length <= 500))) &&
    Array.isArray(workflow.checks) && workflow.checks.length <= 10 && workflow.checks.every(item => selector(item.selector) && Number.isInteger(item.equals) && item.equals > 0) &&
    Array.isArray(workflow.extract) && workflow.extract.length > 0 && workflow.extract.length <= 10 && workflow.extract.every(item => selector(item.selector) && typeof item.field === 'string' && ['first', 'last', 'all'].includes(item.pick) && (item.pick !== 'all' || Number.isInteger(item.maxItems)));
}

export function applyFillSteps(workflow) {
  if (location.origin !== workflow.origin || location.pathname.replace(/\/$/, '') !== new URL(workflow.path, workflow.origin).pathname.replace(/\/$/, '')) return { state: 'session_unavailable' };
  const fields = workflow.fill.map(step => document.querySelector(step.selector));
  if (fields.some(field => !field)) return { state: 'loading' };
  for (let index = 0; index < workflow.fill.length; index++) {
    const step = workflow.fill[index];
    const field = fields[index];
    if (step.inputKind === 'checkbox') {
      if (!(field instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(field.type)) return { state: 'input_unavailable' };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      if (setter) setter.call(field, step.value); else field.checked = step.value;
    } else if (step.inputKind === 'contenteditable') {
      if (!field.isContentEditable) return { state: 'input_unavailable' };
      field.textContent = step.value;
    } else {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || field.type === 'password') return { state: 'input_unavailable' };
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
      if (setter) setter.call(field, step.value); else field.value = step.value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { state: 'filled' };
}

export function evaluateReadWorkflow(workflow) {
  if (location.origin !== workflow.origin) return { state: 'session_unavailable' };
  if (location.pathname.replace(/\/$/, '') !== new URL(workflow.path, workflow.origin).pathname.replace(/\/$/, '') || !document.querySelector(workflow.readySelector)) return { state: 'loading' };
  for (const check of workflow.checks) {
    const count = document.querySelectorAll(check.selector).length;
    if (count !== check.equals) return { state: count === 0 && check.ifZero ? check.ifZero : check.otherwise };
  }
  const result = { state: 'found' };
  for (const item of workflow.extract) {
    const elements = document.querySelectorAll(item.selector);
    if (item.pick === 'all') {
      if (!elements.length || elements.length > item.maxItems) return { state: 'extraction_failed' };
      const values = [...elements].map(element => element.innerText?.trim());
      if (values.some(text => !text || text.length > item.maxLength)) return { state: 'extraction_failed' };
      result[item.field] = values;
      continue;
    }
    const element = item.pick === 'last' ? elements[elements.length - 1] : elements[0];
    const text = element?.innerText?.trim();
    if (!text || text.length > item.maxLength) return { state: 'extraction_failed' };
    result[item.field] = text;
  }
  return result;
}

export async function runBrowserWorkflow(job, api, call, onProgress = async () => {}, { signal, timeoutMs = 22000, callTimeoutMs = 3000, pollIntervalMs = 250 } = {}) {
  if (!validWorkflow(job)) return { state: 'unsupported_workflow' };
  const workflow = job.workflow;
  const deadline = Date.now() + timeoutMs;
  // Every browser call is bounded. A pending document_idle injection must never consume the entire job.
  async function bounded(owner, method, ...args) {
    if (signal?.aborted || Date.now() >= deadline) throw new Error('execution_expired');
    let timer;
    let abort;
    try {
      return await Promise.race([
        call(owner, method, ...args),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('browser_api_timeout')), Math.min(callTimeoutMs, Math.max(1, deadline - Date.now())));
          abort = () => reject(new Error('execution_expired'));
          signal?.addEventListener('abort', abort, { once: true });
        }),
      ]);
    } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
  }
  const samePath = url => new URL(url).pathname.replace(/\/$/, '') === new URL(workflow.path, workflow.origin).pathname.replace(/\/$/, '');
  try {
    if (api.permissions?.contains && !await bounded(api.permissions, 'contains', { origins: [`${workflow.origin}/*`] })) return { state: 'site_permission_required' };
    await onProgress('finding_tab');
    const tabs = await bounded(api.tabs, 'query', { url: `${workflow.origin}/*` });
    const candidates = tabs.filter(tab => tab.id && tab.url && new URL(tab.url).origin === workflow.origin);
    candidates.sort((a, b) => Number(samePath(b.url)) - Number(samePath(a.url)) || Number(Boolean(b.active)) - Number(Boolean(a.active)) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    let tab = candidates[0];
    const created = !tab;
    if (!tab) {
      await onProgress('opening_page');
      tab = await bounded(api.tabs, 'create', { url: new URL(workflow.path, workflow.origin).href, active: false });
      if (!tab?.id) return { state: 'browser_tab_unavailable' };
      while (Date.now() < deadline && !signal?.aborted) {
        tab = await bounded(api.tabs, 'get', tab.id);
        if (tab.url && new URL(tab.url).origin === workflow.origin) break;
        if (tab.status === 'complete' && tab.url && !tab.url.startsWith('about:')) return { state: 'session_unavailable' };
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }
    // signedInSelector is only a historical hint, not an authentication check. Do not inject into unrelated tabs to probe it.
    if (!created) await onProgress('opening_page');
    if (!created && !samePath(tab.url)) await bounded(api.tabs, 'update', tab.id, { url: new URL(workflow.path, workflow.origin).href });
    await onProgress('preparing_page');
    let filled = !workflow.fill?.length;
    let readingReported = false;
    while (Date.now() < deadline && !signal?.aborted) {
      try {
        if (!filled) {
          const [step] = await bounded(api.scripting, 'executeScript', { target: { tabId: tab.id }, injectImmediately: true, func: applyFillSteps, args: [workflow] });
          if (['input_unavailable','session_unavailable'].includes(step?.result?.state)) return step.result;
          if (step?.result?.state !== 'filled') { await new Promise(resolve => setTimeout(resolve, pollIntervalMs)); continue; }
          filled = true;
          await new Promise(resolve => setTimeout(resolve, 120));
        }
        const [read] = await bounded(api.scripting, 'executeScript', { target: { tabId: tab.id }, injectImmediately: true, func: evaluateReadWorkflow, args: [workflow] });
        if (read?.result?.state && read.result.state !== 'loading') {
          if (!readingReported) { await onProgress('reading_page'); readingReported = true; }
          return read.result;
        }
      } catch (error) {
        // Only a destroyed navigation context is transient. Permission, selector, and API failures are not page readiness.
        if (!/frame.*(removed|not.*found)|context.*(destroyed|invalidated)|document.*(unloaded|navigat)/i.test(error.message)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    return { state: 'browser_read_timeout' };
  } catch (error) {
    return error.message === 'execution_expired' ? { state: 'browser_read_timeout' } : { state: 'browser_read_failed', reason: error.message === 'browser_api_timeout' ? 'browser_api_timeout' : 'script_error' };
  }
}
