#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { state, saveState, readJson, statusPath } from './paths.mjs';
import { sessionFiles, findSession, preview } from './sessions.mjs';
import { openStore, search, readChunk, stats, clearSession } from './store.mjs';
import { ingest } from './ingest.mjs';
import { scanOnce, watch } from './watch.mjs';
import { isConfigured, isActive } from './cli-support.mjs';
import { installHooks, removeHooks } from './hooks-config.mjs';
import { storageStatus, setStorageTarget, migrateStorage } from './storage.mjs';

const [command, ...args] = process.argv.slice(2);
const output = value => console.log(JSON.stringify(value, null, 2));

try {
  if (command === 'list') {
    output(sessionFiles().slice(0, Number(args[0]) || 20).map(x => ({
      id: x.id, ...preview(x.path), path: x.path
    })));
  } else if (command === 'add') {
    const file = findSession(args[0]);
    if (!file) throw new Error('Session not found. Use list to find an ID.');
    const settings = state();
    if (!settings.sessions.some(x => x.id === file.id)) settings.sessions.push({ id: file.id, path: file.path });
    saveState(settings);
    const db = openStore();
    output(await ingest(db, file));
    db.close();
  } else if (command === 'reindex') {
    const selected = state().sessions.find(x => x.id === args[0] || x.id.startsWith(args[0] || '\0'));
    if (!selected) throw new Error('Select a session first with add.');
    const file = existsSync(selected.path) ? selected : findSession(selected.id);
    if (!file) throw new Error('Session source not found.');
    const db = openStore(); output(await ingest(db, file, { reset: true })); db.close();
  } else if (command === 'remove') {
    const settings = state();
    settings.sessions = settings.sessions.filter(x => x.id !== args[0] && !x.id.startsWith(args[0] || '\0'));
    saveState(settings);
    output({ selected: settings.sessions.map(x => x.id), retainedArchive: true });
  } else if (command === 'forget') {
    const settings = state();
    const matches = settings.sessions.filter(x => x.id === args[0] || x.id.startsWith(args[0] || '\0'));
    if (matches.length !== 1) throw new Error('Specify one selected session ID.');
    const db = openStore();
    db.exec('BEGIN');
    try { clearSession(db, matches[0].id); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    db.close();
    settings.sessions = settings.sessions.filter(x => x.id !== matches[0].id);
    saveState(settings);
    output({ forgotten: matches[0].id });
  } else if (command === 'storage') {
    if (!args.length) output(storageStatus());
    else if (args[0] === 'target') output(setStorageTarget(args[1]));
    else if (args[0] === 'migrate') output(migrateStorage());
    else throw new Error('Use storage, storage target <absolute folder>, or storage migrate.');
  } else if (command === 'threshold') {
    const value = Number(args[0]);
    if (!Number.isFinite(value) || value < 0.1 || value > 0.95) throw new Error('Threshold must be 0.1 to 0.95.');
    const settings = state(); settings.threshold = value; saveState(settings);
    output({ threshold: value });
  } else if (command === 'sync') {
    const db = openStore();
    output(await scanOnce(db));
    db.close();
  } else if (command === 'watch') {
    await watch();
  } else if (command === 'status') {
    const db = openStore();
    output({ configured: isConfigured(), connected: isActive(), storage: storageStatus(), ...stats(db), selected: state().sessions,
      watcher: existsSync(statusPath) ? readJson(statusPath, null) : null });
    db.close();
  } else if (command === 'search') {
    const db = openStore(); output(search(db, args.join(' '))); db.close();
  } else if (command === 'read') {
    const db = openStore(); output(readChunk(db, Number(args[0]), 5000, Number(args[1]) || 0)); db.close();
  } else if (command === 'install-hooks') {
    output({ installed: installHooks(), review: 'Open /hooks in Codex and trust the four Cheng-Shang hooks.' });
  } else if (command === 'remove-hooks') {
    output({ removed: removeHooks() });
  } else {
    console.log('承·上: list [n] | add <session-id> | reindex <session-id> | remove <session-id> | forget <session-id> | threshold <0.1..0.95> | storage [target <folder>|migrate] | sync | watch | status | search <words> | read <chunk-id> | install-hooks | remove-hooks');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
