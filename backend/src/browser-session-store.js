import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SessionVault } from './session-vault.js';

function siteId(origin) {
  return `site${createHash('sha256').update(origin).digest('hex')}`;
}

function validOrigin(value) {
  const url = new URL(value);
  if (url.origin !== value || (url.protocol !== 'https:' && url.protocol !== 'http:')) throw new Error('Invalid site origin');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS required');
  return value;
}

function validSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Invalid snapshot');
  const origin = validOrigin(snapshot.origin);
  if (!Array.isArray(snapshot.cookies) || snapshot.cookies.length > 500 || !snapshot.cookies.every(cookie =>
    cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string' && typeof cookie.domain === 'string' && typeof cookie.path === 'string')) throw new Error('Invalid cookies');
  if (!snapshot.localStorage || typeof snapshot.localStorage !== 'object' || Array.isArray(snapshot.localStorage) ||
    !Object.entries(snapshot.localStorage).every(([key, value]) => typeof key === 'string' && typeof value === 'string')) throw new Error('Invalid local storage');
  if(snapshot.sessionStorage!==undefined&&(!snapshot.sessionStorage||typeof snapshot.sessionStorage!=='object'||Array.isArray(snapshot.sessionStorage)||Object.values(snapshot.sessionStorage).some(value=>typeof value!=='string')))throw new Error('Invalid session storage');
  return origin;
}

export class BrowserSessionStore {
  constructor(root, now = () => new Date().toISOString()) {
    this.root = root;
    this.vault = new SessionVault(root);
    this.now = now;
    this.tokenPath = path.join(root, 'pairing.token');
  }

  async pairingToken() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try {
      await writeFile(this.tokenPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    return readFile(this.tokenPath, 'utf8');
  }

  async authorized(value) {
    if (typeof value !== 'string' || !/^Bearer [0-9a-f]{64}$/.test(value)) return false;
    const expected = Buffer.from(await this.pairingToken());
    const received = Buffer.from(value.slice(7));
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  async mcpToken(origin, rotate = false) {
    validOrigin(origin);const id=`mcp${siteId(origin)}`;
    let record=rotate?null:await this.vault.load(id);
    if(!record){record={token:randomBytes(32).toString('hex')};await this.vault.save(id,record);}
    return record.token;
  }
  async authorizedMcp(origin,authorization){
    if(typeof authorization!=='string'||!/^Bearer [0-9a-f]{64}$/.test(authorization))return false;
    const record=await this.vault.load(`mcp${siteId(validOrigin(origin))}`);if(!record)return false;
    return timingSafeEqual(Buffer.from(record.token),Buffer.from(authorization.slice(7)));
  }
  async list() {
    return (await this.vault.load('browserindex'))?.sites ?? [];
  }

  async save(snapshot) {
    const origin = validSnapshot(snapshot);
    const savedAt = this.now();
    const metadata = {
      origin,
      savedAt, needsReconnect:false, lastVerifiedAt:null,
      cookieCount: snapshot.cookies.length,
      storageKeyCount: Object.keys(snapshot.localStorage).length,
    };
    await this.vault.save(siteId(origin), { ...snapshot, savedAt });
    const sites = (await this.list()).filter(site => site.origin !== origin);
    sites.unshift(metadata);
    await this.vault.save('browserindex', { sites });
    return metadata;
  }

  async markConnection(origin,state) {
    validOrigin(origin);if(!['verified','login_required'].includes(state))throw new Error('Invalid connection state');
    const sites=await this.list(),site=sites.find(site=>site.origin===origin);if(!site)return;
    site.needsReconnect=state==='login_required';
    if(state==='verified')site.lastVerifiedAt=this.now();
    await this.vault.save('browserindex',{sites});
  }
  async load(origin) {
    return this.vault.load(siteId(validOrigin(origin)));
  }

  async remove(origin) {
    await this.vault.remove(`mcp${siteId(validOrigin(origin))}`);
    await this.vault.remove(siteId(validOrigin(origin)));
    await this.vault.save('browserindex', { sites: (await this.list()).filter(site => site.origin !== origin) });
  }
}
