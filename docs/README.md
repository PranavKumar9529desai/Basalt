# Basalt App Shell & Performance Notes

High-level reminders for building an Obsidian-class UI with React + Tauri + Rust.

## Goals
- Match or beat Obsidian feel: sub-16 ms input latency, <800 ms TTI, <150 ms search on ~5k notes.
- Keep React as a thin view layer; push heavy work to Rust or Web Workers.

## Architecture Shape
- **App shell (React):** pane tree with tabs/splits, command palette, sidebars. Persist layout; use TanStack Router for route-aware tabs plus per-pane history.
- **State:** small global store (Zustand/Jotai) for panes, doc metadata, prefs; selector-based subscriptions; batch updates.
- **Editor island:** CodeMirror as a leaf. Feed it document text and emit patches/diffs rather than whole strings.
- **Data/IO service:** Tauri commands wrap filesystem ops (read/write/list/watch) and return structured errors.
- **Index/graph/search:** built in Rust or workers; UI receives streamed results (binary or compact JSON).
- **Plugin surface:** `registerCommand`, `registerView(paneType)`, `registerEditorExtension`, `registerIndexer(fn)`, `registerSettings(schema)` with sandboxed access to fs/network via Rust.

## React Discipline
- Virtualize anything long (file tree, search, backlinks).
- Avoid derived data in state; compute via selectors/memo.
- Stable props/keys; memo pane components; contain layout (`contain: content` when safe).
- Event delegation; debounced text change handling.

## Rust / Worker Responsibilities
- Fast filesystem scans, debounced writes, fs watch.
- Incremental inverted index + link graph; path hashing to avoid needless reloads.
- Heavy parsing (front-matter, math, syntax highlighting preload), compression/snapshots.
- Capability gate for plugins (fs/network).

## Performance Playbook (m10-performance)
- Measure first: React Profiler + browser Performance; flamegraph on Rust when needed.
- Avoid copies: send deltas, not blobs; pre-allocate (`with_capacity`, `SmallVec`) on hot Rust paths.
- Batch work: fs events, save pipeline, UI state updates (`unstable_batchedUpdates`).
- Parallelize: workers for parsing/indexing; `rayon` or async Rust for IO-bound tasks.
- Cache-friendly data: prefer flat arrays for small sets; keep graph adjacency lists contiguous.

## Guardrails & Budgets
- Input-to-paint <16 ms; keystroke handler must not allocate or sync-block.
- Search on warm cache <150 ms for 5k medium notes; cold load acceptable <300 ms.
- Startup: minimal shell bundle; lazy-load panes/plugins; precompile CodeMirror extensions.
- Memory: avoid holding full vault in JS; keep doc cache LRU; chunk large payloads.

## Immediate Next Steps
- Add workspace store + pane tree scaffold; render two editors to validate splits.
- Stand up worker/Rust indexer; wire virtualized search/backlinks.
- Add perf scripts (`npm run profile`, flamegraph helper) and track the budgets above.
