# ADR-036: Core Plugin Architecture

## Status

Accepted (2026-09-07)

## Context

Basalt needs first-party features that Obsidian ships as _core plugins_:
Templates, Daily notes, Outlines, Starred, and more. These are not panels
(no `registerView`), not raw commands, and not shell glue — they are
self-contained domains that contribute to several registration surfaces at
once (commands, ribbon items, settings, and occasionally views).

Today those surfaces exist as separate, uncoordinated seams:

- `commandService.registerCommand()` + metadata in
  `packages/commands/src/commands.json`
- `viewRegistry` / `leafRegistry` in `app-shell/registrations.ts`
- Ribbon item arrays in `app-shell/Ribbon.tsx`
- Settings sections in `features/settings/store.ts` `CORE_SECTIONS`
- Rust command modules in `src-tauri/src/commands/`

The settings modal already groups sections under `"core-plugins"` (the
Obsidian lexicon) and currently shows "No core plugin settings yet" — the
architecture anticipated this moment without defining what a core plugin
_is_ or where its code lives.

How do the reference applications structure this? Obsidian's answer (from
its official plugin API): **core plugins are plugins** — a self-contained
type that in `onload()` registers exactly four surfaces (`addCommand`,
`addRibbonIcon`, `addSettingTab`, `registerView`) and owns a private
settings blob; commands are namespaced `plugin-id:command-id`; the shell
renders from registries and knows nothing about plugin internals. Joplin's
answer (open-source Electron/TS, closest analog): the same, plus
**declarative setting metadata** — a plugin declares `{type, label,
section, value}` items and the app renders the form automatically.

Basalt's ADR-018 already committed to the registries principle; this ADR
defines the first-class **core plugin** unit that consumes it.

## Decision

### Governing principle

**A core plugin is a self-contained domain that contributes to the existing
registration surfaces and owns its settings keys. The shell and the shared
layer are the only places that import feature code; features never import
the shell or upstream layers.**

### The core plugin skeleton

A plugin named `x` MAY use any subset of these contributions (a plugin =
the set of files it actually needs, not a mandated directory):

| Surface                  | Where it registers                                                                                              | Ownership                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Palette command(s)       | `packages/commands/src/commands.json` (metadata) + `commandService.registerCommand("x:action", cb)`             | callback lives in `features/x/commands.ts` (self-contained) or in `shared/` when it must reach the workspace controller               |
| Ribbon button(s)         | `app-shell/Ribbon.tsx` item                                                                                     | shell item calls `commandService.execute("x:action")` or a feature store action                                                       |
| Settings section         | `features/settings/store.ts` (id `"x"`, group `"core-plugins"`) + a section component                           | section renders the declarative `SETTING_SPECS` entries for its id via the generic `SettingsFields` component — no hand-written forms |
| Settings keys            | `DEFAULTS` in `features/settings/settings-data.ts`, namespaced `x*` (e.g. `templateFolder`, `dailyNotesFolder`) | read via `useSetting`/`getSetting`, written via `setSetting` → Rust `config.json` (flat KV, no schema)                                |
| Views (optional)         | `app-shell/registrations.ts`                                                                                    | `viewRegistry` / `leafRegistry` only                                                                                                  |
| Rust commands (optional) | `src-tauri/src/commands/<x>/mod.rs` + `generate_handler` in `lib.rs`                                            | one command module dir per plugin that needs backend work; shared mutation contract lives in `commands/common.rs`                     |

### Conventions

1. **Command ids are namespaced `x:action`** (matching Obsidian's enforced
   prefixing): `templates:insert`, `dailies:open-today`,
   `canvas:group-selection`.
2. **Templates variables are the Obsidian syntax** — `{{title}}`,
   `{{date}}`, `{{time}}`, with colon format overrides `{{date:YYYY-MM-DD}}`.
   Token set is a small Moment.js-compatible subset implemented locally in
   TypeScript (`YYYY/YY/MMMM/MMM/MM/M/DD/D/dddd/ddd/dd/d/HH/H/hh/h/mm/m/ss/s/
A/a` + literals) — no Moment dependency.
3. **Template expansion is a frontend concern** (one TS implementation for
   both insert-at-cursor and daily-note creation). Rust never formats dates;
   Rust commands that need content receive it already-expanded.
4. **Settings section rendering is declarative** (Joplin model): a
   `SETTING_SPECS` map describes type/label/description/section; the generic
   `SettingsFields` component renders rows. Future plugins and the
   presently-stubbed settings sections (Files & links, Editor, General)
   adopt the same mechanism instead of hand-building forms.
5. **Rust file mutation goes through `commands/common.rs`** — the single
   write contract (`resolve_parent_dir` + `write_markdown_note` wrapping
   `register_self_writes` → write → vault cache → search index), extracting
   the duplicated flows from `notes/`.

## Non-goals

- **Process-isolated plugin host** (ADR-018 Phase 5) — unchanged; this ADR
  covers first-party core plugins only.
- **Per-plugin settings namespaces in `config.json`** — keys stay flat
  (`templateFolder`, not `templates.folder`); revisit only if the flat map
  crowds.
- **org-capture-style escapes** (`%^{prompt}`, `%?` cursor placement) —
  documented as future work, not in the v1 contract.
- **Auto-apply templates to arbitrary new notes** — Obsidian's core
  Templates plugin does not do this (community Templater does); out of
  scope until plugin-phase work.

## Consequences

- Adding a core plugin touches only: its own `features/<x>/` and
  `commands/<x>/` dirs, one `commands.json` entry per command, one or two
  `DEFAULTS` keys + spec entries, one `store.ts` section, at most one
  `Ribbon.tsx` item. No shell surgery, no shared-layer edits for
  self-contained plugins.
- Settings UI becomes generic data-driven rendering; the first real
  settings forms (Templates, Daily notes) are built once and reused.
- Templates + Daily notes are the two pilots that validate the skeleton;
  later core plugins (Outline, Starred, Tags) copy the shape with zero
  architectural change.
- The `create_note`/`create_untitled_note` flows gain `resolve_parent_dir`
  traversal protection (`..` rejection + canonicalization) as a free
  consequence of extracting the write contract.
