import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projects = ['backend', 'frontend'];

for (const project of projects) {
  if (existsSync(path.join(root, project, 'node_modules', '.modules.yaml'))) continue;
  console.log(`Installing ${project} dependencies with pnpm…`);
  const result = spawnSync('pnpm', ['--dir', project, 'install', '--frozen-lockfile'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const children = [
  spawn('pnpm', ['--dir', 'backend', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
  spawn('pnpm', ['--dir', 'frontend', 'dev:ui'], {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.pid == null) continue;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

let finished = 0;
for (const child of children) {
  child.on('error', error => {
    console.error(error);
    stop();
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    finished++;
    if (!stopping) {
      console.error(`A dev service stopped (${signal ?? code}). Shutting down both services.`);
      process.exitCode = code || 1;
      stop();
    }
    if (finished === children.length) process.exit();
  });
}
