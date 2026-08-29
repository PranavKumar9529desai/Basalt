// Graph feature — note-link graph (ADR-021).
//
// Leaf UI + engine live here; the WebGL2 renderer is the `@workspace/graph`
// package and the force-layout compute is `crates/basalt-graph` (wasm).
// This is the only legal import surface for other layers (see AGENTS.md).
export { GraphView } from "./components/GraphView";
export { SpatialGrid } from "./spatialGrid";
