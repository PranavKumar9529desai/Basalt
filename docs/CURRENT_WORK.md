# Current Work — Session Handoff

> Point a new session at this file: *"Read docs/CURRENT_WORK.md and continue."*
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---

## Active workstream: Editor performance campaign (ADR-018 follow-up)

Goal: make the editor measurably fast (beat Obsidian feel), then add graph view
and an HTML renderer as pure registry registrations.

### Done (all committed on main)

| Commit | What |
|---|---|
| `25231a7` | Unified header band: workspace grid + `StripSeparator` (active tab cut-through, z-contract: line z-10 < tabs/nubs z-20) |
| `19d1e14` / `36de7cf` | Docs sync (AGENTS/CONVENTIONS/README), dead agent machinery removed, ADR statuses fixed |
| `0c388ee` | **ADR-018 Phase 1**: `packages/views` view registry + generic `SideDock`s + `WorkspaceProvider` ("app context"); `Sidebar`/`RightSidebar` deleted; views registered in `app-shell/viewRegistrations.ts` |
| `74e2c3e` | Tab bar padding |
| `c1c4bc0` | **ADR-018 Phase 2**: leaf registry (`leafRegistry`, `LeafServicesProvider`); tabs carry `viewType`; `MarkdownLeaf` = raw uncontrolled CM6, per-tab `EditorState` cache + `view.setState()` doc-swapping (undo/cursor/scroll survive switches); typing = zero React re-renders; `PaneContent`/`useEditor` deleted; `useNoteIO` is thin invoke wrappers |
| `a0e66f9` | **Write choke point (Rust)**: `save_file` registers `AppState.self_writes` before writing, watcher consumes marker + skips → no duplicate events, no watcher reindex on own saves; `save_file` no longer emits `vault://file-changed`; it updates vault cache + search index directly |
| `ea4d873` | **Lazy commit policy**: `SearchState` batches commits — `update_document`/`remove_document` mark pending; `flush_if_due()` (10s idle, `IDLE_COMMIT_DELAY`), `flush_pending()` forced before every query; 2s background flusher thread (`start_search_flusher` in `watcher.rs`, started from boot). Was: tantivy commit + fsync every 2s autosave |
| `0461bd8` | **Frontend benchmark harness**: `packages/editor/src/benchmark.ts` — `runTypingBenchmark(view)` measures real per-keystroke dispatch cost of the live view (all extensions) at 1KB/10KB/100KB, 200 samples each, p50/p95/max; deterministic doc generator (mulberry32); `editorBenchmarkState.active` guard makes the update listener skip dirty/autosave/stats during runs; dev command `dev:editor-benchmark` (palette) logs `console.table` + status line |

### Benchmark baseline (dev build, devtools open — INFLATED, re-measure in prod)

| Doc size | setDoc | mean | p50 | p95 | max |
|---|---|---|---|---|---|
| 1KB | 33ms | 4.0ms | 4.0 | 7.0 | 10 |
| 10KB | 44ms | 6.8ms | 6.0 | 10 | 13 |
| 100KB | 237ms | 31ms | 30 | **40** | 51 |

Reading: fails the 16.7ms frame budget at 100KB. Two signals:
1. **Fixed ~4ms/keystroke at 1KB** — some extension does size-independent work per
   transaction (suspects: suggestions plugin, clickable links, live preview).
2. Sublinear scaling (100× size → 8× cost) — decorations mostly viewport-limited,
   but the size-dependent part still eats the budget on big notes.

Dev-mode + devtools inflate numbers 2–5×; production re-run required before
conclusions.

### Next steps (in order)

1. ~~Extension isolation mode in the harness~~ ✅ DONE (commit `44b3885`):
   `EditorExtensionGroups` in `editor.ts` + `runIsolationBenchmark` +
   `dev:editor-benchmark-isolation` palette command; results written to
   `/tmp/basalt-reports/editor-benchmark.md` via `write_dev_report`
   (no devtools needed).
2. **Run the isolation benchmark** — launch the app, open a note, run
   `dev:editor-benchmark-isolation` from the palette (prod build preferred:
   `bun run build:linux` then run the binary). Compare variants against
   `base`; the delta names the culprit.
3. **Optimize live-preview per ADR-019** — single-pass engine (commit
   `37c5975`) + incremental lazy mapping on docs > 48KB (`perf(editor):
   incremental live-preview`). Regression gate: p95 ≤ 4ms @ 100KB full stack;
   stretch ≤ 2ms. **Awaiting re-benchmark.**
4. Then: graph view (first real *view* consumer) and HTML renderer (first new
   *leaf* registration) — both are pure `viewRegistrations.ts` additions.

### Recorded migration debt (not urgent)

- ~~6 other emit sites in `commands/files.rs`~~ ✅ DONE — all mutations on the
  choke point; `vault://file-changed` = external only.
- ~~Closed-tab `EditorState` pruning~~ ✅ DONE — `onTabStructureChanged`
  signal via LeafServices; dirty tabs flush-save before prune.
- ~~`SearchState.commit()` direct call in `save_file`~~ ✅ VERIFIED already
  resolved by lazy-commit policy (no .commit() sites outside tests).
- Remaining known trade-offs: lingering self-write markers if a watcher event
  never arrives for a registered path (rare, benign); live-preview reveal on
  >48KB docs is deferred to idle ticks (~350ms cap).
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
