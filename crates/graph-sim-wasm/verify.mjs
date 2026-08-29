// Headless proof: load the built wasm directly (no browser/Tauri) and drive the
// C-ABI surface the web worker will use. Verifies the Rust -> wasm -> JS path:
// seed a graph, step it, and confirm positions are finite and actually move.
import { readFileSync } from "node:fs";

const wasmPath = new URL(
  "./target/wasm32-unknown-unknown/release/graph_sim_wasm.wasm",
  import.meta.url,
);
const bytes = readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;

const N = 2000;
const DEGREE = 3;
e.sim_seed(N, DEGREE, 1);

const nodeCount = e.sim_node_count();
const edgeCount = e.sim_edge_count();
console.log(`seeded: node_count=${nodeCount} edge_count=${edgeCount}`);
if (nodeCount !== N) throw new Error(`expected ${N} nodes, got ${nodeCount}`);
if (edgeCount === 0) throw new Error("no edges generated");

const readPositions = () =>
  new Float32Array(e.memory.buffer, e.sim_positions_ptr(), nodeCount * 2);

const before = readPositions().slice();
for (let i = 0; i < 60; i++) e.sim_step();
const after = readPositions();

let finite = true;
let moved = 0;
for (let i = 0; i < after.length; i++) {
  if (!Number.isFinite(after[i])) finite = false;
  if (Math.abs(after[i] - before[i]) > 1e-3) moved++;
}

console.log(`finite=${finite} moved=${moved}/${after.length}`);
if (!finite) throw new Error("non-finite positions");
if (moved < after.length * 0.5) throw new Error("positions did not move");
console.log("OK: wasm sim produces finite, evolving positions");
