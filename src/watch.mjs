import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, state, statusPath, writeJson } from './paths.mjs';
import { findSession } from './sessions.mjs';
import { openStore, stats } from './store.mjs';
import { ingest, latestUsage } from './ingest.mjs';
import { isConfigured, isActive } from './cli-support.mjs';
import { archiveHealth } from './diagnostics.mjs';
import { listTasks, resume, ensureTask } from './tasks.mjs';

const pidPath = join(dataDir, 'watch.pid');

function claim() {
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, 'utf8'));
    try { process.kill(pid, 0); return false; } catch { /* stale process */ }
  }
  writeFileSync(pidPath, String(process.pid));
  process.on('exit', () => { try { if (readFileSync(pidPath, 'utf8') === String(process.pid)) unlinkSync(pidPath); } catch {} });
  return true;
}

export async function scanOnce(db = openStore()) {
  const settings = state();
  const sessionStatus = [];
  const errors = [];
  for (const selected of settings.sessions) {
    const file = existsSync(selected.path) ? selected : findSession(selected.id);
    if (db.prepare('SELECT 1 FROM sessions WHERE id=?').get(selected.id)) ensureTask(db, selected.id);
    if (!file) { errors.push(`${selected.id}: source missing`); continue; }
    try {
      const usage = latestUsage(file.path);
      const ratio = usage.contextWindow ? usage.inputTokens / usage.contextWindow : 0;
      const indexed = db.prepare('SELECT offset FROM sessions WHERE id=?').get(file.id)?.offset || 0;
      if (ratio >= settings.threshold && statSync(file.path).size > indexed) await ingest(db, file);
      sessionStatus.push({ id: file.id, inputTokens: usage.inputTokens,
        contextWindow: usage.contextWindow, ratio: Math.round(ratio * 100),
        indexedBytes: db.prepare('SELECT offset FROM sessions WHERE id=?').get(file.id)?.offset || 0 });
    } catch (error) { errors.push(`${selected.id}: ${error.message}`); }
  }
  const health = archiveHealth(db, settings.sessions);
  const report = { at: new Date().toISOString(), configured: isConfigured(), connected: isActive(),
    readable: health.readable, indexed: health.indexed, pendingBytes: health.pendingBytes,
    threshold: settings.threshold, ...stats(db), selected: sessionStatus,
    tasks: listTasks(db).map(x => ({ id: x.id, title: x.title, status: resume(db, x.id).status })),
    errors: [...errors, ...health.issues] };
  writeJson(statusPath, report);
  return report;
}

export async function watch() {
  if (!claim()) return;
  const db = openStore();
  let scanning = false;
  const tick = async () => {
    if (scanning) return;
    scanning = true;
    try { await scanOnce(db); }
    catch (error) {
      try { writeJson(statusPath, { at: new Date().toISOString(), configured: isConfigured(), connected: isActive(), error: error.message }); }
      catch { /* A locked status file must not stop the watcher. */ }
    }
    finally { scanning = false; }
  };
  await tick();
  setInterval(tick, 10000);
}
