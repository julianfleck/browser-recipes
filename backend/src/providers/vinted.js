export const vinted = Object.freeze({
  id: 'vinted',
  name: 'Vinted',
  sessionOrigins: ['https://www.vinted.de'],
  workflows: [{
    id: 'vinted.session_probe',
    provider: 'vinted',
    sessionOrigin: 'https://www.vinted.de',
    effect: 'read',
    description: 'Send one read-only homepage request using the saved session cookies.',
    steps: [
      { id: 'homepage', run: context => context.http.get('/', { followSameOrigin: 2 }) },
      { id: 'assessment', run: (_context, steps) => {
        const response = steps.homepage;
        const state = response.status === 200 ? 'site_reachable'
          : response.redirected ? 'redirected'
          : [401, 403, 429].includes(response.status) ? 'blocked_or_challenged'
          : 'unexpected_response';
        return { state, authenticated: 'unverified' };
      } },
    ],
    result: steps => ({
      state: steps.assessment.state,
      authenticated: steps.assessment.authenticated,
      httpStatus: steps.homepage.status,
      redirected: steps.homepage.redirected,
      sameOriginRedirect: steps.homepage.sameOriginRedirect,
      redirectHops: steps.homepage.redirectHops,
    }),
  }, {
    id: 'vinted.latest_received_message',
    provider: 'vinted',
    sessionOrigin: 'https://www.vinted.de',
    effect: 'read',
    description: 'Read the latest received message from a saved Vinted session through its inbox UI.',
    steps: [{
      id: 'inbox',
      run: context => context.browser.withPage(async (page, session) => {
        await page.goto('https://www.vinted.de/', { waitUntil: 'domcontentloaded' });
        const inboxButton = page.locator('[data-testid="header-conversations-button"]');
        const signedIn = await inboxButton.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
        if (!signedIn) return { state: 'session_unavailable' };
        await session.checkpoint();
        await inboxButton.click();
        await page.locator('[data-testid="conversation-content"]').waitFor({ state: 'visible', timeout: 20000 });

        const threads = page.locator('[data-testid^="inbox-list-item-"][data-testid$="-container"]');
        const threadCount = await threads.count();
        if (threadCount === 0) return { state: 'empty' };
        if (threadCount !== 1) return { state: 'multiple_threads_require_review', threadCount };

        const messages = page.locator('[data-testid="braze-message-text"]');
        const messageCount = await messages.count();
        if (messageCount !== 1) return { state: 'unsupported_message_layout', messageCount };
        const message = (await messages.last().innerText()).trim();
        return message ? { state: 'found', message } : { state: 'empty_message' };
      }),
    }],
    result: steps => steps.inbox,
  }],
});
