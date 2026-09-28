#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { forgetConversation } from './archive.mjs';
import { activeDataDir, state, saveState, readJson, statusPath } from './paths.mjs';
import { sessionFiles, findSession, preview } from './sessions.mjs';
import { openStore, search, readChunk, stats, clearSession } from './store.mjs';
import { ingest } from './ingest.mjs';
import { scanOnce, watch } from './watch.mjs';
import { isConfigured, isActive } from './cli-support.mjs';
import { installHooks, removeHooks } from './hooks-config.mjs';
import { storageStatus, setStorageTarget, migrateStorage } from './storage.mjs';
import { diagnose } from './diagnostics.mjs';
import { evaluate } from './eval.mjs';
import { candidates, pin, listPins, updatePin, retirePin } from './pins.mjs';
import { archives, exportConversation } from './privacy.mjs';

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
    const db = openStore();
    try { output(await ingest(db, file)); saveState(settings); }
    finally { db.close(); }
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
    if (!/^[0-9a-f-]{8,36}$/i.test(args[0] || '')) throw new Error('Specify an archived session ID.');
    const settings = state();
    const db = openStore();
    const matches = db.prepare('SELECT id FROM sessions WHERE id=? OR id LIKE ?').all(args[0] || '', (args[0] || '') + '%');
    if (matches.length !== 1) { db.close(); throw new Error('Specify one archived session ID.'); }
    settings.sessions = settings.sessions.filter(x => x.id !== matches[0].id);
    saveState(settings);
    try {
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM pins WHERE session_id=?').run(matches[0].id);
        clearSession(db, matches[0].id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } finally { db.close(); }
    forgetConversation(activeDataDir(), matches[0].id);
    output({ forgotten: matches[0].id });
  } else if (command === 'archives') {
    const db = openStore(); try { output(archives(db)); } finally { db.close(); }
  } else if (command === 'export') {
    const db = openStore(); try { output(exportConversation(db, args[0], args[1])); } finally { db.close(); }
  } else if (command === 'candidates') {
    const db = openStore(); try { output(candidates(db, Number(args[0]) || 30)); } finally { db.close(); }
  } else if (command === 'pins') {
    const db = openStore(); try { output(listPins(db, { status: args[0] || 'active', query: args.slice(1).join(' ') })); } finally { db.close(); }
  } else if (command === 'pin') {
    const db = openStore(); try { output(pin(db, Number(args[0]), args[1], args.slice(2).join(' '))); } finally { db.close(); }
  } else if (command === 'update-pin') {
    const db = openStore(); try { output(updatePin(db, Number(args[0]), args.slice(1).join(' '))); } finally { db.close(); }
  } else if (command === 'retire-pin') {
    const db = openStore(); try { output(retirePin(db, Number(args[0]))); } finally { db.close(); }
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
  } else if (command === 'doctor') {
    const db = openStore();
    try { output(diagnose(db)); } finally { db.close(); }
  } else if (command === 'status') {
    const db = openStore();
    output({ configured: isConfigured(), connected: isActive(), storage: storageStatus(), ...stats(db), selected: state().sessions,
      watcher: existsSync(statusPath) ? readJson(statusPath, null) : null });
    db.close();
  } else if (command === 'search') {
    const filters = {};
    const words = [];
    const flags = { '--session': 'sessionId', '--project': 'project', '--since': 'since',
      '--until': 'until', '--role': 'role', '--limit': 'limit' };
    for (let i = 0; i < args.length; i++) {
      if (flags[args[i]]) {
        if (!args[i + 1]) throw new Error(`Missing value for ${args[i]}.`);
        filters[flags[args[i]]] = args[++i];
      } else if (args[i].startsWith('--')) throw new Error(`Unknown search option: ${args[i]}`);
      else words.push(args[i]);
    }
    const db = openStore();
    try { output(search(db, words.join(' '), filters)); } finally { db.close(); }
  } else if (command === 'eval') {
    if (!args[0]) throw new Error('Provide a JSON evaluation file.');
    const db = openStore();
    try { output(evaluate(db, JSON.parse(readFileSync(args[0], 'utf8')))); } finally { db.close(); }
  } else if (command === 'read') {
    const db = openStore(); output(readChunk(db, Number(args[0]), 5000, Number(args[1]) || 0)); db.close();
  } else if (command === 'install-hooks') {
    output({ installed: installHooks(), review: 'Open /hooks in Codex and trust the four Cheng-Shang hooks.' });
  } else if (command === 'remove-hooks') {
    output({ removed: removeHooks() });
  } else {
    console.log('承·上: list [n] | add <session-id> | reindex <session-id> | remove <session-id> | forget <session-id> | threshold <0.1..0.95> | storage [target <folder>|migrate] | sync | watch | status | doctor | archives | export <session-id> <absolute-file> | candidates | pins [status] [query] | pin <chunk-id> <kind> [note] | update-pin <id> <note> | retire-pin <id> | search <words> [filters] | eval <cases.json> | read <chunk-id> | install-hooks | remove-hooks');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
