import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { activeDataDir, root, storageConfigPath, readJson, writeJson } from './paths.mjs';

function validate(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Choose an absolute folder path.');
  const target = resolve(path);
  if (target.toLowerCase() === join(root, 'data').toLowerCase()) return target;
  const inside = relative(root, target);
  if (!inside.startsWith('..') && !isAbsolute(inside)) throw new Error('Choose a folder outside the project to keep conversation data out of Git.');
  return target;
}

export function storageStatus(configPath = storageConfigPath) {
  const config = readJson(configPath, {});
  return { activeDir: config.activeDir || activeDataDir(), targetDir: config.targetDir || null };
}

export function setStorageTarget(path, configPath = storageConfigPath) {
  const targetDir = validate(path);
  const config = readJson(configPath, {});
  writeJson(configPath, { ...config, targetDir });
  return { activeDir: config.activeDir || activeDataDir(), targetDir };
}

export function migrateStorage(configPath = storageConfigPath, source = activeDataDir()) {
  const config = readJson(configPath, {});
  const target = validate(config.targetDir);
  if (source.toLowerCase() === target.toLowerCase()) return { activeDir: source, migrated: false };
  const watcher = join(source, 'watch.pid');
  if (existsSync(watcher)) {
    const pid = Number(readFileSync(watcher, 'utf8'));
    try { process.kill(pid, 0); throw new Error('Stop the background watcher before migration.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  for (const name of ['memory.sqlite', 'state.json', 'node-path.txt', 'conversations']) {
    if (existsSync(join(target, name))) throw new Error('Destination already contains a Continuum archive.');
  }
  mkdirSync(target, { recursive: true });
  const sourceDb = join(source, 'memory.sqlite');
  if (existsSync(sourceDb)) {
    const db = new DatabaseSync(sourceDb);
    try { db.exec(`VACUUM INTO '${join(target, 'memory.sqlite').replaceAll("'", "''")}'`); }
    finally { db.close(); }
  }
  if (existsSync(join(source, 'conversations'))) cpSync(join(source, 'conversations'), join(target, 'conversations'), { recursive: true });
  for (const name of ['state.json', 'node-path.txt']) {
    if (existsSync(join(source, name))) copyFileSync(join(source, name), join(target, name));
  }
  writeJson(configPath, { ...config, activeDir: target, targetDir: target });
  return { activeDir: target, previousDir: source, migrated: true };
}