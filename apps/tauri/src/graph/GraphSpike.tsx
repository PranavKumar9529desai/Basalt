// Phase-0 de-risk probe UI (DEV only). Confirms the two highest-risk facts on
// the real Tauri webview: (1) a WebGL2 context actually initializes and the
// GPU rasterizes (readback matches the clear color) — the NVIDIA/WebKitGTK
// risk; (2) a Rust-compiled wasm module loads and runs inside a web worker.
// Mounted from main.tsx under `import.meta.env.DEV`. Delete after Phase 0.
//
// Verdict is also console.logged (tag "[graph-spike]") so the result can be
// read from the Tauri dev stdout without looking at the screen.
import { useEffect, useRef, useState } from "react";

console.log("[graph-spike] module loaded");

type Verdict = {
  webgl2: "pending" | "ok" | "fail";
  glVendor?: string;
  glRenderer?: string;
  pixelOk?: boolean;
  worker: "pending" | "ok" | "fail";
  wasmResult?: number;
  wasmMagic?: number;
  error?: string;
};

function Row({ k, val }: { k: string; val: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "var(--sat-text-muted)" }}>{k}</span>
      <span style={{ color: "var(--sat-text-primary)" }}>{val}</span>
    </div>
  );
}

export function GraphSpike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [v, setV] = useState<Verdict>({ webgl2: "pending", worker: "pending" });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const gl = canvas.getContext("webgl2");
      if (!gl) {
        console.log("[graph-spike] webgl2", { ok: false, reason: "no context" });
        setV((p) => ({ ...p, webgl2: "fail", error: "no webgl2 context" }));
      } else {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        const vendor = dbg
          ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string)
          : (gl.getParameter(gl.VENDOR) as string);
        const renderer = dbg
          ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
          : (gl.getParameter(gl.RENDERER) as string);
        gl.clearColor(0.1, 0.6, 0.9, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const pixelOk = px[0] === 25 && px[1] === 153 && px[2] === 229;
        console.log("[graph-spike] webgl2", { ok: true, vendor, renderer, pixelOk });
        setV((p) => ({
          ...p,
          webgl2: "ok",
          glVendor: String(vendor),
          glRenderer: String(renderer),
          pixelOk,
        }));
      }
    }

    const worker = new Worker(new URL("./graphProbe.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (
      e: MessageEvent<{ ok: boolean; result: number; magic: number }>,
    ) => {
      console.log("[graph-spike] wasm", e.data);
      setV((p) => ({ ...p, worker: "ok", wasmResult: e.data.result, wasmMagic: e.data.magic }));
    };
    worker.onerror = (e) => {
      console.log("[graph-spike] wasm", { ok: false, error: e.message });
      setV((p) => ({ ...p, worker: "fail", error: e.message }));
    };
    worker.postMessage({ a: 2, b: 40 });
    return () => worker.terminate();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--sat-surface-1)",
        color: "var(--sat-text-primary)",
        padding: 24,
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflow: "auto",
      }}
    >
      <h1 style={{ fontSize: 18 }}>Graph Stack Spike (DEV only)</h1>
      <canvas ref={canvasRef} width={4} height={4} style={{ position: "absolute", left: -100, top: -100, width: 4, height: 4, opacity: 0, pointerEvents: "none" }} />
      <Row k="WebGL2" val={v.webgl2} />
      {v.glVendor && <Row k="GL vendor" val={v.glVendor} />}
      {v.glRenderer && <Row k="GL renderer" val={v.glRenderer} />}
      {v.pixelOk !== undefined && (
        <Row k="GPU draw" val={v.pixelOk ? "ok (readback matched)" : "MISMATCH"} />
      )}
      <Row k="WASM worker" val={v.worker} />
      {v.wasmResult !== undefined && <Row k="probe_add(2,40)" val={String(v.wasmResult)} />}
      {v.wasmMagic !== undefined && <Row k="probe_magic()" val={String(v.wasmMagic)} />}
      {v.error && <Row k="error" val={v.error} />}
      <p style={{ color: "var(--sat-text-muted)", maxWidth: 620 }}>
        WebGL2 = ok + GPU draw = ok ⇒ NVIDIA/WebKitGTK path is safe. WASM worker = ok +
        probe_add = 42 ⇒ Rust→wasm runs off-thread. Remove the DEV mount in main.tsx after
        Phase 0.
      </p>
    </div>
  );
}
