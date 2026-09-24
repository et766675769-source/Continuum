import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir } from '../src/paths.mjs';
import { openStore, search, readChunk, stats } from '../src/store.mjs';
import { ingest, latestUsage } from '../src/ingest.mjs';
import { vector, similarity } from '../src/vector.mjs';

test('incremental import, incomplete line, Chinese vector search and exact read', async () => {
  mkdirSync(dataDir, { recursive: true });
  const dir = mkdtempSync(join(dataDir, 'test-'));
  const path = join(dir, 'rollout-example.jsonl');
  const file = { id: 'example', path };
  const db = openStore(join(dir, 'test.sqlite'));
  const rows = [
    { type: 'session_meta', payload: { cwd: 'demo', timestamp: '2026-01-01' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '向量检索如何加速中文对话搜索' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '先用倒排索引过滤候选，再进行向量重排。' }] } },
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 75 }, model_context_window: 100 } } }
  ];
  try {
    writeFileSync(path, rows.map(x => JSON.stringify(x)).join('\n') + '\n{"type":"response_item"');
    const first = await ingest(db, file);
    assert.equal(first.added, 2);
    assert.equal(first.inputTokens, 75);
    assert.equal(stats(db).chunks, 2);
    const archive = join(dir, 'conversations', 'example', 'context.sqlite');
    const archiveDb = new DatabaseSync(archive);
    assert.equal(archiveDb.prepare('SELECT count(*) n FROM chunks').get().n, 2);
    archiveDb.close();
    assert.deepEqual(latestUsage(path), { inputTokens: 75, contextWindow: 100 });
    const hits = search(db, '中文向量检索');
    assert.ok(hits.length > 0);
    assert.match(readChunk(db, hits[0].id).text, /向量/);
    assert.equal((await ingest(db, file)).added, 0);
    appendFileSync(path, 'garbage\n' + JSON.stringify(rows[1]) + '\n');
    const second = await ingest(db, file);
    assert.equal(second.malformed, 1);
    assert.equal(second.added, 1);
    assert.equal(stats(db).chunks, 3);
    const updatedArchive = new DatabaseSync(archive);
    assert.equal(updatedArchive.prepare('SELECT count(*) n FROM chunks').get().n, 3);
    updatedArchive.close();
    assert.ok(similarity(vector('中文搜索'), vector('搜索中文')) > 0);
    const other = { id: 'another', path: join(dir, 'rollout-another.jsonl') };
    writeFileSync(other.path, [rows[0], rows[1]].map(x => JSON.stringify(x)).join(String.fromCharCode(10)) + String.fromCharCode(10));
    await ingest(db, other);
    const otherArchive = new DatabaseSync(join(dir, 'conversations', 'another', 'context.sqlite'));
    assert.equal(otherArchive.prepare('SELECT count(*) n FROM chunks').get().n, 1);
    otherArchive.close();
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('tool results are searchable and a rebuild removes stale evidence', async () => {
  mkdirSync(dataDir, { recursive: true });
  const dir = mkdtempSync(join(dataDir, 'tool-test-'));
  const path = join(dir, 'rollout-tool.jsonl');
  const file = { id: 'tool-session', path };
  const db = openStore(join(dir, 'test.sqlite'));
  const record = text => JSON.stringify({ type: 'response_item', payload: {
    type: 'custom_tool_call_output', output: [{ type: 'input_text', text }] } }) + '\n';
  try {
    const call = JSON.stringify({ type: 'response_item', payload: {
      type: 'custom_tool_call', name: 'search', input: { query: '蓝色按钮对比度' } } }) + '\n';
    writeFileSync(path, call + record('检索结果：蓝色按钮的对比度不足。'));
    assert.equal((await ingest(db, file)).added, 2);
    assert.ok(search(db, '蓝色按钮对比度').some(x => x.role === 'tool_result'));
    assert.ok(search(db, '蓝色按钮对比度').some(x => x.role === 'tool_call'));
    assert.equal(search(db, '蓝色按钮对比度', { conversationOnly: true }).length, 0);
    writeFileSync(path, record('检索结果：绿色按钮通过验收。'));
    assert.equal((await ingest(db, file, { reset: true })).added, 1);
    assert.equal(search(db, '对比度').length, 0);
    assert.equal(search(db, '绿色按钮验收')[0].role, 'tool_result');
    const longQuery = Array.from({ length: 30 }, (_, i) => `filler${i}`).join(' ') + ' 绿色按钮验收';
    assert.equal(search(db, longQuery)[0].role, 'tool_result');
    const longText = '甲 '.repeat(700) + '特殊段落' + '乙 '.repeat(700);
    writeFileSync(path, record(longText));
    await ingest(db, file, { reset: true });
    const hit = search(db, '特殊段落')[0];
    const nearby = readChunk(db, hit.id, 5000, 1);
    assert.ok(nearby.parts.length > 1);
    assert.equal(nearby.text, longText.trim());
    writeFileSync(path, record('特殊段落 '.repeat(500)));
    await ingest(db, file, { reset: true });
    assert.equal(search(db, '特殊段落').length, 1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
