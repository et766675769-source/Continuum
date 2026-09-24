import { statSync, openSync, readSync, closeSync } from 'node:fs';
import { linesFrom, contentFromItem, preview } from './sessions.mjs';
import { clearSession, saveChunk } from './store.mjs';

const CHUNK = 1400;
const OVERLAP = 150;

export function* splitText(text) {
  for (let start = 0, part = 0; start < text.length; start += CHUNK - OVERLAP, part++) {
    yield { part, text: text.slice(start, start + CHUNK) };
    if (start + CHUNK >= text.length) break;
  }
}

export async function ingest(db, file, { reset: forceReset = false } = {}) {
  const meta = preview(file.path);
  const previous = db.prepare('SELECT offset,line_no FROM sessions WHERE id=?').get(file.id);
  const size = statSync(file.path).size;
  const reset = forceReset || !!previous && size < previous.offset;
  let offset = reset ? 0 : previous?.offset || 0;
  let lineNo = reset ? 0 : previous?.line_no || 0;
  let inputTokens = null, contextWindow = null, added = 0, malformed = 0;
  db.exec('BEGIN');
  try {
    if (reset) clearSession(db, file.id);
    for await (const line of linesFrom(file.path, offset)) {
      offset = line.offset;
      lineNo++;
      let record;
      try { record = JSON.parse(line.text); } catch { malformed++; continue; }
      if (record.type === 'response_item') {
        const item = record.payload;
        const content = contentFromItem(item);
        if (content) for (const part of splitText(content.text)) {
          saveChunk(db, { sessionId: file.id, lineNo, role: content.role, ...part });
          added++;
        }
      } else if (record.type === 'event_msg' && record.payload?.type === 'token_count') {
        const info = record.payload.info || {};
        inputTokens = info.last_token_usage?.input_tokens ?? inputTokens;
        contextWindow = info.model_context_window ?? contextWindow;
      }
    }
    db.prepare(`INSERT INTO sessions(id,path,cwd,created,offset,line_no,input_tokens,context_window,updated)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET path=excluded.path,cwd=excluded.cwd,
      offset=excluded.offset,line_no=excluded.line_no,
      input_tokens=coalesce(excluded.input_tokens,sessions.input_tokens),
      context_window=coalesce(excluded.context_window,sessions.context_window),updated=excluded.updated`)
      .run(file.id, file.path, meta.cwd, meta.created, offset, lineNo, inputTokens, contextWindow);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { id: file.id, added, malformed, offset, lineNo, inputTokens, contextWindow };
}

export function latestUsage(path) {
  const size = statSync(path).size;
  const length = Math.min(size, 2 * 1024 * 1024);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try { readSync(fd, buffer, 0, length, size - length); }
  finally { closeSync(fd); }
  const lines = buffer.toString('utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"token_count"')) continue;
    try {
      const row = JSON.parse(lines[i]);
      if (row.type !== 'event_msg' || row.payload?.type !== 'token_count') continue;
      const info = row.payload.info || {};
      return { inputTokens: info.last_token_usage?.input_tokens || 0,
        contextWindow: info.model_context_window || 0 };
    } catch { /* An incomplete live line is expected. */ }
  }
  return { inputTokens: 0, contextWindow: 0 };
}
