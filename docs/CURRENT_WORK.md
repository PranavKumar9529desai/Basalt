# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---

## Infinite Canvas (ADR-035) — ARCHITECTURE REVISED (HANDOFF READY)

**Branch:** `feat/adr35-canvas-parse`
**Status:** ADR-035 amended. Initial custom WebGL2 rect viewport + imperative DOM overlay superseded by `@xyflow/react` + Rust backend (`crates/basalt-canvas`) architecture. Detailed technical spec documented in `docs/adr/035-infinite-canvas.md`.

### Handoff Plan: Migration to `@xyflow/react`
- **Dependencies:** Add `@xyflow/react` to `apps/tauri/package.json`.
- **Rust Backend:** Keep `crates/basalt-canvas` for JSON Canvas v1.0 parse/serialize, validation, and file I/O via Tauri (`open_canvas`, `save_canvas`).
- **Data Mapper:** Implement `features/canvas/lib/mapper.ts` (lossless bidirectional conversion between `CanvasDocument` and XYFlow `Node[]`/`Edge[]`).
- **Custom Nodes (`features/canvas/nodes/`):**
  - `TextCardNode.tsx`: Markdown preview + inline edit on double-click, 4-way handles (Top/Right/Bottom/Left), `<NodeResizer />`.
  - `FileNode.tsx`: Note embed card referencing `.md` vault files with title, excerpt, and icon.
  - `GroupNode.tsx`: Translucent container with editable top-left title label, background z-index.
  - `LinkNode.tsx`: Web link bookmark card.
- **Custom Edges (`features/canvas/edges/`):**
  - `CanvasEdge.tsx`: Smooth cubic Bezier curve (`type: "bezier"`) connecting flush to card handles with closed arrowheads (`MarkerType.ArrowClosed`) and midpoint label pill.
- **View & Chrome (`features/canvas/`):**
  - `CanvasView.tsx`: Replace raw canvas rAF loop with `<ReactFlow>` and `<Background variant={BackgroundVariant.Dots} />`.
  - `CanvasToolbar.tsx`: Add card, note, group, and zoom controls.
  - Debounced auto-save back to `.canvas` file via `save_canvas`.
- **Deprecate/Cleanup:** Deprecate `packages/canvas-viewport` and remove obsolete imperative geometry files (`lib/scene.ts`, `lib/interaction.ts`, `lib/spatial.ts`, `lib/overlay.ts`).


## Embed Rendering (ADR-034) — COMPLETE

**Branch:** `feat/adr34-embed-rendering`
**Status:** All five parts committed + docs done; ADR-034 moved Proposed → Accepted
with the implementation appendix. Full suite green: editor tests 196/196, app
tests 275/275, `cargo test --workspace`, oxlint + tsc clean, clippy clean.

### Commits

- `c4bdf8c` Part A/E — `feat(media): Linux embed playback via loopback HTTP
  server + stem-aware resolveAsset`. New `media_server_url` command in
  `apps/tauri/src-tauri/src/commands/media.rs` (`http-range` dep, lazy OnceLock
  bind on `127.0.0.1:0`, per-connection threads, 64 KiB streaming, path-traversal
  guard, 9 unit tests); frontend `app-shell/mediaServer.ts` + `resolveAsset`
  rewrite in `useLeafServices.ts` (stem match over `ws.treeNodes`, unique match
  or null).
- `3c5e191` Part B — `feat(editor): render media embeds inside rich table cells`.
  `table-widget.ts` new `renderInlineCell(text, resolve)` (`EMBED_RE`, real
  `<img>/<video>/<audio>`, `.cm-table-link[data-name]` + `.cm-table-media`);
  reads `resolveAssetFacet` at render time. 5 new tests.
- `cd67988` Part C — `feat(editor): render real media for embeds in live
  preview`. `embed-media.ts` exports `buildEmbedWidget(url, target)`; `embeds.ts`
  swaps the chip for media off the active line; `editor.ts` livePreview group
  gets `EMBED_MEDIA_THEME` + `resolveAssetFacet.of(config.resolveAsset)`.
- `8088178` Part D — `fix(editor): reading-mode wikilink clicks slice brackets;
  bind table links`. `wiki-links.ts` exports `targetFromWikiLinkNode` +
  `normalizeWikiLinkTarget`; `readingLinkHandler` gates `video,audio` →
  `.cm-table-link[data-name]` → `.cm-live-wikilink`. 9 new tests.
- `1e889d2` Part C correction — `feat(editor): render media embeds even with the
  caret on their line`. ADR decided media renders in EVERY caret state
  (Obsidian parity), dropping the WYSIWYM reveal for valid embeds. Broken
  embeds keep the chip AND the caret reveal (raw source under the caret stays
  editable).

### Notes

- `ec856d3` (user's commit, mid-session) swept in the Part W wiring to
  `editor.ts` (livePreview group) + `EditorController.ts` (`resolveAsset`
  passes) — content identical to intent, no redo needed.
- User's concurrent WIP (dql-widget.ts, dql-layout.test.ts, AGENTS.md,
  `crates/README.md`, `crates/basalt-tables/tests/complex_queries.rs`,
  `docs/plan/`) is NOT part of these commits.
- `9f2845f` — debug: instrumented live-preview walk + embed toDOM for scroll
  lag diagnosis (console logs for `toDOM` count, field dispatch path, walk
  timing; removable after diagnosis).

---

## `packages/editor` code-review workstream — DONE (per-phase commits)

**Branch:** `feat/adr34-embed-rendering` (on top of ADR-034)
**Status:** All five phases committed; editor suite green (191/191 excluding the
3 pre-existing `table-widget.test.ts` embed failures owned by the concurrent
session), oxlint + `tsc --noEmit` clean in both `packages/editor` and `apps/tauri`.

### Commits (newest first)

- `00ec6e9` fix(editor): drop stale DQL paints when the widget was replaced
  mid-query — `toDOM` async `.then/.catch` bail when the element is detached or
  the query text no longer matches; query still cached for later renders.
- `1c1f8a2` test(editor): drive live-preview update paths + idle scheduler
  through a real EditorView — lazy-map path (widgetModels preserved by
  reference), >48KB threshold rebuilds, `PreviewScheduler` deferred convergence
  (polling, not wall-clock).
- `ec856d3` feat(editor): route external links through injected opener
  (`openExternalLinkFacet`, Tauri `openUrl`) — never `window.open`.
- `2d88c9b` perf(editor): cap huge-doc parse budget at ~1 frame; scheduler loop
  re-arms while `complete:false` (fixed a latent convergence gap).
- `6c48f6c` perf(editor): region-slice frontmatter parse to the block span, not
  full-doc `toString()`.

### Notes

- `docs/packages-code-review.md` §2/§3/§6/§12 statuses updated for these fixes.
- **Known red on this branch (NOT mine):** `tests/block-widgets/table-widget.test.ts`
  has 3 failing embed tests from the concurrent ADR-034 table-embeds work —
  exclude when running the suite (`vitest run --exclude
  tests/block-widgets/table-widget.test.ts`).
- Concurrent session's untracked files remain: `crates/README.md`,
  `crates/basalt-tables/tests/complex_queries.rs`, `docs/plan/`.

---

## Split Pane Layout Tree (ADR-032) — COMPLETE

**Branch:** `feat/split-pane-layout`
**Status:** All phases implemented and committed; ADR-032 marked complete. Full
suite: 240 tests passing, oxlint + tsc clean.

### Commits

- `43ac869` docs: ADR-032
- `71a0b4c` Phase 1 — layout tree data model (`LayoutNode`, `TabGroup`, `splitLeaf`/`removeLeaf` helpers)
- `af80bd7` Phase 2 — `PaneRenderer` + `SplitPane` components
- `a2bb6cd` / `6ddad1d` Phase 3 — split/close/activate actions + tests
- `63180c0` shell integration; `211c9b3` palette commands + keybindings
- `54e4fd1` housekeeping — `commands.json` pane entries + v2 guard test
- `a9dd3bb` Phase A — `root` + `activePaneId` are the single source of truth (flat `pane` removed)
- `74f6e89` Phase B — split duplicates active tab (distinct id, independent editors); Bug-1 regression test
- `7113b28` Phase C — per-pane tab bars + activate-on-focus
- `af0eed2` Phase D — DnD between panes (`moveTabToPane`, `moveTabToNewPane`, pane-body drop)
- `8d0c923` Phase E — v2 snapshot restores on boot
- `bd6df84` Phase F — `CmdOrCtrl+Alt+W` → `pane:close`

### Previously Deferred — now committed

- ✅ Resize sashes (proportional `size` ratios) — `c52e5b3`
- ✅ Edge-drop split zones (visual drop targets for `moveTabToNewPane`) — `c52e5b3`

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

## Rust Quality-Hardening — ACTIVE

**Branch:** `fix/code-block-height` (user-confirmed working branch for ALL Rust work)
**Commit sequence:** Phases A, 1, 2, 3, 4 all committed.

> NOTE (2026-09-04): The ADR-029 **frontend** workstream (reading-mode search
> preview parity) from a prior session is committed **separately** as `919f3fb`
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
- **Phase 4** `bfd194f` — clippy: `cargo clippy --workspace --all-targets -- -D
  warnings` passes clean. Fixed `Default` impls for `FileMetadata`/`Document`
  (`new()` kept, delegates to `Self::default()` — 21 call sites) and derived
  `Default` for `QueryResult`; moved `[profile.release]` from
  `apps/tauri/src-tauri/Cargo.toml` (was ignored on a workspace member) to root
  workspace `Cargo.toml`; ~60 lint fixes across
  basalt-types/parser/graph/vault/search/tables + the tauri command layer
  (`map_or(false,…)`→`is_some_and`, `split(['|','#'])`,
  `question_mark` in fuzzy loop, `as_chunks::<2>()`, `std::slice::from_ref(&x)`
  instead of `&[x.clone()]`, manual-strip, redundant closures, needless borrows,
  useless `vec!` in tests). Wired **`bun run lint:rust`** (clippy + tests) into
  root `package.json` and added **`.github/workflows/ci.yml`** (frontend + rust
  jobs; repo previously had NO CI). Enabled the previously-dead
  `length_of_list_returns_count` in `basalt-tables/tests/query_execution.rs`
  (`#[test]` added; its matcher expected `Link` but the `file.name` group key is
   `Text` — fixed). `cargo test --workspace` green (207 tests).

### ADR-030 phases completed this session (uncommitted atop `main`)

Closed out most of the ADR-030 plan from Phase 0 where it was left:

- **Phase 0 remainder:** `DqlError` now `#[derive(thiserror::Error)]` in
  `basalt-tables` (`#[from] ParseError`); `FrontmatterValue::property_type()`
  now returns `Option<PropertyType>` — `None` no longer lies as `Text`.
- **Phase 3:** `basalt-search` dropped `anyhow` for a typed `SearchError`
  (`thiserror`, `Io`/`Tantivy` from-variants); silent `let _ = flush_pending()`
  and index failures now log. `NodeId` is a real newtype (`pub struct NodeId(u32)`,
  `Copy`/`Eq`/`Hash`/`Ord`, `#[serde(transparent)]` so `VaultCache` v1 wire and
  graph-wasm are unchanged). `QueryColumn.type_` is now a closed
  `QueryColumnType` enum (snake_case serde — `"text"|"number"|"date"|"checkbox"|"link"|"list"`).
- **Phase 4:** `group_rows` is a HashMap-indexed O(N) grouper (also fixes the
  old cross-type `compare_typed == Equal` conflation — `Number(3)` and
  `Text("3")` no longer share a group); `resolve_asset` uses
  `eq_ignore_ascii_case` (no per-asset `to_lowercase` allocs); `infer_mime_type`
  returns `&'static str`; `arena::get_or_insert` single `to_string()`; `reorder_tree`
  reuses scratch buffers (`order`/`queue`/`reordered`); snippets build one
  `TermMatcher` (AhoCorasick) per query and use `partition_point` (O(log n)) for
  byte→char mapping.
- **Phase 5:** `clippy.toml` added at workspace root (cognitive
  complexity/too-many-args/type-complexity thresholds); `basalt-search` added to
  workspace members so CI (`cargo clippy/test --workspace`) covers it.
- **Verify:** `cargo test --workspace` green (206 tests incl. 16 search,
  25 tables), `cargo clippy --workspace --all-targets -- -D warnings` clean,
  `cargo fmt --all --check` clean, graph-wasm + frontmatter-wasm compile.

### Phase 2 — value-type unification (DONE this session)

`TypedValue` + `FrontmatterValue` collapsed into one internally-tagged
`TypedValue` in `basalt-types` (ADR-030 Phase 2). `FrontmatterValue` is now a
type alias. One shared YAML converter `yaml_to_typed` (date + datetime +
wikilink classification) lives in `query.rs`; the parser's `yaml_to_value`/
`infer_string`/`is_iso_*`/`first_wikilink_target` were deleted in favour of it.
`DateTime` variant added (serde `datetime`) for frontmatter date-times;
`GroupKey::from_typed` folds it onto `Date`. `None` → `Null` (`{"type":"null"}`).

Wire contract verified by a serde round-trip test asserting the exact
internally-tagged JSON (`{"type":"text",…}`, `{"type":"link","name","path"}`,
…), matching `features/editor/types/query.ts`. Frontmatter `Link("target")` now
maps to `Link { name, path }` (path = name).

Frontmatter-wasm + graph-wasm rebuilt; `packages/editor` mirrors rewritten to
the internally-tagged shape: `types.ts` (`FrontmatterValue` union),
`frontmatter-utils.ts` (`isNullValue`/`valueType`/`frontmatterValuesEqual` +
test), `frontmatter-widget.ts` (`displayValue`/`inferValue`/`coerce`),
`frontmatter-icons.ts`, and `features/editor/lib/frontmatter.ts`
(`serializeFrontmatterValue`).

**Note:** the branch has since been merged to `main` (`35d985d`); this phase's
work is uncommitted atop `main`.

### Phase 5 — test parity (PLANNED, not started)

- wasm-bindgen tests for `frontmatter-wasm` + `graph-wasm` (note both use
  `#[wasm_bindgen_test]` internally and are built standalone via scripts hex).
- Inline unit tests for `basalt-tables` engine/expr internals.

### Pending (separate workstream, coordinate with user)

- `test/editor-testing` render-mode fix + table fix (untracked `render-mode.ts`
  + committed test) — NOT part of Rust commits; confirm branch first.

---

## Previous Work (completed, for context)

See git log for completed features: ADR-023 (inline title + rename), editor
performance campaign (ADR-019/020, p95 = 4ms @ 100KB), graph view (ADR-021),
DQL query engine (ADR-027/028). All merged to main.
