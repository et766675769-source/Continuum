import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPath } from './paths.mjs';
import { terms, vector, similarity } from './vector.mjs';

export function openStore(path = dbPath) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, cwd TEXT, created TEXT,
      offset INTEGER NOT NULL DEFAULT 0, line_no INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER, context_window INTEGER, updated TEXT
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, line_no INTEGER NOT NULL,
      part INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
      vec TEXT NOT NULL, UNIQUE(session_id, line_no, part)
    );
    CREATE INDEX IF NOT EXISTS chunks_session ON chunks(session_id, line_no);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(grams);
  `);
  return db;
}

export function saveChunk(db, chunk) {
  const result = db.prepare(`INSERT OR IGNORE INTO chunks(session_id,line_no,part,role,text,vec)
    VALUES(?,?,?,?,?,?)`).run(chunk.sessionId, chunk.lineNo, chunk.part, chunk.role,
    chunk.text, JSON.stringify(vector(chunk.text)));
  if (result.changes) db.prepare('INSERT INTO chunk_fts(rowid,grams) VALUES(?,?)')
    .run(result.lastInsertRowid, terms(chunk.text).join(' '));
}

export function clearSession(db, id) {
  db.prepare('DELETE FROM chunk_fts WHERE rowid IN (SELECT id FROM chunks WHERE session_id=?)').run(id);
  db.prepare('DELETE FROM chunks WHERE session_id=?').run(id);
  db.prepare('DELETE FROM sessions WHERE id=?').run(id);
}

export function search(db, query, { sessionId, limit = 6, conversationOnly = false } = {}) {
  const allWords = [...new Set(terms(query))];
  const words = allWords.length <= 16 ? allWords :
    Array.from({ length: 16 }, (_, i) => allWords[Math.floor(i * (allWords.length - 1) / 15)]);
  if (!words.length) return [];
  const match = words.map(x => `"${x.replaceAll('"', '""')}"`).join(' OR ');
  const rows = db.prepare(`SELECT c.id,c.session_id,c.line_no,c.part,c.role,c.text,c.vec,
    bm25(chunk_fts) AS rank FROM chunk_fts JOIN chunks c ON c.id=chunk_fts.rowid
    WHERE chunk_fts MATCH ? AND (? IS NULL OR c.session_id=?)
      AND (? = 0 OR c.role IN ('user','assistant'))
    ORDER BY rank LIMIT 120`).all(match, sessionId || null, sessionId || null, conversationOnly ? 1 : 0);
  const qvec = vector(query);
  const ranked = rows.map(row => ({
    id: row.id, sessionId: row.session_id, line: row.line_no, part: row.part,
    role: row.role, score: similarity(qvec, JSON.parse(row.vec)) + Math.min(0.25, -row.rank / 50),
    excerpt: row.text.slice(0, 600)
  })).sort((a, b) => b.score - a.score);
  const seen = new Set();
  return ranked.filter(row => {
    const key = `${row.sessionId}:${row.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(1, Math.min(limit, 20)));
}

export function readChunk(db, id, maxChars = 5000, neighbors = 0) {
  const row = db.prepare('SELECT id,session_id,line_no,part,role,text FROM chunks WHERE id=?').get(id);
  if (!row) return null;
  const span = Math.max(0, Math.min(Number(neighbors) || 0, 2));
  const parts = span ? db.prepare(`SELECT part,text FROM chunks WHERE session_id=? AND line_no=?
    AND part BETWEEN ? AND ? ORDER BY part`).all(row.session_id, row.line_no,
    row.part - span, row.part + span) : [{ part: row.part, text: row.text }];
  let text = '';
  for (let i = 0; i < parts.length; i++) {
    const previous = parts[i - 1];
    const overlap = previous?.part + 1 === parts[i].part && previous.text.length === 1400 &&
      parts[i].text.startsWith(previous.text.slice(-150));
    text += (i && !overlap ? '\n' : '') + parts[i].text.slice(overlap ? 150 : 0);
  }
  return { id: row.id, sessionId: row.session_id, line: row.line_no,
    part: row.part, role: row.role, parts: parts.map(x => x.part),
    text: text.slice(0, maxChars) };
}

export function stats(db) {
  const totals = db.prepare('SELECT count(*) chunks, coalesce(sum(length(text)),0) chars FROM chunks').get();
  const sessions = db.prepare('SELECT count(*) n FROM sessions').get().n;
  return { sessions, chunks: totals.chunks, chars: totals.chars };
}
