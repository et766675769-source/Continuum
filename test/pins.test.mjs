import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../src/paths.mjs';
import { openStore, saveChunk, clearSession } from '../src/store.mjs';
import { candidates, pin, listPins, updatePin, retirePin } from '../src/pins.mjs';

test('reviewed memory retains provenance and becomes stale on reindex', () => {
  mkdirSync(dataDir, { recursive: true });
  const dir = mkdtempSync(join(dataDir, 'pins-test-'));
  const db = openStore(join(dir, 'memory.sqlite'));
  try {
    db.prepare('INSERT INTO sessions(id,path,cwd,created) VALUES(?,?,?,?)')
      .run('example', 'source.jsonl', 'demo', '2026-01-01');
    saveChunk(db, { sessionId: 'example', lineNo: 7, part: 0,
      role: 'user', text: '决定使用本地索引，不上传原始对话。' });
    const source = candidates(db)[0];
    assert.equal(source.kind, 'decision');
    const saved = pin(db, source.id, 'constraint', '所有归档保持本地');
    assert.equal(saved.session_id, 'example');
    assert.equal(saved.line_no, 7);
    assert.equal(listPins(db, { query: '归档' })[0].id, saved.id);
    updatePin(db, saved.id, '归档数据保留在本地');
    clearSession(db, 'example');
    assert.equal(listPins(db).length, 0);
    assert.equal(listPins(db, { status: 'stale' })[0].note, '归档数据保留在本地');
    retirePin(db, saved.id);
    assert.equal(listPins(db, { status: 'retired' }).length, 1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});