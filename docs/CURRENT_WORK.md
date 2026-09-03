# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---

## Rust Quality-Hardening — ACTIVE

**Branch:** `fix/code-block-height` (user-confirmed working branch for ALL Rust work)
**Commit sequence:** Phases A, 1, 2, 3 already committed; Phase 4 (clippy) in flight, uncommitted.

> NOTE (2026-09-04): The ADR-029 **frontend** workstream (reading-mode search
> preview parity) from a prior session is now **committed separately** as
> `919f3fb` (`feat(search): render preview with full reading-mode parity`),
> ahead of this Rust work on the same branch. It is NOT part of the Rust
> commits — keep it separate. It touches `Shell.tsx`, `Overlays.tsx`,
> `SearchModal.tsx`, `PreviewPane.tsx/.test.ts`, `search/types.ts`,
> `search/index.ts` (the `PreviewDeps` bag lives in `features/search/types.ts`,
> not `shared/previewDeps.ts`).

### Completed (committed on `fix/code-block-height`)

- **Phase A** `e447a0b` — typed errors: `thiserror` domain enums
  (`basalt_parser::ParseError`, `basalt_vault::path_utils::PathError`) +
  single `AppError` enum/`AppResult` alias in
  `apps/tauri/src-tauri/src/error.rs`; all 10 command modules converted from
  `Result<_, String>` to `AppResult`. Wire contract = string only (frontend does
  `String(err)`), DO NOT change.
- **Phase 1** `a775f38` — flow: intent-revealing `Vault` service methods
  (`note_paths`, `paths_under`, `note_count`, `backlinks_for`, `all_tags`,
  `metadata`) in `crates/basalt-vault/src/vault.rs`; commands no longer reach
  into `metadata_cache`/`arena` internals.
- **Phase 2** `86d9417` — structure: moved `src-tauri/src/{app_state,cache,
  config,watcher,workspace}.rs` under `src/core/` (re-exported at crate root);
  deleted dead `crates/basalt-wasm` (superseded by `graph-wasm` +
  `frontmatter-wasm`); fixed stale `basalt-wasm` refs in ADR-009/020/021/022 +
  `docs/webview-costs.md`; fixed `EditorController.test.ts` mock path
  `../logic/` → `../lib/`.
- **Phase 3** `ecdcd7f` — docs: added CONVENTIONS.md §11 "Rust Backend
  Conventions" (thiserror-where, error-variant granularity, wire contract,
  service-method naming, src-tauri module layout); added `rust` to commit scope;
  fixed stale `editor/logic/` → `lib/` path in CONVENTIONS §9; retitled doc to
  "Basalt Conventions — Frontend & Rust Backend".

### Phase 4 — clippy enforcement (IN PROGRESS, uncommitted)

Goal: `cargo clippy --workspace --all-targets -- -D warnings` passes clean, then
wire clippy + tests into a lint script and CI (repo currently has NO
`.github/workflows/`).

Status of clippy fixes (all file edits staged/working-tree, NOT yet committed):

- `basalt-types` DONE: `Default` derives + `new()` delegates to `Self::default()`
  for `FileMetadata`/`Document` (`new()` MUST stay — 21 call sites); `QueryResult`
  now `#[derive(Default)]` (removed manual impl).
- Profiles warning DONE: moved `[profile.release]` from
  `apps/tauri/src-tauri/Cargo.toml` (was ignored on a workspace member) to root
  `Cargo.toml` as workspace-level profile.
- `basalt-parser` DONE: `split(['|', '#'])` (3×), `strip_prefix("- ")` for
  frontmatter list items, `is_some_and` for fn_name verify.
- `basalt-graph` DONE: `?` in fuzzy loop, `sort_by_key(Reverse)` for search
  results, `is_some_and` (2×) in liveness, `contains(&1)/contains(&0)` in
  graph_layout test.
- `basalt-vault` REMAINING (in progress): `indexer.rs:53-56` (unnecessary if-let
  + map_or over `Result` iterator — use `filter_map`/`is_some_and`),
  `indexer.rs:87` (`map_or(false, …)` → `is_some_and`), `path_utils.rs:47`
  (char comparison → `split(['…'])`-style), `path_utils.rs:80` (loop var `i` only
  indexes `components` → iterate directly over `components`), `asset_index.rs:
  464,475,486,496,509,510,525` (7× "useless use of `vec!`" in tests).

How to resume clippy fix loop: `cargo clippy --workspace --all-targets -- -D warnings`
until EXIT 0, then `cargo test --workspace`, then commit Phase 4
(`chore(rust): add clippy -D warnings enforcement, fix lints`).

### Phase 5 — test parity (PLANNED, not started)

- wasm-bindgen tests for `frontmatter-wasm` + `graph-wasm` (note both use
  `#[wasm_bindgen_test]` internally and are built standalone via scripts hex).
- Inline unit tests for `basalt-tables` engine/expr internals.

### Pending (separate workstream, coordinate with user)

- `test/editor-testing` render-mode fix + table fix (untracked `render-mode.ts`
  + committed test) — NOT part of Rust commits; confirm branch first.

---

## Frontend Restructure — ACTIVE

**Branch:** `feat/frontend-restructure`
**Worktree:** `/home/pranav/Projects/.worktrees/basalt-feat/frontend-restructure`
**Based on:** `main` at `fb83910`

### Goal

Standardize the internal layout of every feature to a consistent pattern, and
move misplaced files to their correct layers. The four-layer architecture
(routes → app-shell → shared → features) and registry-driven workbench
(ADR-018) are sound — this restructure fixes inconsistency _within_ those
layers.

### Standard Feature Layout (canonical)

```
features/<name>/
├── index.ts          (barrel — the ONLY import surface)
├── types.ts          (TypeScript interfaces/enums)
├── lib/              (pure business logic — no React, no hooks)
├── store/            (Zustand store — or store.ts if simple)
├── hooks/            (React hooks — stateful, side-effectful)
└── components/       (React components — JSX, props in, DOM out)
```

### Phase 1: Standardize features — add `lib/` dirs, move scattered root files

| Move                     | From                                                                        | To                                                           | Import updates needed                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rename `logic/` → `lib/` | `editor/logic/*`                                                            | `editor/lib/*`                                               | `editor/index.ts`: `./logic/frontmatter` → `./lib/frontmatter`; `editor/hooks/useNoteIO.ts`: `../logic/frontmatter` → `../lib/frontmatter`; `editor/controller/EditorController.ts`: 4 imports `../logic/*` → `../lib/*`; `editor/hooks/useEditor.ts`: `../logic/reconcile` → `../lib/reconcile` |
| Move selectors           | `tabs/selectors.ts` + `tabs/selectors.test.ts`                              | `tabs/lib/selectors.ts` + `tabs/lib/selectors.test.ts`       | `tabs/index.ts`: `./selectors` → `./lib/selectors`; `selectors.test.ts`: `./types` → `../types`                                                                                                                                                                                                  |
| Move search logic        | `search/commands.ts` + `search/benchmark.ts`                                | `search/lib/commands.ts` + `search/lib/benchmark.ts`         | `search/index.ts`: `import "./commands"` → `import "./lib/commands"`; `commands.ts`: `./benchmark` → `./benchmark` (same, both moved together), `./store` → `../store`                                                                                                                           |
| Move settings logic      | `settings/settings-data.ts` + `settings/commands.ts`                        | `settings/lib/settings-data.ts` + `settings/lib/commands.ts` | `settings/index.ts`: `./settings-data` → `./lib/settings-data`, `import "./commands"` → `import "./lib/commands"`; `commands.ts`: `./store` → `../store`; `shared/useWorkspace.test.ts`: `../features/settings/settings-data` → `../features/settings/lib/settings-data`                         |
| Move graph logic         | `graph/nodeScale.ts` + `graph/spatialGrid.ts` + `graph/spatialGrid.test.ts` | `graph/lib/*`                                                | `graph/index.ts`: `./spatialGrid` → `./lib/spatialGrid`; `graph/components/Graph.tsx`: `../spatialGrid` → `../lib/spatialGrid`, `../nodeScale` → `../lib/nodeScale`                                                                                                                              |
| Create empty `lib/`      | —                                                                           | `vault/lib/`                                                 | No imports to update (placeholder for future logic)                                                                                                                                                                                                                                              |

**Verification:** `bun run lint && bunx tsc --noEmit` from `apps/tauri/`
**Commit:** `git add -A && git commit -m "refactor: standardize feature layout — lib/ directories"`

### Phase 2: Slim `app-shell/` → `shared/`

| Move                  | From                            | To                                 | Import updates needed                                                    |
| --------------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Cross-feature context | `app-shell/AppProvider.tsx`     | `shared/AppProvider.tsx`           | `app-shell/index.ts` barrel, `app-shell/Shell.tsx` (imports AppProvider) |
| One-time init         | `app-shell/Boot.tsx`            | `shared/Boot.tsx`                  | `routes/index.tsx` (imports Boot)                                        |
| Leaf services         | `app-shell/useLeafServices.ts`  | `shared/useLeafServices.ts`        | `app-shell/index.ts` barrel, `app-shell/Shell.tsx`                       |
| Shell commands        | `app-shell/useShellCommands.ts` | `shared/shellCommands.ts` (rename) | `app-shell/index.ts` barrel, `app-shell/Shell.tsx`                       |
| TTI instrumentation   | `app-shell/tti.ts`              | `shared/tti.ts`                    | `app-shell/index.ts` barrel, `app-shell/Boot.tsx` (now also in shared)   |
| Per-leaf chrome       | `app-shell/ViewHeader.tsx`      | `shared/ViewHeader.tsx`            | `app-shell/index.ts` barrel, `app-shell/Shell.tsx`                       |

ViewHeader is NOT a dumb component — it calls `useTabsStore`,
`useRenameSignalStore`, and `commandService.execute`, so it belongs in
`shared/`, not `packages/ui/`.

Update `shared/index.ts` barrel to export all moved files.
Update `app-shell/index.ts` barrel to remove moved exports.
Update `app-shell/Shell.tsx` to import from `shared/` instead of local.

**Verification:** `bun run lint && bunx tsc --noEmit` from `apps/tauri/`
**Commit:** `git add -A && git commit -m "refactor: move orchestration from app-shell to shared/"`

### Phase 3: Final verification

- `bun run lint` (oxlint)
- `bunx tsc --noEmit` (typecheck)
- `bun run build` (production build)
- `bun run test` (vitest)

**Commit:** only if fixes needed.

---

## Previous Work (completed, for context)

See git log for completed features: ADR-023 (inline title + rename), editor
performance campaign (ADR-019/020, p95 = 4ms @ 100KB), graph view (ADR-021),
DQL query engine (ADR-027/028). All merged to main.
