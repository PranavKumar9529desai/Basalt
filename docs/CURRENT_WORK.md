# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

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
4. **NEXT: Graph view** (NoteGraph panel) — first real _view_ registry
   consumer. Register via `registerView()` in `app-shell/viewRegistrations.ts`
   (no shell surgery). Compute lives in `crates/basalt-graph/`. Backlinks
   sidebar already exists; graph is the missing piece.
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
- **BUG (pre-existing, scoped): moving an open note strands its tab on the
  dead old path** — tab ids derive from paths and nothing rekeys open tabs
  after `move_paths`, so the next autosave fails (`save_file` on nonexistent
  path) and edits are lost. Fix sketch: decouple tab identity from path —
  stable ids + path updates in place, with MarkdownLeaf reading path from
  the live tab instead of cached meta. Touches tabs store + leaf meta
  lifecycle; needs its own session.

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
