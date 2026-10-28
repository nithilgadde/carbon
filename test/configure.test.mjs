import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure, preset, restore } from '../scripts/configure.mjs';

const fixture = t => {
  const directory = mkdtempSync(join(tmpdir(), 'carbon-config-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const json = path => JSON.parse(readFileSync(path, 'utf8'));

test('preset assigns each surface without replacing unrelated configuration', () => {
  const settings = { theme: 'light', defaultModel: 'example', packages: [
    'npm:unrelated', 'npm:pi-cc-extensions@1.0.12',
    { source: 'npm:pi-cc-extensions', themes: ['themes/cc-dark.json'], extensions: ['extensions/index.ts'] },
  ] };
  const zen = { colors: { accent: '#abc' }, components: {
    toolDisplay: { enabled: true, style: 'opencode' },
    editor: { style: 'other', colors: { border: '#123' } },
  } };
  const cc = { previewLines: 7, excludeRenderers: ['custom'], stickyUserMessage: true };
  const original = structuredClone({ settings, zen, cc });
  const result = preset(settings, zen, cc);
  assert.deepEqual({ settings, zen, cc }, original);
  assert.equal(result['settings.json'].theme, 'light');
  assert.equal(result['settings.json'].packages[0], 'npm:unrelated');
  assert.deepEqual(result['settings.json'].packages[1].extensions, []);
  assert.deepEqual(result['settings.json'].packages[2].themes, ['themes/cc-dark.json']);
  assert.equal(result['zentui.json'].components.toolDisplay.enabled, false);
  assert.equal(result['zentui.json'].components.thinkingSteps.enabled, false);
  assert.equal(result['zentui.json'].components.editor.colors.border, '#123');
  assert.equal(result['pi-cc-extensions.json'].previewLines, 7);
  assert.equal(result['pi-cc-extensions.json'].stickyUserMessage, false);
  assert.deepEqual(preset(...Object.values(result)), result);
});

test('fresh install can restore originally absent files', t => {
  const dir = fixture(t);
  const saved = configure(dir);
  assert.equal(json(join(dir, 'zentui.json')).components.footer.style, 'starship');
  const undoRestore = restore(saved);
  for (const name of ['settings.json', 'zentui.json', 'pi-cc-extensions.json']) {
    assert.equal(existsSync(join(dir, name)), false);
  }
  restore(undoRestore);
  assert.equal(json(join(dir, 'pi-cc-extensions.json')).mode, 'on');
});

test('restore preserves exact original bytes and backs up newer configuration', t => {
  const dir = fixture(t);
  const original = '{ "theme": "dark", "packages": ["npm:pi-cc-extensions"] }\n';
  writeFileSync(join(dir, 'settings.json'), original);
  const saved = configure(dir);
  writeFileSync(join(dir, 'settings.json'), '{"theme":"light"}');
  const newer = restore(saved);
  assert.equal(readFileSync(join(dir, 'settings.json'), 'utf8'), original);
  assert.equal(json(join(newer, 'settings.json')).theme, 'light');
});

test('malformed input fails before creating backups or changing other files', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'settings.json'), '{"theme":"light"}');
  writeFileSync(join(dir, 'zentui.json'), '{broken');
  assert.throws(() => configure(dir));
  assert.equal(readFileSync(join(dir, 'settings.json'), 'utf8'), '{"theme":"light"}');
  assert.equal(existsSync(join(dir, 'backups')), false);
  assert.throws(() => preset({ packages: 'invalid' }, {}, {}), /array/);
});

test('duplicate local adapter is never overwritten or silently enabled', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, 'extensions'));
  const path = join(dir, 'extensions', 'pi-cc-utilities.ts');
  writeFileSync(path, '// local extension');
  assert.throws(() => configure(dir), /register the same/);
  assert.equal(readFileSync(path, 'utf8'), '// local extension');
  assert.equal(existsSync(join(dir, 'backups')), false);
});

test('incomplete backup is rejected before changing destination files', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'settings.json'), '{}');
  const saved = configure(dir);
  rmSync(join(saved, 'settings.json'));
  assert.throws(() => restore(saved), /missing settings.json/);
  assert.equal(json(join(dir, 'pi-cc-extensions.json')).mode, 'on');
});
