import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { root, dataDir } from '../src/paths.mjs';
import { isActive } from '../src/cli-support.mjs';

test('MCP handshake exposes a live connection and clears it on exit', async () => {
  const child = spawn(process.execPath, [join(root, 'src', 'mcp.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const marker = join(dataDir, `mcp-${child.pid}.json`);
  try {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) + '\n');
    const [chunk] = await once(child.stdout, 'data');
    assert.equal(JSON.parse(chunk.toString()).result.serverInfo.name, 'cheng-shang');
    assert.equal(existsSync(marker), true);
    assert.equal(isActive(), true);
  } finally {
    const exited = once(child, 'exit');
    child.stdin.end();
    await exited;
    assert.equal(existsSync(marker), false);
  }
});

test('connection status expires stale markers', () => {
  mkdirSync(dataDir, { recursive: true });
  const dir = mkdtempSync(join(dataDir, 'marker-test-'));
  const marker = join(dir, `mcp-${process.pid}.json`);
  try {
    writeFileSync(marker, '{}');
    assert.equal(isActive(dir), true);
    utimesSync(marker, new Date(0), new Date(0));
    assert.equal(isActive(dir), false);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
