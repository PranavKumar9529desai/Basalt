/// <reference lib="webworker" />
// Phase-2 minimal proof worker: loads the Rust->wasm force sim, ticks it off the
// main thread, and posts position/edge buffers back for the canvas to draw.
// Mirrors the Phase-0 probe's `?init` loading path (vite-plugin-wasm).
import init from "./graph_sim.wasm?init";

type SimExports = {
  sim_seed(n: number, degree: number, seed: number): void;
  sim_step(): void;
  sim_node_count(): number;
  sim_edge_count(): number;
  sim_positions_ptr(): number;
  sim_edges_ptr(): number;
  memory?: WebAssembly.Memory;
  exports?: { memory?: WebAssembly.Memory };
};

let sim: SimExports | null = null;

function memory(): WebAssembly.Memory {
  const anySim = sim as unknown as {
    memory?: WebAssembly.Memory;
    exports?: { memory?: WebAssembly.Memory };
  };
  const m = anySim.memory ?? anySim.exports?.memory;
  if (!m) throw new Error("wasm memory not exposed");
  return m;
}

self.onmessage = async (
  e: MessageEvent<{ action: "start"; n?: number; degree?: number }>,
) => {
  if (e.data.action !== "start") return;
  if (!sim) sim = (await init()) as unknown as SimExports;

  const n = e.data.n ?? 2000;
  const degree = e.data.degree ?? 3;
  sim.sim_seed(n, degree, 1);
  const nodeCount = sim.sim_node_count();
  const edgeCount = sim.sim_edge_count();
  const posPtr = sim.sim_positions_ptr();
  const edgePtr = sim.sim_edges_ptr();

  const tick = () => {
    if (!sim) return;
    sim.sim_step();
    // Re-fetch the buffer each frame: wasm may grow memory on a later step,
    // detaching the previous ArrayBuffer.
    const buf = memory().buffer;
    const positions = new Float32Array(buf, posPtr, nodeCount * 2);
    const edges = new Uint32Array(buf, edgePtr, edgeCount * 2);
    // Copy out so the postMessage payload is a stable, transferable buffer.
    self.postMessage({
      positions: positions.slice(),
      edges: edges.slice(),
      nodeCount,
      edgeCount,
    });
    setTimeout(tick, 1000 / 60);
  };

  tick();
};
