import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../src/paths.mjs';
import { openStore, stats, saveChunk } from '../src/store.mjs';
import { runHook } from '../src/hook.mjs';
import { createTask, saveCheckpoint } from '../src/tasks.mjs';

test('compaction saves the tail and prompt recall stays short', async () => {
  mkdirSync(dataDir, { recursive: true });
  const dir = mkdtempSync(join(dataDir, 'hook-test-'));
  const file = join(dir, 'rollout-test.jsonl');
  const dbPath = join(dir, 'test.sqlite');
  const selected = { sessions: [{ id: 'test-session', path: file }] };
  const makeStore = () => openStore(dbPath);
  const entry = { type: 'response_item', payload: { type: 'message', role: 'assistant',
    content: [{ type: 'output_text', text: '蓝色按钮方案被否决，因为对比度不满足无障碍要求。' }] } };
  try {
    writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { cwd: 'demo' } }) + '\n' + JSON.stringify(entry) + '\n');
    assert.equal(await runHook({ hook_event_name: 'PreCompact', session_id: 'test-session' }, selected, makeStore), null);
    const db = makeStore();
    assert.equal(stats(db).chunks, 1);
    db.close();
    const hint = await runHook({ hook_event_name: 'UserPromptSubmit', session_id: 'test-session',
      cwd: 'demo', prompt: '为什么蓝色按钮方案被否决？' }, selected, makeStore);
    assert.match(hint.hookSpecificOutput.additionalContext, /memory_read/);
    assert.ok(hint.hookSpecificOutput.additionalContext.length < 300);
    assert.doesNotMatch(hint.hookSpecificOutput.additionalContext, /对比度/);
    const longPrompt = Array.from({ length: 100 }, (_, i) => `filler${i}`).join(' ') + ' 为什么蓝色按钮方案被否决？';
    const longHint = await runHook({ hook_event_name: 'UserPromptSubmit', session_id: 'test-session',
      cwd: 'demo', prompt: longPrompt }, selected, makeStore);
    assert.match(longHint.hookSpecificOutput.additionalContext, /memory_read/);
    const compact = await runHook({ hook_event_name: 'SessionStart', source: 'compact',
      session_id: 'test-session' }, selected, makeStore);
    assert.match(compact.hookSpecificOutput.additionalContext, /memory_search/);
    const checkpointDb = makeStore();
    const task = createTask(checkpointDb, '按钮决策', 'test-session');
    const sourceId = checkpointDb.prepare('SELECT id FROM chunks LIMIT 1').get().id;
    saveCheckpoint(checkpointDb, task.id, [{ kind: 'decision', text: '不采用蓝色按钮', sourceIds: [sourceId] }]);
    checkpointDb.close();
    const startup = await runHook({ hook_event_name: 'SessionStart', source: 'startup',
      session_id: 'new-session', cwd: 'demo' }, selected, makeStore);
    assert.match(startup.hookSpecificOutput.additionalContext, /不采用蓝色按钮/);
    assert.match(startup.hookSpecificOutput.additionalContext, /#\d+/);
    const otherDb = makeStore();
    otherDb.prepare('INSERT INTO sessions(id,path,cwd,line_no) VALUES(?,?,?,?)').run('other-task', 'other.jsonl', 'demo', 1);
    saveChunk(otherDb, { sessionId: 'other-task', lineNo: 1, part: 0, role: 'user', text: '蓝色按钮项目另有要求' });
    createTask(otherDb, '另一个任务', 'other-task');
    otherDb.close();
    assert.equal(await runHook({ hook_event_name: 'SessionStart', source: 'startup',
      session_id: 'new-session', cwd: 'demo' }, selected, makeStore), null);
    assert.equal(await runHook({ hook_event_name: 'UserPromptSubmit', session_id: 'new-session',
      cwd: 'demo', prompt: '蓝色按钮有什么要求？' }, selected, makeStore), null);
    assert.equal(await runHook({ hook_event_name: 'UserPromptSubmit', session_id: 'test-session',
      cwd: 'demo', prompt: '继续' }, selected, makeStore), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
