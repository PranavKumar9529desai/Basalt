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
  top ask is _actionable_ value (surface orphans, broken/duplicate links, jump
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

| App           | Lesson                                                                                                                                                                    | Takeaway                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Logseq**    | Graph DB (DataScript) with queries in a **DB worker thread** so UI stays responsive ([DeepWiki](https://deepwiki.com/logseq/logseq/2-architecture-overview))              | Separate the model/query tier from the render tier; compute off main thread |
| **Tana**      | "Write information, not documents" — nodes/supertags first-class, graph is a query surface ([tana.inc](https://outliner.tana.inc/knowledge-graph))                        | Graph is for navigation, not screensaver                                    |
| **Heptabase** | Infinite **spatial whiteboard** of connected cards as primary metaphor ([review](https://aiindigo.com/blog/heptabase-review-2026-the-visual-brain-for-complex-knowledge)) | Spatial canvas + graph are complementary modes                              |
| **Kinopio**   | Playful node+arrow canvas with tactile motion                                                                                                                             | Physics _feel_ is a feature                                                 |

### What is already built here

- `crates/basalt-graph` owns the graph model: `arena` (`NodeId`,
  `StringArena`), `fuzzy` (node query), and Criterion benches
  (`graph_query`, `arena_growth`, `graph_insert`).
- `crates/basalt-wasm/graph-wasm` already exists as the WASM bridge.
- ADR-020 pre-authorized the graph stack: **move 3** (binary IPC for
  node/edge dumps), **move 4** (WASM force graph in a Web Worker, WebGL render,
  zero React per frame), **move 5** (windowed virtualization), **move 6**
  (channel event streams). This ADR promotes those into a concrete blueprint.

The solved, benchmarked pattern is Rust → WASM graph core + Web Worker graph +
GPU render: `@invariantcontinuum/graph` ("Rust core compiled to WASM… layout
engine inside a Web Worker"), and `hylograph-wasm` reports **3–4× speedup over
D3.js at 10k+ nodes**. We own the crate already.

## Decision

### Governing principle

**The graph view is a GPU-rendered, Rust-owned visualization.** Rust
(`basalt-graph`, compiled to WASM as `graph-wasm`) owns the model and the
force graphulation; the simulation runs off the main thread in a Web Worker;
positions flow from the wasm module's linear memory (a C-ABI pointer) to a
WebGL2 renderer as typed arrays; React never touches per-frame data.

**Acceptance bar (non-negotiable): sustained ≥60fps at ≥25k nodes** on target
hardware — strictly better than Obsidian, which degrades past ~10k notes on
Canvas2D.

### Four tiers (aligned to the four-layer rule)

```
crates/basalt-graph              model + force graph (Rust, native + WASM)
        │  wasm-bindgen (graph-wasm, C-ABI exports)
features/graph/components/GraphWorker.ts
                                 GRAPH WORKER: ticks graph_step(), posts
                                 positions from wasm linear memory each frame
        │  postMessage (transferable typed arrays)
packages/graph                   WEBGL2 RENDERER (pure geometry, no React)
        │  <Graph/> draws from buffers
features/graph                   React view: filters, selection, local graph,
                                 hover/click-to-open; registers via ADR-018
        │  leafRegistry.register({ type: "graph", … })
app-shell/registrations.ts       one-line contribution, no shell surgery
```

1. **Model tier — `crates/basalt-graph` (extend).** Force-simulation module:
   Barnes-Hut quadtree for O(n log n) repulsion, velocity-Verlet integration
   with damping, spring attraction on edges, gravity/centering, optional
   collision. Edge list is built from parser/vault link extraction (reuses the
   backlink pipeline that feeds `get_backlinks`). Reuse the existing arena +
   `fuzzy` query paths.
2. **Bridge tier — `crates/basalt-wasm/graph-wasm` (extend).** Expose graph
   construction and `graph_step()` over a flat **C-ABI** (`graph_alloc_edges`,
   `graph_build`, `graph_step`, `graph_positions_ptr`, `graph_reheat`,
   `graph_set_position`) so a Web Worker can copy edges in and read positions
   back from the wasm linear memory — zero serialization per frame.
3. **Engine tier — `packages/graph` (primitive).** A pure WebGL2 renderer
   (`GraphRenderer`): given a canvas and typed-array scene buffers it draws
   nodes (`gl.POINTS`), edges (`gl.LINES` via `UNSIGNED_INT` index buffer), and
   directional arrowhead triangles. No React, no Tauri, no business state —
   renders in an empty `index.html` given position buffers (passes the
   `packages/` litmus). **Zero React per frame.** No WebGPU path is used;
   WebGL2 is the shipped renderer.
4. **Feature tier — `apps/tauri/src/features/graph`.** The React view: filter
   bar (`tag:`/`path:` operators), color groups (tag, then folder), local-graph
   mode with depth control, directional arrows, display toggles (orphans /
   attachments / text-fade), hover/selection, context menu, click-to-open.
   Registers via `leafRegistry.register({ type: "graph", … })` in
   `app-shell/registrations.ts` (ADR-018); reads state through
   `useLeafServices()`; opens notes via `services.openNote`. **Never a route**
   (ADR-004). Respects feature rules: ≤2 store files, ≤4 hooks, `index.ts`
   surface.

### Snapshot IPC

The feature pulls `get_graph` (a regular Tauri command) which returns a JSON
snapshot — `GraphSnapshot { node_count, nodes (meta: path, tags, is_attachment,
is_tag, cluster), edges (index pairs), edge_weights }`. The snapshot is built
once and transferred to the worker as an `Uint32Array` of edges plus the node
count; the worker copies the edges into wasm linear memory and ticks from then
on. No binary IPC (`tauri::ipc::Response` bytes), no slice-level paging, and no
`Channel` streaming are used — the graph is re-snapshotted on demand.

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

1. Force-graph module in `basalt-graph` + Criterion benches at 5k and 25k. ✅
2. `graph-wasm` C-ABI bridge + `GraphWorker` (features/graph/components) + WebGL2
   renderer (`packages/graph`); render the full vault graph at 60fps. ✅
3. Registered `graph` leaf (ADR-018) + hover/click-to-open + JSON snapshot
   (`get_graph`). ✅
4. Filters (`tag:`/`path:` operators), local-graph mode + depth, directional
   edges, display toggles (orphans/attachments/text-fade), color groups. ✅
5. Physics polish: drag-pan, node drag with reheat. ⚠️ partial — animated
   filter-transition migrations and inertia pan/zoom not shipped.
6. (Deferred) WebGPU compute graph + spatial whiteboard mode.

### Non-goals

- No new route (ADR-004).
- No Canvas2D renderer — that is Obsidian's losing path.
- No plugin API for the graph (gated by ADR-018 Phase 5).
- No server/cloud graph; local-first only.

## Consequences

- Graph compute leaves the webview; the GPU draws. Matches ADR-007 (Rust bulk
  work) and ADR-020.
- Two locations: `packages/graph` (WebGL2 renderer primitive) and
  `apps/tauri/src/features/graph` (React feature + `GraphWorker`). Both obey
  layer rules; the graph leaf is lazy-loaded out of the startup bundle.
- Build pipeline must compile `basalt-graph` → WASM and bundle the worker
  (`graph_sim.wasm?init`, vite-plugin-wasm).
- **Risk — worker tooling:** latency-sensitive; mitigated by reusing the
  `graph-wasm` scaffold and the benchmarked `@invariantcontinuum/graph` pattern.
  Edge transfer into wasm memory plus per-frame pointer reads avoid any
  serialization on the hot loop.
- **Risk — worker init failure:** the worker latches the failure and reports
  once (`{ action: "error" }`) instead of hanging every `await`; the graph
  degrades to a drawing-less area rather than freezing the app.

## Verification

- **Criterion benches** in `crates/basalt-graph/benches`: `graph_step` time at 5k
  and 25k fixtures must stay within a 60fps budget (≤16.6ms graph + post per
  frame). 25k tier required (AGENTS.md rule).
- **Browser FPS harness:** render the full 25k vault graph; measure sustained
  frame time. Target ≥60fps; cite Obsidian's lag reports as the comparison
  baseline.
- `bun run lint && bunx tsc --noEmit` after any implementation step (AGENTS.md §7).
