export const workflowStatuses = { recorded: 'Generating', needs_model: 'Needs attention', draft: 'Ready to test', tested: 'Test passed', saved: 'Saved' };
export function domain(origin) { try { return new URL(origin).hostname.replace(/^www\./, ''); } catch { return origin || 'Unknown website'; } }
export function workflowRows(items) {
  return items.map(item => ({ ...item, name: item.recording.title, site: domain(item.recording.origin), status: workflowStatuses[item.state] ?? item.state,
    lastTest: item.test?.state === 'found' ? 'Passed' : item.test?.state ? 'Failed' : 'Not tested',
    steps: (item.workflow?.steps??item.recording.events).filter(event => event.type !== 'output').length,
    created: Date.parse(item.createdAt) || null,
  }));
}
export function filterWorkflows(rows, { query = '', filters = [], view = 'active' } = {}) {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter(row => Boolean(row.archived) === (view === 'archived') &&
    `${row.name} ${row.recording.description ?? ''} ${row.site}`.toLocaleLowerCase().includes(search) &&
    filters.every(filter => row[filter.id] === filter.value));
}
export function sidebarLayout(value) {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  const width = Number.isFinite(number) ? Math.round(Math.min(360, Math.max(64, number))) : 236;
  return { width, compact: width < 176 };
}
export function recordingTimeline(events, createdAt) {
  const title = event => ({ navigation: 'Opened page', click: 'Clicked element', input: 'Changed a field', output: event.mode === 'list' ? 'Read a list' : event.mode === 'one' ? 'Read an element' : 'Read page' })[event.type] ?? event.type;
  return events.map((event, index) => ({ id: `step-${index}`, at: createdAt,
    title: `${index + 1}. ${title(event)}`,
    meta: [event.path, event.redacted ? 'Private value hidden' : null].filter(Boolean).join(' · '),
    selector: event.selector, event,
  }));
}
export function workflowLocation(id, search = '') {
  const params = new URLSearchParams(search);
  params.delete('teaching');
  return `/teachings${id ? `/${encodeURIComponent(id)}` : ''}${params.size ? `?${params}` : ''}`;
}

export function mcpLocation(origin, toolId = null, search = '') {
  const params = new URLSearchParams(search);
  params.delete('teaching'); params.delete('site');
  const identity=typeof origin==='object'?origin.id:new URL(origin).host;
  return `/mcps/${encodeURIComponent(identity)}${toolId ? `/tools/${encodeURIComponent(toolId)}` : ''}${params.size ? `?${params}` : ''}`;
}
export function readMcpRoute(pathname = location.pathname) {
  const match = pathname.match(/^\/mcps\/([^/]+)(?:\/tools\/([^/]+))?\/?$/);
  return match ? {host: decodeURIComponent(match[1]), toolId: match[2] ? decodeURIComponent(match[2]) : null} : {host:null, toolId:null};
}
export function mcpUrl(origin) { return `http://127.0.0.1:8787/mcp/${encodeURIComponent(typeof origin==='object'?origin.endpoint:new URL(origin).host)}`; }
export function mcpRows(items = [], sessions = [], reports = [], registry = undefined) {
  const origins = [...new Set([...items.map(item=>item.recording.origin), ...sessions.map(session=>session.origin)])];
  const records=registry??origins.map(origin=>({id:new URL(origin).host,name:new URL(origin).host,endpoint:new URL(origin).host,origin,enabled:true}));
  return records.filter(record=>!record.deletedAt).map(record=>{const origin=record.origin;
    const session=sessions.find(session=>session.origin===origin);
    const tools=items.filter(item=>item.recording.origin===origin&&(item.mcpId?item.mcpId===record.id:!record.duplicatedFrom));
    const active=tools.filter(item=>!item.archived);
    const tested=tools.filter(item=>item.test).sort((a,b)=>(b.testRun?.finishedAt??Date.parse(b.createdAt)??0)-(a.testRun?.finishedAt??Date.parse(a.createdAt)??0));
    const latest=tested[0], testedAt=latest?.testRun?.finishedAt??0, savedAt=Date.parse(session?.savedAt)||0;
    const currentTest=latest&&(!savedAt||!testedAt||testedAt>=savedAt);
    const issues=reports.filter(report=>report.origin===origin&&report.state==='open'&&(report.mcpId?report.mcpId===record.id:!record.duplicatedFrom));
    const needsLogin=issues.some(report=>report.issue==='login_expired')||session?.needsReconnect||currentTest&&['login_required','session_unavailable'].includes(latest.test.state);
    const detectedRepair=currentTest&&['element_not_found','extraction_failed','ambiguous_result','copy_unavailable'].includes(latest.test.state);
    const ready=session?.lastVerifiedAt||currentTest&&latest.test.state==='found';
    const status=record.enabled===false?'Inactive':record.lastTest?.state==='login_required'?'Login required':record.lastTest?.state==='unreachable'?'Unreachable':needsLogin?'Login required':issues.length||detectedRepair?'Repair required':ready?'Ready':currentTest&&latest.test.state!=='found'?'Needs attention':session?'Login saved':'Public access';
    return {...record, origin, site:domain(origin), tools:active.length,
      savedTools:active.filter(item=>item.state==='saved').length, archived:tools.length-active.length,
      status, issues, issueCount:issues.length, repairToolId:detectedRepair?latest.id:issues.find(report=>report.issue!=='login_expired')?.teachingId, needsRepair:Boolean(detectedRepair||issues.some(report=>report.issue!=='login_expired')), needsLogin:Boolean(needsLogin||record.lastTest?.state==='login_required'), session, url:mcpUrl(record), href:mcpLocation(record),
      lastRun:testedAt||null};
  }).sort((a,b)=>a.name.localeCompare(b.name));
}
