import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class SessionVault {
  constructor(root) {
    this.root = root;
    this.keyPath = path.join(root, 'vault.key');
  }

  file(platform) {
    if (!/^[a-z0-9]+$/.test(platform)) throw new Error('Invalid platform name');
    return path.join(this.root, `${platform}.enc`);
  }

  async key() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try {
      await writeFile(this.keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const key = await readFile(this.keyPath);
    if (key.length !== 32) throw new Error('Invalid vault key');
    return key;
  }

  async save(platform, record) {
    const key = await this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(record)), cipher.final()]);
    const payload = JSON.stringify({
      version: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64'),
    });
    const temporary = `${this.file(platform)}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, payload, { flag: 'wx', mode: 0o600 });
    await rename(temporary, this.file(platform));
  }

  async load(platform) {
    let payload;
    try {
      payload = JSON.parse(await readFile(this.file(platform), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (payload.version !== 1) throw new Error('Unsupported vault record');
    const decipher = createDecipheriv('aes-256-gcm', await this.key(), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  async remove(platform) {
    await rm(this.file(platform), { force: true });
  }
}
