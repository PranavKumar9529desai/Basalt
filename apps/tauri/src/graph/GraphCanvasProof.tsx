// Phase-2 minimal proof: 2D canvas render of the wasm force simulation. DEV-only
// overlay (mounted from main.tsx under import.meta.env.DEV). Draws live nodes +
// edges streamed from graphSim.worker.ts, auto-fitting the view each frame.
import { useEffect, useRef } from "react";

type Frame = {
  positions: Float32Array;
  edges: Uint32Array;
  nodeCount: number;
  edgeCount: number;
};

export function GraphCanvasProof() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<Frame | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const worker = new Worker(new URL("./graphSim.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<Frame>) => {
      frameRef.current = e.data;
    };
    worker.postMessage({ action: "start", n: 2000, degree: 3 });

    let raf = 0;
    const draw = () => {
      const f = frameRef.current;
      if (f) {
        const { positions, edges, nodeCount } = f;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "#0d1117";
        ctx.fillRect(0, 0, w, h);

        // Bounding box -> fit-to-canvas transform.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < nodeCount; i++) {
          const x = positions[i * 2];
          const y = positions[i * 2 + 1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        const pad = 24;
        const sx = (w - pad * 2) / Math.max(1e-6, maxX - minX);
        const sy = (h - pad * 2) / Math.max(1e-6, maxY - minY);
        const s = Math.min(sx, sy);
        const ox = pad + (w - pad * 2 - (maxX - minX) * s) / 2 - minX * s;
        const oy = pad + (h - pad * 2 - (maxY - minY) * s) / 2 - minY * s;
        const tx = (x: number) => x * s + ox;
        const ty = (y: number) => y * s + oy;

        ctx.strokeStyle = "rgba(120,140,170,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < edges.length; i += 2) {
          const u = edges[i];
          const v = edges[i + 1];
          ctx.moveTo(tx(positions[u * 2]), ty(positions[u * 2 + 1]));
          ctx.lineTo(tx(positions[v * 2]), ty(positions[v * 2 + 1]));
        }
        ctx.stroke();

        ctx.fillStyle = "#4cc2ff";
        for (let i = 0; i < nodeCount; i++) {
          ctx.beginPath();
          ctx.arc(tx(positions[i * 2]), ty(positions[i * 2 + 1]), 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      worker.terminate();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={480}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        border: "1px solid var(--sat-layout-border)",
        borderRadius: 8,
        background: "#0d1117",
      }}
    />
  );
}
