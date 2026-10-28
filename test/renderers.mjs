// Integration smoke test against the installed Pi and the pinned renderer dependency.
// Uses temporary configuration and files, never the user's Pi settings.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configure } from '../scripts/configure.mjs';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const agentDir = mkdtempSync(join(tmpdir(), 'carbon-render-test-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.on('exit', () => rmSync(agentDir, { recursive: true, force: true }));
configure(agentDir);

const host = process.env.PI_HOST_PACKAGE || join(
  execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(),
  '@earendil-works/pi-coding-agent',
);
const fromHost = relative => import(pathToFileURL(join(host, relative)).href);
const { loadExtensions } = await fromHost('dist/core/extensions/loader.js');
const { initTheme, theme } = await fromHost('dist/modes/interactive/theme/theme.js');
const { ToolExecutionComponent, AssistantMessageComponent, UserMessageComponent } = await fromHost('dist/index.js');
const requireHost = createRequire(join(host, 'package.json'));
const { visibleWidth } = await import(pathToFileURL(requireHost.resolve('@earendil-works/pi-tui')).href);

initTheme('dark', false);
const originalTool = ToolExecutionComponent.prototype.getCallRenderer;
const originalThinking = AssistantMessageComponent.prototype.updateContent;
const nativeUser = new UserMessageComponent('Keep ZenTUI user styling').render(80);
const loaded = await loadExtensions([root + 'extensions/index.ts'], root);
assert.deepEqual(loaded.errors, []);
const extension = loaded.extensions[0];
assert.ok(extension.commands.has('ccstyle'));
assert.ok(extension.commands.has('context'));
loaded.runtime.getAllTools = () => [];
loaded.runtime.appendEntry = () => {};
const tui = { children: [], requestRender() {} };
const forbidden = name => () => { throw new Error(`Adapter must not own ${name}`); };
const ctx = {
  mode: 'tui', hasUI: true, cwd: root, isIdle: () => true,
  sessionManager: { getBranch: () => [], getEntries: () => [], getSessionId: () => 'hybrid-smoke', getSessionFile: () => undefined },
  ui: {
    theme, setStatus() {}, notify() {}, requestRender() {}, addAutocompleteProvider() {},
    setWidget(_id, factory) { if (typeof factory === 'function') factory(tui, theme); },
    setEditorComponent: forbidden('editor'), setFooter: forbidden('footer'),
    setHeader: forbidden('header'), setWorkingMessage: forbidden('working line'),
  },
};
const emit = async (name, event = {}) => {
  for (const fn of [...(extension.handlers.get(name) ?? [])]) await fn(event, ctx);
};
const strip = text => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
const message = {
  role: 'assistant', api: 'openai-responses', provider: 'openai', model: 'test',
  timestamp: 1000, stopReason: 'stop',
  content: [{ type: 'thinking', thinking: '**Checking the file**\nInspect the existing source before editing.' }, { type: 'text', text: 'Ready.' }],
  usage: { input: 0, output: 0, totalTokens: 0, cost: { total: 0 } },
};
for (let cycle = 0; cycle < 2; cycle++) {
  try {
    await emit('session_start');
    // Flush the renderer's deferred write-override installation, not agent polling.
    await delay(25);
    assert.notEqual(ToolExecutionComponent.prototype.getCallRenderer, originalTool);
    assert.notEqual(AssistantMessageComponent.prototype.updateContent, originalThinking);
    // CC adds nonprinting prompt-boundary markers even when its sticky UI is off.
    const userLines = new UserMessageComponent('Keep ZenTUI user styling').render(80)
      .map(line => line.replace(/\x1b_cc:[pP]\x07/g, ''));
    assert.deepEqual(userLines, nativeUser);
    const scratch = mkdtempSync(join(tmpdir(), 'pi-hybrid-diff-'));
    try {
      const id = `real-write-${cycle}`;
      const args = { path: join(scratch, 'example.ts'), content: 'export const value = 2;\n' };
      const write = extension.tools.get('write').definition;
      const result = await write.execute(id, args, undefined, undefined, { cwd: scratch });
      assert.equal(readFileSync(args.path, 'utf8'), args.content);
      const component = new ToolExecutionComponent('write', id, args, {}, write, tui, scratch);
      component.setArgsComplete();
      component.updateResult({ ...result, isError: false });
      component.setExpanded(true);
      const rendered = component.render(80).map(strip).join('\n');
      assert.ok(rendered.includes('export const value = 2;'), 'real write diff missing');
      assert.ok(!rendered.includes('diff unavailable'), 'write metadata not connected');
      if (!cycle) console.log(`real write diff:\n${rendered}`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    for (const width of [40, 80, 140]) {
      for (const [name, args, result] of [
        ['read', { path: 'example.ts' }, 'export const value = 1;'],
        ['write', { path: 'example.ts', content: 'export const value = 2;\n' }, 'Successfully wrote example.ts'],
        ['edit', { path: 'example.ts', edits: [{ oldText: '1', newText: '2' }] }, 'Successfully edited example.ts'],
      ]) {
        const component = new ToolExecutionComponent(name, `${cycle}-${name}-${width}`, args, {}, undefined, tui, root);
        component.setArgsComplete();
        component.updateResult({ content: [{ type: 'text', text: result }], details: undefined, isError: false });
        const lines = component.render(width);
        assert.ok(lines.some(line => strip(line).includes('example.ts')), `${name} must show path`);
        assert.ok(lines.every(line => visibleWidth(line) <= width), `${name} overflow at ${width}`);
        if (!cycle && width === 80) console.log(`${name}:\n${lines.map(strip).join('\n')}`);
      }
      const lines = new AssistantMessageComponent(message).render(width);
      assert.ok(lines.some(line => /Checking the file/.test(strip(line))), 'CC thinking summary missing');
      assert.ok(lines.every(line => visibleWidth(line) <= width), `thinking overflow at ${width}`);
      if (!cycle && width === 80) console.log(`thinking:\n${lines.map(strip).join('\n')}`);
    }
  } finally {
    await emit('session_shutdown');
  }
  assert.equal(ToolExecutionComponent.prototype.getCallRenderer, originalTool);
  assert.equal(AssistantMessageComponent.prototype.updateContent, originalThinking);
}
console.log('PASS: hybrid configuration, extension loading, read/write/edit/thinking at 40/80/140 columns, chrome isolation, and two startup/shutdown cycles');
