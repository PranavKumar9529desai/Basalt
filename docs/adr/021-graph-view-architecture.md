# ADR-021: Graph View Architecture

**Status:** Accepted (2026-08-29)
**Date:** 2026-08-29
**Supersedes/extends:** ADR-018 (view registry), ADR-020 (moves 3–6), ADR-004 (navigation), ADR-007 (Rust responsibility)

## Context

Obsidian's Graph View is its most-criticized surface, and the failure is
architectural, not cosmetic. The most-requested improvements from its own
community, and the weaknesses our competitive research surfaced:

- **Performance collapses at scale.** Repeated reports of the graph being
  "extremely slow even after indexed" and "unusable" at 10k–50k notes
  ([Obsidian forum — graph lag](https://forum.obsidian.md/t/graph-view-lag/83244),
  [15k reality check](https://digitalbiztalk.com/article/when-your-obsidian-graph-view-becomes-unusable-a-15k-note-reality-check),
  [reddit](https://www.redditmedia.com/r/ObsidianMD/comments/16hvjiy/fix_for_a_slow_obsidian_graph_view/)).
  Users themselves identified the root cause: **Obsidian's graph is Canvas2D /
  CPU-bound and "by default does not use GPU."** That is the exact weakness to
  beat.
- **"Looks great, but useless."** Recurring sentiment
  ([forum](https://forum.obsidian.md/t/you-all-say-the-graph-is-useless-let-me-show-you-how-to-use-it/116738),
  [Dan Holloran](https://danholloran.me/posts/making-obsidians-graph-view-actually-useful)):
  top ask is *actionable* value (surface orphans, broken/duplicate links, jump
  to a neighborhood), not a decorative picture.
- **Filters too weak.** Tag-frequency (`tag used in ≥N notes` —
  [forum](https://forum.obsidian.md/t/new-filter-for-graph-view-filter-based-on-tags-frequency/114559)),
  relative/neighbor queries (`note OR neighbor-of` —
  [forum](https://forum.obsidian.md/t/relative-grouping-filter-for-local-graph-view/114906)),
  property-driven queries, and tag-links-as-edges are all community plugins or
  open requests. No edge directionality (links render undirected).
- **Unreadable on first open** — structural files clutter the view; wants
  curated defaults.

### What other apps prove

| App | Lesson | Takeaway |
| --- | ------ | -------- |
| **Logseq** | Graph DB (DataScript) with queries in a **DB worker thread** so UI stays responsive ([DeepWiki](https://deepwiki.com/logseq/logseq/2-architecture-overview)) | Separate the model/query tier from the render tier; compute off main thread |
| **Tana** | "Write information, not documents" — nodes/supertags first-class, graph is a query surface ([tana.inc](https://outliner.tana.inc/knowledge-graph)) | Graph is for navigation, not screensaver |
| **Heptabase** | Infinite **spatial whiteboard** of connected cards as primary metaphor ([review](https://aiindigo.com/blog/heptabase-review-2026-the-visual-brain-for-complex-knowledge)) | Spatial canvas + graph are complementary modes |
| **Kinopio** | Playful node+arrow canvas with tactile motion | Physics *feel* is a feature |

### What is already built here

- `crates/basalt-graph` owns the graph model: `arena` (`NodeId`,
  `StringArena`), `fuzzy` (node query), and Criterion benches
  (`graph_query`, `arena_growth`, `graph_insert`).
- `crates/basalt-wasm` already exists as the WASM bridge.
- ADR-020 pre-authorized the graph stack: **move 3** (binary IPC for
  node/edge dumps), **move 4** (WASM force sim in a Web Worker, WebGL render,
  zero React per frame), **move 5** (windowed virtualization), **move 6**
  (channel event streams). This ADR promotes those into a concrete blueprint.

The solved, benchmarked pattern is Rust → WASM graph core + Web Worker sim +
GPU render: `@invariantcontinuum/graph` ("Rust core compiled to WASM… layout
engine inside a Web Worker"), and `hylograph-wasm` reports **3–4× speedup over
D3.js at 10k+ nodes**. We own the crate already.

## Decision

### Governing principle

**The graph view is a GPU-rendered, Rust-owned visualization.** Rust
(`basalt-graph`) owns the model and the force simulation; the simulation runs
off the main thread in a Web Worker; positions stream to a WebGL2/WebGPU
renderer as typed arrays; React never touches per-frame data.

**Acceptance bar (non-negotiable): sustained ≥60fps at ≥25k nodes** on target
hardware — strictly better than Obsidian, which degrades past ~10k notes on
Canvas2D.

### Four tiers (aligned to the four-layer rule)

```
crates/basalt-graph     model + force sim (Rust, native + WASM)
        │  wasm-bindgen
crates/basalt-wasm      JS/WASM bridge: build graph, sim_step() -> Float32Array
        │  loaded in
packages/graph          SIM WORKER (wasm sim tick) + WEBGL2/WebGPU RENDERER
        │  postMessage (transferable typed arrays)
features/graph          React view, filters, selection, mode; registers via ADR-018
        │  viewRegistry.register(...)
app-shell/viewRegistrations.ts   one-line contribution, no shell surgery
```

1. **Model tier — `crates/basalt-graph` (extend).** Add a force-simulation
   module: **Barnes-Hut quadtree** for O(n log n) repulsion, **velocity-Verlet**
   integration with damping, spring attraction on edges, gravity/centering,
   optional collision. Edge list is built from parser/vault link extraction
   (reuses the backlink pipeline that already feeds `get_backlinks`). Reuse the
   existing arena + `fuzzy` query paths.
2. **Bridge tier — `crates/basalt-wasm` (extend).** Expose graph construction
   and `sim_step()` returning `Float32Array` position buffers (SharedArrayBuffer
   where COOP/COEP allow zero-copy). Already scaffolded.
3. **Engine tier — new `packages/graph` (primitive).** A Web Worker hosting the
   wasm sim ticks it and posts transferable position arrays; a **WebGL2**
   renderer draws instanced points + lines. **No Tauri, no business state** —
   renders in an empty `index.html` given position buffers (passes the
   packages/ litmus). WebGPU compute is the stretch path for the sim itself at
   the 25k+ tier (fallback to WebGL2). **Zero React per frame.**
4. **Feature tier — new `apps/tauri/src/features/graph`.** The React view
   component, filter UI, hover/selection, mode switch. Registers via
   `viewRegistry.register({ type: "graph", … })` in
   `app-shell/viewRegistrations.ts` (ADR-018); reads state through
   `useWorkspaceContext()`; opens notes via `openNote`. **Never a route**
   (ADR-004). Respects feature rules: ≤2 store files, ≤4 hooks, `index.ts`
   surface.

### IPC (realizes ADR-020 moves 3/5/6)

- **Bulk dump (move 3):** node/edge arrays serialized with bincode/postcard in
  Rust, returned via `tauri::ipc::Response::new(bytes)` (skips JSON); decoded
  into typed arrays frontend-side. Matters at ≥10k notes.
- **Windowed paging (move 5):** frontend requests slices ("nodes 500–550");
  Rust answers from its arena. Whole-graph only for small vaults.
- **Channel streams (move 6):** vault-watcher mutations flow over one
  `tauri::ipc::Channel`, coalesced to one batched graph update per frame — a
  25k git checkout fires hundreds of events; React must see one update.

### Physics spec ("real physics")

- **Forces:** Fruchterman-Reingold / ForceAtlas2-style — Barnes-Hut repulsion,
  edge springs, gravity, collision.
- **Integration:** fixed-timestep velocity-Verlet with damping accumulator for
  stability independent of frame rate.
- **Interaction physics:** dragging a node imparts **momentum**; release
  settles or springs back. Pan/zoom carry **inertia**.
- **Animated filter transitions:** when a filter changes the visible set,
  surviving nodes **physically migrate** to their new cluster layout instead of
  hard-cutting. This is the perceived "real" differentiator.

### Feature set beyond Obsidian (the "more powerful" asks)

1. **GPU-rendered, 60fps at 25k nodes** — the headline; Obsidian crawls at 10k.
2. **Queryable graph:** click a node → its neighborhood + **orphan/unlinked-note
   detection**; fuzzy node search (reuse `fuzzy_match`).
3. **Strong filters:** tag-frequency, relative/neighbor (`note OR neighbor-of`),
   property-driven (frontmatter), **directional edges** (arrowheads).
4. **Curated default view** so first open is readable (no structural-file
   clutter).
5. **Modes (stretch):** force graph + optional **spatial whiteboard**
   (Heptabase inspiration) for synthesis.

### Phases (each ships independently)

1. Force-sim module in `basalt-graph` + Criterion benches at 5k and 25k.
2. `basalt-wasm` bridge + sim Web Worker + WebGL2 renderer (`packages/graph`);
   render the full vault graph at 60fps.
3. Registered `graph` view (ADR-018) + open-on-click + binary IPC dump (move 3).
4. Filters (tag-frequency, relative/neighbor, property, directionality) +
   queryable neighborhood + orphan detection.
5. Physics polish: drag momentum, animated filter transitions, inertia pan/zoom.
6. (Stretch) WebGPU compute sim + spatial whiteboard mode.

### Non-goals

- No new route (ADR-004).
- No Canvas2D renderer — that is Obsidian's losing path.
- No plugin API for the graph (gated by ADR-018 Phase 5).
- No server/cloud graph; local-first only.

## Consequences

- Graph compute leaves the webview; the GPU draws. Matches ADR-007 (Rust bulk
  work) and ADR-020.
- Two new packages: `packages/graph` (primitive renderer/worker) and
  `apps/tauri/src/features/graph` (React feature). Both obey layer rules.
- Build pipeline must compile `basalt-graph` → WASM and bundle the worker.
- **Risk — SharedArrayBuffer** needs COOP/COEP headers in dev; set via Tauri
  config / Rust response headers, fall back to transferable `postMessage`.
- **Risk — WebGPU availability**; WebGL2 is the baseline renderer, WebGPU opt-in.
- **Risk — wasm/worker tooling** complexity; mitigated by reusing the existing
  `basalt-wasm` scaffold and the benchmarked `@invariantcontinuum/graph` pattern.

## Verification

- **Criterion benches** in `crates/basalt-graph/benches`: `sim_step` time at 5k
  and 25k fixtures must stay within a 60fps budget (≤16.6ms sim + post per
  frame). 25k tier required (AGENTS.md rule).
- **Browser FPS harness:** render the full 25k vault graph; measure sustained
  frame time. Target ≥60fps; cite Obsidian's lag reports as the comparison
  baseline.
- `bun run lint && bunx tsc --noEmit` after any implementation step (AGENTS.md §7).
