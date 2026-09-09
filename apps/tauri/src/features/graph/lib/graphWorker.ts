/// <reference lib="webworker" />
// The C-ABI WebAssembly force-graph worker (ADR-038 §3 graph split, moved
// from components/GraphWorker.ts). Loads the Rust->wasm force graph in a web
// worker, ticks it off the main thread, and posts position buffers back for
// the canvas to draw.
//
// Obsidian-style cooling: the graph decays `alpha` each step; once it settles
// (alpha < ~0.03) this worker STOPS ticking so the graph doesn't bounce
// forever. Interactions (node drag / reheat) restart the loop via
// `graph_reheat` / `graph_set_position`.
//
// This module is loaded ONLY as a worker entry (`new Worker(new URL(...))` in
// hooks/useGraphEngine.ts) — main-thread code imports its message types with
// `import type`, which the compiler erases.
import init from "../components/graph_sim.wasm?init";

type GraphExports = {
  graph_alloc_edges(capacity: number): number;
  graph_build(
    node_count: number,
    edges_offset: number,
    edge_count: number,
  ): void;
  graph_seed(n: number, degree: number, seed: number): void;
  graph_step(): void;
  graph_node_count(): number;
  graph_positions_ptr(): number;
  graph_alpha(): number;
  graph_reheat(): void;
  graph_set_position(index: number, x: number, y: number): void;
  memory: WebAssembly.Memory;
};

// --- Worker protocol types (imported by the engine with `import type`) ------

export interface GraphNodeMeta {
  path: string;
  tags: string[];
  is_attachment: boolean;
  is_tag: boolean;
  cluster: number;
}

export interface GraphSnapshot {
  node_count: number;
  nodes: GraphNodeMeta[];
  edges: number[] | Uint32Array;
  edge_weights: number[] | Float32Array;
}

export interface GraphFrame {
  positions: Float32Array;
  nodeCount: number;
  alpha: number;
}

export type GraphWorkerMessage =
  | GraphFrame
  | { action: "error"; message: string };

// --- Worker implementation ------------------------------------------------

let instance: WebAssembly.Instance | null = null;
let ex: GraphExports | null = null;
let ready: Promise<void> | null = null;
let activeNodeCount = 0;
let running = false;
let failed = false;

const recycledBuffers: ArrayBuffer[] = [];

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
    // Zero-allocation position transfer using double-buffered pool
    const floatCount = activeNodeCount * 2;
    const requiredBytes = floatCount * 4;
    let transferBuf = recycledBuffers.pop();
    if (!transferBuf || transferBuf.byteLength < requiredBytes) {
      transferBuf = new ArrayBuffer(requiredBytes);
    }

    const wasmPositions = new Float32Array(
      ex.memory.buffer,
      ex.graph_positions_ptr(),
      floatCount,
    );
    const outPositions = new Float32Array(transferBuf, 0, floatCount);
    outPositions.set(wasmPositions);

    self.postMessage(
      {
        positions: outPositions,
        nodeCount: activeNodeCount,
        alpha: ex.graph_alpha(),
      },
      [transferBuf],
    );

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
    | { action: "recycle"; buffer: ArrayBuffer }
  >,
) => {
  if (failed) return;
  try {
    await ensureInit();
  } catch (err) {
    failed = true;
    self.postMessage({
      action: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  const data = e.data;
  if ("action" in data && data.action === "recycle") {
    if (data.buffer && data.buffer.byteLength > 0) {
      recycledBuffers.push(data.buffer);
    }
    return;
  }
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