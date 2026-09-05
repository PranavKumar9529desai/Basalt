// CanvasView — thin composition shell. All state, GPU, and interaction live
// in useCanvasController.ts; pure helpers in lib/; DOM sync in lib/overlay.ts.

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LeafProps } from "@workspace/views";
import { CanvasViewportRenderer } from "@workspace/canvas-viewport";
import type { Scene, SceneEdge, SceneGroup, SceneNode } from "./lib/scene";
import type { Side } from "./lib/scene";
import { MOCK_SCENE } from "./lib/scene";
import { setActiveCanvas } from "./commands";
import { useCanvasController } from "./useCanvasController";

export function CanvasView({ tab }: LeafProps) {
  const c = useCanvasController();

  // ─── Command handle (palette commands read this) ──────────────────────────

  useEffect(() => {
    setActiveCanvas({
      groupSelection: c.groupSelection,
      deleteSelection: c.deleteSelection,
      selectionCount: () => c.selectedRef.current.size,
    });
    return () => setActiveCanvas(null);
  }, [c.groupSelection, c.deleteSelection, c.selectedRef]);

  // ─── Boot: load canvas file, init renderer, start rAF ─────────────────────

  useEffect(() => {
    const canvas = c.canvasRef.current;
    if (!canvas) return;
    const renderer = new CanvasViewportRenderer(canvas);
    c.rendererRef.current = renderer;
    let active = true;

    const boot = async () => {
      let scene: Scene = MOCK_SCENE;
      if (tab.path.endsWith(".canvas")) {
        try {
          const json: string = await invoke("open_canvas", { path: tab.path });
          const doc = JSON.parse(json);
          const groups: SceneGroup[] = [];
          const nodes: SceneNode[] = [];
          let maxId = 0;
          for (const n of doc.nodes ?? []) {
            const base = { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, color: n.color ?? "" };
            const numId = parseInt(n.id, 10);
            if (!isNaN(numId) && numId > maxId) maxId = numId;
            if (n.type === "group") groups.push({ ...base, label: n.label });
            else nodes.push({ ...base, type: n.type, text: n.text });
          }
          const edges: SceneEdge[] = (doc.edges ?? []).map((e: Record<string, string>) => ({
            id: e.id, from: e.fromNode, to: e.toNode,
            fromSide: e.fromSide as Side | undefined,
            toSide: e.toSide as Side | undefined,
            label: e.label,
          }));
          scene = { nodes, groups, edges, nextNodeId: maxId };
          c.savePathRef.current = tab.path;
        } catch { /* fall through to mock */ }
      }
      if (!active) return;
      c.sceneRef.current = scene;
      c.rebuildIndex();
      renderer.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
      c.pushGPU();
      renderer.setView(c.viewRef.current);
      c.syncOverlay();
    };
    void boot();

    const frame = () => {
      if (c.gpuDirtyRef.current) {
        renderer.render();
        c.gpuDirtyRef.current = false;
      }
      c.rafRef.current = requestAnimationFrame(frame);
    };
    c.rafRef.current = requestAnimationFrame(frame);

    // Capture refs at effect-time for cleanup.
    const rafId = c.rafRef.current;
    const overlayNodesMap = c.overlayNodesRef.current;
    const rendererSnap = c.rendererRef.current;

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      rendererSnap?.dispose();
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      c.rendererRef.current = null;
      for (const [, el] of overlayNodesMap) el.remove();
      overlayNodesMap.clear();
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      c.sceneRef.current = MOCK_SCENE;
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      c.savePathRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- boot runs once per tab
  }, [tab.path]);

  // ─── Resize observer ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = c.canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      const r = c.rendererRef.current;
      if (r && canvas.clientWidth > 0) {
        r.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
        c.gpuDirtyRef.current = true;
        c.pushGPU();
        c.syncOverlay();
      }
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Create overlay elements (SVG line, marquee, handles container) ───────

  useEffect(() => {
    const container = c.containerRef.current;
    if (!container) return;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;";
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("stroke", "var(--sat-accent-primary)");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "6,4");
    line.style.display = "none";
    svg.appendChild(line);
    container.appendChild(svg);
    c.edgeLineRef.current = line;

    const marquee = document.createElement("div");
    marquee.style.cssText = "position:absolute;border:1px dashed var(--sat-accent-primary);background:color-mix(in srgb,var(--sat-accent-primary) 10%,transparent);pointer-events:none;display:none;z-index:6;";
    container.appendChild(marquee);
    c.marqueeRef.current = marquee;

    const handles = document.createElement("div");
    handles.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:7;";
    container.appendChild(handles);
    c.handleContainerRef.current = handles;

    return () => { svg.remove(); marquee.remove(); handles.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <style>{`.canvas-overlay-node.hovered{box-shadow:0 0 0 2px var(--sat-accent-primary);}.canvas-overlay-node.selected{box-shadow:0 0 0 2px var(--sat-accent-primary),0 0 0 4px color-mix(in srgb,var(--sat-accent-primary) 40%,transparent);}`}</style>
    <div
      ref={c.containerRef}
      className="relative h-full w-full overflow-hidden"
    >
      <canvas
        ref={c.canvasRef}
        className="absolute inset-0 h-full w-full"
        tabIndex={0}
        onFocus={c.onContainerFocus}
        onBlur={c.onContainerBlur}
        onPointerDown={c.onPointerDown}
        onPointerMove={c.onPointerMove}
        onPointerUp={c.onPointerUp}
        onWheel={c.onWheel}
        onDoubleClick={c.onDoubleClick}
        onKeyDown={c.onKeyDown}
      />
      <div ref={c.overlayRef} id="canvas-overlay" className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
    </>
  );
}
