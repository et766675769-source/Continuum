import { dirname, join, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const storageConfigPath = join(root, 'storage.json');
export function activeDataDir() {
  const path = readJson(storageConfigPath, {}).activeDir;
  return typeof path === 'string' && isAbsolute(path) ? resolve(path) : join(root, 'data');
}
export const dataDir = activeDataDir();
export const statusPath = join(dataDir, 'status.json');
export const codexHome = process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.codex');

export function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  for (let attempt = 0; attempt < 6; attempt++) {
    try { renameSync(temp, path); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 5) throw error;
      // ponytail: cloud-sync file locks are brief; keep this synchronous retry bounded.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
}

export function state() { return readJson(join(activeDataDir(), 'state.json'), { sessions: [], threshold: 0.7 }); }
export function saveState(value) { writeJson(join(activeDataDir(), 'state.json'), value); }
export function hasData() { return existsSync(join(activeDataDir(), 'memory.sqlite')); }