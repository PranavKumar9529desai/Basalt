# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---
## ADR-048 Native Task Management — MERGED to main ✅ (2026-09-10)

**Merged:** fast-forward `ccc7e63..16e3c78` onto `main` (2026-09-10); branch
history: `f186845` Phase 1 scanner/data model · `6448b11` Phase 2 query
engine+IPC · `9b9fecd` Phase 3 ```tasks block widget · `02618e2` Phase 4
signifier decorations · `da94ab6` Phase 5 module split · `5043730` Phase 5
create/edit modal · `16e3c78` Phase 6 settings/commands/keybindings.

**Goal:** Native task management (kanban explicitly EXCLUDED by user). Scope:
Rust query engine + Tauri IPC, ```tasks block widget, editor signifier
enhancements, create/edit modal, settings + commands + keybindings.
**Note:** The prior CURRENT_WORK note ("cargo test --workspace fails in
basalt-tables — user WIP urgency.rs/output.rs") is now RESOLVED — that WIP was
this work; deps added, `output.rs` rewritten, all crates pass.

### Phase 1 — Rust scanner + data model ✅
- `crates/basalt-types/src/task.rs` — `TaskData`, `TaskStatus`, `TaskPriority`
  (30+ tests)
- `crates/basalt-types/src/metadata.rs` — `FileMetadata.tasks: Vec<TaskData>`
  with `#[serde(default)]`
- `crates/basalt-parser/src/task_scan.rs` (719 lines) — checkbox scanner +
  signifier parsing (priority `⏫🔺🔼🔽⏬`, status `✅/🟢/🟡/🟠/🔴/⛔`,
  dates `📅 🛫 ⏳ ✅ created` via `YYYY-MM-DD`, tags `#tag`, recurring `🔁`),
  integrated into `scan_body_tokens_ascii/unicode` in `metadata.rs`

### Phase 2 — Query engine + Tauri IPC ✅
- `crates/basalt-tables/src/urgency.rs` — urgency score (11 tests)
- `crates/basalt-tables/src/output.rs` — `execute_task_query(vault,
  Option<&TaskQuery>)`, `task_to_row`, `matches_filter`, `sort_tasks`,
  `collect_all_tasks`, `task_columns` (full + short modes); 10 output columns:
  File/Path/Line/Description/Status/Priority/Due/Scheduled/Tags/Urgency
- `crates/basalt-tables/src/engine.rs` (line 307) — `QueryType::Task =>
  execute_task_query(vault, None)`
- `apps/tauri/src-tauri/src/commands/tasks/` — 5 commands: `get_tasks`,
  `toggle_task`, `create_task`, `update_task`, `get_task_line`. **Module split
  (Phase 5):** `commands/tasks/{mod,line,signifiers,serializer}.rs` — the
  700-line monolith is GONE; signifier parsing, line parsing, and line
  serialization are separate files.
- `apps/tauri/src-tauri/src/{commands/mod.rs, lib.rs}` — wired into handler list
- `crates/basalt-tables/tests/task_query.rs` — 12 integration tests
- **Gate passed:** `cargo test --workspace` + `cargo clippy --workspace
  --all-targets -- -D warnings` both clean BEFORE the TS phase

### Phase 3 — ```tasks block widget (packages/editor) ✅
- `src/block-widgets/task-query-types.ts` — TS mirror of TaskQuery/TaskFilter/
  TaskSort + `RunTasksQueryFn` + `TaskDisplayOptions` + `ParsedTaskQuery`
- `src/block-widgets/task-query-parser.ts` (401 lines) — line-based instruction
  parser: done/not-done, status, priority (above/below/is/in), dates with
  relative tokens (today/tomorrow/yesterday/this|next|last week), no-due-date/
  exists, description/tags/path/folder/filename, recurring/blocked, sort/group/
  limit, display options (short mode, hide X, show urgency). Unsupported lines
  collected into `unsupported[]` for a footer warning.
- `src/block-widgets/task-query-html.ts` — renders the 10-column result as a
  task list: checkbox icons, priority badges, date chips, tag pills, urgency,
  backlink links. Client-side grouping on `query.groups[0]`.
- `src/block-widgets/task-query-theme.ts` — `TASK_WIDGET_THEME` via
  `EditorView.baseTheme` with `--sat-*` tokens
- `src/block-widgets/task-query-widget.ts` — `TaskQueryWidget` + 
  `taskQueryBlockSpec`; detects `tasks`/`task` fenced langs, parses, caches by
  `${todayKey()}::${body}` (relative-date expiry at midnight), `getTasksQueryFacet`
  injection, code-toggle button in live mode, null span when caret in block
- `src/block-widgets/dql-types.ts` — added `list` TypedValue variant AND
  `"list"` to `QueryColumn.type` (Tags columns arrive as list cells)
- `src/block-widgets/dql-html.ts` — `renderCellHtml` `list` case added
  (`.map(renderCellHtml).join(", ")`)
- `src/editor.ts` — `commonBlockWidgetExtensions(config?)` gained
  `runTasksQuery` param; registers task spec/theme/facet when provided;
  forwarded through `createEditorExtensionGroups`, `readingExtensions`,
  `readingModeExtras`
- `src/index.ts` — exports: `taskQueryBlockSpec`, `TASK_WIDGET_THEME`,
  `clearTaskQueryCache`, `getTasksQueryFacet` + 6 types
- `src/preview/code-blocks.ts` — **critical live-preview fix**: 
  `handleCodeBlockNode` only passed `dql`/`dataview`/`mermaid` through to the
  block-widget walk; added `tasks`/`task` to the allowlist or ```tasks blocks
  render as raw code chrome in live mode (found via e2e test; READ THIS if
  results don't render in a new surface)
- Feature wiring: `features/editor/hooks/useNoteIO.ts` (`runTasksQuery`
  → `invoke("get_tasks", { query })`), `controller/EditorController.ts` +
  `.test.ts` (NoteIO interface + fixture)
- Tests: `task-query-parser.test.ts` (22), `task-widget.test.ts` (9, incl.
  e2e through `createEditorExtensions` in reading+live modes),
  `public-api.test.ts` snapshot updated; editor suite 314/314 at the time

### Phase 4 — Editor signifier decorations + status cycling ✅
- `features/tasks/` canonical layout: `index.ts`, `types.ts`, `lib/commands.ts`
  (toggle + cycle-status via CM6 transaction, no IPC in hot path),
  `lib/task-icons.ts`, `hooks/useTaskActions.ts`, `components/TaskBadge.tsx`,
  `components/TaskDateChip.tsx`
- `packages/editor/src/input/task-signifiers.ts` — pure-TS signifier parser
  (mirror of Rust scanner), zero allocations per visible range

### Phase 5 — Create/Edit modal ✅
- **Rust fixes (committed in the module-split commit `da94ab6`):**
  - `priority_to_signifier` emits ADR-048 §2.3 canonical emoji
    (`⏫/🔼/🔽/⏬`); legacy `🔴/🟡/🔵/⬇️` + p0–p4 read for compat
  - start/scheduled swap: `🛫`→start, `⏳`→scheduled (matches Phase 1
    scanner + TS parser); `CreateTaskInput`/`UpdateTaskInput` both carry
    `start`
  - `?` checkbox char ↔ `on_hold` status round-trip
  - multi-token recurrence: `🔁every 2 weeks on Friday` absorbed as one
    rule via byte-offset slicing
  - **description-stripping fix:** `parse_task_line_parts` returns only
    plain-text description (signifiers are leaf suffixes) — fixes
    `get_task_line` prefill double-serialization AND `update_task` fallback
  - `build_task_line_from_parts` takes a `TaskLineParts` struct
    (clippy too_many_arguments)
- `features/tasks/store.ts` — `useTaskModalStore` (isOpen/mode/editTarget)
- `features/tasks/components/CreateTaskModal.tsx` — shadcn Dialog; fields:
  Description, Status (edit-only), Priority, Due/Scheduled/Start (native
  date inputs), Recurrence (presets + custom), Tags (chips). Validation:
  description required; recurrence needs ≥1 date. Props
  `getActivePath`/`onTaskCreated` injected from Shell (no cross-feature
  imports)
- `features/tasks/lib/commands.ts` — `tasks:create` + `tasks:edit`
  registered (edit resolves path+line via shell-injected `setTaskContext`)
- Shell/Overlays wiring: `setTaskContext` effect in `Shell.tsx`; lazy
  `CreateTaskModal` in `Overlays.tsx`
- `packages/commands` — 4 tasks entries in `commands.json`
  (create/edit/toggle/cycle-status) + `IconCheckbox`/`IconRefresh`
- Tests: 11 Rust module tests (including round-trip), 8 modal tests
  (create/edit round-trip, validation, tags, escape)
### Phase 6 — Settings + Commands + Keybindings ✅
- 8 task settings in `settings-data.ts` (`tasksGlobalFilter`,
  `tasksDefaultPriority`, `tasksDoneDateAutoAdd`, `tasksCancelledDateAutoAdd`,
  `tasksCreatedDateAutoAdd`, `tasksStatusSequence` (comma-separated string),
  `tasksNewTaskPosition`, `tasksRemoveScheduledOnRecurrence`) + `specs/tasks.ts`
  (8 items) wired into `specs/index.ts` CORE_SPECS, the registrations.ts
  plugin loop, and `CorePluginsSection.tsx` roster (IconCheckbox)
- 4 new commands: `tasks:set-priority` (IconFlag), `tasks:set-due-date` +
  `tasks:set-scheduled` (IconCalendarEvent) → open the modal in edit mode at
  cursor via extracted `openEditAtCursor` helper; `tasks:postpone`
  (IconCalendarOff) → CM6 dispatch replacing `📅YYYY-MM-DD` with tomorrow
  (local-time ISO) or appending it
- Keybinding: `CmdOrCtrl+Enter` → `tasks:toggle` (`when: editorFocused`;
  hotkey parser lowercases key, matches Enter)
- Gate green: app vitest 362/362, editor vitest 337/337, cargo test --workspace
  clean, clippy clean, `bun run lint` + both tsc clean

### Key decisions (respect these)
- `execute_task_query` bypasses the DQL WorkRow pipeline — iterates vault
  metadata directly
- `matches_filter(path, task, filter)` — path/folder/filename predicates need
  the source path; signature takes it first
- Date-range semantics: `due this week` → two inclusive filters
  (`on_or_after` start + `on_or_before` end); `before/after this week` → single
  bound
- Bare relative dates (`due tomorrow`) = equality ("on")
- Display options are frontend-only — parsed alongside query, never sent to Rust
- Cache key `${todayKey()}::${body}`; `clearTaskQueryCache()` exported for tests
- Module split: `commands/tasks/` is a directory module; NEVER rebuild a
  700-line monolith (repeated surgical edits corrupted it)
- Simpler description semantics: description = text before the FIRST
  signifier token (signifiers are leaf suffixes in the canonical layout)
- App vitest: `bun run test` (NOT `bun test` — that runs Bun's runner without
  jsdom/vi.mocked and shows bogus failures)
- `local/adr048-plan.md` is scratch; `local/` is gitignored scratch space

### Commands
```bash
cd packages/editor && bunx vitest run          # editor test suite (337/337)
cd packages/editor && bunx tsc --noEmit        # editor types
cd apps/tauri && bun run test                  # app vitest (362/362)
cd apps/tauri && bunx tsc --noEmit             # app types
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
bun run lint                                   # oxlint at repo root
```


---

## Obsidian Excalidraw plugin compat — COMPLETE ✅ (2026-09-10)

**Bug:** `.excalidraw.md` files created by Obsidian's Excalidraw plugin opened
blank in Basalt. Root cause: ALL real plugin files store the scene as an
LZString `compressed-json` base64 block inside `## Drawing` — the parser only
handled raw `json` fences and returned `EMPTY_DRAWING_JSON`.

**Fix — per-format parse dispatch, mirror in Rust + TS:**

- `src-tauri/src/core/drawing.rs` → `core/drawing/` directory module:
  - `mod.rs` — `DrawingPayload`, `EMPTY_DRAWING_JSON`, `extract_text_elements_from_json`,
    frontmatter helper, dispatcher (`parse_drawing_content`: pure JSON →
    Basalt hybrid → Obsidian hybrid → empty fallback), `serialize_drawing_markdown`,
    `atomic_write_file`
  - `basalt.rs` — native `.drawing.md` (`%%#drawing-data` + `# Drawing Text & Elements`)
  - `obsidian.rs` — `is_obsidian_excalidraw_format`, `parse_obsidian_excalidraw`,
    `serialize_obsidian_markdown` (Drawing-block-only replacement), and a faithful
    LZString `decompress_from_base64` port (~100 lines, 5-bit BitReader, surrogate-aware
    code-unit→String conversion, JSON validation on decompressed payload)
- `apps/tauri/src/features/drawing/lib/`:
  - `obsidianFormat.ts` — TS mirror importing `lz-string` (added as direct dep to
    `apps/tauri/package.json`)
  - `parser.ts` — old inline `extractDrawingJson` soup deleted; clean 3-way dispatcher
- **Save preservation:** `save_drawing` detects Obsidian format and rewrites ONLY the
  `## Drawing` fenced block (as an uncompressed `json` fence — the plugin reads both),
  keeping `# Excalidraw Data`, `## Text Elements`, warning banner, and all user markdown
  byte-for-byte. Auto-save on a Basalt-format file is unchanged.
- **Text-element bullets:** stacked `^blockref` suffixes stripped for search/indexing.

**Verified:** real user vault file decompresses to a valid Excalidraw v2 scene
(3 elements, all `isDeleted: true` — genuinely empty drawing). Rust: 69 tauri
tests pass, clippy `-D warnings` clean. TS: 9 drawing tests pass (includes real
compressed fixture round-trip), oxlint 0, `tsc --noEmit` clean.

**Note:** `cargo test --workspace` currently fails in `basalt-tables` — pre-existing
user WIP (`urgency.rs`, `output.rs` reference `chrono`/`serde` without deps). Unrelated
to this work; left untouched.

**Follow-up:** `## Text Elements` bullets are preserved but not re-synced from the
scene on save (plugin re-syncs on its own save; see `serialize_obsidian_markdown`
comment). Element Links / Embedded Files sections also untouched by design.

## Rust Crate Hygiene & Deslop Refactoring (2026-09-09) — COMPLETE ✅

All 8 phases completed with dedicated commits, verified against full workspace test suite and clippy zero-warning gate:

1. **Phase 0** (`f704e2f`): Conventions prevention layer (§12.8–§12.12 in `CONVENTIONS.md`).
2. **Phase 1** (`21b5e6d`): Shared path utilities consolidated in `basalt-types` (`crates/basalt-types/src/path_utils.rs`); deleted duplicate `crates/basalt-vault/src/utils.rs`.
3. **Phase 2** (`52979ba`): `TypedValue` comparison operations and temporal parsing moved to `basalt-types` (type owns its operations); `chrono` moved to `basalt-types`.
4. **Phase 3** (`ce4fca1`): Unified YAML frontmatter fence parsing across crates on `fm_bounds` / `frontmatter_body_offset`.
5. **Phase 4** (`991cd3b`): Consolidated wikilink parsing in `basalt-parser` (`parse_obsidian_link`, `extract_target`).
6. **Phase 5** (`fb094d1`): Error style normalized (lowercase without periods, eliminated double prefix in `DqlError::Parse`).
7. **Phase 6** (`82fab98`): Isolated `basalt-graph` scope by moving `fuzzy_match` and `search_commands` to `basalt-search`.
8. **Phase 7** (`c30c1c6`): Internal cleanup (generic `HeapNode<const DESC: bool>`, `register_relationship` in `asset_index`).
9. **Phase 8**: Full verification gate passed (`cargo test --workspace` [286+ tests pass], `cargo clippy --workspace --all-targets -- -D warnings` [0 warnings], `bun run lint` [0 warnings/errors], `tsc --noEmit` [clean]).

---

## Frontend & Packages Hygiene & Deslop Refactoring (2026-09-09) — COMPLETE ✅

**Branch:** `refactor/frontend-packages-hygiene`

All 5 phases completed with dedicated commits, verified against full frontend & packages test suites and zero-warning linter gate:

1. **Phase 1** (`37891ee`): Shared Path Utilities Consolidation:
   - Implemented canonical path helpers in `packages/ui/src/lib/paths.ts` (`basename`, `stemOf`, `isMarkdownPath`, `isCanvasPath`, `isDocumentPath`, `normalizePath`) with unit tests (`paths.test.ts`, 14 tests).
   - Re-exported from `@workspace/ui` root and migrated 10+ call sites across `canvas`, `graph`, `search`, `tabs`, `vault`, `shared`, and `packages/ui`.
2. **Phase 2** (`a4661d6`): Dead Package & Code Cleanup:
   - Deleted deprecated legacy `packages/canvas` (superseded by `@xyflow/react` per ADR-035).
   - Cleaned package dependencies and regenerated `bun.lock`.
3. **Phase 3** (`e1958e6`): Feature Layout & File Organization:
   - Standardized command registrations into `features/<name>/lib/commands.ts` across `canvas`, `search`, `settings`, `templates`, and `export`.
   - Relocated non-component context definitions (`CanvasContext.ts`) from `components/` into `lib/`.
4. **Phase 4** (`4987cda`): Export & Naming Normalization:
   - Converted settings section components (`CommunityPluginsSection`, `CorePluginsSection`, `HotkeysSection`) from default exports to named exports.
   - Converted canvas nodes, edges, and helpers (`GuidelineLines`, `CanvasEdge`, `CardHandles`, `GhostCardNode`, `GroupNode`, `LinkNode`, `TextCardNode`, `FileNode`) to named exports (`export const Component = memo(...)`).
   - Removed duplicate default exports and fixed import references across consumers.
5. **Phase 5** (`a50eb78`): Codify Conventions & Agent Rules:
   - Updated `CONVENTIONS.md`: Added §1.8 (Standard Feature Layout), §2.5 (Downward-Only Layer Direction), §4.4 (Component Named Exports), and §13 (Shared Frontend Utilities `@workspace/ui`).
   - Updated `AGENTS.md` and `apps/tauri/AGENTS.md`: Codified downward-only layer dependencies, named exports, and shared path utility rules.
6. **Full Verification Gate**:
   - `oxlint`: 0 warnings, 0 errors across 488 files.
   - `apps/tauri`: 44 test files, 345 passing tests.
   - `packages/ui`: 1 test file, 14 passing tests.
   - `packages/editor`: 34 test files, 280 passing tests.
   - `cargo test --workspace`: all suites passing (basalt_vault 52, tauri_lib 54, basalt_types 8, etc.).
   - `tsc --noEmit`: Clean.

---

## Benchmark & ADR-040-046 gate verification - ACTIVE

**Status:** ADR-040-046 implementation is in the tree (source-verified
2026-09-09, table below). Implementation phase closed; active workstream is
measurement: fresh Criterion baseline, per-ADR gate check, then the ADR-046
remainder.

### ADR implementation state (source-verified 2026-09-09)

| ADR                                  | Code                                                                                                                                                                | Gate                             | Gate status                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| 040 typing latency                   | ✅ `packages/editor/src/preview/` — switch dispatch, O(1) code-block cursor, heading-7 bypass, deco caches, pre-allocated list widgets, 48KB lazy path + hysteresis | p95 ≤ 2.0 ms @ 100 KB            | ⏳ optimizing & benchmarking               |
| 041 zero-AST parser + SIMD           | ✅ `crates/basalt-parser` — memchr3, ASCII Tier-1, SpanCursor Tier-2, in-place dedup                                                                                | >500k notes/s @ 25k              | ❓ unverified                              |
| 042 parallel indexing + binary cache | ✅ `basalt-vault` Rayon map-reduce, deferred hashing, `BSLT` bincode cache (magic + atomic rename)                                                                  | ≤250 ms cold / ≤15 ms warm @ 25k | ⏳ unverified                              |
| 043 full-text + fuzzy search         | ✅ `basalt-search` MmapDirectory BM25, nucleo two-stage, SIMD snippets, 10s commit                                                                                  | switcher < 16 ms                 | ❓ unverified                              |
| 044 graph WASM force sim             | ✅ sim + Barnes-Hut + C-ABI wasm + WebGL2 + double-buffer + binary IPC `decodeBinaryGraphSnapshot`                                                                  | graph_step 25k ≤ 16.6 ms         | ✅ 13.70 ms + binary IPC wired             |
| 045 DQL engine                       | ✅ `basalt-tables` Schwartzian sort, streaming top-K heap selection, predicate push-down, 3VL                                                                       | sub-15 ms @ 25k claim            | ⏳ stream top-k heap selection implemented |
| 046 two-tier boot                    | ✅ Complete — instant O(1) warm boot (<20ms) + `fast_scan_flat_tree` + fused worker (`core/indexing.rs`) + background mtime sync + progress toast                   | boot ≤ 60 ms cold / ≤ 20 ms warm | ⏳ implemented, measuring                  |

### Benchmark process (this session)

1. `cargo bench --workspace -- --save-baseline adr040-046` — full release run
   ≈ 24 min (running via `hub` process `bench`).
2. Diff vs the 2026-09-08 baseline (`docs/performance-baseline.md`);
   confirm/refute flagged `index_walk/5000` +73%.
3. Verify gates: parse 25k, index cold/warm, DQL 25k, graph_step 25k.
4. Frontend gates need the app: typing p95 via `dev:editor-benchmark`, search
   via `dev:search-benchmark` (DEV-gated; prod numbers need `VITE_BENCH`
   relaxation).
5. Update `docs/performance-baseline.md` rows with fresh numbers; report.
6. ADR-046 remainder after gates: fused progressive worker `core/indexing.rs`
   (parse once → NoteGraph + Tantivy batch-by-batch), search banner + graph
   progress state, Tier-2 cache save.
7. Not started: Rust batched IPC; plugin host (ADR-018 Phase 5).

## Branch merge — `feat/adr039-mermaid-math` → `main` (2026-09-08)

**Status:** Merged. The branch carried every feature workstream since the
ADR-038 gate; all landed on `main` in one fast-forward (see commits below).
Check the post-merge gate (`bun run lint && bunx tsc --noEmit`, app vitest,
`cargo test --workspace`, clippy `-D warnings`) before further work.

### What merged (bottom → top)

- **File DnD** (`9a6b25a`, `96a346c`, `f2ecfb1`) — tree → editor `[[wikilink]]`
  at caret; tree → canvas file node; pointer-events machinery in
  `shared/fileDnd/` (WebKitGTK fires no HTML5 `dragstart`).
- **ADR-039 math/mermaid** (`c1a129f`…`b856177`) — mermaid + KaTeX widget
  registry, strict securityLevel, content-keyed cache, phase-5 test gate.
- **Backlinks** (`49b35bf`) — context snippets + link resolution + panel.
- **Brand/typography** (`f7636b4`) — typography architecture + volcanic theme
  - asset suite.
- **Tags** (`e514979`) — Tags dock + tantivy `tag:` operator + clickable
  `#tag` pills → prefilled search. Includes a mid-refactor restore of the
  `get_graph`/`autocomplete_links`/`autocomplete_tags` invoke registrations
  (TS still calls all three).

### Gate evidence (pre-merge, working tree)

tsc + oxlint clean; app vitest 335/335 (+ TagsSidebar 5/5, packages/editor
274/274); `cargo test --workspace` green (basalt_vault 46, tauri_lib 53,
basalt_types 8, tables suites); clippy `-D warnings` clean. One QuickSwitcher
timeout on a shared-CPU run proved to be load flake (passes in 1.7 s solo).

### Remaining known debt

- Rust batched IPC; plugin host (ADR-018 Phase 5) — both still `⏳ Not
started` on the status table.
- Untracked agent scratch (brand assets) was never committed into the branch.

## File drag-and-drop (tree → editor, tree → canvas) — COMPLETE + survey

**Branch:** `feat/adr039-mermaid-math` (on top of user's ADR-039 WIP)
**Status:** Two commits landed; remaining DnD surfaces surveyed below.

### Commits

- `9a6b25a` `feat(dnd): drag notes from the file tree into the editor` —
  tree file rows arm a pointer-drag (WebKitGTK fires no HTML5 `dragstart`;
  same reason tab drags use pointers); past the 5px threshold a floating
  ghost follows the cursor; dropping over a CM6 pane inserts `[[stem]]` at
  the caret. Source: `packages/ui` `FileTreeNode` `onDragStart` prop; vault
  adapter maps `FileNode → FlatTreeNode` + `DraggedFile`;
  `shared/fileDnd/` (state, `useFileDrag`, ghost, `dispatchFileDrop`);
  `EditorControllerRegistry.forEach` to resolve the pane under the cursor.
- `96a346c` `feat(dnd): drop file-tree notes onto the canvas as file nodes` —
  `features/canvas/lib/canvasDrop.ts` per-pane registry (keyed
  register/unregister, rect hit-test); `CanvasView` threads `paneId` +
  `containerRef`, converts the screen point via
  `reactFlowInstance.screenToFlowPosition`, creates a `canvasFile` node at
  the drop (same shape as picker/native-drop paths); `drop.ts` routes
  `.react-flow` hits there.

### Verification

8 new tests (3 drag-state, 2 editor-drop, 3 canvas-drop registry).
`bun run lint` clean; `bunx tsc --noEmit` reports only the PRE-EXISTING
ADR-039 WIP error in `packages/editor/src/syntax/registry.ts` (`markdownMath`
not exported by `@codemirror/lang-markdown` — user's uncommitted work, proven
by stash test to fail identically without our changes); full app suite 290
pass, the same 5 editor/search suites crash on that WIP import (0 test
failures). GUI smoke not run (native Tauri window).

### DnD surface survey — where else we need it

Priorities for Obsidian parity, reusing `shared/fileDnd` (source-agnostic:
any row/list can arm `useFileDrag` with a `DraggedFile`; `dispatchFileDrop`
already routes editor + canvas):

1. **Tree → folder to move** (HIGH value, MEDIUM cost). Today moving a note
   is context-menu → rename/move dialog. Drop a file row onto a folder row
   (or between rows) → Rust `folders::move_rename` (exists). Needs a
   tree-internal drop target + hover affordance; DISABLES HTML5-native
   tree-drag conflicts.
2. **Search results → editor `[[wikilink]]`** (HIGH value, LOW cost). Search
   result rows already know the note path; arm drag →
   `dispatchFileDrop` works unchanged. Same for backlinks and graph nodes.
3. **Tree tab → pane/tab bar to open there** (MEDIUM, MEDIUM). Drag a note
   onto a tab pill or pane body to open it in that pane (split semantics).
   Reuses tab DnD drop targets partially.
4. **OS file/URL → editor embed/link** (MEDIUM, LOW). Native HTML5 drops
   INTO the app do fire on Linux; a CM6 `domEventHandlers.drop` can insert
   `![[embed]]`/link. Paste-image already proves the insert path.
5. **OS file → canvas** (MEDIUM, LOW). Canvas `onDrop` already handles this
   (native event) — verify/unchanged.
6. Deferred: editor → tree drag-out (renderer complexity, low value); canvas
   node → editor link (context menu suffices).

Not committed here: nothing beyond the two feature commits; user's ADR-039
WIP (AGENTS.md, `packages/editor/*`, `packages/theme/*`, `packages/ui
globals.css`, `scratch/`, `scripts/generate-brand-assets.py`) untouched.

## Settings system (ADR-037) — COMPLETE

**Status:** Registry-driven settings modal implemented per ADR-037 + the UI
spec (`docs/specs/settings-ui-and-architecture.md`, checklist §7 fully ticked).
Branch `main`, uncommitted.

- **Registry + nav:** `settingsRegistry` (orders + `pluginEnabled` predicates)
  drives a 240px `SettingsNav` sidebar — OPTIONS / CORE PLUGINS / COMMUNITY
  PLUGINS groups, icons, active pill, Deep Search with per-section match-count
  badges; modal store holds `isOpen/activeSection/searchQuery`.
- **Sections:** general / appearance / editor / files-links / templates /
  dailies are declarative `SettingItemSpec[]` (rendered via `SettingsFields`,
  matched substrings highlighted); hotkeys = virtualized command list with
  one-shot key recorder, conflict detection, reset/unbind, persistence;
  `CorePluginsSection` manager (8 plugins, gear → plugin tab, enable toggle
  gates tab visibility); `CommunityPluginsSection` empty state (host not built).
- **Keybindings service:** overrides + unbound sets, `setCustomBinding`/
  `unbind`/`resetBinding`/`conflictsWith`, persisted to localStorage
  `basalt.hotkey-overrides` (5 new tests).
- **Effects:** `AppearanceEffects` (mounted in `main.tsx`) applies accent color,
  font family, font size, zoom to `--sat-*` tokens / `html` style.
- **Persistence:** unchanged Rust `get_settings`/`set_setting` multi-tier store.

**Verify:** oxlint clean, `apps/tauri` tsc clean, vitest 319/319 (app) + 31/31
(keybindings, 5 new). GUI smoke not run (native Tauri window).

**Known follow-ups (out of scope by design):** editor settings (vim mode etc.)
persist but are not yet consumed by the editor; `enabledPlugins` gates
settings-tab visibility only — real plugin lifecycle lands with the plugin
host (ADR-018 Phase 5, ADR-036 follow-up); community plugin install/listing
waits for the host; account/license rows are `deferred()` placeholders.

---

## File decomposition (ADR-038) — COMPLETE (merged to main)

**Status:** All five phases done, merged to `main` via fast-forward at `bf5ba88`,
one commit per phase, zero behavior/API change — import surfaces frozen (entry
barrels re-export identical symbols; outside consumers untouched). User's
ADR-037 settings WIP (`src/features/settings/**`, `docs/adr/037*`,
`docs/specs/`) was never staged into these commits.

- **Phase 1** `3e8036b` — zero-risk relocations: `table-widget.ts` → `table-parse/html/theme`,
  `dql-widget.ts` → `dql-types/html/theme`, `live-preview.ts` → `collector/scheduler/tag-marks`
  (engine 615→196; `previewScheduler(field)`/`tagMarksPlugin(field)` factories break the
  module cycle), both WebGL renderers → `shaders.ts`+`programs.ts`, `useVaultController`
  sub-hooks, `useTabDnD` internals, Rust test-blob extraction (`reorganize/rename/move_rename`
  - shared `temp_vault` → `commands/common_tests.rs` — clears the old command-refactor
    backlog item below).
- **Phase 2** `3147787` — Rust crate seams: `force_graph.rs` → `quadtree.rs`+sim,
  `basalt-canvas/lib.rs` → `types.rs`+`ser.rs` (450→188), `basalt-tables/engine.rs` →
  `grouping.rs`+`output.rs`, `basalt-types/query.rs` → `value.rs`+`convert.rs`, vault
  `graph.rs` → `cc.rs`, `assets/save.rs` → `infer.rs`, `media.rs` → `media/{mod,server,http}.rs`
  (LazyLock per repo rule), parser `query/parse.rs` → `source/expr/plan` + `frontmatter.rs`
  → `walk.rs`.
- **Phase 3** `d40231b` — feature-layer hooks: `CanvasView.tsx` 907→242 (6 `lib/useCanvas*`
  hooks; persistence owns `nodesRef/edgesRef` breaking the state↔persistence cycle),
  `Graph.tsx` 1359→340 (`lib/` engine/worker/geometry/theme/excerpt/filters/localGraph/
  interactions/persistedState + justified `useGraphEngine.ts` — worker entry must stay
  isolated), tabs `core.ts` 900→36 (`core/{openClose,panes,pin,persistenceSync}` + `lib/ids.ts`),
  `shared/editorCommands.tsx` 470→9 (`commands/` split), editor links → `links.ts`,
  `EditorController` → `lib/{linkFetch,viewEvents}`, vault `deleteFlow.ts`, search
  `searchApi.ts`, `TabsBar.tsx` 449→345 (`OverflowMenu.tsx` + `DropIndicator.tsx`).
  Lint debt introduced by extraction fixed (stable refs/setters added to dep arrays;
  per-render `colorContext` read through a ref in the mount effect).
- **Phase 4** `1c6d21c` — test-file splits, zero assertions changed: tables
  `complex_queries.rs` → 5 per-scenario files + `tests/common/` (56 tests), parser
  `query/tests.rs` → per-clause `tests/` submodules (38), canvas lib tests → `#[path]`
  `lib_tests.rs` (11), tabs/vault TS mirrors + `testUtils` helpers (verbatim).
- **Phase 5** — full gate (below) + docs (ADR-038 status → implemented, tier disposition
  tables; AGENTS.md; this file; `docs/file-splitting-plan.md`).

**Gate evidence:** `cargo test --workspace` green (parser 82, tables 56, tauri 53, canvas
33, graph 8, types 8, plus doc/ser suites), `cargo clippy --workspace --all-targets
-- -D warnings` clean, `bunx tsc --noEmit` + `bun run lint` clean except the pre-existing
in-flight settings WIP (untouched), apps/tauri vitest 319/319, packages/editor 34/36
(2 pre-existing `codeBtn` failures, proven identical on clean HEAD), typing-latency
full-stack p95 = 3.10 ms @ 100 KB (gate ≤ 4 ms, ADR-019).

---

## Core plugins: Templates + Daily notes — COMPLETE

**Status:** First two core plugins per new [ADR-036](adr/036-core-plugin-architecture.md).

- **ADR-036** written + indexed in AGENTS.md.
- **Rust** (`src-tauri/src/commands/`): `templates/mod.rs` (`list_templates`,
  `read_template`, traversal-guarded) + `dailies/mod.rs` (`open_daily_note` =
  idempotent open-or-create); shared write contract in `commands/common.rs`
  (`resolve_parent_dir` + `write_markdown_note`), which `notes/` now uses —
  gained `..`-traversal protection on `create_note`/`create_untitled_note` for
  free. No chrono: dates/template expansion are TS-only (ADR-036 §Conventions 3).
- **Frontend**: `features/templates/` (Moment-subset `date-format.ts`,
  `expand-template.ts`, palette `TemplatePicker`, `templates:insert` command);
  `dailies:open-today` in `shared/useShellCommands.ts`; settings sections
  (Templates/Daily notes, group `core-plugins`) via generic `SettingsFields` +
  declarative `SETTING_SPECS`; ribbon buttons + palette metadata.
- **Verify**: `cargo test --workspace` + `cargo clippy --workspace --all-targets
-- -D warnings` clean; `bunx tsc --noEmit` + `bun run lint` clean; 294 vitest
  (13 new) pass; `bun run build` (vite) succeeds. GUI smoke not run in this
  environment (native Tauri window; command logic covered by the Rust + TS
  unit suites above).

---

## Command module refactor — COMPLETE

**Status:** Split the four oversized `src-tauri/src/commands/` files into module
directories (pure structure, no logic changes; ADR-030 conventions — thin
`mod.rs`, result structs at module root, `crate::commands::common` imports in
submodules):

- `vault.rs` (511L) → `vault/{mod,graph}.rs`
- `assets.rs` (1122L) → `assets/{mod,reorganize,save}.rs`
- `notes.rs` (896L) → `notes/{mod,rename}.rs`
- `folders.rs` (785L) → `folders/{mod,move_rename}.rs`

All `#[tauri::command]` exports and `commands/mod.rs` re-exports unchanged;
workspace clippy `-D warnings` clean, 287 tests pass. The `temp_vault()`
helper-extraction backlog item below was completed 2026-09-08 in ADR-038 phase 1
(`commands/common_tests.rs`).

---

## ADR↔code consistency audit — COMPLETE

**Branch:** `main` (uncommitted)
**Status:** All 28 ADRs in `docs/adr/` audited against the live code and
corrected; 003 + 010 verified accurate (untouched). Corrected files:
002, 004, 005, 007, 008, 009, 011, 017, 018, 019, 020, 021, 022, 023, 024, 026,
027, 028, 029, 030, 031, 032, 033, 034, 035. Style rule applied throughout:
clean current-state prose, no "was X → now Y" narration.

Cross-cutting corrections (details live in each ADR):

- **002/007/030** — theme build outputs (`globals.css` + `themes/manifest.ts`),
  remaining-debt lists (e.g. `arena.rs` still double `to_string()`), crate
  inventory.
- **021/029/031** — graph shipped as `leafRegistry` leaf + `GraphWorker.ts`
  (C-ABI `graph_positions_ptr`, JSON `get_graph` snapshot — no binary IPC);
  reading mode via `readingModeExtras` compartment; PDF via
  `features/export/lib/pdf.ts` (readingExtensions → hidden CM6 → `window.print()`).
- **032** — orientation vocabulary documented as shipped (`"horizontal"` =
  side-by-side columns): flagged `pane:split-right`/`split-down` passing the
  swapped orientation to `splitActivePane` as a known issue.
- **026/034** — HTML block rendering shipped, inline HTML deferred; media
  server lives in `shared/mediaServer.ts` (5 app-shell refs corrected).
- **027/028** — DQL shipped via `TypedValue::List`, FLATTEN list-splitting,
  `query/` parser dir; stale test-counts singular "has one pane" claims removed.
- **004/025/035** — `/onboarding` route removed from docs (only `/` exists);
  tab persistence v1/v2 hydration documented; canvas tree/status corrected
  (`CanvasContext.ts`, `packages/canvas` = `@workspace/canvas-viewport`).

Also fixed: `crates/basalt-parser/src/metadata.rs` doc-comment
`basalt_fs` → `basalt_vault`; AGENTS.md §4 (`/onboarding`) + status-table rows
for DQL/canvas/export; this file's stale `basalt-wasm` deletion claim.

**Verify:** `bun run lint && bunx tsc --noEmit`, review `git diff`, commit on
user request. Next real workstreams (from the status table): Rust batched IPC,
plugin host (ADR-018 Phase 5).

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
  `crates/README.md`, `crates/basalt-tables/tests/complex_queries.rs`) is NOT
  part of these commits.
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

- **Known red on this branch (NOT mine):** `tests/block-widgets/table-widget.test.ts`
  has 3 failing embed tests from the concurrent ADR-034 table-embeds work —
  exclude when running the suite (`vitest run --exclude
tests/block-widgets/table-widget.test.ts`).
- Concurrent session's untracked files remain: `crates/README.md`,
  `crates/basalt-tables/tests/complex_queries.rs`.

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

## Frontend Restructure — PARTIALLY SHIPPED (see below)

**Branch:** `feat/frontend-restructure` — shipped on `main`; small remainder open
**Worktree:** `/home/pranav/Projects/.worktrees/basalt-feat/frontend-restructure`
**Based on:** `main` at `fb83910`

**On `main` now:** Phase 2 (orchestration `app-shell/` → `shared/`) landed as
`ae44f61` (`AppProvider`, `Boot`, `useLeafServices`, `shellCommands`, `tti`,
`ViewHeader` all live in `shared/`). Phase 1 landed partially: `editor/logic` →
`editor/lib` and `tabs/lib/layoutTree.ts` are in place. **Still open:**
`graph/{nodeScale,spatialGrid}.ts` remain at the feature root (not `graph/lib/`),
and `search/lib`, `settings/lib`, `vault/lib` were never filled in.

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
  `crates/basalt-wasm` still exists on `main` as a container directory holding
  the `graph-wasm` + `frontmatter-wasm` subcrates (no workspace members, built
  standalone) — NOT deleted; fixed stale `basalt-wasm` refs in
  ADR-009/020/021/022; fixed `EditorController.test.ts` mock path
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
  - committed test) — NOT part of Rust commits; confirm branch first.

---

## Release / CI pipeline (handoff-critical)

Release workflow factors (triggers, GitHub Free cost model, macOS-tag-only
rule, version sync, wasm regen, deliberate gaps) are codified in
[`docs/RELEASE.md`](./RELEASE.md). **Any agent doing release or CI work MUST
read it first** — especially: macOS builds only on `v*` tags + manual dispatch;
never add macOS to per-push triggers; sync version across `tauri.conf.json`,
`src-tauri/Cargo.toml`, and `apps/tauri/package.json`; regenerate + commit
WASM before tagging.

## Previous Work (completed, for context)

See git log for completed features: ADR-023 (inline title + rename), editor
performance campaign (ADR-019/020, p95 = 4ms @ 100KB), graph view (ADR-021),
DQL query engine (ADR-027/028), native task management (ADR-048, kanban
excluded; see the merged ADR-048 section above for phase notes). All merged to
main.
