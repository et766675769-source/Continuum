import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

export async function snapshot(db) {
  if (db.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok')
    throw new Error('主索引损坏，拒绝覆盖健康快照');
  const main = db.prepare('PRAGMA database_list').all().find(row => row.name === 'main')?.file;
  if (!main) throw new Error('主索引路径不可用');
  const folder = join(dirname(main), 'backups');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, `memory-${Math.floor(Date.now() / 3600000) % 2}.sqlite`);
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await backup(db, temp);
    const copy = new DatabaseSync(temp, { readOnly: true });
    try {
      if (copy.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok')
        throw new Error('快照完整性检查失败');
    } finally { copy.close(); }
    renameSync(temp, target);
    return target;
  } finally {
    for (const path of [temp, `${temp}-wal`, `${temp}-shm`]) rmSync(path, { force: true });
  }
}
