/**
 * Carbon: Claude Code tool/thinking rendering alongside ZenTUI chrome.
 * Configure ownership with scripts/configure.mjs before enabling this package.
 * Internal pi-cc modules are pinned and covered by the integration smoke test.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { config } from "../node_modules/pi-cc-extensions/extensions/config/config.ts";
import { installCompactThinking, type CompactThinkingController } from "../node_modules/pi-cc-extensions/extensions/feature/compact-thinking.ts";
import claudeCodeStyle, { getCompactThinkingConfig } from "../node_modules/pi-cc-extensions/extensions/renderer/index.ts";
import aliases from "../node_modules/pi-cc-extensions/extensions/feature/shell/aliases.ts";
import context from "../node_modules/pi-cc-extensions/extensions/feature/context.ts";
import sessionReference from "../node_modules/pi-cc-extensions/extensions/feature/reference/index.ts";
import subagentAutocomplete from "../node_modules/pi-cc-extensions/extensions/feature/reference/subagent.ts";

export default function (pi: ExtensionAPI): void {
  // Register the renderer lifecycle first, then thinking. The reverse shutdown
  // order can resurrect a stale thinking patch from the renderer's saved prototype.
  // Forward queries because the thinking controller is created just below.
  let thinking: CompactThinkingController;
  claudeCodeStyle(pi, undefined, {
    updateConfig: next => thinking.updateConfig(next),
    getMessageThinkingDurationMs: timestamp => thinking.getMessageThinkingDurationMs?.(timestamp),
    isMessageThinkingActive: timestamp => thinking.isMessageThinkingActive?.(timestamp) ?? false,
    getThinkingAnimationFrame: () => thinking.getThinkingAnimationFrame?.() ?? 0,
    setCompactSummaryActive: active => thinking.setCompactSummaryActive?.(active),
  });
  thinking = installCompactThinking(pi, getCompactThinkingConfig());

  if (config.enableAliases) aliases(pi);
  if (config.enableContextCommand) context(pi);
  if (config.enableSessionReference) sessionReference(pi);
  if (config.enableSubagentAutocomplete) subagentAutocomplete(pi);
}
