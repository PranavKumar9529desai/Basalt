# ADR-018: Registry-Driven Workbench

## Status

Accepted (2026-06-25)
## Context

Basalt's goal is an Obsidian-class desktop Markdown workspace that eventually
supports plugins capable of changing the UI. Today the workbench shell is
hard-coded JSX: `RightSidebar` imports `BacklinksSidebar` directly, `Sidebar`
imports `FileTree`, `ActivityBar` hardcodes its items, and the layout exists
only as compiled React in `WorkspaceView`.

This has three costs:

1. **Every new panel requires shell surgery** — adding a graph view means
   editing 3+ shell files and threading props through `useWorkspace`.
2. **Plugins are impossible** — a plugin cannot edit our JSX; it can only
   register into something.
3. **No pane splits, ever** — a singular `pane` in the tabs store cannot
   become a tree of panes without a view abstraction to place inside them.

VS Code and Obsidian — the two reference applications for this problem —
converged on the same answer: **the shell renders from registries; everything
else (including first-party features) contributes to registries.** Obsidian's
plugin API is almost entirely registry calls (`registerView`, `addRibbonIcon`,
`addCommand`); VS Code's `contributes` in `package.json` is a declarative
registry, and its own core features register through the identical path as
extensions.

Basalt already proves the pattern works here: `packages/commands` and
`packages/keybindings` are registries, and features meet the shell only
through string keys.

## Decision

### Governing principle

**The workbench shell renders from registries. Features, and eventually
plugins, contribute to registries. The shell imports no feature component
directly.**

### Lexicon (adopted from Obsidian)

All workbench code uses one vocabulary. Renames ride along with the phase
that touches the code — no big-bang rename.

| Term | Meaning | Replaces |
|---|---|---|
| **Workspace** | The whole main surface; owns the pane tree | `WorkspaceView` layout role |
| **Ribbon** | Far-left vertical strip of quick actions | `ActivityBar` (VS Code term) |
| **Side dock** | Left/right collapsible panel hosting views | `Sidebar` / `RightSidebar` |
| **View** | A registered panel component identified by `type` (e.g. `file-explorer`, `backlinks`) | ad-hoc "panel"/"sidebar content" |
| **Pane** | A split region of the workspace holding a tab group | `TabGroupFrame` / "group" |
| **Leaf** | One tab's content, resolved from a registered leaf/view type | `PaneContent` switch logic |

### Phases (each builds on the last; each ships independently)

1. **View registry + generic side docks** — `packages/views`; side docks
   render registered views; `BacklinksSidebar` and `FileTree` become the
   first contributions.
2. **Leaf types for the editor area** — tab model gains `viewType`; pane
   content resolves from the registry (`"markdown"` first).
3. **Layout as serializable tree** — `pane` → `panes: PaneTree`, persisted
   Obsidian-`workspace.json`-style; enables splits and drag-between-panes.
4. **Contribution points for remaining surfaces** — status bar items,
   context menus, settings sections, ribbon items.
5. **Plugin host (last)** — in-process contributions from a manifest;
   process isolation (VS Code-style extension host) is explicitly out of
   scope until phases 1–4 are consumed by first-party features.

### Non-goals

- No DI container (VS Code's `InstantiationService` is the wrong weight).
- No process-isolated extension host in phases 1–4.
- No big-bang rename; vocabulary migrates with the code it touches.

## Consequences

- Adding a panel becomes one `registerView({...})` call; the shell is
  untouched.
- First-party features and future plugins use the identical registration
  path — the plugin story is the architecture, not a separate project.
- Registries must be import-side-effect safe (same pattern as
  `shared/paneCommands.ts`) or registration must be explicit at boot;
  prefer explicit boot-time registration lists for determinism.
- `packages/views` is a leaf dependency: no imports from `apps/tauri`
  features, mirroring `packages/commands`.
