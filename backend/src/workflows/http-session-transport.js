function cookieMatches(cookie, url, now) {
  if (!cookie || typeof cookie.name !== 'string' || typeof cookie.value !== 'string') return false;
  const domain = String(cookie.domain ?? '').toLowerCase();
  const host = url.hostname.toLowerCase();
  const domainMatches = domain.startsWith('.')
    ? host === domain.slice(1) || host.endsWith(domain)
    : host === domain;
  if (!domainMatches || (cookie.secure && url.protocol !== 'https:')) return false;
  if (cookie.expirationDate && cookie.expirationDate <= now) return false;
  const path = cookie.path || '/';
  return url.pathname === path || url.pathname.startsWith(path.endsWith('/') ? path : `${path}/`);
}

export function createHttpSessionTransport(snapshot, { fetchImpl = fetch, now = () => Date.now() / 1000 } = {}) {
  const origin = new URL(snapshot.origin);
  if (origin.origin !== snapshot.origin || origin.protocol !== 'https:') throw new Error('HTTPS session origin required');

  return Object.freeze({
    async get(path, { followSameOrigin = 0 } = {}) {
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw new Error('Workflow path must be relative to its session origin');
      if (!Number.isInteger(followSameOrigin) || followSameOrigin < 0 || followSameOrigin > 3) throw new Error('Invalid redirect limit');
      let url = new URL(path, origin);
      let redirectHops = 0;
      for (;;) {
        if (url.origin !== origin.origin) throw new Error('Workflow may not leave its session origin');
        const cookie = snapshot.cookies.filter(item => cookieMatches(item, url, now()))
          .map(item => `${item.name}=${item.value}`).join('; ');
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: cookie ? { cookie, accept: 'text/html' } : { accept: 'text/html' },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        const location = response.headers.get('location');
        const redirected = response.status >= 300 && response.status < 400;
        let destination = null;
        try { if (location) destination = new URL(location, url); } catch {}
        const sameOriginRedirect = Boolean(destination && destination.origin === origin.origin);
        await response.body?.cancel?.();
        if (redirected && sameOriginRedirect && redirectHops < followSameOrigin) {
          url = destination;
          redirectHops++;
          continue;
        }
        return { status: response.status, redirected, sameOriginRedirect, redirectHops };
      }
    },
  });
}
