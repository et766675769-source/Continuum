import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const dataDir = join(root, 'data');
export const statePath = join(dataDir, 'state.json');
export const dbPath = join(dataDir, 'memory.sqlite');
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
  renameSync(temp, path);
}

export function state() { return readJson(statePath, { sessions: [], threshold: 0.7 }); }
export function saveState(value) { writeJson(statePath, value); }
export function hasData() { return existsSync(dbPath); }
