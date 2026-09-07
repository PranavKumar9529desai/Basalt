# ADR-038 Working Breakdown — File Decomposition

> Execution checklist for [ADR-038](adr/038-file-decomposition-structural-clarity.md).
> One commit per phase (§ phases below). Verification invariant per ADR §5.
> Status banner: last updated 2026-09-08 — ALL PHASES COMPLETE (`3e8036b` · `3147787` · `d40231b` · `1c6d21c` · phase-5).

## Phase 1 — Zero-risk relocations ✅
> Status banner: all phases complete — commits in the rows below.
| Item | Files | Status |
|---|---|---|
| dql-widget split | `packages/editor/src/block-widgets/` → `dql-types.ts` `dql-html.ts` `dql-theme.ts` | ✅ `3e8036b` |
| useVaultController | `features/vault/hooks/` → `useVaultClipboard.ts` `useVaultContextMenu.ts` `useVaultSelection.ts` | ✅ `3e8036b` (no DnD code exists → `lib/vaultDnD.ts` skipped, verified) |
| useTabDnD | `features/tabs/hooks/lib/` → `dragState.ts` `hitTest.ts` `dropExec.ts` | ✅ `3e8036b` |
| graph renderer | `packages/graph/src/` → `shaders.ts` `programs.ts` | ✅ `3e8036b` |
| canvas renderer | `packages/canvas/src/` → `shaders.ts` `programs.ts` | ✅ `3e8036b` |
| Rust test extraction | `commands/assets/rewrite.rs` `reorganize_tests.rs`; `commands/notes/rename_attachments.rs` `rename_tests.rs`; `commands/folders/move.rs` `rename.rs` `common.rs` `move_rename_tests.rs` | ✅ `3e8036b` |
| table-widget split | `packages/editor/src/block-widgets/` → `table-parse.ts` `table-html.ts` `table-theme.ts` | ✅ `3e8036b` |
| live-preview | `packages/editor/src/preview/` → `collector.ts` `scheduler.ts` `tag-marks.ts` | ✅ `3e8036b` |

## Phase 2 — Rust crate seams ✅

| Item | Files | Status |
| force-graph quadtree | `crates/basalt-graph/src/graph_layout/force_graph.rs` → `quadtree.rs` + sim | ✅ `3147787` |
| basalt-canvas types/ser | `crates/basalt-canvas/src/lib.rs` → `types.rs` + `ser.rs` | ✅ `3147787` |
| tables engine | `crates/basalt-tables/src/engine.rs` → `grouping.rs` + `output.rs` | ✅ `3147787` |
| basalt-types query | `crates/basalt-types/src/query.rs` → `value.rs` + `convert.rs` | ✅ `3147787` |
| vault graph cc | `commands/vault/graph.rs` → `cc.rs` (union-find) | ✅ `3147787` |
| lite: parse.rs | `crates/basalt-parser/src/query/parse.rs` → `source.rs` `expr.rs` `plan.rs` | ✅ `3147787` |
| lite: frontmatter walk | `crates/basalt-parser/src/frontmatter.rs` → `walk.rs` | ✅ `3147787` |
| lite: save.rs infer | `commands/assets/save.rs` → `infer.rs` | ✅ `3147787` |
| media server/http | `commands/media.rs` → `media/server.rs` + `media/http.rs` | ✅ `3147787` |

## Phase 3 — Feature-layer hooks ✅

| Item | Files | Status |
|---|---|---|
| CanvasView | `features/canvas/CanvasView.tsx` → `lib/useCanvasState.ts` `useCanvasPersistence.ts` `useCanvasKeyboard.ts` `useCanvasSelection.ts` `useCanvasGuidelines.ts` `useCanvasModals.ts` | ✅ `d40231b` |
| Graph lib | `features/graph/components/Graph.tsx` → `lib/` `graphWorker.ts` `geometry.ts` `themeColors.ts` `excerpt.ts` `persistedState.ts` `filters.ts` `localGraph.ts` `interactions.ts` `useGraphEngine.ts` | ✅ `d40231b` |
| tabs core slices | `features/tabs/store/core.ts` → `core/` `openClose.ts` `panes.ts` `pin.ts` `persistenceSync.ts` + `lib/ids.ts`; `createCoreSlice` composes | ✅ `d40231b` |
| editorCommands | `shared/editorCommands.tsx` → `commands/editorCommands.ts` `tableCommands.ts` `devBenchmarks.ts` | ✅ `d40231b` |
| lite: EditorController | `controller/EditorController.ts` → `lib/linkFetch.ts` `lib/viewEvents.ts` | ✅ `d40231b` |
| lite: frontmatter-widget | `packages/editor/src/frontmatter-widget.ts` → `frontmatter-utils.ts` | ✅ `04bf72c` (pre-ADR) |
| lite: editor links | `packages/editor/src/editor.ts` → `links.ts` | ✅ `d40231b` |
| lite: useVaultMutations | `features/vault/hooks/useVaultMutations.ts` → `lib/deleteFlow.ts` | ✅ `d40231b` |
| lite: search store | `features/search/store.ts` → `lib/searchApi.ts` | ✅ `d40231b` |
| lite: TabsBar | `packages/ui/src/components/tabs/TabsBar.tsx` → `OverflowMenu.tsx` `DropIndicator.tsx` (rendered by TabItem, TabsBar passes `showDropIndicator`) | ✅ `d40231b` |
## Phase 4 — Test-file splits ✅

| Item | Files | Status |
|---|---|---|
| complex_queries | `crates/basalt-tables/tests/complex_queries.rs` → per-scenario (aggregation/group_by/flatten/edge_cases/pipeline) | ✅ `1c6d21c` (56 tests) |
| query tests | `query/tests.rs` (392) per clause → `tests/` submodules | ✅ `1c6d21c` (38 tests) |
| mirror splits | `useTabDnD.test.ts` (576) mirrors hooks/lib; `split.test.ts` (526) + `useVaultController.test.ts` (490) per extracted module | ✅ `1c6d21c` (tests verbatim) |
| basalt-canvas lib tests | `lib.rs` inline `#[cfg(test)] mod tests` → `#[path]` `lib_tests.rs` | ✅ `1c6d21c` (11 tests) |

## Phase 5 — Full gate ✅

- [x] `bun run lint` + `bunx tsc --noEmit` (apps/tauri) — clean except pre-existing settings WIP
- [x] `cargo test --workspace` + `cargo clippy --workspace --all-targets -- -D warnings` — green
- [x] typing-latency harness — full-stack p95 = 3.10 ms @ 100 KB (gate ≤ 4 ms)
- [x] Flip ADR-038 status → implemented; ✓ tier disposition tables
- [x] Update AGENTS.md status table + CURRENT_WORK.md
