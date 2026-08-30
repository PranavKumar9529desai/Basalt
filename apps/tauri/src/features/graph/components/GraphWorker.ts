/// <reference lib="webworker" />
// Loads the Rust->wasm force graph in a web worker, ticks it off the main
// thread, and posts position buffers back for the canvas to draw.
//
// Obsidian-style cooling: the graph decays `alpha` each step; once it settles
// (alpha < ~0.03) this worker STOPS ticking so the graph doesn't bounce forever.
// Interactions (node drag / reheat) restart the loop via `graph_reheat` /
// `graph_set_position`.
import init from "./graph_sim.wasm?init";

type GraphExports = {
  graph_alloc_edges(capacity: number): number;
  graph_build(node_count: number, edges_ptr: number, edge_count: number): void;
  graph_seed(n: number, degree: number, seed: number): void;
  graph_step(): void;
  graph_node_count(): number;
  graph_positions_ptr(): number;
  graph_alpha(): number;
  graph_reheat(): void;
  graph_set_position(index: number, x: number, y: number): void;
  memory: WebAssembly.Memory;
};

let instance: WebAssembly.Instance | null = null;
let ex: GraphExports | null = null;
let ready: Promise<void> | null = null;
let activeNodeCount = 0;
let running = false;
let failed = false;

function ensureInit(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // vite-plugin-wasm's `?init` resolves to the WebAssembly.Instance; the
      // C-ABI functions (and `memory`) live on `instance.exports`.
      instance = (await init()) as unknown as WebAssembly.Instance;
      ex =
        (instance.exports as unknown as GraphExports) ??
        (instance as unknown as GraphExports);
    })();
  }
  return ready;
}

function start() {
  if (running) return;
  running = true;
  const tick = () => {
    if (!ex) {
      running = false;
      return;
    }
    ex.graph_step();
    // Re-fetch the buffer each frame: wasm may grow memory on a later step,
    // detaching the previous ArrayBuffer.
    const buf = ex.memory.buffer;
    const positions = new Float32Array(
      buf,
      ex.graph_positions_ptr(),
      activeNodeCount * 2,
    );
    self.postMessage({
      positions: positions.slice(),
      nodeCount: activeNodeCount,
      alpha: ex.graph_alpha(),
    });
    if (ex.graph_alpha() > 0.03) {
      setTimeout(tick, 1000 / 60);
    } else {
      running = false;
    }
  };
  tick();
}

self.onmessage = async (
  e: MessageEvent<
    | { action: "build"; nodeCount: number; edges: Uint32Array }
    | { action: "start"; n?: number; degree?: number }
    | { action: "reheat" }
    | { action: "pin"; index: number; x: number; y: number }
  >,
) => {
  if (failed) return;
  try {
    await ensureInit();
  } catch (err) {
    // Latch the failure: report once, then ignore all further messages. Without
    // this, a rejected init promise would hang every await below and freeze the
    // graph with no explanation.
    failed = true;
    self.postMessage({
      action: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  const data = e.data;
  if (data.action === "build") {
    activeNodeCount = data.nodeCount;
    const edgeCount = Math.floor(data.edges.length / 2);
    const ptr = ex!.graph_alloc_edges(edgeCount);
    new Uint32Array(ex!.memory.buffer, ptr, data.edges.length).set(data.edges);
    ex!.graph_build(data.nodeCount, ptr, edgeCount);
    start();
  } else if (data.action === "start") {
    const n = data.n ?? 2000;
    ex!.graph_seed(n, data.degree ?? 3, 1);
    activeNodeCount = ex!.graph_node_count();
    start();
  } else if (data.action === "reheat") {
    ex!.graph_reheat();
    start();
  } else if (data.action === "pin") {
    ex!.graph_set_position(data.index, data.x, data.y);
    ex!.graph_reheat();
    start();
  }
};
