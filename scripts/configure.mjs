#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FILES = ['settings.json', 'zentui.json', 'pi-cc-extensions.json'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const encode = value => `${JSON.stringify(value, null, 2)}\n`;

function readObject(path) {
  if (!existsSync(path)) return {};
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!object(value)) throw new Error(`${basename(path)} must contain a JSON object`);
  return value;
}

function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = object(value) ? merge(object(base[key]) ? base[key] : {}, value) : value;
  }
  return result;
}

export function preset(settings, zen, cc) {
  if (settings.packages !== undefined && !Array.isArray(settings.packages)) {
    throw new Error('settings.json packages must be an array');
  }
  const updatedSettings = { ...settings };
  if (settings.packages) {
    updatedSettings.packages = settings.packages.map(entry => {
      const source = typeof entry === 'string' ? entry : entry?.source;
      if (typeof source !== 'string' || !/^npm:pi-cc-extensions(?:@.*)?$/.test(source)) return entry;
      return { ...(typeof entry === 'string' ? { source } : entry), extensions: [] };
    });
  }
  return {
    'settings.json': updatedSettings,
    'zentui.json': merge(zen, { components: {
      editor: { enabled: true, style: 'opencode' },
      userMessages: { enabled: true, style: 'framed' },
      selectorBorders: { enabled: true },
      footer: { style: 'starship' },
      toolDisplay: { enabled: false },
      thinkingSteps: { enabled: false },
      workingLine: { enabled: true },
    } }),
    'pi-cc-extensions.json': { ...cc, mode: 'on', stickyUserMessage: false },
  };
}

function backup(agentDir) {
  const parent = join(agentDir, 'backups');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(parent, 'carbon-'));
  const files = {};
  for (const name of FILES) {
    files[name] = existsSync(join(agentDir, name));
    if (files[name]) writeFileSync(join(directory, name), readFileSync(join(agentDir, name)), { mode: 0o600 });
  }
  writeFileSync(join(directory, 'manifest.json'), encode({ version: 1, agentDir, files }), { mode: 0o600 });
  return directory;
}

function atomicWrite(path, content) {
  const temporary = `${path}.carbon-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function configure(directory) {
  const agentDir = resolve(directory);
  if (existsSync(join(agentDir, 'extensions', 'pi-cc-utilities.ts'))) {
    throw new Error('Move extensions/pi-cc-utilities.ts outside the extensions directory before enabling Carbon; it would register the same renderers/utilities twice.');
  }
  // Validate every input before making any change.
  const next = preset(...FILES.map(name => readObject(join(agentDir, name))));
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const saved = backup(agentDir);
  try {
    for (const name of FILES) atomicWrite(join(agentDir, name), encode(next[name]));
  } catch (error) {
    throw new Error(`Configuration failed. Originals are in ${saved}: ${error.message}`);
  }
  return saved;
}

export function restore(directory) {
  const source = resolve(directory);
  const manifest = readObject(join(source, 'manifest.json'));
  if (manifest.version !== 1 || typeof manifest.agentDir !== 'string' || !object(manifest.files)) {
    throw new Error('Not a Carbon backup');
  }
  // Validate all backed-up contents before changing the destination.
  const contents = new Map();
  for (const name of FILES) {
    if (typeof manifest.files[name] !== 'boolean') throw new Error('Invalid backup file manifest');
    if (manifest.files[name]) {
      const path = join(source, name);
      if (!existsSync(path)) throw new Error(`Backup is missing ${name}`);
      readObject(path);
      contents.set(name, readFileSync(path));
    }
  }
  const agentDir = resolve(manifest.agentDir);
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const saved = backup(agentDir);
  for (const name of FILES) {
    if (contents.has(name)) atomicWrite(join(agentDir, name), contents.get(name));
    else rmSync(join(agentDir, name), { force: true });
  }
  return saved;
}

function main(args) {
  if (args.length && (args.length !== 2 || !['--agent-dir', '--restore'].includes(args[0]))) {
    throw new Error('Usage: node scripts/configure.mjs [--agent-dir PATH | --restore BACKUP]');
  }
  if (args[0] === '--restore') {
    console.log(`Restored configuration. Pre-restore backup: ${restore(args[1])}`);
  } else {
    const directory = args[1] ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
    console.log(`Carbon configured. Original configuration backup: ${configure(directory)}`);
    console.log('Install ZenTUI and Carbon as documented, then start Pi or run /reload.');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
