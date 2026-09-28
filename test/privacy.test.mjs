import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, saveChunk } from '../src/store.mjs';
import { archives, exportConversation } from '../src/privacy.mjs';

test('privacy export keeps source, preserves provenance and never overwrites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-privacy-'));
  const db = openStore(join(dir, 'memory.sqlite'));
  try {
    db.prepare('INSERT INTO sessions(id,path,cwd,created) VALUES(?,?,?,?)')
      .run('example', 'source.jsonl', 'demo', '2026-01-01');
    saveChunk(db, { sessionId: 'example', lineNo: 4, part: 0, role: 'user', text: '需要保留归档来源。' });
    const destination = join(dir, 'export.jsonl');
    assert.equal(exportConversation(db, 'example', destination).chunks, 1);
    const lines = readFileSync(destination, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines[0].id, 'example');
    assert.equal(lines[1].line_no, 4);
    assert.equal(archives(db)[0].chunks, 1);
    assert.throws(() => exportConversation(db, 'example', destination), /EEXIST/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});