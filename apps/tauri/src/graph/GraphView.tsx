// Real vault note-link graph rendered as a full workbench leaf (ADR-018).
// Feeds `get_graph` to the wasm force graph (GraphWorker), then draws on a WebGL2
// canvas (packages/graph) with Obsidian-style interactions + controls:
// hover-highlight, click-to-open, right-click context menu, wheel zoom,
// drag-pan, node drag, filter bar (tag:/path:/ operators), color groups (by
// tag, then folder), local-graph mode from the active note (or a chosen root)
// with a depth control, directional arrows, and display toggles (orphans /
// attachments / text-fade). Text labels use a transparent 2D overlay so the
// GL canvas stays pure geometry (ADR-021: WebGL2, never Canvas2D).
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { useLeafServices, type LeafProps } from "@workspace/views";
import { GraphRenderer } from "@workspace/graph";
import { useActiveNoteStore } from "../features/editor";
import { useTabsStore } from "../features/tabs";
import { SpatialGrid } from "./spatialGrid";

type GraphNodeMeta = {
  path: string;
  tags: string[];
  is_attachment: boolean;
};
type GraphSnapshot = {
  node_count: number;
  nodes: GraphNodeMeta[];
  edges: number[];
};
type GraphFrame = {
  positions: Float32Array;
  nodeCount: number;
  alpha: number;
};

const NODE_R = 2.6; // node radius in screen px
const MIN_SCALE = 0.02;
const MAX_SCALE = 12;
const LABEL_SCALE = 1.4; // show node labels once zoomed past this
const LABEL_CAP = 1500; // skip labels above this many visible nodes
const CENTER_SCALE = 2.2; // zoom level used when flying to a node
const ARROW_EDGE_CAP = 20000; // skip per-frame arrowheads past this many edges

const PALETTE = [
  "#4cc2ff",
  "#ff7eb6",
  "#ffd166",
  "#06d6a0",
  "#b794f6",
  "#f6ad55",
  "#63b3ed",
  "#fc8181",
  "#68d391",
  "#f687b3",
];

// Build a triangle (3 verts) at the target end of each edge for arrowheads.
// `r`/`w` are the tip offset and half-width in world units (so they shrink
// with zoom, staying proportional to the constant-size node glyph).
function buildArrows(
  positions: Float32Array,
  edges: Uint32Array,
  edgeCount: number,
  scale: number,
): Float32Array {
  const r = (NODE_R + 2) / scale;
  const w = (NODE_R * 0.7 + 2) / scale;
  const n = Math.min(edgeCount, ARROW_EDGE_CAP);
  const out = new Float32Array(n * 6);
  let o = 0;
  for (let e = 0; e < n * 2; e += 2) {
    const u = edges[e];
    const v = edges[e + 1];
    const ux = positions[u * 2];
    const uy = positions[u * 2 + 1];
    const vx = positions[v * 2];
    const vy = positions[v * 2 + 1];
    let dx = vx - ux;
    let dy = vy - uy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const px = -dy;
    const py = dx;
    const tx = vx - dx * r;
    const ty = vy - dy * r;
    const lx = tx + px * w;
    const ly = ty + py * w;
    const rx = tx - px * w;
    const ry = ty - py * w;
    out[o++] = tx;
    out[o++] = ty;
    out[o++] = lx;
    out[o++] = ly;
    out[o++] = rx;
    out[o++] = ry;
  }
  return out;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function GraphView(_props: LeafProps) {
  const services = useLeafServices();
  const activeNotePath = useActiveNoteStore((s) => s.activeNote?.path ?? null);

  const glRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  // Full-graph data (set once on load).
  const pathsRef = useRef<string[]>([]);
  const tagsRef = useRef<string[][]>([]);
  const attachRef = useRef<boolean[]>([]);
  const edgesRef = useRef<Uint32Array>(new Uint32Array(0));
  const adjRef = useRef<number[][]>([]);
  const syntheticRef = useRef(false);

  // Active (visible) subset, recomputed by `rebuild`.
  const activeMapRef = useRef<number[]>([]); // subset idx -> full idx
  const activeEdgesRef = useRef<Uint32Array>(new Uint32Array(0));
  const activeAdjRef = useRef<number[][]>([]);

  const frameRef = useRef<GraphFrame | null>(null);
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0, fitted: false });
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRef = useRef(-1);
  const rebuildRef = useRef<() => void>(() => {});
  const centerOnRef = useRef<(full: number) => void>(() => {});
  // Per-subset hover flag buffer for the renderer (written on hover, uploaded when dirty).
  const flagsRef = useRef<Float32Array>(new Float32Array(0));
  const flagsDirtyRef = useRef(false);
  // Live mirrors of control state so the mount-only rebuild() reads current values.
  const queryRef = useRef("");
  const localRef = useRef(false);
  const showOrphansRef = useRef(true);
  const showAttachRef = useRef(true);
  const activeNotePathRef = useRef<string | null>(null);
  const localDepthRef = useRef(2);
  const localRootRef = useRef<string | null>(null);
  const gridRef = useRef(new SpatialGrid());
  const arrowOutRef = useRef(new Float32Array(0));
  const lastArrowFrameRef = useRef<GraphFrame | null>(null);
  const lastArrowScaleRef = useRef(1);
  const dirtyRef = useRef(true);

  const [query, setQuery] = useState("");
  const [local, setLocal] = useState(false);
  const [showOrphans, setShowOrphans] = useState(true);
  const [showAttach, setShowAttach] = useState(true);
  const [localDepth, setLocalDepth] = useState(2);
  const [localRoot, setLocalRoot] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; title: string } | null>(
    null,
  );
  const [menu, setMenu] = useState<{ x: number; y: number; full: number } | null>(
    null,
  );
  // Keep the mirrors in sync with the rendered state.
  queryRef.current = query;
  localRef.current = local;
  showOrphansRef.current = showOrphans;
  // ---- helpers ----
  const colorFor = (full: number): string => {
    if (attachRef.current[full]) return "#8b949e";
    const ts = tagsRef.current[full];
    if (ts && ts.length) {
      let h = 0;
      for (const c of ts[0]) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return PALETTE[h % PALETTE.length];
    }
    // No tags: color by top-level folder so sibling notes share a hue.
    const p = pathsRef.current[full] ?? "";
    const seg = p.split("/");
    const folder = seg.length > 1 ? seg[0] : "";
    if (folder) {
      let h = 0;
      for (const c of folder) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return PALETTE[h % PALETTE.length];
    }
    return "#4cc2ff";
  };
  const basename = (p: string) => p.split("/").pop() ?? p;

  useEffect(() => {
    const glCanvas = glRef.current;
    const labelCanvas = labelRef.current;
    const wrap = wrapRef.current;
    if (!glCanvas || !labelCanvas || !wrap) return;
    const gl = glCanvas.getContext("webgl2");
    if (!gl) {
      console.error("[graph] WebGL2 unavailable — graph requires WebGL2");
      return;
    }
    const labelCtx = labelCanvas.getContext("2d");
    if (!labelCtx) return;

    const renderer = new GraphRenderer(glCanvas);
    rendererRef.current = renderer;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = glCanvas.clientWidth || 800;
      const cssH = glCanvas.clientHeight || 600;
      renderer.resize(cssW, cssH, dpr);
      labelCanvas.width = Math.round(cssW * dpr);
      labelCanvas.height = Math.round(cssH * dpr);
      labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(glCanvas);

    const worker = new Worker(new URL("./GraphWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<GraphFrame>) => {
      frameRef.current = e.data;
    };

    (async () => {
      try {
        const g = await invoke<GraphSnapshot>("get_graph");
        if (g.node_count === 0) throw new Error("empty vault");
        pathsRef.current = g.nodes.map((n) => n.path);
        tagsRef.current = g.nodes.map((n) => n.tags);
        attachRef.current = g.nodes.map((n) => n.is_attachment);
        edgesRef.current = Uint32Array.from(g.edges);
        syntheticRef.current = false;
        const adj: number[][] = Array.from({ length: g.nodes.length }, () => []);
        for (let e = 0; e < g.edges.length; e += 2) {
          const u = g.edges[e];
          const v = g.edges[e + 1];
          adj[u].push(v);
          adj[v].push(u);
        }
        adjRef.current = adj;
        console.log(
          `[graph] real vault graph: ${g.node_count} nodes, ${g.edges.length / 2} edges`,
        );
      } catch {
        syntheticRef.current = true;
        const n = 2000;
        pathsRef.current = Array.from({ length: n }, (_, i) => `Note ${i}`);
        tagsRef.current = Array.from({ length: n }, () => []);
        attachRef.current = Array.from({ length: n }, () => false);
        edgesRef.current = new Uint32Array(0);
        adjRef.current = Array.from({ length: n }, () => []);
        worker.postMessage({ action: "start", n, degree: 3 });
        console.log("[graph] no vault graph — synthetic fallback");
      }
      setLoaded(true);
    })();

    // Build the visible (filtered / local / display-gated) subset and (re)seed
    // the worker graph with it.
    const rebuild = () => {
      const paths = pathsRef.current;
      if (!paths.length) return;
      const adj = adjRef.current;
      const attach = attachRef.current;
      const tags = tagsRef.current;
      const fullEdges = edgesRef.current;

      const tokens = queryRef.current.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const tagToks: string[] = [];
      const pathToks: string[] = [];
      const textToks: string[] = [];
      for (const t of tokens) {
        if (t.startsWith("tag:")) tagToks.push(t.slice(4));
        else if (t.startsWith("path:")) pathToks.push(t.slice(5));
        else textToks.push(t);
      }
      const passFilter = (i: number): boolean => {
        const p = paths[i].toLowerCase();
        const name = basename(p).replace(/\.md$/, "");
        if (pathToks.length && !pathToks.every((tok) => p.includes(tok))) return false;
        if (tagToks.length) {
          const ts = tags[i] ?? [];
          if (!tagToks.every((tok) => ts.some((x) => x.toLowerCase().includes(tok))))
            return false;
        }
        if (textToks.length && !textToks.every((tok) => name.includes(tok)))
          return false;
        return true;
      };

      const visible: number[] = [];
      for (let i = 0; i < paths.length; i++) {
        if (!passFilter(i)) continue;
        if (!showOrphansRef.current && adj[i].length === 0) continue;
        if (!showAttachRef.current && attach[i]) continue;
        visible.push(i);
      }

      // Local graph: keep only nodes within BFS depth of the root note.
      let finalVisible = visible;
      if (localRef.current) {
        const anp = activeNotePathRef.current;
        const rootPath = localRootRef.current ?? anp;
        if (rootPath) {
          const root = paths.indexOf(rootPath);
          if (root >= 0) {
            const depth = localDepthRef.current;
            const dist = new Map<number, number>();
            const q = [root];
            dist.set(root, 0);
            while (q.length) {
              const u = q.shift()!;
              const d = dist.get(u)!;
              if (d >= depth) continue;
              for (const v of adj[u]) {
                if (!dist.has(v)) {
                  dist.set(v, d + 1);
                  q.push(v);
                }
              }
            }
            const reach = new Set(dist.keys());
            finalVisible = visible.filter((i) => reach.has(i));
          }
        }
      }

      // Map full idx -> subset idx and remap edges.
      const fullToSub = new Map<number, number>();
      const map: number[] = [];
      finalVisible.forEach((full, sub) => {
        fullToSub.set(full, sub);
        map.push(full);
      });
      const subEdges: number[] = [];
      for (let e = 0; e < fullEdges.length; e += 2) {
        const u = fullToSub.get(fullEdges[e]);
        const v = fullToSub.get(fullEdges[e + 1]);
        if (u !== undefined && v !== undefined) subEdges.push(u, v);
      }
      const subAdj: number[][] = map.map(() => []);
      for (let e = 0; e < subEdges.length; e += 2) {
        subAdj[subEdges[e]].push(subEdges[e + 1]);
        subAdj[subEdges[e + 1]].push(subEdges[e]);
      }

      activeMapRef.current = map;
      activeEdgesRef.current = Uint32Array.from(subEdges);
      activeAdjRef.current = subAdj;
      viewRef.current.fitted = false;

      // Rebuild renderer color + reset hover flags for the new subset.
      const cols = new Float32Array(map.length * 3);
      for (let i = 0; i < map.length; i++) {
        const [r, g, b] = hexToRgb(colorFor(map[i]));
        cols[i * 3] = r;
        cols[i * 3 + 1] = g;
        cols[i * 3 + 2] = b;
      }
      renderer.setColors(cols);
      renderer.setEdges(Uint32Array.from(subEdges), subEdges.length / 2);
      if (flagsRef.current.length !== map.length) {
        flagsRef.current = new Float32Array(map.length);
      } else {
        flagsRef.current.fill(0);
      }
      flagsDirtyRef.current = true;
      renderer.setHasHover(false);

      if (!syntheticRef.current) {
        worker.postMessage({
          action: "build",
          nodeCount: map.length,
          edges: Uint32Array.from(subEdges),
        });
      }
    };
    rebuildRef.current = rebuild;

    // ---- transform + hit-test helpers ----
    const toScreen = (wx: number, wy: number): [number, number] => {
      const v = viewRef.current;
      return [wx * v.scale + v.ox, wy * v.scale + v.oy];
    };
    const toWorld = (sx: number, sy: number): [number, number] => {
      const v = viewRef.current;
      return [(sx - v.ox) / v.scale, (sy - v.oy) / v.scale];
    };
    const fit = () => {
      const f = frameRef.current;
      const v = viewRef.current;
      const count = activeMapRef.current.length;
      if (!f || count === 0) return;
      const p = f.positions;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (let i = 0; i < count; i++) {
        const x = p[i * 2];
        const y = p[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const w = glCanvas.clientWidth || 800;
      const h = glCanvas.clientHeight || 600;
      const pad = 40;
      const bw = Math.max(1e-6, maxX - minX);
      const bh = Math.max(1e-6, maxY - minY);
      const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
      v.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      v.ox = w / 2 - ((minX + maxX) / 2) * v.scale;
      v.oy = h / 2 - ((minY + maxY) / 2) * v.scale;
      v.fitted = true;
    };
    // Fly the camera to a node (snap): center it and zoom to a readable scale.
    const centerOn = (full: number) => {
      const f = frameRef.current;
      if (!f || full * 2 + 1 >= f.positions.length) return;
      const x = f.positions[full * 2];
      const y = f.positions[full * 2 + 1];
      const w = glCanvas.clientWidth || 800;
      const h = glCanvas.clientHeight || 600;
      const v = viewRef.current;
      const s = Math.max(v.scale, CENTER_SCALE);
      v.scale = s;
      v.ox = w / 2 - x * s;
      v.oy = h / 2 - y * s;
    };
    centerOnRef.current = centerOn;
    const hitTest = (sx: number, sy: number): number => {
      const f = frameRef.current;
      const count = activeMapRef.current.length;
      if (!f) return -1;
      const p = f.positions;
      let best = -1;
      let bestD = 8 * 8;
      for (let i = 0; i < count; i++) {
        if (i * 2 + 1 >= p.length) break;
        const [px, py] = toScreen(p[i * 2], p[i * 2 + 1]);
        const dx = px - sx;
        const dy = py - sy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    // ---- pointer handlers ----
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = glCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
      v.ox = mx - (mx - v.ox) * (ns / v.scale);
      v.oy = my - (my - v.oy) * (ns / v.scale);
      v.scale = ns;
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // ignore right/middle — context menu handles those
      setMenu(null);
      const rect = glCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      downRef.current = { x: mx, y: my };
      const hit = hitTest(mx, my);
      if (hit >= 0) {
        dragRef.current = { index: hit, moved: false };
        glCanvas.style.cursor = "grabbing";
      } else {
        panRef.current = { x: mx, y: my };
        glCanvas.style.cursor = "grabbing";
      }
    };
    const onMove = (e: MouseEvent) => {
      const rect = glCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragRef.current) {
        const [wx, wy] = toWorld(mx, my);
        worker.postMessage({
          action: "pin",
          index: dragRef.current.index,
          x: wx,
          y: wy,
        });
        dragRef.current.moved = true;
        return;
      }
      if (panRef.current) {
        const dx = mx - panRef.current.x;
        const dy = my - panRef.current.y;
        const v = viewRef.current;
        v.ox += dx;
        v.oy += dy;
        panRef.current = { x: mx, y: my };
        return;
      }
      const hit = hitTest(mx, my);
      const prevHover = hoverRef.current;
      hoverRef.current = hit;
      if (hit >= 0) {
        const f = frameRef.current!;
        const [px, py] = toScreen(f.positions[hit * 2], f.positions[hit * 2 + 1]);
        const full = activeMapRef.current[hit];
        const nb = activeAdjRef.current[hit];
        // Hover flags: hovered = 1, neighbor = 2, else 0.
        const fl = flagsRef.current;
        if (fl.length === activeMapRef.current.length) {
          for (let i = 0; i < fl.length; i++) {
            fl[i] = i === hit ? 1 : nb.includes(i) ? 2 : 0;
          }
        }
        flagsDirtyRef.current = true;
        renderer.setHasHover(true);
        setHover({ x: px, y: py, title: pathsRef.current[full] ?? "" });
        glCanvas.style.cursor = "pointer";
      } else if (prevHover >= 0) {
        flagsRef.current.fill(0);
        flagsDirtyRef.current = true;
        renderer.setHasHover(false);
        setHover(null);
        glCanvas.style.cursor = "grab";
      }
    };
    const onUp = (e: MouseEvent) => {
      const rect = glCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragRef.current) {
        const moved = dragRef.current.moved;
        const down = downRef.current;
        const wasClick = down && Math.hypot(mx - down.x, my - down.y) < 4;
        if (!moved && wasClick) {
          const full = activeMapRef.current[dragRef.current.index];
          const title = pathsRef.current[full];
          if (title) services.openNote(title);
        }
        dragRef.current = null;
      }
      panRef.current = null;
      downRef.current = null;
      glCanvas.style.cursor = "grab";
    };
    const onLeave = () => {
      hoverRef.current = -1;
      setHover(null);
      panRef.current = null;
      dragRef.current = null;
    };
    // Right-click a node -> context menu (Open / Open in New Tab / Center / Local).
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const rect = glCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      if (hit >= 0) {
        setMenu({ x: mx, y: my, full: activeMapRef.current[hit] });
      } else {
        setMenu(null);
      }
    };

    glCanvas.addEventListener("wheel", onWheel, { passive: false });
    glCanvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    glCanvas.addEventListener("mouseleave", onLeave);
    glCanvas.addEventListener("contextmenu", onContext);

    // ---- draw loop ----
    let raf = 0;
    const draw = () => {
      const f = frameRef.current;
      const w = glCanvas.clientWidth || 800;
      const h = glCanvas.clientHeight || 600;
      // Clear the 2D label overlay each frame.
      labelCtx.clearRect(0, 0, w, h);
      const map = activeMapRef.current;
      const count = map.length;
      if (f && count > 0) {
        const p = f.positions;
        if (!viewRef.current.fitted) fit();
        const v = viewRef.current;
        const renderer = rendererRef.current;
        if (renderer) {
          renderer.setPositions(p);
          renderer.setView({ scale: v.scale, ox: v.ox, oy: v.oy });
          if (flagsDirtyRef.current) {
            renderer.setFlags(flagsRef.current);
            flagsDirtyRef.current = false;
          }
          const arrows = buildArrows(p, activeEdgesRef.current, activeEdgesRef.current.length / 2, v.scale);
          renderer.setArrows(arrows);
          renderer.render();
        }
        // Labels on the transparent 2D overlay.
        const hov = hoverRef.current;
        const neighbors = hov >= 0 ? activeAdjRef.current[hov] : null;
        const showLabels = v.scale > LABEL_SCALE && count < LABEL_CAP;
        if (showLabels) {
          labelCtx.font = "10px system-ui, sans-serif";
          labelCtx.fillStyle = "#c9d1d9";
          for (let i = 0; i < count; i++) {
            if (i * 2 + 1 >= p.length) break;
            const full = map[i];
            const [px, py] = toScreen(p[i * 2], p[i * 2 + 1]);
            const dim = hov >= 0 && i !== hov && !(neighbors && neighbors.includes(i));
            labelCtx.globalAlpha = hov < 0 ? 1 : dim ? 0.25 : 1;
            labelCtx.fillText(basename(pathsRef.current[full] ?? ""), px + NODE_R + 2, py + 3);
          }
          labelCtx.globalAlpha = 1;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      worker.terminate();
      renderer.dispose();
      glCanvas.removeEventListener("wheel", onWheel);
      glCanvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      glCanvas.removeEventListener("mouseleave", onLeave);
      glCanvas.removeEventListener("contextmenu", onContext);
    };
  }, [services]);

  // Rebuild the visible subset whenever a control changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => rebuildRef.current(), 120);
    return () => clearTimeout(t);
  }, [query, showOrphans, showAttach, local, localDepth, localRoot, activeNotePath, loaded]);

  const centerActive = () => {
    const p = activeNotePathRef.current;
    if (!p) return;
    const full = pathsRef.current.indexOf(p);
    if (full >= 0) centerOnRef.current(full);
  };

  const openInNewTab = (full: number) => {
    const path = pathsRef.current[full];
    if (!path) return;
    useTabsStore.getState().openPinned({ path, title: basename(path) });
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          right: 8,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter: tag:foo  path:docs  name  (space = AND)"
          style={{ flex: "1 1 240px", minWidth: 180 }}
        />
        <Button variant="outline" size="sm" onClick={() => setLocal((l) => !l)}>
          {local ? "Local: on" : "Local: off"}
        </Button>
        {local && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: "#c9d1d9",
              fontSize: 12,
            }}
          >
            Depth
            <input
              type="range"
              min={1}
              max={5}
              value={localDepth}
              onChange={(e) => setLocalDepth(Number(e.target.value))}
            />
            {localDepth}
          </label>
        )}
        <Button variant="outline" size="sm" onClick={centerActive}>
          Center
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowOrphans((o) => !o)}
        >
          {showOrphans ? "Orphans ✓" : "Orphans"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAttach((a) => !a)}
        >
          {showAttach ? "Attach ✓" : "Attach"}
        </Button>
      </div>
      <canvas
        ref={glRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#0d1117",
          display: "block",
          cursor: "grab",
        }}
      />
      <canvas
        ref={labelRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.x + 10,
            top: hover.y + 10,
            padding: "2px 6px",
            background: "rgba(20,24,33,0.9)",
            color: "#e6edf3",
            fontSize: 12,
            borderRadius: 4,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {hover.title}
        </div>
      )}
      {menu && (
        <div
          style={{
            position: "absolute",
            left: menu.x + 2,
            top: menu.y + 2,
            zIndex: 20,
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 168,
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => {
              const path = pathsRef.current[menu.full];
              if (path) services.openNote(path);
              setMenu(null);
            }}
          >
            Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => {
              openInNewTab(menu.full);
              setMenu(null);
            }}
          >
            Open in New Tab
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => {
              centerOnRef.current(menu.full);
              setMenu(null);
            }}
          >
            Center in Graph
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start w-full"
            onClick={() => {
              const path = pathsRef.current[menu.full];
              if (path) setLocalRoot(path);
              setLocal(true);
              setMenu(null);
            }}
          >
            Open Local Graph
          </Button>
        </div>
      )}
    </div>
  );
}
