# ADR-019: Editor Decoration Pipeline — Single-Pass Architecture

## Status

Accepted (2026-06-25)

## Context

The editor performance campaign (see `docs/CURRENT_WORK.md`) measured typing
latency with the extension-isolation benchmark (commit `44b3885`) and produced
a clean attribution at 100KB (production build, no devtools):

| Variant                         | p50     | p95      | Cost added vs base |
| ------------------------------- | ------- | -------- | ------------------ |
| base                            | 0ms     | 1ms      | —                  |
| +syntax / +input / +suggestions | ≤2ms    | 3ms      | +2ms               |
| +links                          | 0ms     | 1ms      | +0ms               |
| **+live-preview**               | **7ms** | **12ms** | **+11ms**          |
| full                            | 7ms     | 12ms     | +11ms              |

Live preview owns essentially the entire keystroke overhead above the CM6
floor, and it scales with document size. Root causes in
`packages/editor/src/preview/live-preview.ts`:

1. **Nested dispatch per keystroke.** `blockDecorationUpdater` is an update
   listener that rebuilds block decorations by walking the full syntax tree,
   then dispatches a _second_ transaction to install them. Every keystroke
   pays for two transactions and two update cycles.
2. **Three full-document walks per keystroke.** The block builder iterates the
   entire parsed tree; the inline plugin's code-block pre-pass iterates the
   entire parsed tree again even though its marks only cover visible ranges;
   the marks pass re-walks per visible range.
3. **Rebuild on every viewport change.** Both builders recompute on scroll,
   making scrolling pay the same cost as editing.

### Why not Rust for the keystroke path

Basalt renders through a system webview (Tauri). A keystroke must become DOM
mutations inside that webview, where CodeMirror owns the pipeline. Involving
Rust per keystroke would require serializing document state across the IPC
boundary each time — a fixed cost larger than the computation it would
replace. Meanwhile the compute floor is already excellent: Lezer's warm
incremental markdown parse costs ~1ms (confirmed by the CM author in
[discuss.codemirror.net/t/3976](https://discuss.codemirror.net/t/language-parser-syntax-tree-performance-and-debouncing/3976))
and confirmed empirically by our `base` variant (p95 = 1ms @ 100KB).

Our overhead is redundant work in TypeScript plugin code — an architecture
problem, not a language-speed problem. This matches ADR-007: Rust accelerates
bulk work off the keystroke path (search, indexing, file IO, future graph);
the hot path stays local and minimal.

### Prior art

- **Xi editor** ([rope science 12: minimal invalidation](https://github.com/xi-editor/xi-editor/blob/master/docs/docs/rope_science_12.md)):
  performance comes from incrementalism — an edit delta propagates through the
  pipeline and "ideally, the code touches only a tiny part of the document."
- **Atomic Editor** (`kenforthewin/atomic-editor`, CM6 live preview): one
  fused pre-order tree walk per rebuild, computed without nested dispatches,
  deliberately viewport-independent so scrolling never rebuilds. Their source
  notes fusing separate pre-passes into one walk specifically because the walk
  "runs on every cursor move and its cost scales with document size."
- **Obsidian**: scopes live-preview reveal/hide to the active line / active
  element rather than the document; ships in Electron with the same webview
  constraints as Basalt.
- **CodeMirror core**: requires synchronous tree access per transaction
  (debounced/off-main-thread parsing was evaluated and rejected upstream), so
  decoration builders must be cheap per run, not rare.

## Decision

### Governing principle

**One keystroke = one transaction = one decoration pass over the parsed tree,
scoped to what changed and what depends on selection. Bulk work never crosses
the IPC boundary.**

### Pipeline rules (all binding on `packages/editor`)

1. **No nested dispatches from update listeners.** Decorations are computed
   inside StateField `update()` or ViewPlugin `update()` paths. An extension
   may never observe an update and dispatch another transaction to install
   decorations derived from that same update.
2. **One tree walk per rebuild.** Block decorations, inline marks, and
   mark-hiding are collected in a single pre-order iteration of the syntax
   tree. Pre-passes that exist only to feed later passes (e.g. code-block
   ranges) fold into the same walk.
3. **Viewport-independence for StateField-owned decorations.** Full-document
   coverage is built once and mapped through changes; viewport changes do not
   trigger rebuilds. ViewPlugin-owned marks remain viewport-scoped per CM6
   rules but their supporting state (code-block ranges) comes from the shared
   single walk, not a separate full scan.
4. **Scoped selection-dependent work.** Only cursor-dependent decorations
   (reveal/hide of the active line's marks, HR/callout/code-fence widget
   states) depend on selection; everything else survives selection changes
   untouched.
5. **Bounded parse budget.** `ensureSyntaxTree` calls use a small budget;
   background parse growth is broadcast via throttled effects (≥8KB growth),
   never via blocking parses on the keystroke path.
6. **Benchmark-gated.** Every change to this pipeline runs the isolation
   benchmark before merging. The regression gate at adoption:
   p95 ≤ 4ms @ 100KB full stack (from 12ms); stretch target p95 ≤ 2ms.

### Rejected alternatives

- **Rust/WASM parser replacing Lezer** — bridge serialization per keystroke
  exceeds savings; loses Lezer's incremental parsing; two parsers to keep
  consistent with the Rust-side graph/backlink parsing.
- **Web-worker decorations** — reintroduces async latency CM6's design
  forbids; rejected upstream after evaluation.
- **Zed-style custom rendering stack (GPUI/Rust-native)** — unbounded ceiling
  but years of effort and loss of the CM6 ecosystem (IME, bidi, accessibility,
  vim mode). Revisit only if Basalt outgrows webview rendering entirely.
- **Debouncing/throttling decoration rebuilds** — hides the cost instead of
  removing it, breaks CM6's synchronous-tree contract, adds jitter.

## Consequences

- `live-preview.ts` is restructured around a single-pass engine; individual
  handler modules (`headings.ts`, `lists.ts`, …) keep their node-type logic
  but are invoked from one walk instead of three.
- Focus tracking moves from `view.hasFocus` reads inside builders to a small
  focus StateField fed by DOM events, so builders can run inside field updates
  without a view reference.
- Scrolling becomes O(mapped decorations) instead of O(full rebuild).
- The isolation benchmark remains the acceptance test; CURRENT_WORK tracks
  numbers against the baseline table above.
