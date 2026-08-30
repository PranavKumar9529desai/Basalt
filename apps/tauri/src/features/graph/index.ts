// Leaf UI lives here; the renderer is the `@workspace/graph` package and the
// force-layout compute is `crates/basalt-graph` (wasm). This is the only legal
// import surface for other layers (see AGENTS.md).
export { GraphView } from "./components/GraphView";
export { SpatialGrid } from "./spatialGrid";
