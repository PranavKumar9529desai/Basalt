// Leaf UI lives here; the renderer is the `@workspace/graph` package and the
// force-layout compute is `crates/basalt-graph` (wasm). This is the only legal
// import surface for other layers (see AGENTS.md).
export { Graph } from "./components/Graph";
export { SpatialGrid } from "./spatialGrid";
