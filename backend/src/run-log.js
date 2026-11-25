// Browser call logs can contain page text, filled values and authenticated URLs.
// Keep only a bounded first-line error, with values and quoted payloads removed.
export function safeRunError(error, privateValues = []) {
  let message = String(error?.message || 'Unknown browser error').split(/[\r\n]/, 1)[0]
    .replace(/https?:\/\/[^\s<>"'`]+/gi, '[URL omitted]')
    .replace(/(['"`])[^]*?\1/g, '[quoted value omitted]');
  for (const value of [...new Set(privateValues.filter(value => typeof value === 'string' && value))].sort((a,b)=>b.length-a.length)) {
    const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    message=message.replace(new RegExp(value.length<4?`\\b${escaped}\\b`:escaped,'g'),'[value omitted]');
  }
  message=message.replace(/\b(authorization|cookie|token|password|secret|api[-_]?key)\s*[:=]\s*\S+/gi,'$1=[omitted]')
    .replace(/\bBearer\s+\S+/gi,'Bearer [omitted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email omitted]')
    .replace(/[\x00-\x1f\x7f]/g,'').slice(0,700);
  return {name:/^[A-Za-z][\w]{0,60}$/.test(error?.name)?error.name:'Error',message};
}

export function formatRunLog(run, result = run.result) {
  const elapsed=at=>`${Math.max(0,(Number(at)-Number(run.createdAt))/1000).toFixed(3)}s`;
  const lines=['Bridge backend run',`Run: ${run.id}`,`Status: ${run.state}${result?.state?` · ${result.state}`:''}`];
  if(run.createdAt)lines.push(`Started: ${new Date(run.createdAt).toISOString()}`);
  for(const event of run.events??[])lines.push(`[${elapsed(event.at)}] INFO ${event.phase}${Number.isInteger(event.stepIndex)?` · step ${event.stepIndex+1}`:''}${event.action?` · ${event.action}`:''}`);
  if(run.diagnostic)lines.push(`[${elapsed(run.finishedAt??Date.now())}] ERROR ${run.failedPhase??run.phase}${Number.isInteger(run.stepIndex)?` · step ${run.stepIndex+1}`:''} · ${run.diagnostic.name}: ${run.diagnostic.message}`);
  else if(result&&result.state!=='found')lines.push('Detailed browser error was not recorded for this earlier run. Run again to capture it.');
  return lines.join('\n');
}
