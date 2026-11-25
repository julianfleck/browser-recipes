export function requestExtension(type, token) {
  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', receive); resolve({ ok: false, reason: 'missing' }); }, 1800);
    function receive(event) {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'agent-session:response' || event.data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      resolve({ ok: event.data.ok === true, reason: event.data.reason });
    }
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'agent-session:request', type, token, requestId }, location.origin);
  });
}
