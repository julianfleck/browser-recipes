import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Check, ChevronDown, Clock3, Globe2, LoaderCircle, RotateCcw, Workflow } from 'lucide-react';
import { Progress } from './components/arc/progress/progress';
import { Timeline } from './components/arc/timeline/timeline';
import { Button } from './components/arc/button/button';
import './browser-test-run.css';
import RunLogs from './RunLogs';

const steps = [
 {phase:'loading_session',active:'Restoring saved website login',done:'Saved login restored'},
 {phase:'opening_page',active:'Opening the website headlessly',done:'Website opened'},
 {phase:'replaying',active:'Replaying recorded steps',done:'Recorded steps replayed'},
 {phase:'saving_result',active:'Saving the result',done:'Result saved'},
];

const outcomes = {
  found: 'Test passed',
  site_permission_required: 'Allow access to this site in the extension, then retry.',
  browser_tab_unavailable: 'The browser could not open the website. Open it manually, then retry.',
  session_unavailable: 'Check that you are signed in on the website, then retry.',
  input_unavailable: 'A recorded field was not found on the page.',
  extraction_failed: 'The page changed and the result could not be read.',
  ambiguous_result: 'The result matched more than one element.',
  browser_read_timeout: 'The page did not become ready in time.',
  browser_read_failed: 'The previous browser reader failed. Run again using the backend.',
  timed_out: 'The extension did not finish this test in time.',
};

function elapsed(startedAt, finishedAt, now) {
  if (!startedAt) return '';
  const seconds = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function BrowserTestRun({ run, result, error, canRun, canSave, onRun, onSave, runBusy, saveBusy }) {
  const [expanded, setExpanded] = useState(() => ['queued', 'running'].includes(run?.state));
  const [now, setNow] = useState(Date.now());
  const active = run?.state === 'queued' || run?.state === 'running';
  const phase = run?.phase ?? (active ? run.state : null);
  const phaseLabel = run?.stepLabel ? `Step ${(run.stepIndex??0)+1} · ${run.stepLabel}` : steps.find(step => step.phase === phase)?.active;
  const passed = result?.state === 'found';
  const failed = Boolean(error || run?.state === 'timed_out' || result && !passed);
  const backendMessage=({image_unavailable:'A selected image was not ready. Check the image selection and test again.',output_too_large:'Choose a smaller result: up to 20 elements and 5 images.',login_required:'The saved login expired. Sign in on the website, then choose Save / update website login in the extension.',element_not_found:`A recorded element was not found at step ${(result?.stepIndex??0)+1}. Review its selector in the recipe.`,write_permission_required:'This recipe needs permission to make changes. Enable it below, then test again.',backend_run_failed:'The backend could not finish this recipe. Check the saved login and recorded steps.',browser_not_installed:'The backend needs Chromium. Install it or configure CONNECTOR_CHROMIUM_PATH.',copy_unavailable:'The recorded copy action did not return text.',site_changed:'The recipe navigated to another website. Record that website as a separate tool.',run_timeout:'This recipe exceeded its backend run time.'})[result?.state];
  const title = error || backendMessage || (active ? phaseLabel ?? 'Testing headlessly' : result ? outcomes[result.state] ?? `Test ended: ${result.state.replaceAll('_', ' ')}` : runBusy ? 'Starting backend browser' : 'Test this tool');
  const checkpoints = new Set(run?.events?.map(event => event.phase) ?? []);
  const doneCount = steps.filter(step => checkpoints.has(step.phase) && step.phase !== run?.failedPhase && !(active && step.phase === phase)).length;
  const activity = (run?.events ?? []).map((event, index) => {
    const step = steps.find(item => item.phase === event.phase);
    const isCurrent = active && event.phase === phase;
    const failedStep = !active && event.phase === run?.failedPhase;
    const title = event.stepLabel ? `Step ${(event.stepIndex??0)+1} · ${event.stepLabel}` : event.phase === 'completed' ? passed ? 'Test passed' : 'Test stopped' : event.phase === 'timed_out' ? 'Test timed out' : failedStep ? `${step?.active ?? 'Browser step'} stopped` : isCurrent ? step?.active : step?.done ?? event.phase;
    return { id: `${event.phase}-${index}`, at: event.at, title, icon: event.phase === 'completed' && passed ? <Check size={14}/> : event.phase === 'timed_out' || failedStep || event.phase === 'completed' && !passed ? <AlertCircle size={14}/> : isCurrent ? <LoaderCircle size={14}/> : <Check size={14}/>, tone: event.phase === 'timed_out' || failedStep || event.phase === 'completed' && !passed ? 'danger' : event.phase === 'completed' && passed ? 'success' : 'neutral' };
  });

  useEffect(() => { setExpanded(['queued', 'running'].includes(run?.state)); }, [run?.id, run?.state]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, run?.id]);

  return <section className={`browser-run ${active ? 'is-active' : failed ? 'is-failed' : passed ? 'is-passed' : ''}`} aria-label="Browser test">
    <div className="browser-run-head">
      <span className="browser-run-mark" aria-hidden="true">{active || runBusy ? <LoaderCircle size={17} /> : failed ? <AlertCircle size={17} /> : passed ? <Check size={17} /> : <Workflow size={17} />}</span>
      <div className="browser-run-title"><strong>{title}</strong></div>
      {run?.createdAt && <span className="browser-run-time"><Clock3 size={13} aria-hidden="true"/>{elapsed(run.createdAt, run.finishedAt, now)}</span>}
      {run && <button className="browser-run-toggle" type="button" aria-label={expanded ? 'Hide test steps' : 'Show test steps'} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><ChevronDown size={16} aria-hidden="true"/></button>}
    </div>

    {run && expanded && <div className="browser-run-body">
      <div className="browser-run-progress"><Progress value={doneCount} max={steps.length} aria-label="Browser test progress" /><span>{doneCount} of {steps.length} steps complete</span></div>
      <div className="browser-run-timeline"><Timeline events={activity} now={now} label="Backend run activity" maxHeight="none" compact /></div>
    </div>}

    <RunLogs text={run?.logText}/>
    {(canRun || canSave) && <div className="browser-run-actions">
      {canRun && !active && <Button loading={runBusy} onClick={onRun}>{run || result ? <RotateCcw size={15}/> : <Globe2 size={15}/>} {run || result ? 'Run again' : 'Test tool'} <ArrowRight size={15}/></Button>}
      {canSave && <Button variant="secondary" loading={saveBusy} onClick={onSave}>Save tool <Check size={15}/></Button>}
    </div>}
  </section>;
}
