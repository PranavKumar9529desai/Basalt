/// <reference lib="webworker" />
// Phase-0 de-risk probe worker: loads the Rust->wasm probe module and proves
// it executes inside a Tauri web worker (off the main thread).
import init from "./graph_probe.wasm?init";

type ProbeExports = {
  probe_add(a: number, b: number): number;
  probe_magic(): number;
};

let instance: WebAssembly.Instance | null = null;
let ex: ProbeExports | null = null;

self.onmessage = async (e: MessageEvent<{ a: number; b: number }>) => {
  if (!instance) {
    // vite-plugin-wasm's `?init` resolves to the WebAssembly.Instance; the
    // C-ABI functions live on `instance.exports`.
    instance = (await init()) as unknown as WebAssembly.Instance;
    ex = (instance.exports as unknown as ProbeExports) ?? (instance as unknown as ProbeExports);
  }
  const a = e.data?.a ?? 2;
  const b = e.data?.b ?? 40;
  self.postMessage({ ok: true, result: ex!.probe_add(a, b), magic: ex!.probe_magic() });
};
