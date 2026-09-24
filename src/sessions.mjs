import { createReadStream, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, basename } from 'node:path';
import { codexHome } from './paths.mjs';

const idPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sessionFiles(home = codexHome) {
  const found = [];
  for (const folder of ['sessions', 'archived_sessions']) {
    const stack = [join(home, folder)];
    while (stack.length) {
      let entries;
      try { entries = readdirSync(stack.pop(), { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const path = join(entry.parentPath, entry.name);
        if (entry.isDirectory()) stack.push(path);
        else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) {
          const id = entry.name.match(idPattern)?.[0];
          if (id) found.push({ id, path, mtime: statSync(path).mtimeMs });
        }
      }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

export function findSession(query, home = codexHome) {
  const files = sessionFiles(home);
  return files.find(x => x.id === query || x.id.startsWith(query) || x.path === query);
}

export function preview(path) {
  const fd = openSync(path, 'r');
  try {
    const blocks = [];
    let position = 0, end = -1;
    while (position < 2 * 1024 * 1024 && end < 0) {
      const buffer = Buffer.alloc(16384);
      const n = readSync(fd, buffer, 0, buffer.length, position);
      if (!n) break;
      end = buffer.subarray(0, n).indexOf(10);
      blocks.push(buffer.subarray(0, end < 0 ? n : end));
      position += n;
    }
    const line = Buffer.concat(blocks).toString('utf8');
    const payload = JSON.parse(line).payload || {};
    return { cwd: payload.cwd || '', created: payload.timestamp || '' };
  } catch { return { cwd: '', created: '' }; }
  finally { closeSync(fd); }
}

export async function* linesFrom(path, offset = 0) {
  let carry = Buffer.alloc(0);
  let position = offset;
  for await (const block of createReadStream(path, { start: offset, highWaterMark: 65536 })) {
    const data = carry.length ? Buffer.concat([carry, block]) : block;
    let begin = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === 10) {
      const bytes = data.subarray(begin, i);
      position += i - begin + 1;
      yield { text: bytes.toString('utf8').replace(/\r$/, ''), offset: position };
      begin = i + 1;
    }
    carry = data.subarray(begin);
  }
  // A live rollout may end with half a JSON record. Leave it for the next pass.
}

export function contentFromItem(item) {
  if (item?.type === 'message' && ['user', 'assistant'].includes(item.role)) {
    const text = (item.content || []).filter(x => x.type === 'input_text' || x.type === 'output_text')
      .map(x => x.text || '').join('\n').trim();
    return text ? { role: item.role, text } : null;
  }
  if (['function_call', 'custom_tool_call'].includes(item?.type)) {
    const input = typeof item.arguments === 'string' ? item.arguments :
      typeof item.input === 'string' ? item.input : item.input ? JSON.stringify(item.input) : '';
    const text = `${item.name || 'tool'} ${input.slice(0, 8000).replace(/[A-Za-z0-9+/=]{256,}/g, '[binary omitted]')}`.trim();
    return text ? { role: 'tool_call', text } : null;
  }
  if (['function_call_output', 'custom_tool_call_output'].includes(item?.type)) {
    const output = Array.isArray(item.output) ? item.output
      .filter(x => x.type === 'input_text' || x.type === 'output_text' || x.type === 'text')
      .map(x => x.text || '').join('\n') : typeof item.output === 'string' ? item.output : '';
    const readable = output.replace(/[A-Za-z0-9+/=]{256,}/g, '[binary omitted]').trim();
    // ponytail: 32 KiB per tool result; raise this only if large results are routinely needed.
    const text = readable.length > 32768 ? readable.slice(0, 32768) + '\n[tool result truncated]' : readable;
    return text ? { role: 'tool_result', text } : null;
  }
  return null;
}

export function sessionLabel(path) { return basename(path).replace(/^rollout-/, '').replace(/\.jsonl$/, ''); }
