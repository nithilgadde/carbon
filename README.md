# Carbon for Pi

ZenTUI's layout, with Claude Code-style tool cards, diffs, and thinking.

Carbon is a UI extension preset, not a standalone terminal or a color theme. It combines [ZenTUI](https://github.com/lmilojevicc/pi-zentui) with the rendering modules from [pi-cc-extensions](https://github.com/minuque/pi-cc-extensions).

| Surface | Owner |
| --- | --- |
| Editor, footer, user messages, selector borders, working line | ZenTUI |
| Read/write/edit and other tool displays, rich diffs, thinking | pi-cc-extensions |
| Wiring, configuration, lifecycle ordering | Carbon |

The preset uses ZenTUI's OpenCode editor, framed user messages, and Starship footer. Your Pi color theme is unchanged.

## Install

Requires [Pi](https://pi.dev), Node.js 22.19+, npm, and Git. Start with Pi closed or idle.

```sh
git clone https://github.com/nithilgadde/carbon.git
cd carbon
npm ci

# Pin ZenTUI to the revision this preset was tested with.
pi install git:github.com/lmilojevicc/pi-zentui@e9b32c9e4bc8a555d0873d9301f70e9ed4150215

npm run configure
pi install .
```

Start Pi, or run `/reload` in an idle session. Keep the cloned directory: Pi loads local packages from their installed path.

Do **not** separately enable the all-in-one pi-cc-extensions entrypoint. Carbon loads its rendering modules and selected utilities without its competing editor or footer.

If you already use a local `pi-cc-utilities.ts` adapter, move it outside your extensions directory before installing Carbon. The configure script stops if it finds that adapter, rather than silently loading it twice.

## What configure changes

`npm run configure` explicitly updates these files under `~/.pi/agent`:

- `zentui.json`: selects the layout above; disables ZenTUI's tool and thinking renderers.
- `pi-cc-extensions.json`: enables Claude-style rendering and disables its sticky user-message UI.
- `settings.json`: disables the standalone npm pi-cc-extensions entrypoint, if installed. Its other resources remain available.

Unrelated fields are preserved. Each run backs up the original files and records which files did not exist. It prints the backup directory. No configuration is written merely by importing the extension; no npm lifecycle scripts are needed.

For a custom agent directory:

```sh
npm run configure -- --agent-dir /path/to/agent
```

The helper honors `PI_CODING_AGENT_DIR` when no explicit directory is passed. It does not edit project-local settings. If a project re-enables a competing renderer, disable it there too.

## Controls

- `/zentui` — layout settings. Leave Tool display and Thinking steps disabled.
- `/ccstyle` — tool, diff, and thinking settings. Leave sticky user messages disabled.
- Carbon also retains pi-cc's enabled aliases, context command, session references, and subagent autocomplete.

Carbon intentionally does not load pi-cc's startup header, editor, footer, working line, Markdown transformer, or agent-summary feature.

## Restore

Remove Carbon using its installed local path:

```sh
pi remove /absolute/path/to/carbon
```

Then restore the configuration backup printed by the configure script:

```sh
node scripts/configure.mjs --restore /path/to/backup
```

Restore creates another backup before overwriting your current configuration. It restores whole files, so later changes to those files are also rolled back. Reload Pi afterward. ZenTUI remains installed unless you remove it separately.

## Development

```sh
npm ci
npm test
npm run test:integration
```

The integration smoke test uses an installed Pi host. It checks renderer output at 40, 80, and 140 columns, real write-diff metadata, chrome ownership, and repeated startup/shutdown cleanup. Set `PI_HOST_PACKAGE` to the absolute Pi package directory if it is not installed globally.

Validated with Pi 1.4.0, pi-cc-extensions 1.0.12, and ZenTUI 0.33.0 at the pinned revision. Carbon imports internal pi-cc modules, so upgrades need a compatibility check. Component tests are not an end-to-end guarantee for every terminal or other installed extension.

## Credits and license

MIT. The UI renderers come from ZenTUI and pi-cc-extensions; see [third-party notices](THIRD_PARTY_NOTICES.md).
