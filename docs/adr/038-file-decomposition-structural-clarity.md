# ADR-038: File Decomposition — Whole-Stack Structural Clarity

## Status

**Implemented (2026-09-08)** — all five phases executed on `feat/adr38-file-decomposition`,
one commit per phase: `3e8036b` (1) · `3147787` (2) · `d40231b` (3) · `1c6d21c` (4) ·
phase-5 gate commit. Tier disposition is stamped inline below (✓ everywhere; the only
planned split not executed is `vault/lib/vaultDnD.ts` — no DnD code exists in the vault
feature, verified at extraction). `docs/file-splitting-plan.md` is the working breakdown.

## Extends

- [ADR-030](030-rust-crates-quality-refactor.md) — its file/module budgets (§2.1) covered
  Rust only; this ADR promotes them to the whole stack and adds TS- and test-specific rules.
- [ADR-007](007-typescript-rust-responsibilities.md) — the split surface between TS and Rust
  is unchanged; decomposition happens inside each layer.

---

## 1. The audit — why "big files" are a structural problem

Full-tree scan of every `.ts`/`.tsx`/`.rs` file (excluding node_modules/target/generated
schema). Findings, by size:

| Tier         | Count     | Definition                          | Verdict                                            |
| ------------ | --------- | ----------------------------------- | -------------------------------------------------- |
| 1 — urgent   | 4 files   | >900 ln, mixed concerns in one file | Split first                                        |
| 2 — high     | 12 files  | 450–744 ln, clear seams exist       | Split                                              |
| 3 — moderate | ~20 files | 300–450 ln                          | Split where seams exist; **Keep** when one concern |
| 4 — tests    | 6+ files  | >350 ln test mods/files             | Extract by scenario/concern                        |

Largest offenders: `graph/components/Graph.tsx` (1359), `block-widgets/table-widget.ts`
(1053), `canvas/CanvasView.tsx` (907), `tabs/store/core.ts` (900), `vault/hooks/
useVaultController.ts` (744), `preview/live-preview.ts` (615), the two WebGL renderers
(596/569), Rust command files (`reorganize.rs` 612, `rename.rs` 586, `move_rename.rs` 573,
`media.rs` 497) and `basalt-tables/tests/complex_queries.rs` (713).

**Root causes, not nits:**

1. **Accretion on working surfaces.** The graph leaf, canvas leaf, and tab store each
   grew one interaction domain at a time inside the component/slice that first shipped;
   no one stopped to extract once the second or third concern landed.
2. **Data-in-code inflation.** Shader sources and CM6 theme CSS are _data_, not logic,
   yet live inside the renderer/widget files (e.g. `packages/graph/src/renderer.ts` packs
   ~200 lines of GLSL plus three programs plus the class; `table-widget.ts` packs ~215
   lines of theme CSS).
3. **Rust commands bundle impl + helpers + tests.** `reorganize.rs`, `rename.rs`,
   `move_rename.rs` each carry 150–230-line `#[cfg(test)] mod tests` inline, which
   doubles the apparent size of an otherwise moderate module.
4. **Hook composition flattened.** `useVaultController.ts` already contains three
   sub-hooks (`useVaultClipboardState`, `useVaultContextMenuState`,
   `useVaultSelectionState`) written inline instead of as sibling modules.

The bar from [AGENTS.md](../AGENTS.md): maintainability 6 months out. A 1300-line
component is un-reviewable: a change to filter logic requires re-reading the entire
interaction surface.

## 2. Decision — whole-stack budgets, module-first

### 2.1 File budgets

- **Production file ≤ ~400 ln soft** (TS) / **>500 ln is a smell**; Rust keeps ADR-030's
  ~450 ln soft. These are tripwires for _mixed-concern_ files, not single algorithms.
- **Component ≤ ~300 ln** of JSX/logic; interaction domains beyond that move to `lib/`
  hooks or child components.
- **One store slice file per concern** (zustand): never a single `StateCreator` body with
  more than ~3 action domains.
- **Test mods >~150 ln extracted** from production files (see §2.4).
- **Data-in-code rule:** shader strings, theme CSS, and other static blobs are data —
  split into their own file _even below the threshold_ when they exceed ~20% of the file.

### 2.2 Module-first

`foo.ts` → `foo/` directory as soon as a second concern exists inside it. Splits follow
responsibility, never line-count alone: `parse` / `html` / `theme` / `widget` /
`state` / `persistence` / `interactions` are the recognized seams. When a file _is_ one
algorithm, keep it whole (see §4).

### 2.3 Import surfaces are frozen

Every split keeps the public surface identical: `features/*/index.ts`,
`packages/*/index.ts`, and Rust module entry points re-export the same symbols. The
registry pattern (ADR-018) means consumers resolve leaves/commands by id — no caller
should see a split. This is what makes the campaign mechanically safe.

### 2.4 Rust test extraction

In-crate `#[cfg(test)] mod tests` blobs move to sibling `*_tests.rs` files included via
`#[path = "..."]` + `#[cfg(test)] mod`, preserving access to crate internals. Tests of
_pure public_ surface become integration tests in `tests/`. `cargo test` output is
unchanged — the split is organizational.

### 2.5 What is NOT in scope

No behavior changes, no renames of public APIs, no perf work, no

formatting churn. This is pure decomposition; every step is verified by the existing
test suite plus lint/type-check.

## 3. The audit — files and their target layouts

### Tier 1 — urgent (>900 ln)

| File                                   | ln   | Split into                                                                                                                                                                                                 | Disposition                                                                   |
| -------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `graph/components/Graph.tsx`           | 1359 | `lib/graphWorker.ts`, `lib/geometry.ts`, `lib/themeColors.ts`, `lib/excerpt.ts`, `lib/persistedState.ts`, `lib/filters.ts`, `lib/localGraph.ts`, `lib/interactions.ts`; component keeps JSX + store wiring | ✅ `d40231b` (engine hook `useGraphEngine.ts` added — worker-entry isolation) |
| `editor/block-widgets/table-widget.ts` | 1053 | `table-parse.ts`, `table-html.ts`, `table-theme.ts`; widget + spec stay                                                                                                                                    | ✅ `3e8036b`                                                                  |
| `canvas/CanvasView.tsx`                | 907  | `lib/useCanvasState.ts`, `lib/useCanvasPersistence.ts`, `lib/useCanvasKeyboard.ts`, `lib/useCanvasSelection.ts`, `lib/useCanvasGuidelines.ts`, `lib/useCanvasModals.ts`                                    | ✅ `d40231b`                                                                  |
| `tabs/store/core.ts`                   | 900  | `core/openClose.ts`, `core/panes.ts`, `core/pin.ts`, `core/persistenceSync.ts`, `lib/ids.ts`; `createCoreSlice` composes them                                                                              | ✅ `d40231b`                                                                  |

### Tier 2 — high (450–744 ln)

| File                                    | ln  | Split into                                                                                  | Disposition                                                   |
| --------------------------------------- | --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `vault/hooks/useVaultController.ts`     | 744 | `useVaultClipboard.ts`, `useVaultContextMenu.ts`, `useVaultSelection.ts`, `lib/vaultDnD.ts` | ✅ `3e8036b` (no DnD code exists → `lib/vaultDnD.ts` skipped) |
| `editor/preview/live-preview.ts`        | 615 | `collector.ts`, `scheduler.ts`, `tag-marks.ts` (engine core stays)                          | ✅ `3e8036b`                                                  |
| `packages/graph/src/renderer.ts`        | 596 | `shaders.ts`, `programs.ts`, `renderer.ts`                                                  | ✅ `3e8036b`                                                  |
| `packages/canvas/src/renderer.ts`       | 569 | same shape (shaders/programs/renderer)                                                      | ✅ `3e8036b`                                                  |
| `tabs/hooks/useTabDnD.ts`               | 512 | `lib/dragState.ts`, `lib/hitTest.ts`, `lib/dropExec.ts`                                     | ✅ `3e8036b`                                                  |
| `editor/controller/EditorController.ts` | 473 | `lib/linkFetch.ts`, `lib/viewEvents.ts` (lite)                                              | ✅ `d40231b`                                                  |
| `shared/editorCommands.tsx`             | 470 | `commands/editorCommands.ts`, `commands/tableCommands.ts`, `commands/devBenchmarks.ts`      | ✅ `d40231b`                                                  |
| `editor/block-widgets/dql-widget.ts`    | 464 | `dql-types.ts`, `dql-html.ts`, `dql-theme.ts`                                               | ✅ `3e8036b`                                                  |
| `commands/assets/reorganize.rs`         | 612 | `rewrite.rs` (embed rewriting), `reorganize_tests.rs`                                       | ✅ `3e8036b`                                                  |
| `commands/notes/rename.rs`              | 586 | `rename_attachments.rs`, `rename_tests.rs`                                                  | ✅ `3e8036b`                                                  |
| `commands/folders/move_rename.rs`       | 573 | `move.rs`, `rename.rs`, `common.rs`, `move_rename_tests.rs`                                 | ✅ `3e8036b`                                                  |
| `commands/media.rs`                     | 497 | `media/server.rs`, `media/http.rs`                                                          | ✅ `3147787`                                                  |

### Tier 3 — moderate (300–450 ln)

Split: `basalt-tables/engine.rs` → `grouping.rs` + `output.rs`; `graph_layout/force_graph.rs`
→ `quadtree.rs` + sim; `basalt-canvas/lib.rs` → `types.rs` + `ser.rs`; `basalt-types/query.rs`
→ `value.rs` + `convert.rs`; `commands/vault/graph.rs` → `cc.rs` (union-find).

Disposition: all five ✅ `3147787`.

Lite (helpers only): `parser/query/parse.rs` (source/expr/plan), `parser/frontmatter.rs`
(`walk.rs`), `editor/frontmatter-widget.ts` (`frontmatter-utils.ts`), `editor/editor.ts`
(`links.ts`), `commands/assets/save.rs` (`infer.rs`), `vault/hooks/useVaultMutations.ts`
(`lib/deleteFlow.ts`), `search/store.ts` (`lib/searchApi.ts`), `ui/TabsBar.tsx`
(`OverflowMenu.tsx`, `DropIndicator.tsx`).

Disposition: all eight ✅ — parse/frontmatter/save `3147787`; the rest `d40231b`;
`frontmatter-utils.ts` pre-existed (`04bf72c`).

Keep whole: `commands/boot.rs`, `tabs/lib/layoutTree.ts`, `shared/useWorkspace.ts`
(architecture mandates a single wiring point), `commands/assets/mod.rs`,
`packages/editor/src/input/table-mutations.ts` (single concern, zero deps).

Disposition: kept as designed ✓.

### Tier 4 — oversized tests

`basalt-tables/tests/complex_queries.rs` (713) → per-scenario files (aggregation /
group_by / flatten / edge_cases / pipeline); `query/tests.rs` (392) per clause;
`useTabDnD.test.ts` (576) mirrors the Tier-2 split; `split.test.ts` (526) and
`useVaultController.test.ts` (490) split per extracted module; Rust test blobs per §2.4.

Disposition: all ✅ `1c6d21c` (tables 56 tests, parser 38, canvas lib tests → `#[path]`
`lib_tests.rs`, TS mirrors verbatim).

## 4. What stays whole — the cohesion rule

These files are large _because_ they are one algorithm or one deliberate surface; splitting
them would add indirection without adding manageability. They get test-blob extraction only:

- `basalt-parser`: `link_rewrite.rs`, `metadata.rs`, `parser.rs`, `inline.rs`
- `basalt-vault`: `indexer.rs`, `tree/build.rs`, `path_utils.rs`
- `basalt-search`: `search_state.rs`, `nucleo_scorer.rs`, `snippets.rs`, `tantivy/index.rs`
- `packages/editor`: `preview/callouts.ts`, `preview/code-blocks.ts`,
  `preview/html-typography.ts`, `input/table-navigation.ts`
- `commands/assets/mod.rs`, `commands/common.rs`, `commands/{notes,folders,dailies,templates}/mod.rs`

## 5. Execution phases and verification invariant

Ordered so each step lands green and the risky work sits on top of proven extraction:

1. **Zero-risk relocations** — shader/program strings, table-widget split, DQL split,
   `useVaultController` sub-hooks, `useTabDnD` internals, Rust test extraction
   (reorganize/rename/move_rename). ✅ `3e8036b`
2. **Rust crate seams** — force-graph quadtree, basalt-canvas types/ser, tables engine
   grouping/output, basalt-types value/convert, vault graph cc. ✅ `3147787`
3. **Feature-layer hooks** — CanvasView (state/persistence/keyboard), Graph lib extraction,
   tabs core slices. ✅ `d40231b`
4. **Test-file splits** — mirror whatever landed above. ✅ `1c6d21c`
5. **Full gate** — ✅ phase-5 commit; results below.

**Verification invariant (every step):** `bun run lint` + `bunx tsc --noEmit` (TS side),
`cargo test --workspace` + `cargo clippy --workspace --all-targets -- -D warnings` (Rust
side), the targeted suite for each touched module, and the typing-latency harness
(ADR-019/020 gate) whenever `packages/editor` moves; 25k Criterion benches for any
perf-claiming step (none expected — this is decomposition).

**Final gate (phase 5):** lint/tsc clean (only the user's in-flight ADR-037 settings WIP
errors remain, pre-existing and untouched); `cargo test --workspace` green (parser 82,
tables 56, tauri 53, canvas 33, graph 8, types 8 — plus doc/ser suites); clippy
`-D warnings` clean; apps/tauri vitest 319/319; packages/editor vitest 34/36 (2
pre-existing `codeBtn` failures, identical on clean HEAD); typing-latency full-stack
p95 = 3.10 ms @ 100 KB (gate ≤ 4 ms, ADR-019).

## 6. Decisions locked

- Scope is all four tiers, executed in the order above.
- Import surfaces never change (§2.3) — this is the acceptance criterion for every step.
- In-crate test extraction via `#[path]` mods; integration tests only for pure public
  surface (§2.4).
- Cohesion rule (§4) is not negotiable within this campaign — files listed there are
  kept unless a later review finds a real second concern.
- Execution is complete (2026-09-08): this ADR's status is flipped to **implemented**, the
  tier tables carry ✓ disposition, and AGENTS.md/CURRENT_WORK.md are updated.
