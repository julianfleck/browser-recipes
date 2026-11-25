export const MARKETPLACES = Object.freeze({
  vestiaire: { name: 'Vestiaire Collective', url: 'https://www.vestiairecollective.com/' },
  vinted: { name: 'Vinted', url: 'https://www.vinted.de/' },
});

export class SessionManager {
  constructor({ vault, browser, now = () => new Date().toISOString() }) {
    this.vault = vault;
    this.browser = browser;
    this.now = now;
    this.active = new Map();
    this.overrides = new Map();
  }

  assertPlatform(platform) {
    if (!Object.hasOwn(MARKETPLACES, platform)) {
      throw new Error(`Unsupported marketplace: ${platform}`);
    }
  }

  async status(platform) {
    this.assertPlatform(platform);
    const saved = await this.vault.load(platform);
    const state = this.overrides.get(platform)
      ?? (saved ? (saved.needsReconnect ? 'needs_reconnect' : saved.lastVerifiedAt ? 'previously_verified' : 'saved_unverified') : 'not_connected');
    return {
      platform,
      name: MARKETPLACES[platform].name,
      state,
      liveViewUrl: this.active.get(platform)?.session.liveViewUrl ?? null,
      savedAt: saved?.savedAt ?? null,
      lastVerifiedAt: saved?.lastVerifiedAt ?? null,
    };
  }

  async allStatuses() {
    return Promise.all(Object.keys(MARKETPLACES).map(platform => this.status(platform)));
  }

  async closeActive(platform) {
    const current = this.active.get(platform);
    if (current) {
      this.active.delete(platform);
      this.overrides.delete(platform);
      await current.session.close();
    }
  }

  async connect(platform) {
    this.assertPlatform(platform);
    if ([...this.active.keys()].some(other => other !== platform)) {
      throw new Error('Finish the open login or verification first');
    }
    await this.closeActive(platform);
    const session = await this.browser.open(platform, null);
    this.active.set(platform, { kind: 'login', session });
    this.overrides.set(platform, 'login_open');
    return this.status(platform);
  }

  async saveLogin(platform) {
    this.assertPlatform(platform);
    const current = this.active.get(platform);
    if (current?.kind !== 'login') throw new Error('No login window is open');
    const storageState = await current.session.snapshot();
    const previous = await this.vault.load(platform);
    const record = { storageState, savedAt: this.now(), lastVerifiedAt: null, needsReconnect: false };
    await this.closeActive(platform);
    await this.vault.save(platform, record);
    if (previous?.storageState?.contextId !== storageState.contextId) {
      await this.browser.removeState?.(previous?.storageState);
    }
    this.overrides.delete(platform);
    return this.status(platform);
  }

  async openVerification(platform) {
    this.assertPlatform(platform);
    if ([...this.active.keys()].some(other => other !== platform)) {
      throw new Error('Finish the open login or verification first');
    }
    const saved = await this.vault.load(platform);
    if (!saved) throw new Error('No saved session to verify');
    await this.closeActive(platform);
    const session = await this.browser.open(platform, saved.storageState);
    this.active.set(platform, { kind: 'verification', session });
    this.overrides.set(platform, 'verification_open');
    return this.status(platform);
  }

  async finishVerification(platform, stillSignedIn) {
    this.assertPlatform(platform);
    const current = this.active.get(platform);
    if (current?.kind !== 'verification') throw new Error('No verification window is open');
    if (stillSignedIn) {
      const previous = await this.vault.load(platform);
      const storageState = await current.session.snapshot();
      await this.closeActive(platform);
      await this.vault.save(platform, {
        storageState,
        savedAt: previous.savedAt,
        lastVerifiedAt: this.now(),
        needsReconnect: false,
      });
    } else {
      const previous = await this.vault.load(platform);
      await this.closeActive(platform);
      await this.vault.save(platform, { ...previous, needsReconnect: true });
    }
    return this.status(platform);
  }

  async disconnect(platform) {
    this.assertPlatform(platform);
    await this.closeActive(platform);
    const saved = await this.vault.load(platform);
    await this.browser.removeState?.(saved?.storageState);
    await this.vault.remove(platform);
    this.overrides.delete(platform);
    return this.status(platform);
  }

  async cancel(platform) {
    this.assertPlatform(platform);
    await this.closeActive(platform);
    this.overrides.delete(platform);
    return this.status(platform);
  }
}
