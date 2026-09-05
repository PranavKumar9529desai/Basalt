// The infinite canvas leaf: renders `.canvas` files as an interactive spatial
// viewport (ADR-035). Builds typed arrays from the scene model, feeds the
// WebGL2 viewport renderer in a rAF loop, and overlays DOM text for node
// titles + group labels. Pan, zoom, hover, select, and drag are all handled.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LeafProps } from "@workspace/views";
import { CanvasViewportRenderer } from "@workspace/canvas-viewport";
import type { CanvasTransform } from "@workspace/canvas-viewport";

// ─── Scene model ─────────────────────────────────────────────────────────────

interface SceneNode {
  id: string;
  type: "text" | "file" | "link";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
}
interface SceneGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
}
interface SceneEdge {
  id: string;
  from: string;
  to: string;
}
interface Scene {
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
}

// ─── Preset color map ────────────────────────────────────────────────────────

const PRESET_RGB: Record<string, [number, number, number]> = {
  "1": [0.9, 0.25, 0.3],
  "2": [1.0, 0.63, 0.2],
  "3": [0.95, 0.84, 0.2],
  "4": [0.2, 0.78, 0.4],
  "5": [0.16, 0.7, 0.9],
  "6": [0.6, 0.3, 0.9],
};
const DEFAULT_RGB: [number, number, number] = [0.85, 0.85, 0.87];
const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];
const toRgb = (c: string): [number, number, number] =>
  PRESET_RGB[c] ?? (c.startsWith("#") && c.length === 7 ? hexRgb(c) : DEFAULT_RGB);

// ─── Screen-position helpers ─────────────────────────────────────────────────

interface ScreenRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
const toScreen = (
  x: number,
  y: number,
  w: number,
  h: number,
  v: CanvasTransform,
): ScreenRect => ({
  sx: x * v.scale + v.ox,
  sy: y * v.scale + v.oy,
  sw: w * v.scale,
  sh: h * v.scale,
});

// ─── Typed-array builders ────────────────────────────────────────────────────

function buildBuffers(scene: Scene) {
  const { nodes, groups, edges } = scene;

  const nodePos = new Float32Array(nodes.length * 2);
  const nodeSz = new Float32Array(nodes.length * 2);
  const nodeRgb = new Float32Array(nodes.length * 3);
  const nodeA = new Float32Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    nodePos[i * 2] = n.x;
    nodePos[i * 2 + 1] = n.y;
    nodeSz[i * 2] = n.width;
    nodeSz[i * 2 + 1] = n.height;
    const [r, g, b] = toRgb(n.color);
    nodeRgb[i * 3] = r;
    nodeRgb[i * 3 + 1] = g;
    nodeRgb[i * 3 + 2] = b;
    nodeA[i] = 1;
  }

  const grpPos = new Float32Array(groups.length * 2);
  const grpSz = new Float32Array(groups.length * 2);
  const grpRgb = new Float32Array(groups.length * 3);
  const grpA = new Float32Array(groups.length);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    grpPos[i * 2] = g.x;
    grpPos[i * 2 + 1] = g.y;
    grpSz[i * 2] = g.width;
    grpSz[i * 2 + 1] = g.height;
    const [r, gr, b] = toRgb(g.color);
    grpRgb[i * 3] = r;
    grpRgb[i * 3 + 1] = gr;
    grpRgb[i * 3 + 2] = b;
    grpA[i] = 0.25;
  }

  // Edge midpoints and directions.
  const idx = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) idx.set(nodes[i].id, i);
  for (let i = 0; i < groups.length; i++) idx.set(groups[i].id, nodes.length + i);
  const all = [...nodes, ...groups];
  const edgeMids = new Float32Array(edges.length * 2);
  const edgeDirs = new Float32Array(edges.length * 2);
  const edgeRgb = new Float32Array(edges.length * 3);
  const edgeA = new Float32Array(edges.length);
  let ec = 0;
  for (const e of edges) {
    const fi = idx.get(e.from);
    const ti = idx.get(e.to);
    if (fi === undefined || ti === undefined) continue;
    const f = all[fi];
    const t = all[ti];
    const fx = f.x + f.width / 2;
    const fy = f.y + f.height / 2;
    const tx = t.x + t.width / 2;
    const ty = t.y + t.height / 2;
    edgeMids[ec * 2] = (fx + tx) / 2;
    edgeMids[ec * 2 + 1] = (fy + ty) / 2;
    edgeDirs[ec * 2] = tx - fx;
    edgeDirs[ec * 2 + 1] = ty - fy;
    const [r, g, b] = DEFAULT_RGB;
    edgeRgb[ec * 3] = r;
    edgeRgb[ec * 3 + 1] = g;
    edgeRgb[ec * 3 + 2] = b;
    edgeA[ec] = 0.5;
    ec++;
  }
  return { nodePos, nodeSz, nodeRgb, nodeA, grpPos, grpSz, grpRgb, grpA, edgeMids, edgeDirs, edgeRgb, edgeA, edgeCount: ec };
}

// ─── Mock canvas document (replaced by file load when tab path is a .canvas) ─

const MOCK: Scene = {
  groups: [
    { id: "grp1", x: 30, y: 20, width: 660, height: 380, color: "3", label: "Project Brainstorm" },
  ],
  nodes: [
    { id: "card1", type: "text", x: 50, y: 50, width: 260, height: 140, color: "4", text: "# Core Idea\nBuild tools that respect user data ownership." },
    { id: "card2", type: "text", x: 400, y: 50, width: 260, height: 140, color: "1", text: "# Why?\nProprietary formats create lock-in." },
    { id: "card3", type: "link", x: 400, y: 260, width: 260, height: 80, color: "5" },
    { id: "card4", type: "file", x: 50, y: 400, width: 260, height: 120, color: "2" },
  ],
  edges: [
    { id: "e1", from: "card1", to: "card2" },
    { id: "e2", from: "card2", to: "card3" },
  ],
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const SCALE_STEP = 1.08;

// ─── Window-level state for event handlers (avoids stale closures) ───────────

let _scene: Scene | null = null;
let _screenPos: Map<string, ScreenRect> = new Map();
let _hoveredId: string | null = null;
let _selectedId: string | null = null;
let _dragging: { id: string; offsetX: number; offsetY: number } | null = null;
let _savePath: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function syncOverlay() {
  const root = document.getElementById("canvas-overlay");
  if (!root || !_scene) return;
  for (const el of Array.from(root.children) as HTMLElement[]) {
    const id = el.dataset.nodeId!;
    const r = _screenPos.get(id);
    if (!r) { el.style.display = "none"; continue; }
    el.style.display = "";
    el.style.transform = `translate(${r.sx.toFixed(1)}px,${r.sy.toFixed(1)}px)`;
    el.style.width = `${r.sw.toFixed(1)}px`;
    el.style.height = `${r.sh.toFixed(1)}px`;
    const isHover = id === _hoveredId;
    const isSel = id === _selectedId;
    el.classList.toggle("hovered", isHover && !isSel);
    el.classList.toggle("selected", isSel);
  }
}

function scheduleSave() {
  if (!_savePath || !_scene) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (!_savePath || !_scene) return;
    const doc = { nodes: [..._scene.groups.map(g => ({ ...g, type: "group" })), ..._scene.nodes], edges: _scene.edges.map(e => ({ id: e.id, fromNode: e.from, toNode: e.to })) };
    invoke("save_canvas", { path: _savePath, content: JSON.stringify(doc) }).catch(() => {});
  }, 800);
}

function extractTitle(text?: string): string {
  if (!text) return "";
  const first = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return first.replace(/^#+\s*/, "").trim();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CanvasView({ tab }: LeafProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasViewportRenderer | null>(null);
  const viewRef = useRef<CanvasTransform>({ scale: 1, ox: 200, oy: 100 });
  const rafRef = useRef<number>(0);
  const gpuDirtyRef = useRef(true);

  // Set window-level state accessors for event handlers.
  useEffect(() => {
    window.__canvasGetScreenPos = () => _screenPos;
    window.__canvasGetScene = () => _scene;
    return () => { delete window.__canvasGetScreenPos; delete window.__canvasGetScene; };
  }, []);

  // ── Boot: load file or mock, init renderer, start rAF loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasViewportRenderer(canvas);
    rendererRef.current = renderer;

    let active = true;
    const loadScene = async () => {
      let scene: Scene = MOCK;
      // If the tab's path is a .canvas file, load it via Tauri.
      if (tab.path.endsWith(".canvas")) {
        try {
          const json: string = await invoke("open_canvas", { path: tab.path });
          const doc = JSON.parse(json);
          const groups: SceneGroup[] = [];
          const nodes: SceneNode[] = [];
          for (const n of doc.nodes ?? []) {
            const base = { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, color: n.color ?? "" };
            if (n.type === "group") groups.push({ ...base, label: n.label });
            else nodes.push({ ...base, type: n.type, text: n.text });
          }
          const edges: SceneEdge[] = (doc.edges ?? []).map((e: { id: string; fromNode: string; toNode: string }) => ({ id: e.id, from: e.fromNode, to: e.toNode }));
          scene = { nodes, groups, edges };
          _savePath = tab.path;
        } catch { /* fall through to mock */ }
      }
      if (!active) return;
      _scene = scene;

      const buf = buildBuffers(scene);
      renderer.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
      renderer.setGroups(buf.grpPos, buf.grpSz, buf.grpRgb, buf.grpA);
      renderer.setNodes(buf.nodePos, buf.nodeSz, buf.nodeRgb, buf.nodeA);
      renderer.setEdges(buf.edgeMids, buf.edgeDirs, buf.edgeRgb, buf.edgeA);
      renderer.setView(viewRef.current);
      gpuDirtyRef.current = true;
      recomputeScreenPos();
      syncOverlay();
    };
    loadScene();

    const frame = () => {
      if (gpuDirtyRef.current) {
        renderer.render();
        gpuDirtyRef.current = false;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
      _scene = null;
      _savePath = null;
    };
  }, [tab.path]);

  function recomputeScreenPos() {
    if (!_scene) return;
    const v = viewRef.current;
    _screenPos.clear();
    for (const n of _scene.nodes) _screenPos.set(n.id, toScreen(n.x, n.y, n.width, n.height, v));
    for (const g of _scene.groups) _screenPos.set(g.id, toScreen(g.x, g.y, g.width, g.height, v));
  }

  function pushAlphas() {
    const r = rendererRef.current;
    const s = _scene;
    if (!r || !s) return;
    const hasHover = _hoveredId !== null || _selectedId !== null;
    const nodeA = new Float32Array(s.nodes.length);
    const grpA = new Float32Array(s.groups.length);
    for (let i = 0; i < s.nodes.length; i++) {
      const id = s.nodes[i].id;
      nodeA[i] = hasHover && id !== _hoveredId && id !== _selectedId ? 0.55 : 1;
    }
    for (let i = 0; i < s.groups.length; i++) {
      grpA[i] = hasHover && s.groups[i].id !== _selectedId ? 0.12 : 0.25;
    }
    // Rebuild only the alpha arrays and re-upload via a full setNodes/setGroups.
    // This is acceptable because the number of canvas nodes is small (dozens, not thousands).
    const buf = buildBuffers(s);
    r.setNodes(buf.nodePos, buf.nodeSz, buf.nodeRgb, nodeA);
    r.setGroups(buf.grpPos, buf.grpSz, buf.grpRgb, grpA);
    gpuDirtyRef.current = true;
  }

  function rebuildGPU() {
    const r = rendererRef.current;
    const s = _scene;
    if (!r || !s) return;
    const buf = buildBuffers(s);
    r.setGroups(buf.grpPos, buf.grpSz, buf.grpRgb, buf.grpA);
    r.setNodes(buf.nodePos, buf.nodeSz, buf.nodeRgb, buf.nodeA);
    r.setEdges(buf.edgeMids, buf.edgeDirs, buf.edgeRgb, buf.edgeA);
    gpuDirtyRef.current = true;
  }

  // Expose rebuild/alphas for event handlers.
  useEffect(() => {
    window.__canvasRebuild = rebuildGPU;
    window.__canvasPushAlphas = pushAlphas;
    window.__canvasRecomputeScreenPos = recomputeScreenPos;
    window.__canvasSyncOverlay = syncOverlay;
    window.__canvasMarkDirty = () => { gpuDirtyRef.current = true; };
    window.__canvasScheduleSave = scheduleSave;
    window.__canvasSetHovered = (id: string | null) => { _hoveredId = id; };
    window.__canvasSetSelected = (id: string | null) => { _selectedId = id; };
    window.__canvasGetDragging = () => _dragging;
    window.__canvasSetDragging = (d: { id: string; offsetX: number; offsetY: number } | null) => { _dragging = d; };
    window.__canvasGetView = () => viewRef.current;
    window.__canvasGetRenderer = () => rendererRef.current;
    return () => {
      window.__canvasGetScreenPos = undefined;
      window.__canvasGetScene = undefined;
      window.__canvasRebuild = undefined;
      window.__canvasPushAlphas = undefined;
      window.__canvasRecomputeScreenPos = undefined;
      window.__canvasSyncOverlay = undefined;
      window.__canvasMarkDirty = undefined;
      window.__canvasScheduleSave = undefined;
      window.__canvasSetHovered = undefined;
      window.__canvasSetSelected = undefined;
      window.__canvasGetDragging = undefined;
      window.__canvasSetDragging = undefined;
      window.__canvasGetView = undefined;
      window.__canvasGetRenderer = undefined;
    };
  });

  // ── Pointer events ──
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !_scene) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const v = viewRef.current;
    const wx = (sx - v.ox) / v.scale;
    const wy = (sy - v.oy) / v.scale;

    // Hit-test: groups first (background), then nodes (foreground, topmost last).
    let hit: string | null = null;
    for (const g of _scene.groups) {
      if (wx >= g.x && wx <= g.x + g.width && wy >= g.y && wy <= g.y + g.height) hit = g.id;
    }
    for (const n of _scene.nodes) {
      if (wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) hit = n.id;
    }

    if (hit) {
      const all = [..._scene.groups, ..._scene.nodes];
      const el = all.find((n) => n.id === hit);
      if (el) {
        _dragging = { id: hit, offsetX: wx - el.x, offsetY: wy - el.y };
        _selectedId = hit;
      }
    } else {
      // Pan: start drag for the canvas itself.
      _dragging = null;
      _selectedId = null;
      window.__panDrag = { startX: e.clientX, startY: e.clientY, startOx: v.ox, startOy: v.oy };
    }
    window.__canvasPushAlphas?.();
    window.__canvasSyncOverlay?.();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !_scene) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const v = viewRef.current;
    const wx = (sx - v.ox) / v.scale;
    const wy = (sy - v.oy) / v.scale;

    const drag = _dragging;
    if (drag) {
      const all = [..._scene.groups, ..._scene.nodes];
      const el = all.find((n) => n.id === drag.id);
      if (el) {
        el.x = wx - drag.offsetX;
        el.y = wy - drag.offsetY;
        window.__canvasRecomputeScreenPos?.();
        window.__canvasRebuild?.();
        window.__canvasSyncOverlay?.();
      }
      return;
    }

    const panDrag = window.__panDrag;
    if (panDrag) {
      v.ox = panDrag.startOx + (e.clientX - panDrag.startX);
      v.oy = panDrag.startOy + (e.clientY - panDrag.startY);
      const r = window.__canvasGetRenderer?.();
      if (r) r.setView(v);
      window.__canvasRecomputeScreenPos?.();
      window.__canvasSyncOverlay?.();
      return;
    }

    // Hover detection.
    let hit: string | null = null;
    for (const g of _scene.groups) {
      if (wx >= g.x && wx <= g.x + g.width && wy >= g.y && wy <= g.y + g.height) hit = g.id;
    }
    for (const n of _scene.nodes) {
      if (wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) hit = n.id;
    }
    if (hit !== _hoveredId) {
      window.__canvasSetHovered?.(hit);
      window.__canvasPushAlphas?.();
      window.__canvasSyncOverlay?.();
      canvas.style.cursor = hit ? "grab" : "default";
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.releasePointerCapture(e.pointerId);
    const wasDrag = _dragging !== null;
    _dragging = null;
    window.__panDrag = undefined;
    if (wasDrag) window.__canvasScheduleSave?.();
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = viewRef.current;
    const factor = e.deltaY > 0 ? 1 / SCALE_STEP : SCALE_STEP;
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
    const ratio = ns / v.scale;
    v.ox = mx - (mx - v.ox) * ratio;
    v.oy = my - (my - v.oy) * ratio;
    v.scale = ns;
    const r = window.__canvasGetRenderer?.();
    if (r) r.setView(v);
    window.__canvasRecomputeScreenPos?.();
    window.__canvasSyncOverlay?.();
  };

  // ── Resize observer ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      const r = rendererRef.current;
      if (r && canvas.clientWidth > 0) {
        r.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
        gpuDirtyRef.current = true;
      }
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // ── Render ──
  return (
    <>
    <style>{`.canvas-overlay-node.hovered{box-shadow:0 0 0 2px var(--sat-accent-primary);}.canvas-overlay-node.selected{box-shadow:0 0 0 2px var(--sat-accent-primary),0 0 0 4px color-mix(in srgb,var(--sat-accent-primary) 40%,transparent);}`}</style>
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
      <div
        id="canvas-overlay"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {_scene &&
          [..._scene.groups, ..._scene.nodes].map((el) => (
            <div
              key={el.id}
              data-node-id={el.id}
              className="canvas-overlay-node absolute select-none overflow-hidden"
              style={{ willChange: "transform" }}
            >
              {"label" in el && el.label && (
                <div className="px-2 pt-1 text-xs font-semibold opacity-70"
                     style={{ color: "var(--sat-text-secondary)" }}>
                  {el.label}
                </div>
              )}
              {"text" in el && el.text && (
                <div className="px-3 pt-2 text-sm leading-snug"
                     style={{ color: "var(--sat-text-primary)" }}>
                  {extractTitle(el.text)}
                </div>
              )}
              {"type" in el && el.type === "file" && (
                <div className="px-3 pt-2 text-sm opacity-60"
                     style={{ color: "var(--sat-text-secondary)" }}>
                  📄 file
                </div>
              )}
              {"type" in el && el.type === "link" && (
                <div className="px-3 pt-2 text-sm opacity-60"
                     style={{ color: "var(--sat-text-secondary)" }}>
                  🔗 link
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
    </>
  );
}

// Window-level ambient types for event handler decoupling.
declare global {
  interface Window {
    __panDrag?: { startX: number; startY: number; startOx: number; startOy: number };
    __canvasRebuild?: () => void;
    __canvasPushAlphas?: () => void;
    __canvasRecomputeScreenPos?: () => void;
    __canvasSyncOverlay?: () => void;
    __canvasMarkDirty?: () => void;
    __canvasScheduleSave?: () => void;
    __canvasSetHovered?: (id: string | null) => void;
    __canvasSetSelected?: (id: string | null) => void;
    __canvasGetDragging?: () => { id: string; offsetX: number; offsetY: number } | null;
    __canvasSetDragging?: (d: { id: string; offsetX: number; offsetY: number } | null) => void;
    __canvasGetView?: () => CanvasTransform;
    __canvasGetRenderer?: () => CanvasViewportRenderer | null;
    __canvasGetScreenPos?: () => Map<string, ScreenRect>;
    __canvasGetScene?: () => Scene | null;
  }
}
