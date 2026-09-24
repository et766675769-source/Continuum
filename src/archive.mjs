import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { writeJson } from './paths.mjs';

export function conversationDir(dataRoot, id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Invalid session ID.');
  return join(dataRoot, 'conversations', id);
}

export function syncConversation(db, file, meta, reset = false) {
  const main = db.prepare('PRAGMA database_list').all().find(row => row.name === 'main')?.file;
  if (!main) throw new Error('The main archive has no file path.');
  const folder = conversationDir(dirname(main), file.id);
  mkdirSync(folder, { recursive: true });
  const copy = new DatabaseSync(join(folder, 'context.sqlite'));
  try {
    copy.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY, line_no INTEGER, part INTEGER, role TEXT, text TEXT)');
    if (reset) copy.exec('DELETE FROM chunks');
    const lastId = copy.prepare('SELECT coalesce(max(id),0) id FROM chunks').get().id;
    const rows = db.prepare('SELECT id,line_no,part,role,text FROM chunks WHERE session_id=? AND id>? ORDER BY id').iterate(file.id, lastId);
    const insert = copy.prepare('INSERT OR IGNORE INTO chunks(id,line_no,part,role,text) VALUES(?,?,?,?,?)');
    copy.exec('BEGIN');
    try {
      for (const row of rows) insert.run(row.id, row.line_no, row.part, row.role, row.text);
      copy.exec('COMMIT');
    } catch (error) { copy.exec('ROLLBACK'); throw error; }
    writeJson(join(folder, 'session.json'), { id: file.id, source: file.path, cwd: meta.cwd, created: meta.created });
  } finally { copy.close(); }
}

export function forgetConversation(dataRoot, id) {
  rmSync(conversationDir(dataRoot, id), { recursive: true, force: true });
}