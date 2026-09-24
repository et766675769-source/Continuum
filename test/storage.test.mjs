import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, saveChunk, search } from '../src/store.mjs';
import { setStorageTarget, migrateStorage } from '../src/storage.mjs';

test('storage migration keeps a searchable live WAL and switches only after success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cheng-storage-'));
  const source = join(dir, 'old');
  const target = join(dir, 'new');
  const config = join(dir, 'storage.json');
  try {
    mkdirSync(source);
    writeFileSync(join(source, 'state.json'), JSON.stringify({ sessions: [{ id: 'kept' }], threshold: 0.7 }));
    mkdirSync(join(source, 'conversations', 'kept'), { recursive: true });
    writeFileSync(join(source, 'conversations', 'kept', 'session.json'), '{}');
    const db = openStore(join(source, 'memory.sqlite'));
    saveChunk(db, { sessionId: 'kept', lineNo: 1, part: 0, role: 'user', text: '对话归档迁移验证' });
    setStorageTarget(target, config);
    assert.equal(existsSync(join(target, 'memory.sqlite')), false);
    assert.equal(migrateStorage(config, source).migrated, true);
    db.close();
    const copy = openStore(join(target, 'memory.sqlite'));
    assert.match(search(copy, '归档迁移')[0].excerpt, /对话归档迁移验证/);
    copy.close();
    assert.equal(JSON.parse(readFileSync(join(target, 'state.json'))).sessions[0].id, 'kept');
    assert.equal(JSON.parse(readFileSync(config)).activeDir, target);
    assert.equal(existsSync(join(source, 'memory.sqlite')), true);
    assert.equal(existsSync(join(target, 'conversations', 'kept', 'session.json')), true);
    const blocked = join(dir, 'nonempty');
    mkdirSync(blocked);
    writeFileSync(join(blocked, 'keep.txt'), 'keep');
    setStorageTarget(blocked, config);
    assert.equal(migrateStorage(config, source).migrated, true);
    assert.equal(readFileSync(join(blocked, 'keep.txt'), 'utf8'), 'keep');
    const occupied = join(dir, 'occupied');
    mkdirSync(occupied);
    writeFileSync(join(occupied, 'state.json'), '{}');
    setStorageTarget(occupied, config);
    assert.throws(() => migrateStorage(config, source), /already contains/);
    assert.equal(JSON.parse(readFileSync(config)).activeDir, blocked);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
