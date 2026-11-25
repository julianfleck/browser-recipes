(function () {
const bridgeApi = globalThis.chrome ?? globalThis.browser;
const appOrigin = location.origin;

let pollTimer;
function runtimeMessage(message, respond = () => {}) {
  try {
    bridgeApi.runtime.sendMessage(message, result => {
      const error = bridgeApi.runtime.lastError;
      respond(error ? { ok: false, reason: 'reload_required' } : { ok: result?.ok !== false, ...result });
    });
  } catch {
    if (pollTimer) clearInterval(pollTimer);
    respond({ ok: false, reason: 'reload_required' });
  }
}
function pollWorkflows() {
  if (location.port !== '5173' || !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  runtimeMessage({ type: 'agent-session:poll-workflows' });
}
pollTimer = setInterval(pollWorkflows, 2000);
pollWorkflows();

window.addEventListener('message', event => {
  if (location.port !== '5173' || !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  if (event.source !== window || event.origin !== appOrigin || event.data?.channel !== 'agent-session:request') return;
  const { type, requestId, token } = event.data;
  if (typeof requestId !== 'string' || requestId.length > 100) return;
  const reply = result => window.postMessage({ channel: 'agent-session:response', requestId, ...result }, appOrigin);
  if (type === 'ping') {
    runtimeMessage({ type: 'agent-session:health' }, reply);
  } else if (type === 'run-test') {
    // Acknowledge the wake request immediately; the app polls the server for
    // the actual browser job state and result.
    reply({ ok: true });
    runtimeMessage({ type: 'agent-session:poll-workflows' });
  } else if (type === 'pair' && typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)) {
    try {
      bridgeApi.storage.local.set({ pairingToken: token }, () => {
        const error = bridgeApi.runtime.lastError;
        reply({ ok: !error, ...(error ? { reason: 'reload_required' } : {}) });
      });
    } catch { reply({ ok: false, reason: 'reload_required' }); }
  }
});
})();
