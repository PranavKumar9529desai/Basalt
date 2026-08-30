# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---

## Inline note title + rename (ADR-023) — IMPLEMENTED, ready to merge

Complete across all layers (Rust → parser → tabs → leaf → shared orchestration):

- **Rust backend** (`rename_note` in `apps/tauri/src-tauri/src/commands/files.rs`
  + `crates/basalt-parser/src/link_rewrite.rs`): atomic rename — sanitize name,
  enumerate link candidates from graph metadata, `fs::rename`, rewrite
  `[[wikilinks]]` in other notes + self-links, update vault doc/index under the
  write lock (`index_remove` + `index_upsert`). Returns `{ path, name,
  updated_files }`; emits no events (frontend refreshes).
- **Rust backend — `rename_path`** (folders + attachments): same choke-point
  contract. Notes are rejected ("use rename_note"); files keep their extension
  (`resolve_rename_target_name`), folders rewrite vault-relative path-form
  wikilinks (`PathRename` / `rewrite_wikilinks_path` in `link_rewrite.rs`),
  move every nested `.md` doc through the cache + index, and return `{ path,
  name, moved, updated_files }` so the frontend can repoint open tabs inside
  the folder. Tested via the `temp_vault_with_folder` harness.
- **Tabs** (`renameOnOpen`): transient flag on `OpenableTabInput`/`TabModel`
  (mirrors `line`), set by `createNoteInstant`; **persistence layer now
  serializes an explicit field list** — this fixes `line` (and would have
  leaked `renameOnOpen`) out of the snapshot while keeping `leafType`.
- **Leaf** (`packages/editor/src/scroll-header.ts` + `features/editor/
  components/InlineTitle.tsx`): title mounted in its own React root inside a
  slot prepended to `.cm-scroller` (`data-basalt-title` flips the scroller to
  flex-column); CM stays the sole scroll owner. Click → edit with select-all;
  Enter commits / Esc cancels / blur commits; backend errors render inline;
  interrupted edits commit on unmount. `renameOnOpen` consumed once per tab id.
- **Orchestration** (`shared/useWorkspace.ts` `renameNote`): invoke →
  `refreshTree()` → `updateTabPaths([{from,to}])` (id-stable, caches survive).
  Injected to leaves via `LeafServices.renameNote`.

The three deferred companions from the ADR are now shipped too:

- **F2 rename** (`keybindings.json` `{ "key": "F2", "action": "renameActiveNote" }`):
  registered in `useMarkdownEditor` → `useRenameSignalStore.request(tabId)` →
  `MarkdownEditorView` bumps a `renameEpoch` → `InlineTitle` enters edit mode.
  `mountedEpochRef` baselines the mount-time epoch so tab switches never
  re-enter edit mode, only fresh signals do. Rename signal lives in
  `features/editor/ui/renameSignal.ts` (the shared seam for the ⋮ menu too).
- **Tree context-menu Rename**: `FileTreeContextMenu` item enabled (`onRename`
  prop) → `useVaultController.onMenuRename` sets `mutations.renamingNode`
  (isEditing row rendered in place, stem shown for notes) →
  `handleCommitRename` routes to `shared/useWorkspace.ts` `renameNode`
  (notes → `rename_note`; folders/attachments → `rename_path`) which refreshes
  the tree, repoints open tabs (`moved` covers nested docs), and opens the
  renamed folder.
- **ViewHeader ⋮ menu** (`app-shell/ViewHeader.tsx`): generic per-leaf chrome
  band wrapping leaf content in `WorkspaceView.renderPane`. Actions: Rename
  note (markdown leaves only, via the rename signal), Pin/Unpin, Copy path,
  Copy link, Close. Uses the existing Base UI `ContextMenu*` primitives in
  controlled mode with an element anchor — no new dependency, works for
  markdown and graph leaves alike.

Verified: `cargo test -p basalt-parser -p tauri@0.1.0` (**41 + 23 pass**, +11
parser `PathRename` tests, +4 `rename_path` tests), full `apps/tauri` vitest
suite (**189**), `bun run lint`, `bunx tsc --noEmit` clean.

Frontmatter `title` is intentionally not renamed by this feature (ADR-023
non-goal).

### Post-merge regression fixes (2026-08-30)

Three issues surfaced after the rename/header work shipped:

1. **"Save error: No such file or directory (os error 2)" on new-note (Ctrl+N)
   + inline-title not focused.** Root cause confirmed: `WorkspaceTabs` memoized
   `activeTab` on `[activeTabId]` only. A rename keeps the tab id stable and
   repoints its path in place (via `updateTabPaths`, which bumps
   `persistVersion`), so the memo kept serving the **stale tab (old path)** to
   the leaf — the leaf's autosave then wrote to the now-deleted old path
   (ENOENT). Fix: `WorkspaceTabs` now subscribes to `persistVersion` and keys
   the memo on it, so a path repoint re-resolves the live tab object. This is
   the same stale-snapshot root class as the pre-existing "move strands a tab"
   debt below.
2. **Inline-title focus on mount.** `InlineTitle`'s edit-mode effect only
   called `input.select()`; a freshly-inserted input isn't focused yet, and
   `select()` on an unfocused element is a no-op. Fix: `focus()` then `select()`.
3. **Header UI reconciled with Obsidian reference.** The note name was shown a
   third time in the `ViewHeader` chrome band (it already lives on the tab AND
   as the editable inline title). Removed the `displayTitle` span from
   `ViewHeader`; the band now shows only the ⋮ actions menu (Rename / Pin /
   Copy path / Copy link / Close), matching Obsidian's tab + inline-title
   anatomy.

Re-verified after fixes: 41 + 23 Rust, 189 vitest, `bun run lint`, `bunx tsc
--noEmit` all green.

---

## Active workstream: Editor performance campaign (ADR-018 follow-up)

Goal: make the editor measurably fast (beat Obsidian feel), then add graph view
and an HTML renderer as pure registry registrations.

### Done (all committed on main)

| Commit                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `25231a7`             | Unified header band: workspace grid + `StripSeparator` (active tab cut-through, z-contract: line z-10 < tabs/nubs z-20)                                                                                                                                                                                                                                                                                                                                      |
| `19d1e14` / `36de7cf` | Docs sync (AGENTS/CONVENTIONS/README), dead agent machinery removed, ADR statuses fixed                                                                                                                                                                                                                                                                                                                                                                      |
| `0c388ee`             | **ADR-018 Phase 1**: `packages/views` view registry + generic `SideDock`s + `WorkspaceProvider` ("app context"); `Sidebar`/`RightSidebar` deleted; views registered in `app-shell/viewRegistrations.ts`                                                                                                                                                                                                                                                      |
| `74e2c3e`             | Tab bar padding                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `c1c4bc0`             | **ADR-018 Phase 2**: leaf registry (`leafRegistry`, `LeafServicesProvider`); tabs carry `viewType`; `MarkdownLeaf` = raw uncontrolled CM6, per-tab `EditorState` cache + `view.setState()` doc-swapping (undo/cursor/scroll survive switches); typing = zero React re-renders; `PaneContent`/`useEditor` deleted; `useNoteIO` is thin invoke wrappers                                                                                                        |
| `a0e66f9`             | **Write choke point (Rust)**: `save_file` registers `AppState.self_writes` before writing, watcher consumes marker + skips → no duplicate events, no watcher reindex on own saves; `save_file` no longer emits `vault://file-changed`; it updates vault cache + search index directly                                                                                                                                                                        |
| `ea4d873`             | **Lazy commit policy**: `SearchState` batches commits — `update_document`/`remove_document` mark pending; `flush_if_due()` (10s idle, `IDLE_COMMIT_DELAY`), `flush_pending()` forced before every query; 2s background flusher thread (`start_search_flusher` in `watcher.rs`, started from boot). Was: tantivy commit + fsync every 2s autosave                                                                                                             |
| `0461bd8`             | **Frontend benchmark harness**: `packages/editor/src/benchmark.ts` — `runTypingBenchmark(view)` measures real per-keystroke dispatch cost of the live view (all extensions) at 1KB/10KB/100KB, 200 samples each, p50/p95/max; deterministic doc generator (mulberry32); `editorBenchmarkState.active` guard makes the update listener skip dirty/autosave/stats during runs; dev command `dev:editor-benchmark` (palette) logs `console.table` + status line |

### Benchmark baseline (dev build, devtools open — INFLATED, re-measure in prod)

| Doc size | setDoc | mean  | p50 | p95    | max |
| -------- | ------ | ----- | --- | ------ | --- |
| 1KB      | 33ms   | 4.0ms | 4.0 | 7.0    | 10  |
| 10KB     | 44ms   | 6.8ms | 6.0 | 10     | 13  |
| 100KB    | 237ms  | 31ms  | 30  | **40** | 51  |

Reading: fails the 16.7ms frame budget at 100KB. Two signals:

1. **Fixed ~4ms/keystroke at 1KB** — some extension does size-independent work per
   transaction (suspects: suggestions plugin, clickable links, live preview).
2. Sublinear scaling (100× size → 8× cost) — decorations mostly viewport-limited,
   but the size-dependent part still eats the budget on big notes.

Dev-mode + devtools inflate numbers 2–5×. ✅ Prod re-run (2026-08-24,
isolation benchmark) confirms: full stack p95 = 4ms @ 100KB — gate met, no
culprit extension to chase.

### Next steps (in order)

1. ~~Extension isolation mode in the harness~~ ✅ DONE (commit `44b3885`).
2. ~~Run the isolation benchmark~~ ✅ DONE (2026-08-24, prod build). Results
   in `/tmp/basalt-reports/editor-benchmark.md`: full stack p95 = **2ms @ 1KB,
   2ms @ 10KB, 4ms @ 100KB**. No size-independent per-keystroke tax; largest
   single contributors at 100KB are +syntax (~1.7ms mean) then live-preview
   (~1.9ms). Groups don't compound pathologically.
3. ~~Optimize live-preview per ADR-019~~ ✅ GATE PASSED — single-pass engine
   (`37c5975`) re-benchmarked on prod: p95 = 4ms @ 100KB full stack meets the
   ≤ 4ms gate. Stretch (≤ 2ms) narrowly missed; accepted as diminishing
   returns. Perf campaign closed.
4. ~~Graph view (NoteGraph panel)~~ ✅ DONE — implemented as a **leaf**
   (registered in `leafRegistry`, not `viewRegistry` — it is tab content,
   Obsidian-style). Frontend lives in `apps/tauri/src/features/graph/`
   (leaf `GraphView.tsx` + `GraphWorker.ts` + `graph_sim.wasm` co-located in
   `components/`, `spatialGrid.ts` at the feature root, `index.ts` as the
   only import surface). Renderer in `packages/graph/`, compute in
   `crates/basalt-graph/`. Decoupled via `useLeafServices` (activeNote /
   openPinned) — no direct feature-store imports. `graph:open` command
   folded into `shared/tabCommands.ts`.
5. Then: HTML renderer — first new _leaf_ registration (`leafRegistry`),
   also a pure `viewRegistrations.ts` addition.

### Benchmark evidence (recorded 2026-08-24)

- **Search @ 5k notes** (criterion, `cargo bench -p basalt-search`, target
  <150ms): query batch (5 queries) = 435µs median (~87µs/query); full reindex
  = 67ms; bulk index build = 62ms. ~340× under budget on raw `TantivyIndex`
  path; app-path (`SearchState`) bench optional later.
- **TTI instrumentation** ✅ done, first prod run recorded: webview TTI =
  678ms (<800 target ✅), process-est = 1223ms (❌). Breakdown: webview spawn
  ~568ms, invoke(boot) 171ms (rust boot_total 163ms, search_init 107ms),
  React paint tail 311ms. Report: `/tmp/basalt-reports/tti-report.md`.
- **ADR-020 desktop-tier performance** ✅ accepted. Moves 1+2 IMPLEMENTED:
  speculative parallel boot (`run_preboot` thread in `setup()`, PREBOOT
  mutex cache, lock-held-during-compute; `set_vault` invalidates) +
  concurrent search-init ∥ tree/workspace via `thread::scope` inside
  `perform_boot` + hidden-until-painted window (`visible: false`, frontend
  `show()` after paint mark, 10s Rust failsafe). Moves 3–6 proposed:
  binary IPC (Response::raw), WASM graph physics in worker,
  Rust-paged collections, Channel event streams.
- **Frontend bundle split (ADR-020 move 3, done)**: `manualChunks` in
  `vite.config.ts` (react-vendor / codemirror-vendor / icons) + `React.lazy`
  overlays (search/quick-switcher/settings) + idle prefetch after paint.
  Traps documented in vite.config comments: language-data hub, legacy-modes,
  @lezer/<language> parser tables — none may land in a manual chunk
  (rollup#5627). Startup JS ≈ 1.19MB (entry 686 + cm 317 + react 188) vs
  1.24MB monolith before; overlay chunks now lazy. **Honest read: parse
  savings are small — the 319ms paint tail is mostly React mount + CM6 view
  creation, not JS parsing. Next lever: defer background-tab editor
  creation on multi-tab restore.**
  Follow-ups: rayon-parallel vault parsing (25k tier), 25k criterion
  fixtures (AGENTS.md rule), memory-footprint measurement.

### Search modal benchmark (recorded 2026-08-30)

Frontend counterpart of the `basalt-search` criterion benches (those prove the
raw index is fast; this proves the React modal ships results to pixels).
Harness in `apps/tauri/src/features/search/benchmark.ts` — deterministic
synthetic results (4KB / 40KB / 100KB notes × 20 files × 16 matches, the
`limit: 20` display cap) driven through the real `useSearchStore` +
`SearchModal`. Two numbers per phase: `commit` (React render+commit via
`flushSync`) and `paint` (until a frame paints after passive effects drain —
catches the PreviewPane CM6 work `commit` can't see). p95 of `paint` is the
gate vs the 16.67ms budget. Run via palette command **Run Search Modal
Benchmark** (`dev:search-benchmark`); report → `/tmp/basalt-reports/search-benchmark.md`.

**Bug found by the harness (fixed):** unsorted highlight spans crash
`PreviewPane.buildDecorations` with CodeMirror's "Ranges must be added sorted
by 'from' position" — preview marks were added in input order while
`HighlightedText` sorts its copy. Fixed both sides: generator emits sorted
spans; `buildDecorations` sorts defensively (regression tests in
`PreviewPane.test.ts`).

**Perf fixes (PreviewPane, 2026-08-30):**
- Module-level LRU of parsed `EditorState`s keyed by **file content**
  (`cachedPreviewState`, cap 24) — the MarkdownLeaf tab-cache pattern surviving
  modal mounts. Cross-file nav now swaps via `view.setState(cached)` instead of
  a full-doc re-parse; open-cold reuses the previous parse. Correct by
  construction: reuse requires the identical content string, so a changed file
  always re-parses.
- Per-nav `scrollIntoView` skipped when the match line is already in
  `view.visibleRanges` — real adjacent-line scanning no longer forces an
  O(doc) line-measure each keystroke.
- Same-file nav kept incremental (decoration dispatch only); the old
  `doc.toString()` compare replaced by a text-ref compare.

**Dev-build results (p95 paint ms; dev+devtools inflate 2–5×, re-measure in
prod):**

| phase | 4KB | 40KB | 100KB | verdict |
|---|---|---|---|---|
| open-cold | 292 (was 185) | 274 (was 552) | 328 (was **1011**) | ❌ warm-reopen improved; cold parse lives in `max` |
| install | 34 (was 17) | 28 (was 17) | 18 (was 17) | ✅ one to two frames |
| nav-same-file | 124 (was 82) | 103 (was 82) | 89 (was 69) | ⚠️ scroll-skip + prod pending |
| nav-cross-file | 117 (was 98) | 176 (was 253) | 218 (was **395**) | ⚠️ parse tax gone (−45% @100KB) |
| keystroke | 32 (was 40) | 30 (was 30) | 30 (was 24) | ⚠️ 1.5–2× |

Reading: `install` (results landed) fits the budget at every size. Cross-file +
open-cold parse tax eliminated; the residual ~90–220ms nav paint is now
once-per-state line-measure + the ~35–40ms dev commit (React list re-render on
selection). **Next: prod re-run for real numbers** — nav commit is plausibly
~8–17ms after 2–5× inflation. If it fits, close out; if not, the lever is the
per-row `Button`/`HighlightedText` re-render on selection change. 4KB open-cold
regression is run-to-run noise (see `max`), not a fix regression.

**Perf pass 2 (2026-08-30) — kill the per-keystroke commit**: the ~35–40ms
dev `commit` on every selection/query change was the SearchModal re-rendering
the *entire* virtualized list (`Button` + `HighlightedText` per row). Rows
extracted to `features/search/components/SearchResultRows.tsx` and memoized
(`FileRow`/`MatchRow`, `memo`) on **primitives** (`top`, `selected`) + stable
item refs + a stable `openItem` callback (no inline closures) — so a selection
change re-renders only the two rows whose `selected` flips, and a query change
re-renders none. `top` is passed as a number (not a fresh style object) so
unchanged rows skip even when the virtualizer re-runs. Expected: nav/keystroke
`commit` → near-zero; remaining `paint` for far-jump nav is the virtualizer
scroll re-render + once-per-state line-measure (avoided for real adjacent-line
scanning by the `visibleRanges` scroll-skip from pass 1). Re-measure, then
prod-re-run for the gate.

**Perf pass 3 (2026-08-30) — take the recenter off the critical frame**: the
PreviewPane `scrollIntoView` to a far match forced an O(doc) line-measure
inside the same frame as the keydown. The decoration highlight stays
synchronous (cheap one-line mark), but a non-visible recenter is now deferred
to a `requestAnimationFrame` — rapid navigation coalesces into a single
recenter (last target wins via refs), a destroyed/remounted view bails on
`scrollDOM.isConnected`, and an in-flight cross-file swap re-targets the new
doc offset. The keydown paints instantly; centering happens one frame later,
off the measured critical path.

### Recorded migration debt (not urgent)

- ~~6 other emit sites in `commands/files.rs`~~ ✅ DONE — all mutations on the
  choke point; `vault://file-changed` = external only.
- ~~Closed-tab `EditorState` pruning~~ ✅ DONE — `onTabStructureChanged`
  signal via LeafServices; dirty tabs flush-save before prune.
- ~~`SearchState.commit()` direct call in `save_file`~~ ✅ VERIFIED already
  resolved by lazy-commit policy (no .commit() sites outside tests).
- Remaining known trade-offs: lingering self-write markers if a watcher event
  never arrives for a registered path (rare, benign); live-preview reveal on
  > 48KB docs is deferred to idle ticks (~350ms cap).
- ~~**BUG (pre-existing, scoped): moving an open note strands its tab on the
  dead old path**~~ ✅ FIXED 2026-08-30 — the root cause was the
  `WorkspaceTabs` `activeTab` memo being keyed only on `activeTabId`: after
  `updateTabPaths` repointed a tab's path in place (bumping `persistVersion`),
  the memo kept returning the stale tab (old path), so
  `MarkdownLeaf` saved to the dead location. `WorkspaceTabs` now subscribes to
  `persistVersion` and re-keys the memo on it, so saves always resolve the live
  path. (See the ADR-023 regression fixes above.)

### Key invariants (do not break)

- `vault://file-changed` means **external change only** (self-writes suppressed
  in Rust). Frontend reconciles by content-diff (vim FileChangedShell model) —
  no timestamps, no echo windows.
- Typing causes **zero React re-renders**; documents live in CM6, never in
  React state. `editorBenchmarkState.active` must keep bypassing the update
  listener.
- Search commits are batched (idle 10s / before-query). Never commit per save.
- Shell renders from registries (`viewRegistry` / `leafRegistry`); no feature
  panel imports in `app-shell`. New panels = registration entries only.
- Header band z-contract: `HeaderBandRule` (was `StripSeparator`) z-10 <
  active tab + nubs z-20; section backgrounds z-auto.
- Graph leaf (`features/graph`) reads cross-feature state **only** through
  `useLeafServices` (`activeNote`, `openPinned`); it must never import
  `features/editor` or `features/tabs` stores directly.

### Naming overhaul (2026-08-24, lexicon anchored to ADR-018 / VS Code)

view = side-dock panel, leaf = tab content type. Renamed:
`useFocusedPaneStore`→`useActiveNoteStore`, `useWorkspace`→
`useWorkspaceController`, `useVaultActions` merged into `useVaultMutations`,
`useSettingsDataStore`→`useSettingsStore` (chrome→`useSettingsModalStore`),
`ActivityBar`→`Ribbon` (ui + shell), `EditorComponent`→`EditorHost`,
`paneCommands.ts`→`tabCommands.ts`, `TabGroupFrame`→`TabListFrame`,
`StripSeparator`→`HeaderBandRule` (`top-strip/`→`header-band/`),
`CUSTOM_THEME`→`BASE_EDITOR_THEME`, `TabModel.viewType`→`leafType`
(`viewTypeForPath`→`leafTypeForPath`; hydrate accepts legacy `viewType`),
`openNotePreview`+`openNote` merged into `openNote(path)`. Dead code deleted:
`useTabIO`, `SaveIndicator`, `ThemeSelect`, `useCommandStore`, duplicate ui
`useTabDnD`, unwired `useWorkspaceTabHandlers` returns. Banner comments
replaced with doc comments per CONVENTIONS §8.

---

## Graph view — perf pass (branch `feat/graph-view`, not yet merged to main)

Built the note-link graph as a WebGL2 + Canvas2D hybrid (ADR-021). Sim runs in
`GraphWorker.ts` (WASM force layout, off the UI thread). Perf pass completed:

| Commit    | What                                                                                                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `21b7877` | O(local) hover hit-test via `SpatialGrid` (replaces O(node-count) scan per `mousemove`); arrow rebuild throttled to new frame / zoom change, written into a reused `Float32Array`; render-on-dirty gate so a settled, idle graph does zero GPU/CPU work. `spatialGrid.test.ts` (vitest, 9 cases) added. |
| `f45ede6` | `packages/graph/README.md` — documents renderer decisions (hybrid, buffer-orphaning vs `bufferSubData`, premultiplied-alpha, shared VAOs, coordinate convention, API).                                                                                                              |

Verified: `tsc --noEmit` + `oxlint` + `bun run lint` clean; 9/9 unit tests pass.

### Open decision — OffscreenCanvas render worker (DEFERRED to next session)

**Question:** move the WebGL2 draw out of the main thread into a render worker
(`canvas.transferControlToOffscreen()` → worker `getContext("webgl2")`),
leaving the UI thread for input/DOM only.

**Why it's attractive:** the UI thread never blocks on a GPU draw; input,
scroll, and React stay smooth under render load, and rendering continues even
if the main thread is busy.

**Why we deferred it:**
- Sim is *already* off-thread (GraphWorker). The expensive physics isn't on the
  UI thread.
- The render itself is 3 draw calls (points/lines/arrows) and is dirty-gated,
  so an idle graph is free and a 25k-node draw is well under one frame budget.
  Main-thread render is fine at this scale.
- Real added cost: a second worker, forwarding pointer events + view state
  across the thread boundary, harder WebGL-in-worker debugging, and different
  context-loss handling.
- **Blocker to verify first — Tauri/Linux webview support.** OffscreenCanvas-
  in-worker with WebGL2 needs a supporting webview. WebView2 (Windows) and
  recent WKWebView (macOS, Safari 16.4+) are fine; **webkit2gtk on Linux
  (Tauri's Linux webview) has historically had partial/off worker-GL support**
  and must be confirmed on the target machine before adopting.

**Recommendation:** measure main-thread input latency at full vault scale via
`bun run dev` first. If smooth at 25k, keep the main-thread render. Adopt the
render worker only if input jank appears at larger vaults (100k+) or main-
thread contention shows up. If adopted, capture as ADR-022.

### Restructure (2026-08-30)

Frontend graph code moved out of the stray `apps/tauri/src/graph/` into a
proper feature: `apps/tauri/src/features/graph/` (leaf `GraphView.tsx` +
`GraphWorker.ts` + `graph_sim.wasm` co-located in `components/`,
`spatialGrid.ts` at the feature root, `index.ts` as the only import
surface). `GraphView` previously imported `features/editor` +
`features/tabs` stores directly (violating the no-cross-feature-imports
rule); it now reads `activeNote` and `openPinned` through
`useLeafServices` (the shell injects them — the same seam `MarkdownLeaf`
uses). The `graph:open` command (calls `tabs.openView`) moved to
`shared/tabCommands.ts`, the designated cross-feature command-wiring file;
the stray `graph/commands.ts` was deleted. Renderer (`packages/graph/`) and
compute (`crates/basalt-graph/`) are unchanged.

### Wasm build wiring (2026-08-30)

`apps/tauri/src/features/graph/components/graph_sim.wasm` is a GENERATED
artifact, not hand-written. It is the `wasm32-unknown-unknown` release build
of `crates/graph-wasm` (cdylib over `basalt-graph`), copied into the
frontend by `scripts/build-graph-wasm.sh`. Regenerate after any graph-Rust
change with `bun run build:wasm`; prove the output with `bun run verify:wasm`
(runs `crates/graph-wasm/verify.mjs`, which drives the C-ABI surface for both
the `graph_seed` and `graph_build` paths). The crate's real output name is
`graph_sim_wasm.wasm`; the script renames it to `graph_sim.wasm` to match the
`?init` import in `GraphWorker.ts`.

### GraphView split + BacklinksView consistency (2026-08-30)

`GraphView.tsx` (was ~857 lines) split its pure-presentational UI into two
child components in `features/graph/components/`: `GraphControls` (filter bar,
local-graph toggle/depth, Center, orphans/attachments toggles) and
`GraphContextMenu` (right-click Open / Open in New Tab / Center in Graph /
Open Local Graph). `GraphView` keeps the canvas, hover label, and
interaction/render-loop effects — those are bound to the WebGL2 loop, so they
were intentionally left in place. Both children are prop-driven and hold zero
state.

`BacklinksView.tsx` (app-shell) no longer imports `features/editor` directly:
its `activeNoteBacklinks` now flows through `useWorkspaceContext()` (the same
sanctioned seam the graph leaf uses). `WorkspaceContextValue` now exposes
`activeNoteBacklinks` alongside the previously-added `activeNote`. The last
direct `features/editor` consumer in app-shell is gone.
