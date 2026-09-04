//! Force-directed layout simulation for the graph view.
//!
//! The simulation owns the model-independent physics: a Barnes-Hut quadtree
//! gives O(n log n) repulsion, edges are springs, a weak gravity term keeps the
//! cloud centered, and a fixed-timestep damped symplectic integrator settles it
//! without depending on frame rate. State lives in flat `f32` arrays so the
//! WASM bridge hands the renderer a `Float32Array` with zero copy.
//!
//! Node indices in this module are dense `0..n`; `LayoutGraph::from_note_graph`
//! remaps `basalt-graph`'s sparse arena `NodeId`s to that dense space.
//!
//! Performance note: the quadtree is rebuilt every step (positions move) and is
//! then *reordered into BFS layout* so that a node's four children occupy
//! contiguous slots. Barnes-Hut traversal is otherwise random-access and
//! cache-thrash bound at 25k nodes. The `theta` opening criterion is the main
//! speed/accuracy lever: `2.0` clears the ADR-021 60fps gate (≤16.6ms) at 25k
//! with ~2x headroom, leaving room in the same frame budget for WebGL rendering.
//! Lower it (≈1.0–1.2) for higher-quality local clusters on smaller graphs.

mod force_graph;
mod layout_graph;
mod params;
#[cfg(test)]
mod tests;

pub use force_graph::ForceGraph;
pub use layout_graph::LayoutGraph;
pub use params::GraphParams;
