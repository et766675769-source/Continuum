const KINDS = new Set(['decision', 'constraint', 'todo']);
const cues = [
  ['decision', /决定|已确定|最终采用|选用|改为|不再/],
  ['constraint', /必须|不能|不得|约束|要求|限制/],
  ['todo', /下一步|待办|TODO|还需要|尚未完成/i]
];

export function candidates(db, limit = 30) {
  const rows = db.prepare(`SELECT c.id,c.session_id,c.line_no,c.role,c.text,s.cwd
    FROM chunks c JOIN sessions s ON s.id=c.session_id
    WHERE c.role IN ('user','assistant') AND c.part=0
    ORDER BY c.id DESC LIMIT 1000`).all();
  return rows.flatMap(row => {
    if (row.text.length > 800 || /我会|我已|接下来做/.test(row.text)) return [];
    const kind = cues.find(([, pattern]) => pattern.test(row.text))?.[0];
    return kind ? [{ id: row.id, sessionId: row.session_id, line: row.line_no,
      project: row.cwd, kind, excerpt: row.text.slice(0, 300) }] : [];
  }).slice(0, Math.max(1, Math.min(Number(limit) || 30, 100)));
}

export function pin(db, chunkId, kind, note) {
  if (!KINDS.has(kind)) throw new Error('Kind must be decision, constraint, or todo.');
  const source = db.prepare('SELECT id,session_id,line_no,text FROM chunks WHERE id=?').get(chunkId);
  if (!source) throw new Error('Source excerpt not found.');
  const value = (note || source.text.slice(0, 300)).trim();
  if (!value || value.length > 1000) throw new Error('Note must contain 1 to 1000 characters.');
  const result = db.prepare(`INSERT INTO pins(session_id,chunk_id,line_no,kind,note,quote)
    VALUES(?,?,?,?,?,?)`).run(source.session_id, source.id, source.line_no, kind, value, source.text.slice(0, 500));
  return db.prepare('SELECT * FROM pins WHERE id=?').get(result.lastInsertRowid);
}

export function listPins(db, { status = 'active', query } = {}) {
  if (!['active', 'stale', 'retired', 'all'].includes(status)) throw new Error('Invalid pin status.');
  const rows = db.prepare(`SELECT p.*,s.cwd AS project FROM pins p LEFT JOIN sessions s ON s.id=p.session_id
    WHERE (?='all' OR p.status=?) ORDER BY p.updated DESC,p.id DESC LIMIT 500`).all(status, status);
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => words.every(word => (row.note + ' ' + row.quote).toLowerCase().includes(word)));
}

export function updatePin(db, id, note) {
  const value = String(note || '').trim();
  if (!value || value.length > 1000) throw new Error('Note must contain 1 to 1000 characters.');
  const result = db.prepare("UPDATE pins SET note=?,updated=datetime('now') WHERE id=?")
    .run(value, id);
  if (!result.changes) throw new Error('Pinned memory not found.');
  return db.prepare('SELECT * FROM pins WHERE id=?').get(id);
}

export function retirePin(db, id) {
  const result = db.prepare("UPDATE pins SET status='retired',updated=datetime('now') WHERE id=?").run(id);
  if (!result.changes) throw new Error('Pinned memory not found.');
  return { retired: id };
}