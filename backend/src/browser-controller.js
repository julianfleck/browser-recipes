import Browserbase from '@browserbasehq/sdk';
import { chromium as defaultChromium } from 'playwright-core';
import { MARKETPLACES } from './session-manager.js';

export class BrowserController {
  constructor({ bb, chromium = defaultChromium, apiKey = process.env.BROWSERBASE_API_KEY, settleMs = 3000 } = {}) {
    this.bb = bb ?? (apiKey ? new Browserbase({ apiKey }) : null);
    this.chromium = chromium;
    this.settleMs = settleMs;
  }

  get configured() {
    return Boolean(this.bb);
  }

  async open(platform, savedState) {
    const marketplace = MARKETPLACES[platform];
    if (!marketplace) throw new Error(`Unsupported marketplace: ${platform}`);
    if (!this.bb) throw new Error('Set BROWSERBASE_API_KEY on the backend to start a hosted login');

    const isNew = !savedState?.contextId;
    const contextId = savedState?.contextId ?? (await this.bb.contexts.create()).id;
    let browser;
    let heartbeat;
    try {
      const remote = await this.bb.sessions.create({
        timeout: 900,
        region: 'eu-central-1',
        browserSettings: {
          context: { id: contextId, persist: true },
          recordSession: false,
          logSession: false,
        },
      });
      browser = await this.chromium.connectOverCDP(remote.connectUrl);
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(marketplace.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const { debuggerFullscreenUrl } = await this.bb.sessions.debug(remote.id);
      heartbeat = setInterval(() => page.evaluate(() => undefined).catch(() => {}), 4 * 60_000);
      heartbeat.unref?.();
      let retained = !isNew;
      return {
        liveViewUrl: debuggerFullscreenUrl,
        snapshot: async () => { retained = true; return { contextId }; },
        close: async () => {
          clearInterval(heartbeat);
          await browser.close();
          if (!retained) await this.bb.contexts.delete(contextId);
          else if (this.settleMs) await new Promise(resolve => setTimeout(resolve, this.settleMs));
        },
      };
    } catch (error) {
      clearInterval(heartbeat);
      if (browser) await browser.close().catch(() => {});
      if (isNew) await this.bb.contexts.delete(contextId).catch(() => {});
      throw error;
    }
  }

  async removeState(savedState) {
    if (!savedState?.contextId) return;
    if (!this.bb) throw new Error('Set BROWSERBASE_API_KEY on the backend to remove the hosted session');
    await this.bb.contexts.delete(savedState.contextId);
  }
}
