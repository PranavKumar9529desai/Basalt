# graph-wasm — Graph Force-Layout WASM Bridge

A minimal **standalone** WASM bridge for the graph force-layout simulation
(ADR-021 Phase 2). Roots a `ForceGraph` (from `basalt-graph`), feeds it flat
edge arrays written into wasm linear memory, and steps the Barnes-Hut layout
one fixed timestep at a time. Exposes a C-ABI surface consumed by
`GraphWorker.ts` on the frontend.

Standalone `<workspace>` (like `frontmatter-wasm`) so
`cargo build --target wasm32-unknown-unknown` does not pull the whole repo
workspace. `cdylib` + `rlib`, `opt-level="z"` + `lto`.

## Public API (C-ABI)

All `#[no_mangle]` `extern "C"`:

| Function                | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `graph_alloc_edges(count)` | Allocate the edge buffer in wasm linear memory   |
| `graph_seed(...)`       | Seed positions (synthetic layout path)             |
| `graph_build(nodes, edges_ptr, ...)` | Build a `ForceGraph` from flat edge arrays |
| `graph_step()`          | Advance the simulation one fixed timestep          |
| `graph_node_count()` / `graph_edge_count()` | Sizes                     |
| `graph_positions_ptr()` | Flat `f32` `[x0,y0,...]` positions buffer (zero-copy) |
| `graph_edges_ptr()`     | The edge index buffer                              |
| `graph_alpha()` / `graph_reheat()` | Simulation cooling control        |
| `graph_set_position(i, x, y)` | Pin a single node position               |

Positions are exposed as a flat `f32` `[x0,y0,...]` buffer for **zero-copy**
rendering — no per-frame serialization.

## Build & verify

The built artifact becomes `apps/tauri/src/features/graph/components/graph_sim.wasm`.
The crate's real output name is `graph_wasm.wasm`; `scripts/build-graph-wasm.sh`
renames it to `graph_sim.wasm` to match the `?init` import in `GraphWorker.ts`.

```bash
bun run build:wasm    # regenerate graph_sim.wasm
bun run verify:wasm   # drive the C-ABI surface via crates/basalt-wasm/graph-wasm/verify.mjs
```

`verify.mjs` exercises both the `graph_seed` and `graph_build` paths.

## Documentation

- ADR-021: [Graph View Architecture](../../../docs/adr/021-graph-view-architecture.md)
- [Graph view notes](../../../docs/graph-view/) (proposal, research)
