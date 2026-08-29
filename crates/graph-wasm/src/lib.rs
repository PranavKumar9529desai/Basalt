//! Minimal WASM bridge for the graph force layout (ADR-021 Phase 2 proof).
//!
//! Exposes a C-ABI surface consumed by `GraphWorker.ts` via
//! vite-plugin-wasm `?init` (same path as `crates/graph-wasm-probe`). Build with
//! `cargo build --target wasm32-unknown-unknown --release` from this crate's
//! directory.
//!
//! Two build paths:
//! - `graph_seed` generates a *synthetic* graph in wasm (proof fallback).
//! - `graph_alloc_edges` + `graph_build` ingest a *real* graph (dense node count +
//!   flat edge pairs) produced on the Rust side by the `get_graph` command.
//!   The worker writes the edge bytes into wasm linear memory, so this path has
//!   zero JS-side graph construction.

use basalt_graph::{ForceGraph, LayoutGraph, GraphParams};
use std::cell::RefCell;

struct GraphState {
    graph: ForceGraph,
    /// Edge list as `(u, v)` pairs; laid out contiguously so `graph_edges_ptr`
    /// reads as a flat `u32` array of length `edge_count * 2`.
    edges: Vec<(u32, u32)>,
}

thread_local! {
    static STATE: RefCell<Option<GraphState>> = RefCell::new(None);
}

/// Bump buffer for edges written from JS via `graph_alloc_edges`. Lives in wasm
/// linear memory; pointer is stable for the lifetime of the allocation.
static mut EDGE_BUF: Option<Vec<u32>> = None;

/// Allocate a `u32` buffer for `capacity` edges (2 * capacity slots) and return
/// its linear-memory offset. The worker copies the flat edge array here, then
/// calls `graph_build` with this pointer.
#[no_mangle]
pub extern "C" fn graph_alloc_edges(capacity: u32) -> u32 {
    let mut buf = Vec::with_capacity(capacity as usize * 2);
    buf.resize(capacity as usize * 2, 0);
    let ptr = buf.as_ptr() as u32;
    unsafe {
        EDGE_BUF = Some(buf);
    }
    ptr
}

/// Build a synthetic random graph of `n` nodes, each linked to `degree` random
/// others, and create the simulator with default params (theta = 2.0).
#[no_mangle]
pub extern "C" fn graph_seed(n: u32, degree: u32, seed: u32) {
    let mut rng_state: u64 = if seed == 0 {
        0x9E37_79B9_7F4A_7C15
    } else {
        seed as u64
    };
    let mut rng = || {
        rng_state ^= rng_state << 13;
        rng_state ^= rng_state >> 7;
        rng_state ^= rng_state << 17;
        rng_state
    };

    let n_usize = n as usize;
    let mut edges: Vec<(u32, u32)> = Vec::with_capacity(n_usize * degree as usize);
    let mut degree_count = vec![0u32; n_usize];
    for i in 0..n {
        for _ in 0..degree {
            let j = (rng() % n as u64) as u32;
            if j != i {
                edges.push((i, j));
                degree_count[i as usize] += 1;
                degree_count[j as usize] += 1;
            }
        }
    }

    let layout = LayoutGraph::new(n_usize, edges.clone(), degree_count, vec![0u8; n_usize]);
    let graph = ForceGraph::new(&layout, GraphParams::default());
    STATE.with(|s| *s.borrow_mut() = Some(GraphState { graph, edges }));
}

/// Build the simulator from a real graph: `edges_ptr` points to a flat `u32`
/// array `[u0, v0, u1, v1, ...]` of length `edge_count * 2`, in the dense index
/// space produced by `get_graph`.
#[no_mangle]
pub extern "C" fn graph_build(node_count: u32, edges_ptr: *const u32, edge_count: u32) {
    let slice = unsafe { std::slice::from_raw_parts(edges_ptr, edge_count as usize * 2) };
    let mut edges: Vec<(u32, u32)> = Vec::with_capacity(edge_count as usize);
    let mut degree = vec![0u32; node_count as usize];
    let mut i = 0;
    while i < slice.len() {
        let u = slice[i];
        let v = slice[i + 1];
        edges.push((u, v));
        degree[u as usize] += 1;
        degree[v as usize] += 1;
        i += 2;
    }
    let layout = LayoutGraph::new(node_count as usize, edges.clone(), degree, vec![0u8; node_count as usize]);
    let graph = ForceGraph::new(&layout, GraphParams::default());
    STATE.with(|s| *s.borrow_mut() = Some(GraphState { graph, edges }));
}

/// Advance the layout one fixed timestep (forces scaled by the cooling alpha).
#[no_mangle]
pub extern "C" fn graph_step() {
    STATE.with(|s| {
        if let Some(st) = s.borrow_mut().as_mut() {
            st.graph.step();
        }
    });
}

#[no_mangle]
pub extern "C" fn graph_node_count() -> u32 {
    STATE.with(|s| s.borrow().as_ref().map(|st| st.graph.node_count() as u32).unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn graph_edge_count() -> u32 {
    STATE.with(|s| s.borrow().as_ref().map(|st| st.edges.len() as u32).unwrap_or(0))
}

/// Pointer (wasm linear-memory offset) to the flat `f32` position buffer
/// `[x0, y0, x1, y1, ...]`; length = `graph_node_count() * 2`.
#[no_mangle]
pub extern "C" fn graph_positions_ptr() -> *const f32 {
    STATE.with(|s| {
        s.borrow()
            .as_ref()
            .map(|st| st.graph.positions().as_ptr())
            .unwrap_or(std::ptr::null())
    })
}

/// Pointer to the flat `u32` edge buffer `[u0, v0, u1, v1, ...]`;
/// length = `graph_edge_count() * 2`.
#[no_mangle]
pub extern "C" fn graph_edges_ptr() -> *const u32 {
    STATE.with(|s| {
        s.borrow()
            .as_ref()
            .map(|st| st.edges.as_ptr() as *const u32)
            .unwrap_or(std::ptr::null())
    })
}

/// Current cooling factor: 1.0 = full force, decays toward ALPHA_MIN as the
/// layout settles. The worker stops ticking once this drops below ~0.03.
#[no_mangle]
pub extern "C" fn graph_alpha() -> f32 {
    STATE.with(|s| s.borrow().as_ref().map(|st| st.graph.alpha()).unwrap_or(0.0))
}

/// Restart the layout (e.g. after a node drag) so it re-settles.
#[no_mangle]
pub extern "C" fn graph_reheat() {
    STATE.with(|s| {
        if let Some(st) = s.borrow_mut().as_mut() {
            st.graph.reheat();
        }
    });
}

/// Pin a node to a world position (used while dragging) and zero its velocity.
#[no_mangle]
pub extern "C" fn graph_set_position(index: u32, x: f32, y: f32) {
    STATE.with(|s| {
        if let Some(st) = s.borrow_mut().as_mut() {
            st.graph.set_position(index as usize, x, y);
        }
    });
}
