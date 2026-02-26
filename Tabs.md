# Basalt Tabs System Roadmap

## Goal
Build an Obsidian-like tabs experience for Basalt with VS Code-inspired performance behavior:
- Preview tab + pinned tabs
- Tab groups (split panes)
- Fast switching with bounded memory
- Workspace persistence and restore

## Product Principles
1. Obsidian mental model for workspace navigation (tabs + groups).
2. VS Code performance patterns for tab lifecycle (preview/pin, deferred loading, editor reuse).
3. Three-layer architecture from `AGENTS.md` must be respected.

## Architecture Decisions

### 1) Layer split (mandatory)
- `packages/ui/src/components/tabs/`
  - Dumb presentational components only (`TabsBar`, `TabItem`, `TabGroupFrame`, split controls)
  - No Tauri imports
- `apps/tauri/src/features/tabs/`
  - State, actions, hooks, IPC integration
  - `types.ts`, `store.ts`, `hooks/useTabs.ts`, `hooks/useTabPersistence.ts`, `hooks/useTabIO.ts`, `index.ts`
- `apps/tauri/src/app-shell/`
  - Compose layout (sidebar + tab groups + editor panes)
  - Thin glue only

### 2) State management
Use **Zustand** for tabs feature state.
Why:
- Already used in this codebase (`packages/editor/src/commands/store.ts`)
- Fine-grained selectors reduce rerenders in large tab sets
- Lower boilerplate than Redux for this scope

### 3) Core tab model
Per tab:
- `id`, `path`, `title`
- `isPinned`, `isPreview`, `isDirty`
- `lastAccessedAt`

Per group:
- ordered tab ids
- active tab id
- preview tab id (optional)

Workspace layout:
- split tree + group registry + focused group id

### 4) Performance model
- One editor instance per visible pane (not per tab)
- Deferred content load on tab activation
- In-memory LRU cache for hot tab content
- Debounced persistence to workspace snapshot
- Batched Rust IO for multi-tab restore/open

## TypeScript vs Rust Responsibilities

### TypeScript (UI semantics)
- Open/close/pin/reorder tabs
- Preview-to-pinned promotion rules
- Split/merge groups
- Focus history and keyboard interactions

### Rust (heavy/batched backend)
- `open_files(paths[])` batched reads
- `save_files([{path, content, expected_mtime}])` batched writes + conflict checks
- workspace snapshot read/write command pair
- validated restore payload for tabs/layout
- watcher event coalescing for changed/deleted files

## Phased Delivery Plan

## Phase 0: Spec Lock (current)
- Finalize tab lifecycle rules:
  - single click -> preview tab
  - double click/edit/pin action -> pinned tab
  - close behavior by active/focus history
- Finalize group split behavior and constraints
- Define keyboard shortcuts and command palette actions

Exit criteria:
- `features/tabs/types.ts` contract approved
- Action list approved (`openInPreview`, `pinTab`, `moveTab`, `splitGroup`, etc.)

## Phase 1: UI primitives (`packages/ui`)
- Build presentational tabs components in `packages/ui/src/components/tabs/`
- Add `index.ts` re-exports
- Use existing shadcn/radix primitives where applicable
- Use only `--sat-*` color tokens

Status update (2026-02-26):
- Completed:
  - `packages/ui/src/components/tabs/TabItem.tsx`
  - `packages/ui/src/components/tabs/TabsBar.tsx`
  - `packages/ui/src/components/tabs/TabGroupFrame.tsx`
  - `packages/ui/src/components/tabs/TabSplitDropZone.tsx`
  - `packages/ui/src/components/tabs/types.ts`
  - `packages/ui/src/components/tabs/index.ts`
  - package export path: `@workspace/ui/components/tabs`
- Remaining:
  - Add a lightweight local harness/sandbox usage example for visual checks
  - Wire these primitives into `apps/tauri` via the upcoming tabs feature store (Phase 2)

Exit criteria:
- Story-like local harness renders tab bars/groups without app state
- No Tauri coupling in `packages/ui`

## Phase 2: Tabs feature state (`apps/tauri/src/features/tabs`)
- Implement Zustand store + selectors
- Implement hooks and actions:
  - open/close/close-others/close-right
  - pin/unpin
  - preview replacement
  - reorder within/between groups
  - split group and move tab
- Integrate with command palette actions

Status update (2026-02-26):
- Completed:
  - `apps/tauri/src/features/tabs/types.ts`
  - `apps/tauri/src/features/tabs/store.ts`
  - `apps/tauri/src/features/tabs/hooks/useTabs.ts`
  - `apps/tauri/src/features/tabs/hooks/useTabPersistence.ts`
  - `apps/tauri/src/features/tabs/hooks/useTabIO.ts`
  - `apps/tauri/src/features/tabs/index.ts`
- Pending:
  - shell integration in `routes/index.tsx` and editor wiring (Phase 3)
  - command palette bindings for tab actions
  - deterministic action tests

Exit criteria:
- Deterministic unit tests for reducer-like actions
- No direct imports from other features (shell mediates)

## Phase 3: Editor integration
- Refactor current single-note `useEditor` flow to be tab-aware
- Keep one editor per visible pane
- Load content only for active tab in pane
- Preserve autosave/conflict behavior per active tab

Status update (2026-02-26):
- Completed:
  - Route-level integration now uses `TabsBar` + `TabGroupFrame` for the center editor area
  - Opened notes are mirrored into preview tabs
  - Active tab selection loads note content into the single editor instance
  - Tab close and delete-confirm flows now close corresponding tabs
  - Dirty indicator is synced from editor change/save status
  - Multi-group panes are rendered side-by-side with per-group tab bars and focus switching
  - Command palette actions wired for active tab operations (`close`, `close others`, `close right`, `pin/unpin`, `split right`)
- Pending:
  - per-visible-pane editor instances (current implementation keeps one focused editor instance)
  - command palette tab actions for move/reorder between groups and split directions beyond right
  - extraction of route glue into `app-shell` once the feature API stabilizes

Exit criteria:
- Open many tabs without proportional editor mounts
- Save/conflict banner behavior still correct

## Phase 4: Workspace persistence
- Persist tab/group/layout metadata in `.basalt/workspace.json`
- Restore last session tabs and active group
- Debounced write path initially via existing `set_workspace_key`

Exit criteria:
- Restart app and restore workspace reliably
- Missing/deleted files handled gracefully

## Phase 5: Rust acceleration
- Add batched commands and snapshot commands:
  - `open_files`, `save_files`
  - `get_workspace_snapshot`, `save_workspace_snapshot`
  - optional `restore_workspace_tabs`
- Update frontend to prefer batched commands for startup and multi-open

Exit criteria:
- Fewer IPC calls during restore/open bursts
- Measurable startup/switching improvement

## Phase 6: Performance validation
Measure before/after with reproducible scenarios:
- 1, 10, 50, 200 open tabs
- cold restore vs warm restore
- tab switch latency (p50/p95)
- memory footprint after long session

Targets (initial):
- p95 tab switch under 50ms for warm tab
- restore 50 tabs with no UI freeze
- bounded memory growth via cache cap

## Risks and Mitigations
- Risk: rerender storms with large tab sets
  - Mitigation: selector-based subscriptions + memoized tab items
- Risk: autosave races while switching tabs
  - Mitigation: explicit flush/swap protocol per pane
- Risk: workspace corruption on frequent writes
  - Mitigation: single snapshot write path + atomic Rust write

## Immediate Next Step
Implement Phase 0 artifacts:
1. `features/tabs/types.ts` draft
2. Action contract list
3. Lifecycle state diagram (preview/pin/close/switch)
