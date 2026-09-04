// Headless proof: load the built wasm directly (no browser/Tauri) and drive the
// C-ABI surface the web worker uses. Verifies the Rust -> wasm -> JS path for
// both build modes:
//  - graph_seed: synthetic graph generated in wasm (fallback path)
//  - graph_build: real graph ingested as edges (get_graph path)
import { readFileSync } from "node:fs";

const wasmPath = new URL(
  "./target/wasm32-unknown-unknown/release/graph_wasm.wasm",
  import.meta.url,
);
const bytes = readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;

function readPositions(nodeCount) {
  return new Float32Array(e.memory.buffer, e.graph_positions_ptr(), nodeCount * 2);
}

function assertFiniteAndMoving(label, before, after) {
  let finite = true;
  let moved = 0;
  for (let i = 0; i < after.length; i++) {
    if (!Number.isFinite(after[i])) finite = false;
    if (Math.abs(after[i] - before[i]) > 1e-3) moved++;
  }
  console.log(`  ${label}: finite=${finite} moved=${moved}/${after.length}`);
  if (!finite) throw new Error(`${label}: non-finite positions`);
  if (moved < after.length * 0.5) throw new Error(`${label}: positions did not move`);
}

// --- Mode 1: synthetic graph (graph_seed) ---
{
  const N = 2000;
  e.graph_seed(N, 3, 1);
  console.log(`[seed] node_count=${e.graph_node_count()} edge_count=${e.graph_edge_count()}`);
  if (e.graph_node_count() !== N) throw new Error("seed: wrong node count");
  const before = readPositions(N).slice();
  for (let i = 0; i < 60; i++) e.graph_step();
  assertFiniteAndMoving("seed", before, readPositions(N));
}

// --- Mode 2: real graph ingested as edges (graph_build) ---
{
  const N = 6;
  // hexagon + chord
  const edgePairs = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 0, 0, 3];
  const cap = edgePairs.length / 2;
  const ptr = e.graph_alloc_edges(cap);
  new Uint32Array(e.memory.buffer, ptr, edgePairs.length).set(edgePairs);
  e.graph_build(N, ptr, cap);
  console.log(`[build] node_count=${e.graph_node_count()} edge_count=${e.graph_edge_count()}`);
  if (e.graph_node_count() !== N) throw new Error("build: wrong node count");
  if (e.graph_edge_count() !== cap) throw new Error("build: wrong edge count");
  const before = readPositions(N).slice();
  for (let i = 0; i < 60; i++) e.graph_step();
  assertFiniteAndMoving("build", before, readPositions(N));
}

console.log("OK: wasm graph produces finite, evolving positions for both seed and build");
