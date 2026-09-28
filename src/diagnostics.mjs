import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { activeDataDir, readJson, state, statusPath } from './paths.mjs';
import { isActive, isConfigured } from './cli-support.mjs';
import { hooksInstalled } from './hooks-config.mjs';
import { conversationDir } from './archive.mjs';
import { findSession } from './sessions.mjs';
import { readChunk, search } from './store.mjs';
import { terms } from './vector.mjs';

export function archiveHealth(db, selected, dir = activeDataDir()) {
  const issues = [];
  let pendingBytes = 0;
  let indexed = 0;
  // ponytail: one search/read per selected conversation every 10s; cache only if many sessions make monitoring slow.
  for (const selectedFile of selected) {
    const file = existsSync(selectedFile.path) ? selectedFile : findSession(selectedFile.id);
    if (!file) { issues.push(`对话原文件未找到：${selectedFile.id}`); continue; }
    try {
      const session = db.prepare('SELECT offset FROM sessions WHERE id=?').get(file.id);
      if (!session) { issues.push(`对话尚未归档：${file.id}`); continue; }
      pendingBytes += Math.max(0, statSync(file.path).size - session.offset);
      const sample = db.prepare('SELECT id,text FROM chunks WHERE session_id=? LIMIT 1').get(file.id);
      const path = join(conversationDir(dir, file.id), 'context.sqlite');
      if (!sample || !existsSync(path)) { issues.push(`对话归档不可读：${file.id}`); continue; }
      const local = new DatabaseSync(path, { readOnly: true });
      try {
        if (!local.prepare('SELECT id FROM chunks LIMIT 1').get()) {
          issues.push(`对话独立归档为空：${file.id}`);
          continue;
        }
      } finally { local.close(); }
      indexed++;
      const term = terms(sample.text).find(word => word.length >= 2);
      if (!term || !search(db, term, { sessionId: file.id, limit: 1 }).length ||
        !readChunk(db, sample.id)?.text) issues.push(`对话检索或读取失败：${file.id}`);
    } catch (error) { issues.push(`对话检查失败：${file.id}：${error.message}`); }
  }
  return { readable: selected.length > 0 && issues.length === 0, indexed, pendingBytes, issues };
}

export function diagnose(db) {
  const selected = state().sessions;
  const archive = archiveHealth(db, selected);
  let report;
  try { report = readJson(statusPath, null); } catch { report = null; }
  const watching = !!report?.at && Date.now() - Date.parse(report.at) < 30000 &&
    !report.error && !(report.errors?.length);
  const checks = [
    { name: 'Codex MCP 配置', ok: isConfigured(), action: '点击“接入 Codex”' },
    { name: '生命周期钩子', ok: hooksInstalled(), action: '点击“接入 Codex”，再在 Codex 输入 /hooks 审阅' },
    { name: '已选对话', ok: selected.length > 0, action: '点击“指定对话”' },
    { name: '对话归档与检索', ok: archive.readable, action: archive.issues.join('；') || '选择对话后重新检查' },
    { name: '后台监控', ok: watching, action: '运行 desktop/Start.ps1 重启监控' }
  ];
  return { ready: checks.every(x => x.ok), connected: isActive(), checks,
    selected: selected.length, indexed: archive.indexed, pendingBytes: archive.pendingBytes,
    storage: activeDataDir(), hookTrust: '钩子信任需在 Codex 的 /hooks 中人工确认，程序无法代为验证。' };
}