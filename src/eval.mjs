import { performance } from 'node:perf_hooks';
import { search, readChunk } from './store.mjs';
import { resume } from './tasks.mjs';

export function evaluate(db, cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Evaluation file must contain a nonempty array.');
  const rows = cases.map((item, index) => {
    if (typeof item.query !== 'string' || typeof item.expectedText !== 'string' || !item.expectedText)
      throw new Error(`Case ${index + 1} needs query and expectedText.`);
    const start = performance.now();
    const hits = search(db, item.query, { sessionId: item.sessionId, project: item.project,
      since: item.since, until: item.until, role: item.role, limit: 5 });
    const ms = performance.now() - start;
    const found = hits.some(hit => readChunk(db, hit.id)?.text.includes(item.expectedText));
    return { case: index + 1, found, ms: Math.round(ms * 10) / 10 };
  });
  const sorted = rows.map(x => x.ms).sort((a, b) => a - b);
  return { cases: rows.length, recallAt5: rows.filter(x => x.found).length / rows.length,
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], misses: rows.filter(x => !x.found).map(x => x.case) };
}
export function evaluateResume(db, cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Evaluation file must contain a nonempty array.');
  const rows = cases.map((item, index) => {
    if (!Number.isSafeInteger(item.taskId) || typeof item.expectedText !== 'string' || !item.expectedText)
      throw new Error(`Case ${index + 1} needs taskId and expectedText.`);
    const started = performance.now();
    const value = resume(db, item.taskId);
    const ms = performance.now() - started;
    const text = (value.checkpoint?.items || value.recent).map(x => x.text || x.excerpt).join("\\n");
    return { case: index + 1, found: text.includes(item.expectedText),
      status: value.status, chars: text.length, ms: Math.round(ms * 10) / 10 };
  });
  const sorted = rows.map(x => x.ms).sort((a, b) => a - b);
  return { cases: rows.length, accuracy: rows.filter(x => x.found).length / rows.length,
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
    averageChars: Math.round(rows.reduce((sum, x) => sum + x.chars, 0) / rows.length),
    misses: rows.filter(x => !x.found).map(x => x.case), rows };
}
