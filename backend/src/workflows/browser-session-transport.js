import { chromium as defaultChromium } from 'playwright-core';

const sameSite = { lax: 'Lax', strict: 'Strict', no_restriction: 'None' };
const extensionSameSite = { Lax: 'lax', Strict: 'strict', None: 'no_restriction' };

function cookieBelongsToOrigin(cookie, origin) {
  const host = new URL(origin).hostname;
  const domain = cookie.domain.toLowerCase();
  return domain.startsWith('.') ? host === domain.slice(1) || host.endsWith(domain) : host === domain;
}

export function toBrowserStorageState(snapshot) {
  if (!snapshot || new URL(snapshot.origin).origin !== snapshot.origin) throw new Error('Invalid browser session origin');
  const now = Date.now() / 1000;
  return {
    cookies: snapshot.cookies.filter(cookie => cookieBelongsToOrigin(cookie, snapshot.origin) && (!cookie.expirationDate || cookie.expirationDate > now)).map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate ?? -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: sameSite[cookie.sameSite] ?? 'Lax',
    })),
    origins: [{
      origin: snapshot.origin,
      localStorage: Object.entries(snapshot.localStorage).map(([name, value]) => ({ name, value })),
    }],
  };
}

export function fromBrowserStorageState(state, origin) {
  return {
    origin,
    cookies: state.cookies.filter(cookie => cookieBelongsToOrigin(cookie, origin)).map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expirationDate: cookie.expires >= 0 ? cookie.expires : undefined,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: extensionSameSite[cookie.sameSite] ?? 'lax',
    })),
    localStorage: Object.fromEntries(state.origins.find(item => item.origin === origin)?.localStorage.map(item => [item.name, item.value]) ?? []),
  };
}

export function createBrowserSessionTransport(snapshot, { chromium = defaultChromium, executablePath = process.env.CONNECTOR_CHROMIUM_PATH, onCheckpoint = async () => {} } = {}) {
  return Object.freeze({
    async withPage(run) {
      const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
      try {
        const context = await browser.newContext({ storageState: toBrowserStorageState(snapshot) });
        const page = await context.newPage();
        const session = Object.freeze({
          checkpoint: async () => onCheckpoint(fromBrowserStorageState(await context.storageState(), snapshot.origin)),
        });
        return await run(page, session);
      } finally {
        await browser.close();
      }
    },
  });
}
