/// <reference lib="webworker" />
// Phase-0 de-risk probe worker: loads the Rust->wasm probe module and proves
// it executes inside a Tauri web worker (off the main thread).
import init from "./graph_probe.wasm?init";

type ProbeExports = {
  probe_add(a: number, b: number): number;
  probe_magic(): number;
};

let instance: ProbeExports | null = null;

self.onmessage = async (e: MessageEvent<{ a: number; b: number }>) => {
  if (!instance) instance = (await init()) as unknown as ProbeExports;
  const a = e.data?.a ?? 2;
  const b = e.data?.b ?? 40;
  self.postMessage({ ok: true, result: instance.probe_add(a, b), magic: instance.probe_magic() });
};
