import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codexHome, root, writeJson } from './paths.mjs';

const path = join(codexHome, 'hooks.json');
const script = join(root, 'src', 'hook.mjs');
const command = `"${process.execPath}" "${script}"`;
const names = ['PreCompact', 'SessionEnd', 'SessionStart', 'UserPromptSubmit'];

export function installHooks() {
  const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { hooks: {} };
  config.hooks ||= {};
  for (const name of names) {
    config.hooks[name] ||= [];
    if (config.hooks[name].some(group => group.hooks?.some(hook => hook.command?.includes(script)))) continue;
    const handler = { type: 'command', command, timeout: name === 'SessionEnd' ? 3 : 10 };
    if (name === 'UserPromptSubmit' || name === 'SessionStart') handler.additionalContextLimit = 500;
    const group = { hooks: [handler] };
    if (name === 'SessionStart') group.matcher = '^compact$';
    config.hooks[name].push(group);
  }
  writeJson(path, config);
  return path;
}

export function removeHooks() {
  if (!existsSync(path)) return path;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  for (const name of names) {
    if (!config.hooks?.[name]) continue;
    config.hooks[name] = config.hooks[name].map(group => ({ ...group,
      hooks: group.hooks.filter(hook => !hook.command?.includes(script)) }))
      .filter(group => group.hooks.length);
    if (!config.hooks[name].length) delete config.hooks[name];
  }
  writeJson(path, config);
  return path;
}
