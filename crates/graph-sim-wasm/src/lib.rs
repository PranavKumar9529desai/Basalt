//! Minimal WASM bridge for the graph force simulation (ADR-021 Phase 2 proof).
//!
//! Exposes a C-ABI surface consumed by `graphSim.worker.ts` via
//! vite-plugin-wasm `?init` (same path as `crates/graph-wasm-probe`). Build with
//! `cargo build --target wasm32-unknown-unknown --release` from this crate's
//! directory.
//!
//! The graph is generated *in* wasm (`sim_seed`) so the worker only ever reads
//! positions/edges out — no JS→wasm linear-memory writes are required.

use basalt_graph::{ForceSim, LayoutGraph, SimParams};
use std::cell::RefCell;

struct SimState {
    sim: ForceSim,
    /// Edge list as `(u, v)` pairs; laid out contiguously so `sim_edges_ptr`
    /// reads as a flat `u32` array of length `edge_count * 2`.
    edges: Vec<(u32, u32)>,
}

thread_local! {
    static STATE: RefCell<Option<SimState>> = RefCell::new(None);
}

/// Build a synthetic random graph of `n` nodes, each linked to `degree` random
/// others, and create the simulator with default params (theta = 2.0).
#[no_mangle]
pub extern "C" fn sim_seed(n: u32, degree: u32, seed: u32) {
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

    let layout = LayoutGraph::new(n_usize, edges.clone(), degree_count);
    let sim = ForceSim::new(&layout, SimParams::default());
    STATE.with(|s| *s.borrow_mut() = Some(SimState { sim, edges }));
}

/// Advance the simulation one fixed timestep.
#[no_mangle]
pub extern "C" fn sim_step() {
    STATE.with(|s| {
        if let Some(st) = s.borrow_mut().as_mut() {
            st.sim.step();
        }
    });
}

#[no_mangle]
pub extern "C" fn sim_node_count() -> u32 {
    STATE.with(|s| s.borrow().as_ref().map(|st| st.sim.node_count() as u32).unwrap_or(0))
}

#[no_mangle]
pub extern "C" fn sim_edge_count() -> u32 {
    STATE.with(|s| s.borrow().as_ref().map(|st| st.edges.len() as u32).unwrap_or(0))
}

/// Pointer (wasm linear-memory offset) to the flat `f32` position buffer
/// `[x0, y0, x1, y1, ...]`; length = `sim_node_count() * 2`.
#[no_mangle]
pub extern "C" fn sim_positions_ptr() -> *const f32 {
    STATE.with(|s| {
        s.borrow()
            .as_ref()
            .map(|st| st.sim.positions().as_ptr())
            .unwrap_or(std::ptr::null())
    })
}

/// Pointer to the flat `u32` edge buffer `[u0, v0, u1, v1, ...]`;
/// length = `sim_edge_count() * 2`.
#[no_mangle]
pub extern "C" fn sim_edges_ptr() -> *const u32 {
    STATE.with(|s| {
        s.borrow()
            .as_ref()
            .map(|st| st.edges.as_ptr() as *const u32)
            .unwrap_or(std::ptr::null())
    })
}
