import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, saveChunk, clearSession, search } from '../src/store.mjs';
import { createTask, linkTask, saveCheckpoint, resume, reviewCheckpoint, taskForContext, resumeHint, forgetTaskEvidence, recordFeedback, feedbackReport } from '../src/tasks.mjs';
import { evaluateResume } from '../src/eval.mjs';

test('task checkpoint requires indexed evidence, tracks changes and scopes search', () => {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-task-'));
  const db = openStore(join(dir, 'memory.sqlite'));
  try {
    db.prepare('INSERT INTO sessions(id,path,cwd,created,line_no) VALUES(?,?,?,?,?)')
      .run('a', 'a.jsonl', 'demo', '2026-01-01', 3);
    db.prepare('INSERT INTO sessions(id,path,cwd,created,line_no) VALUES(?,?,?,?,?)')
      .run('b', 'b.jsonl', 'demo', '2026-01-02', 2);
    saveChunk(db, { sessionId: 'a', lineNo: 2, part: 0, role: 'user', text: '决定使用 SQLite 保存上下文' });
    saveChunk(db, { sessionId: 'b', lineNo: 2, part: 0, role: 'assistant', text: 'SQLite 方案已完成' });
    const first = db.prepare("SELECT id FROM chunks WHERE session_id='a'").get().id;
    const second = db.prepare("SELECT id FROM chunks WHERE session_id='b'").get().id;
    const task = createTask(db, '上下文续接', 'a');
    assert.equal(taskForContext(db, 'a', 'demo').id, task.id);
    assert.throws(() => saveCheckpoint(db, task.id, [{ kind: 'decision', text: '采用 SQLite', sourceIds: [second] }]), /outside/);
    const card = saveCheckpoint(db, task.id, [{ kind: 'decision', text: '采用 SQLite', sourceIds: [first] }]);
    assert.equal(resume(db, task.id).status, 'source-backed');
    assert.equal(evaluateResume(db, [{ taskId: task.id, expectedText: '采用 SQLite' }]).accuracy, 1);
    assert.match(resumeHint(resume(db, task.id)), /采用 SQLite/);
    reviewCheckpoint(db, card.id);
    assert.equal(resume(db, task.id).status, 'reviewed');
    const live = join(dir, 'live.jsonl');
    writeFileSync(live, 'old');
    db.prepare('UPDATE sessions SET path=?,offset=? WHERE id=?').run(live, 3, 'a');
    assert.equal(resume(db, task.id).status, 'reviewed');
    appendFileSync(live, 'new');
    assert.equal(resume(db, task.id).status, 'stale');
    assert.equal(search(db, 'SQLite', { taskId: task.id }).length, 1);
    linkTask(db, task.id, 'b');
    assert.equal(search(db, 'SQLite', { taskId: task.id }).length, 2);
    assert.equal(resume(db, task.id).status, 'stale');
    clearSession(db, 'a');
    assert.equal(resume(db, task.id).status, 'stale');
    recordFeedback(db, task.id, true);
    assert.equal(feedbackReport(db).helpfulRate, 1);
    forgetTaskEvidence(db, 'a');
    assert.equal(feedbackReport(db).attempts, 0);
    assert.equal(resume(db, task.id).status, 'no-checkpoint');
    assert.deepEqual(resume(db, task.id).task.sessions, ['b']);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});