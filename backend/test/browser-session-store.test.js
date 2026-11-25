import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BrowserSessionStore } from '../src/browser-session-store.js';

test('saves an arbitrary site snapshot encrypted and lists metadata only', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-session-'));
  const store = new BrowserSessionStore(root);
  const snapshot = {
    origin: 'https://example.org',
    cookies: [{ name: 'sid', value: 'private-session-value', domain: 'example.org', path: '/' }],
    localStorage: { token: 'private-storage-value' },
  };
  const result = await store.save(snapshot);
  assert.equal(result.origin, snapshot.origin);
  assert.equal(result.cookieCount, 1);
  assert.equal(result.storageKeyCount, 1);
  assert.equal(JSON.stringify(await store.list()).includes('private-'), false);
  const files = await readdir(root);
  for (const file of files.filter(name => name.endsWith('.enc'))) {
    const raw = await readFile(path.join(root, file), 'utf8');
    assert.equal(raw.includes('private-session-value'), false);
    assert.equal(raw.includes('private-storage-value'), false);
  }
  assert.deepEqual((await new BrowserSessionStore(root).load(snapshot.origin)).cookies, snapshot.cookies);
  const token = await store.pairingToken();
  assert.equal(await new BrowserSessionStore(root).authorized(`Bearer ${token}`), true);
  assert.equal(await store.authorized(`Bearer ${'0'.repeat(64)}`), false);
  await store.remove(snapshot.origin);
  assert.deepEqual(await store.list(), []);
});

test('rejects invalid sites and malformed snapshots', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-session-'));
  const store = new BrowserSessionStore(root);
  await assert.rejects(store.save({ origin: 'chrome://settings', cookies: [], localStorage: {} }));
  await assert.rejects(store.save({ origin: 'https://example.org', cookies: [{ value: 3 }], localStorage: {} }));
});

test('MCP credentials are scoped to one website and revocable independently',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mcp-access-'));try{
  const store=new BrowserSessionStore(root);const origin='https://example.org';
  const token=await store.mcpToken(origin);assert.equal(await store.authorizedMcp(origin,`Bearer ${token}`),true);
  assert.equal(await store.authorizedMcp('https://other.org',`Bearer ${token}`),false);
  await store.mcpToken(origin,true);assert.equal(await store.authorizedMcp(origin,`Bearer ${token}`),false);
  const replacement=await store.mcpToken(origin);await store.remove(origin);assert.equal(await store.authorizedMcp(origin,`Bearer ${replacement}`),false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('login status distinguishes verified, expired and newly imported authentication without returning secrets',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mcp-status-'));try{
  const store=new BrowserSessionStore(root);const snapshot={origin:'https://example.org',cookies:[],localStorage:{token:'private'}};
  await store.save(snapshot);assert.equal(typeof store.markConnection,'function');
  await store.markConnection(snapshot.origin,'verified');assert((await store.list())[0].lastVerifiedAt);
  await store.markConnection(snapshot.origin,'login_required');assert.equal((await store.list())[0].needsReconnect,true);
  await store.save(snapshot);assert.equal((await store.list())[0].needsReconnect,false);
  assert.equal(JSON.stringify(await store.list()).includes('private'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
