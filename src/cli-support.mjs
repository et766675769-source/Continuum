import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { codexHome, dataDir } from './paths.mjs';

export function isConfigured() {
  try { return /^\[mcp_servers\.cheng_shang\]/m.test(readFileSync(join(codexHome, 'config.toml'), 'utf8')); }
  catch { return false; }
}

export function isActive(dir = dataDir) {
  try {
    let active = false;
    for (const name of readdirSync(dir)) {
      const pid = /^mcp-(\d+)\.json$/.exec(name)?.[1];
      if (!pid) continue;
      const marker = join(dir, name);
      try {
        if (Date.now() - statSync(marker).mtimeMs < 30000) {
          process.kill(Number(pid), 0);
          active = true;
          continue;
        }
      } catch { /* dead or stale server */ }
      try { unlinkSync(marker); } catch {}
    }
    return active;
  } catch { return false; }
}
