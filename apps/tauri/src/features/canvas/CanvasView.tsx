// The infinite canvas leaf: renders `.canvas` files as an interactive spatial
// viewport (ADR-035). Given a canvas document it builds typed arrays of node
// positions, sizes, colors, and alpha, then feeds the WebGL2 viewport renderer
// (packages/canvas-viewport) in a rAF loop. Pan and zoom are handled via
// pointer events on the WebGL canvas.

import { useEffect, useRef, useCallback } from "react";
import type { LeafProps } from "@workspace/views";
import { CanvasViewportRenderer } from "@workspace/canvas-viewport";
import type { CanvasTransform } from "@workspace/canvas-viewport";

// --- Mock canvas document (replaced by file loading in Phase 6) ---------------

interface MockCanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  label?: string;
}

interface MockCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
}

interface MockCanvasDoc {
  nodes: MockCanvasNode[];
  edges: MockCanvasEdge[];
}

const MOCK_CANVAS: MockCanvasDoc = {
  nodes: [
    {
      id: "card1",
      type: "text",
      x: 50,
      y: 50,
      width: 260,
      height: 140,
      color: "4",
      text: "# Core Idea\nBuild tools that respect user data ownership.",
    },
    {
      id: "card2",
      type: "text",
      x: 400,
      y: 50,
      width: 260,
      height: 140,
      color: "1",
      text: "# Why?\nProprietary formats create lock-in.",
    },
    {
      id: "card3",
      type: "link",
      x: 400,
      y: 260,
      width: 260,
      height: 80,
      color: "5",
    },
    {
      id: "card4",
      type: "file",
      x: 50,
      y: 380,
      width: 260,
      height: 120,
      color: "2",
    },
    {
      id: "grp1",
      type: "group",
      x: 30,
      y: 20,
      width: 660,
      height: 360,
      color: "3",
      label: "Project Brainstorm",
    },
  ],
  edges: [
    { id: "e1", fromNode: "card1", toNode: "card2" },
    { id: "e2", fromNode: "card2", toNode: "card3" },
  ],
};

// --- Color mapping -----------------------------------------------------------

const PRESET_RGB: Record<string, [number, number, number]> = {
  "1": [0.9, 0.25, 0.3],   // red
  "2": [1.0, 0.63, 0.2],   // orange
  "3": [0.95, 0.84, 0.2],  // yellow
  "4": [0.2, 0.78, 0.4],   // green
  "5": [0.16, 0.7, 0.9],   // cyan
  "6": [0.6, 0.3, 0.9],   // purple
};

function colorToRgb(color: string | undefined): [number, number, number] {
  if (!color) return [0.85, 0.85, 0.87]; // default: --sat-text-secondary tone
  if (PRESET_RGB[color]) return PRESET_RGB[color];
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    return [r, g, b];
  }
  return [0.85, 0.85, 0.87];
}

// --- Build typed arrays from canvas document ---------------------------------

interface SceneBuffers {
  nodePositions: Float32Array;
  nodeSizes: Float32Array;
  nodeColors: Float32Array;
  nodeAlphas: Float32Array;
  groupPositions: Float32Array;
  groupSizes: Float32Array;
  groupColors: Float32Array;
  groupAlphas: Float32Array;
  edgeMids: Float32Array;
  edgeDirs: Float32Array;
  edgeColors: Float32Array;
  edgeAlphas: Float32Array;
  nodeCount: number;
  groupCount: number;
  edgeCount: number;
}

function buildSceneBuffers(doc: MockCanvasDoc): SceneBuffers {
  const groups = doc.nodes.filter((n) => n.type === "group");
  const nodes = doc.nodes.filter((n) => n.type !== "group");

  const nodePositions = new Float32Array(nodes.length * 2);
  const nodeSizes = new Float32Array(nodes.length * 2);
  const nodeColors = new Float32Array(nodes.length * 3);
  const nodeAlphas = new Float32Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    nodePositions[i * 2] = n.x;
    nodePositions[i * 2 + 1] = n.y;
    nodeSizes[i * 2] = n.width;
    nodeSizes[i * 2 + 1] = n.height;
    const [r, g, b] = colorToRgb(n.color);
    nodeColors[i * 3] = r;
    nodeColors[i * 3 + 1] = g;
    nodeColors[i * 3 + 2] = b;
    nodeAlphas[i] = 1.0;
  }

  const groupPositions = new Float32Array(groups.length * 2);
  const groupSizes = new Float32Array(groups.length * 2);
  const groupColors = new Float32Array(groups.length * 3);
  const groupAlphas = new Float32Array(groups.length);

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    groupPositions[i * 2] = g.x;
    groupPositions[i * 2 + 1] = g.y;
    groupSizes[i * 2] = g.width;
    groupSizes[i * 2 + 1] = g.height;
    const [r, gr, b] = colorToRgb(g.color);
    groupColors[i * 3] = r;
    groupColors[i * 3 + 1] = gr;
    groupColors[i * 3 + 2] = b;
    groupAlphas[i] = 0.25; // translucent background
  }

  // Build edge index for lookup.
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) nodeIndex.set(nodes[i].id, i);
  // Group nodes also in the edge source/target lookup.
  for (let i = 0; i < groups.length; i++)
    nodeIndex.set(groups[i].id, nodes.length + i);

  // All nodes for edge endpoint lookup (nodes + groups).
  const allNodes = [...nodes, ...groups];
  const edgeMids = new Float32Array(doc.edges.length * 2);
  const edgeDirs = new Float32Array(doc.edges.length * 2);
  const edgeColors = new Float32Array(doc.edges.length * 3);
  const edgeAlphas = new Float32Array(doc.edges.length);
  let edgeCount = 0;

  for (const e of doc.edges) {
    const fi = nodeIndex.get(e.fromNode);
    const ti = nodeIndex.get(e.toNode);
    if (fi === undefined || ti === undefined) continue;
    const f = allNodes[fi];
    const t = allNodes[ti];
    const fx = f.x + f.width / 2;
    const fy = f.y + f.height / 2;
    const tx = t.x + t.width / 2;
    const ty = t.y + t.height / 2;
    edgeMids[edgeCount * 2] = (fx + tx) / 2;
    edgeMids[edgeCount * 2 + 1] = (fy + ty) / 2;
    edgeDirs[edgeCount * 2] = tx - fx;
    edgeDirs[edgeCount * 2 + 1] = ty - fy;
    const [r, g, b] = colorToRgb(undefined);
    edgeColors[edgeCount * 3] = r;
    edgeColors[edgeCount * 3 + 1] = g;
    edgeColors[edgeCount * 3 + 2] = b;
    edgeAlphas[edgeCount] = 0.6;
    edgeCount++;
  }

  return {
    nodePositions,
    nodeSizes,
    nodeColors,
    nodeAlphas,
    groupPositions,
    groupSizes,
    groupColors,
    groupAlphas,
    edgeMids,
    edgeDirs,
    edgeColors,
    edgeAlphas,
    nodeCount: nodes.length,
    groupCount: groups.length,
    edgeCount,
  };
}

// --- Component --------------------------------------------------------------

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

export function CanvasView(_props: LeafProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasViewportRenderer | null>(null);
  const viewRef = useRef<CanvasTransform>({ scale: 1, ox: 200, oy: 100 });
  const dragRef = useRef<{ startX: number; startY: number; startOx: number; startOy: number } | null>(null);
  const rafRef = useRef<number>(0);
  const buffersRef = useRef<SceneBuffers | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasViewportRenderer(canvas);
    rendererRef.current = renderer;

    const buffers = buildSceneBuffers(MOCK_CANVAS);
    buffersRef.current = buffers;

    renderer.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
    renderer.setGroups(
      buffers.groupPositions,
      buffers.groupSizes,
      buffers.groupColors,
      buffers.groupAlphas,
    );
    renderer.setNodes(
      buffers.nodePositions,
      buffers.nodeSizes,
      buffers.nodeColors,
      buffers.nodeAlphas,
    );
    renderer.setEdges(
      buffers.edgeMids,
      buffers.edgeDirs,
      buffers.edgeColors,
      buffers.edgeAlphas,
    );
    renderer.setView(viewRef.current);

    const frame = () => {
      renderer.render();
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const onResize = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    renderer.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(onResize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [onResize]);

  // Pan via pointer drag.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      const v = viewRef.current;
      dragRef.current = { startX: e.clientX, startY: e.clientY, startOx: v.ox, startOy: v.oy };
    },
    [],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const v = viewRef.current;
    v.ox = drag.startOx + (e.clientX - drag.startX);
    v.oy = drag.startOy + (e.clientY - drag.startY);
    rendererRef.current?.setView(v);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Zoom via wheel, centered on cursor.
  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const v = viewRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
    const ratio = newScale / v.scale;
    v.ox = mx - (mx - v.ox) * ratio;
    v.oy = my - (my - v.oy) * ratio;
    v.scale = newScale;
    rendererRef.current?.setView(v);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  );
}
