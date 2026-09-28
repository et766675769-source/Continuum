import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { root } from './paths.mjs';

export function archives(db) {
  return db.prepare(`SELECT s.id,s.cwd,s.created,s.path,count(c.id) AS chunks
    FROM sessions s LEFT JOIN chunks c ON c.session_id=s.id
    GROUP BY s.id ORDER BY s.created DESC`).all();
}

export function exportConversation(db, id, destination) {
  const session = db.prepare('SELECT id,cwd,created FROM sessions WHERE id=?').get(id);
  if (!session) throw new Error('Archived conversation not found.');
  if (!isAbsolute(destination)) throw new Error('Choose an absolute export file path.');
  const path = resolve(destination);
  const inside = relative(root, path);
  if (!inside.startsWith('..') && !isAbsolute(inside))
    throw new Error('Export outside the project to avoid publishing conversation data.');
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx');
  let count = 0;
  try {
    writeSync(fd, JSON.stringify({ type: 'session', ...session }) + '\n');
    for (const row of db.prepare(`SELECT line_no,part,role,text FROM chunks
      WHERE session_id=? ORDER BY line_no,part`).iterate(id)) {
      writeSync(fd, JSON.stringify({ type: 'excerpt', ...row }) + '\n');
      count++;
    }
  } catch (error) {
    closeSync(fd);
    try { unlinkSync(path); } catch {}
    throw error;
  }
  closeSync(fd);
  return { exported: id, path, chunks: count, sourceUnchanged: true };
}