import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const extension = path.join(frontend, 'extension');
const built = path.join(frontend, 'extension-build');
const destination = path.join(frontend, 'public', 'agent-session-bridge.zip');
const folder = 'agent-session-bridge/';

const result = spawnSync('pnpm', ['exec', 'vite', 'build', '--config', 'vite.extension.config.js'], { cwd: frontend, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
for (const name of (await readdir(extension)).filter(name => !['popup.html'].includes(name))) {
  await copyFile(path.join(extension, name), path.join(built, name));
}

async function files(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...await files(path.join(directory, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

function checksum(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const localFiles = [];
const directory = [];
let offset = 0;

for (const file of (await files(built)).sort()) {
  const data = await readFile(path.join(built, file));
  const name = Buffer.from(folder + file);
  const crc = checksum(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  localFiles.push(local, name, data);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  directory.push(central, name);
  offset += local.length + name.length + data.length;
}

const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(directory.length / 2, 8);
end.writeUInt16LE(directory.length / 2, 10);
end.writeUInt32LE(directorySize, 12);
end.writeUInt32LE(offset, 16);

await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, Buffer.concat([...localFiles, ...directory, end]));
console.log(`Packaged ${directory.length / 2} extension files for download.`);
