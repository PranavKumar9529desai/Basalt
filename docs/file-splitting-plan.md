# ADR-038 Working Breakdown — File Decomposition

> Execution checklist for [ADR-038](adr/038-file-decomposition-structural-clarity.md).
> One commit per phase (§ phases below). Verification invariant per ADR §5.
> Status banner: last updated 2026-09-08.

## Phase 1 — Zero-risk relocations ✅
> Status banner: last updated 2026-09-08 — Phase 1 committed (`3e8036b`).
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

## Phase 2 — Rust crate seams

| Item | Files | Status |
|---|---|---|
| force-graph quadtree | `crates/basalt-graph/src/graph_layout/force_graph.rs` → `quadtree.rs` + sim | ⬜ |
| basalt-canvas types/ser | `crates/basalt-canvas/src/lib.rs` → `types.rs` + `ser.rs` | ⬜ |
| tables engine | `crates/basalt-tables/src/engine.rs` → `grouping.rs` + `output.rs` | ⬜ |
| basalt-types query | `crates/basalt-types/src/query.rs` → `value.rs` + `convert.rs` | ⬜ |
| vault graph cc | `commands/vault/graph.rs` → `cc.rs` (union-find) | ⬜ |
| lite: parse.rs | `crates/basalt-parser/src/query/parse.rs` → `source.rs` `expr.rs` `plan.rs` | ⬜ |
| lite: frontmatter walk | `crates/basalt-parser/src/frontmatter.rs` → `walk.rs` | ⬜ |
| lite: save.rs infer | `commands/assets/save.rs` → `infer.rs` | ⬜ |
| media server/http | `commands/media.rs` → `media/server.rs` + `media/http.rs` | ⬜ |

## Phase 3 — Feature-layer hooks

| Item | Files | Status |
|---|---|---|
| CanvasView | `features/canvas/CanvasView.tsx` → `lib/useCanvasState.ts` `useCanvasPersistence.ts` `useCanvasKeyboard.ts` `useCanvasSelection.ts` `useCanvasGuidelines.ts` `useCanvasModals.ts` | ⬜ |
| Graph lib | `features/graph/components/Graph.tsx` → `lib/graphWorker.ts` `geometry.ts` `themeColors.ts` `excerpt.ts` `persistedState.ts` `filters.ts` `localGraph.ts` `interactions.ts` | ⬜ |
| tabs core slices | `features/tabs/store/core.ts` → `core/openClose.ts` `panes.ts` `pin.ts` `persistenceSync.ts` + `lib/ids.ts`; `createCoreSlice` composes | ⬜ |
| editorCommands | `shared/editorCommands.tsx` → `commands/editorCommands.ts` `tableCommands.ts` `devBenchmarks.ts` | ⬜ |
| lite: EditorController | `controller/EditorController.ts` → `lib/linkFetch.ts` `lib/viewEvents.ts` | ⬜ |
| lite: frontmatter-widget | `packages/editor/src/frontmatter-widget.ts` → `frontmatter-utils.ts` | ⬜ (utils already extracted pre-ADR) |
| lite: editor links | `packages/editor/src/editor.ts` → `links.ts` | ⬜ |
| lite: useVaultMutations | `features/vault/hooks/useVaultMutations.ts` → `lib/deleteFlow.ts` | ⬜ |
| lite: search store | `features/search/store.ts` → `lib/searchApi.ts` | ⬜ |
| lite: TabsBar | `features/tabs/components/TabsBar.tsx` → `OverflowMenu.tsx` `DropIndicator.tsx` | ⬜ |

## Phase 4 — Test-file splits

| Item | Files | Status |
|---|---|---|
| complex_queries | `crates/basalt-tables/tests/complex_queries.rs` → per-scenario (aggregation/group_by/flatten/edge_cases/pipeline) | ⬜ |
| query tests | `query/tests.rs` (392) per clause | ⬜ |
| mirror splits | `useTabDnD.test.ts` (576) mirrors hooks/lib; `split.test.ts` (526) + `useVaultController.test.ts` (490) per extracted module | ⬜ |

## Phase 5 — Full gate

- [ ] `bun run lint` + `bunx tsc --noEmit` (apps/tauri)
- [ ] `cargo test --workspace` + `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] typing-latency harness if `packages/editor` moved (it did — Phase 1)
- [ ] Flip ADR-038 status → implemented; ✓/✗ tier tables
- [ ] Update AGENTS.md status table + CURRENT_WORK.md