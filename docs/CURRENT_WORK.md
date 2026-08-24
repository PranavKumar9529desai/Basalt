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
3. **Optimize the named culprit** (bet: live-preview mark-hiding pass);
   re-benchmark, compare against this baseline.
4. Then: graph view (first real *view* consumer) and HTML renderer (first new
   *leaf* registration) — both are pure `viewRegistrations.ts` additions.

### Recorded migration debt (not urgent)

- 6 other emit sites in `apps/tauri/src-tauri/src/commands/files.rs`
  (create/rename/delete/move) still double-emit with the OS watcher; migrate
  onto the choke point via a shared `write_through` helper.
- Closed-tab `EditorState`s stay in `MarkdownLeaf`'s `statesRef` cache until
  remount — prune when tabs close (needs a tabs-store signal).
- `SearchState.commit()` still called directly by `save_file` (parity);
  flush_if_due is the policy — consider dropping the direct call once flusher
  thread is trusted.
- 2 biome "info" style nits in `packages/editor/src/benchmark.ts`
  (useTemplate) — harmless.
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
- Header band z-contract: `StripSeparator` z-10 < active tab + nubs z-20;
  section backgrounds z-auto.
