// Real vault note-link graph rendered as a full workbench leaf (ADR-018).
// Feeds `get_graph` to the wasm force sim (GraphWorker), then draws on a 2D
// canvas with Obsidian-style interactions + controls: hover-highlight,
// click-to-open, wheel zoom, drag-pan, node drag, filter bar (tag:/path:
// operators), color groups by tag, local-graph mode from the active note,
// directional arrows, and display toggles (orphans / attachments / text-fade).
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { useLeafServices, type LeafProps } from "@workspace/views";
import { useActiveNoteStore } from "../features/editor";

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

export function GraphView(_props: LeafProps) {
  const services = useLeafServices();
  const activeNotePath = useActiveNoteStore((s) => s.activeNote?.path ?? null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);

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
  // Live mirrors of control state so the mount-only rebuild() reads current values.
  const queryRef = useRef("");
  const localRef = useRef(false);
  const showOrphansRef = useRef(true);
  const showAttachRef = useRef(true);
  const activeNotePathRef = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [local, setLocal] = useState(false);
  const [showOrphans, setShowOrphans] = useState(true);
  const [showAttach, setShowAttach] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; title: string } | null>(
    null,
  );
  // Keep the mirrors in sync with the rendered state.
  queryRef.current = query;
  localRef.current = local;
  showOrphansRef.current = showOrphans;
  showAttachRef.current = showAttach;
  activeNotePathRef.current = activeNotePath;

  // ---- helpers ----
  const colorFor = (full: number): string => {
    if (attachRef.current[full]) return "#8b949e";
    const ts = tagsRef.current[full];
    if (ts && ts.length) {
      let h = 0;
      for (const c of ts[0]) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return PALETTE[h % PALETTE.length];
    }
    return "#4cc2ff";
  };
  const basename = (p: string) => p.split("/").pop() ?? p;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 800;
      const cssH = canvas.clientHeight || 600;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

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
    // the worker sim with it.
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

      // Local graph: keep only nodes within BFS depth of the active note.
      let finalVisible = visible;
      if (localRef.current) {
        const anp = activeNotePathRef.current;
        if (anp) {
          const root = paths.indexOf(anp);
          if (root >= 0) {
            const depth = 2;
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
      const w = canvas.clientWidth || 800;
      const h = canvas.clientHeight || 600;
      const pad = 40;
      const bw = Math.max(1e-6, maxX - minX);
      const bh = Math.max(1e-6, maxY - minY);
      const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
      v.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      v.ox = w / 2 - ((minX + maxX) / 2) * v.scale;
      v.oy = h / 2 - ((minY + maxY) / 2) * v.scale;
      v.fitted = true;
    };
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
      const rect = canvas.getBoundingClientRect();
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
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      downRef.current = { x: mx, y: my };
      const hit = hitTest(mx, my);
      if (hit >= 0) {
        dragRef.current = { index: hit, moved: false };
        canvas.style.cursor = "grabbing";
      } else {
        panRef.current = { x: mx, y: my };
        canvas.style.cursor = "grabbing";
      }
    };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
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
        setHover({ x: px, y: py, title: pathsRef.current[full] ?? "" });
        canvas.style.cursor = "pointer";
      } else if (prevHover >= 0) {
        setHover(null);
        canvas.style.cursor = "grab";
      }
    };
    const onUp = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
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
      canvas.style.cursor = "grab";
    };
    const onLeave = () => {
      hoverRef.current = -1;
      setHover(null);
      panRef.current = null;
      dragRef.current = null;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onLeave);

    // ---- draw loop (always runs; worker only updates positions while hot) ----
    let raf = 0;
    const draw = () => {
      const f = frameRef.current;
      const w = canvas.clientWidth || 800;
      const h = canvas.clientHeight || 600;
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, w, h);
      const map = activeMapRef.current;
      const count = map.length;
      if (f && count > 0) {
        const p = f.positions;
        if (!viewRef.current.fitted) fit();
        const v = viewRef.current;
        const hov = hoverRef.current;
        const neighbors = hov >= 0 ? activeAdjRef.current[hov] : null;
        const edges = activeEdgesRef.current;
        const showLabels = v.scale > LABEL_SCALE && count < LABEL_CAP;

        // arrows + edges
        ctx.lineWidth = 1;
        for (let e = 0; e < edges.length; e += 2) {
          const u = edges[e];
          const vv = edges[e + 1];
          if (u * 2 + 1 >= p.length || vv * 2 + 1 >= p.length) continue;
          const [ux, uy] = toScreen(p[u * 2], p[u * 2 + 1]);
          const [vx, vy] = toScreen(p[vv * 2], p[vv * 2 + 1]);
          const active = hov < 0 || u === hov || vv === hov;
          ctx.strokeStyle = hov < 0
            ? "rgba(120,140,170,0.22)"
            : active
              ? "rgba(120,200,255,0.6)"
              : "rgba(120,140,170,0.06)";
          ctx.beginPath();
          ctx.moveTo(ux, uy);
          ctx.lineTo(vx, vy);
          ctx.stroke();
          // arrowhead at the target end
          if (hov < 0 || active) {
            const ang = Math.atan2(vy - uy, vx - ux);
            const tipX = vx - Math.cos(ang) * (NODE_R + 1);
            const tipY = vy - Math.sin(ang) * (NODE_R + 1);
            const size = 4;
            ctx.fillStyle = hov < 0 ? "rgba(120,140,170,0.5)" : "rgba(120,200,255,0.8)";
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX - size * Math.cos(ang - 0.4),
              tipY - size * Math.sin(ang - 0.4),
            );
            ctx.lineTo(
              tipX - size * Math.cos(ang + 0.4),
              tipY - size * Math.sin(ang + 0.4),
            );
            ctx.closePath();
            ctx.fill();
          }
        }

        // nodes
        for (let i = 0; i < count; i++) {
          if (i * 2 + 1 >= p.length) break;
          const full = map[i];
          const [px, py] = toScreen(p[i * 2], p[i * 2 + 1]);
          const dim =
            hov >= 0 && i !== hov && !(neighbors && neighbors.includes(i));
          ctx.globalAlpha = hov < 0 ? 1 : dim ? 0.25 : 1;
          ctx.fillStyle = colorFor(full);
          ctx.beginPath();
          ctx.arc(px, py, NODE_R, 0, Math.PI * 2);
          ctx.fill();
          if (showLabels && !dim) {
            ctx.globalAlpha = Math.min(1, (v.scale - LABEL_SCALE) * 1.5);
            ctx.fillStyle = "#c9d1d9";
            ctx.font = "10px system-ui, sans-serif";
            ctx.fillText(basename(pathsRef.current[full] ?? ""), px + NODE_R + 2, py + 3);
          }
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      worker.terminate();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [services]);

  // Rebuild the visible subset whenever a control changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => rebuildRef.current(), 120);
    return () => clearTimeout(t);
  }, [query, showOrphans, showAttach, local, activeNotePath, loaded]);

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
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "#0d1117",
          cursor: "grab",
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
    </div>
  );
}
