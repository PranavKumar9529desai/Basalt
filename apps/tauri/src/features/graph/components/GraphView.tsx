// The real vault note-link graph, rendered as a full workbench leaf. Feeds
// `get_graph` to the wasm force graph (GraphWorker), then draws on a WebGL2
// canvas (packages/graph) with Obsidian-style interactions + controls:
// hover-highlight, click-to-open, right-click context menu, wheel zoom,
// drag-pan, node drag, filter bar (tag:/path:/ operators), color groups (by
// tag, then folder), local-graph mode from the active note (or a chosen root)
// with a depth control, directional arrows, and display toggles (orphans /
// attachments / text-fade). Text labels use a transparent 2D overlay so the
// GL canvas stays pure geometry (ADR-021: WebGL2, never Canvas2D).
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLeafServices, type LeafProps } from "@workspace/views";
import { GraphRenderer } from "@workspace/graph";
import { Button } from "@workspace/ui/components/ui/button";
import { SpatialGrid } from "../spatialGrid";
import { computeNodeSize } from "../nodeScale";
import { GraphControls, type GraphColorMode } from "./GraphControls";
import { GraphContextMenu } from "./GraphContextMenu";

type GraphNodeMeta = {
  path: string;
  tags: string[];
  is_attachment: boolean;
  is_tag: boolean;
  cluster: number;
};
type GraphSnapshot = {
  node_count: number;
  nodes: GraphNodeMeta[];
  edges: number[];
  edge_weights: number[];
};
type GraphFrame = {
  positions: Float32Array;
  nodeCount: number;
  alpha: number;
};

type GraphWorkerMessage =
  | GraphFrame
  | { action: "error"; message: string };

const NODE_R = 2.6; // node radius in screen px
const MIN_SCALE = 0.02;
const MAX_SCALE = 12;
const LABEL_SCALE = 1.4; // show node labels once zoomed past this
const LABEL_CAP = 1500; // skip labels above this many visible nodes
const CENTER_SCALE = 2.2; // zoom level used when flying to a node
const ARROW_EDGE_CAP = 20000; // skip per-frame arrowheads past this many edges


// Build a triangle (3 verts) at the target end of each edge for arrowheads.
// `r`/`w` are the tip offset and half-width in world units (so they shrink
// with zoom, staying proportional to the constant-size node glyph).
function buildArrows(
  positions: Float32Array,
  edges: Uint32Array,
  edgeCount: number,
  scale: number,
  out: Float32Array,
): Float32Array {
  const r = (NODE_R + 2) / scale;
  const w = (NODE_R * 0.7 + 2) / scale;
  const n = Math.min(edgeCount, ARROW_EDGE_CAP);
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

interface ThemeColors {
  note: [number, number, number];
  attachment: [number, number, number];
  tag: [number, number, number][];
  tagFill: [number, number, number];
  edge: [number, number, number];
  label: string;
  hoverFill: [number, number, number];
  hoverRing: [number, number, number];
}
const FALLBACK_COLORS: ThemeColors = {
  note: [0.54, 0.58, 0.6],
  attachment: [0.54, 0.58, 0.6],
  tag: [
    [0.3, 0.76, 1],
    [0.25, 0.73, 0.31],
    [0.82, 0.6, 0.13],
    [0.97, 0.32, 0.29],
    [0.34, 0.65, 1],
    [0.9, 0.93, 0.95],
  ],
  tagFill: [0.25, 0.73, 0.31],
  edge: [0.54, 0.58, 0.6],
  label: "#c9d1d9",
  hoverFill: [0.3, 0.76, 1],
  hoverRing: [0.9, 0.93, 0.95],
};
const readThemeColors = (): ThemeColors => {
  const tmp = document.createElement("canvas").getContext("2d")!;
  const cs = getComputedStyle(document.documentElement);
  const resolve = (name: string, fallback: string): [number, number, number] => {
    tmp.fillStyle = "#000";
    tmp.fillStyle = cs.getPropertyValue(name).trim() || fallback;
    const norm = tmp.fillStyle;
    if (norm.startsWith("#")) {
      const n = parseInt(norm.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const m = norm.match(/[\d.]+/g);
    return m ? [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255] : [0, 0, 0];
  };
  const resolveCss = (name: string, fallback: string): string => {
    tmp.fillStyle = "#000";
    tmp.fillStyle = cs.getPropertyValue(name).trim() || fallback;
    return tmp.fillStyle;
  };
  return {
    note: resolve("--sat-graph-node", "#8b949e"),
    attachment: resolve("--sat-graph-attachment", "#8b949e"),
    tag: [
      resolve("--sat-accent-primary", "#4cc2ff"),
      resolve("--sat-state-success", "#3fb950"),
      resolve("--sat-state-warning", "#d29922"),
      resolve("--sat-state-danger", "#f85149"),
      resolve("--sat-state-info", "#58a6ff"),
      resolve("--sat-text-primary", "#e6edf3"),
    ],
    tagFill: resolve("--sat-graph-tag", "#3fb950"),
    edge: resolve("--sat-graph-edge", "#8b949e"),
    label: resolveCss("--sat-graph-label", "#e6edf3"),
    hoverFill: resolve("--sat-graph-hover-fill", "#4cc2ff"),
    hoverRing: resolve("--sat-graph-hover-ring", "#e6edf3"),
  };
};

// Plain-text excerpt for hover preview: drop frontmatter, strip common markdown
// markers, collapse whitespace, cap length. Keeps the preview cheap (no CM6).
const EXCERPT_MAX = 600;
const noteExcerpt = (md: string): string => {
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const cleaned = body
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>`]/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return cleaned.length > EXCERPT_MAX
    ? cleaned.slice(0, EXCERPT_MAX).replace(/\s+\S*$/, "") + "…"
    : cleaned;
};
interface PersistedGraphState {
  query: string;
  local: boolean;
  localDepth: number;
  localRoot: string | null;
  showOrphans: boolean;
  showAttach: boolean;
  colorMode: GraphColorMode;
  controlsOpen: boolean;
  camera?: { scale: number; ox: number; oy: number };
}

export function GraphView({ tab }: LeafProps) {
  const services = useLeafServices();
  const activeNotePath = services.activeNote?.path ?? null;

  // The leaf-services bag identity changes whenever activeNote/activeTab
  // change, but these callbacks themselves are stable. Mount the worker +
  // renderer ONCE: remounting would reset camera + layout and rerun the whole
  // force sim every time the user switches notes.
  const openNoteRef = useRef(services.openNote);
  openNoteRef.current = services.openNote;

  const glRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);

  // Full-graph data (set once on load).
  const pathsRef = useRef<string[]>([]);
  const tagsRef = useRef<string[][]>([]);
  const attachRef = useRef<boolean[]>([]);
  const isTagRef = useRef<boolean[]>([]);
  const edgesRef = useRef<Uint32Array>(new Uint32Array(0));
  const edgeWeightsRef = useRef<Float32Array>(new Float32Array(0));
  const clusterRef = useRef<Uint32Array>(new Uint32Array(0));
  const clusterCountRef = useRef(1);
  const colorModeRef = useRef<GraphColorMode>("single");
  const themeColorsRef = useRef<ThemeColors>(FALLBACK_COLORS);
  const adjRef = useRef<number[][]>([]);
  const syntheticRef = useRef(false);

  // Active (visible) subset, recomputed by `rebuild`.
  const activeMapRef = useRef<number[]>([]); // subset idx -> full idx
  const activeEdgesRef = useRef<Uint32Array>(new Uint32Array(0));
  const activeEdgeWeightsRef = useRef<Float32Array>(new Float32Array(0));
  const activeAdjRef = useRef<number[][]>([]);

  const frameRef = useRef<GraphFrame | null>(null);
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0, fitted: false });
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRef = useRef(-1);
  const rebuildRef = useRef<() => void>(() => {});
  const recolorRef = useRef<() => void>(() => {});
  const centerOnRef = useRef<(full: number) => void>(() => {});
  const fitRef = useRef<() => void>(() => {});
  // Per-subset hover flag buffer for the renderer (written on hover, uploaded when dirty).
  const flagsRef = useRef<Float32Array>(new Float32Array(0));
  const flagsDirtyRef = useRef(false);
  const edgeFlagsRef = useRef<Float32Array>(new Float32Array(0));
  const edgeFlagsDirtyRef = useRef(false);
  const hoverEdgeFullRef = useRef(-1);
  // Per-subset drawn sizes (CSS px diameter) and the underlying importance
  // array (link degree / tag note-count) they are derived from.
  const sizesRef = useRef<Float32Array>(new Float32Array(0));
  const scaleInputsRef = useRef<Float32Array>(new Float32Array(0));
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
  const [colorMode, setColorMode] = useState<GraphColorMode>("single");
  const [controlsOpen, setControlsOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    title: string;
    full: number;
    isTag: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<{ excerpt: string } | null>(null);
  const [stateReady, setStateReady] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const excerptCacheRef = useRef<Map<string, string>>(new Map());
  const hoverFetchRef = useRef(0);
  const hoverFullRef = useRef(-1);
  const [menu, setMenu] = useState<{ x: number; y: number; full: number; isTag: boolean } | null>(
    null,
  );
  queryRef.current = query;
  colorModeRef.current = colorMode;
  activeNotePathRef.current = activeNotePath;
  localRootRef.current = localRoot;
  useEffect(() => {
    colorModeRef.current = colorMode;
    recolorRef.current?.();
  }, [colorMode]);
  useEffect(() => {
    const ro = new MutationObserver(() => {
      themeColorsRef.current = readThemeColors();
      const tc = themeColorsRef.current;
      rendererRef.current?.setEdgeColor(tc.edge);
      rendererRef.current?.setHoverColors(tc.hoverFill, tc.hoverRing);
      recolorRef.current?.();
    });
    ro.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void invoke<Record<string, unknown>>("get_workspace")
      .then((workspace) => {
        if (cancelled) return;
        const saved = workspace[`graphState:${tab.path}`] as PersistedGraphState | undefined;
        if (saved) {
          setQuery(saved.query ?? "");
          setLocal(Boolean(saved.local));
          setLocalDepth(Math.max(1, Math.min(5, saved.localDepth ?? 2)));
          setLocalRoot(saved.localRoot ?? null);
          setShowOrphans(saved.showOrphans ?? true);
          setShowAttach(saved.showAttach ?? true);
          setColorMode(saved.colorMode ?? "single");
          setControlsOpen(saved.controlsOpen ?? true);
          if (saved.camera) viewRef.current = { ...saved.camera, fitted: true };
        }
        setStateReady(true);
      })
      .catch(() => setStateReady(true));
    return () => {
      cancelled = true;
    };
  }, [tab.path]);

  useEffect(() => {
    if (!stateReady) return;
    const state: PersistedGraphState = {
      query,
      local,
      localDepth,
      localRoot,
      showOrphans,
      showAttach,
      colorMode,
      controlsOpen,
      camera: {
        scale: viewRef.current.scale,
        ox: viewRef.current.ox,
        oy: viewRef.current.oy,
      },
    };
    const timer = window.setTimeout(() => {
      void invoke("set_workspace_key", { key: `graphState:${tab.path}`, value: state });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [stateReady, tab.path, query, local, localDepth, localRoot, showOrphans, showAttach, colorMode, controlsOpen]);
  const colorFor = (full: number): [number, number, number] => {
    const tc = themeColorsRef.current;
    const mode = colorModeRef.current;
    if (isTagRef.current[full]) {
      // Default ("single") view keeps tags one theme-hued fill; the rainbow
      // palette is opt-in via the cluster/tag/folder color modes below.
      if (mode === "single") return tc.tagFill;
      const p = pathsRef.current[full] ?? "";
      let h = 0;
      for (const c of p) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return tc.tag[h % tc.tag.length];
    }
    if (attachRef.current[full]) return tc.attachment;
    if (mode === "single") return tc.note;
    if (mode === "cluster" && clusterCountRef.current > 1) {
      const c = clusterRef.current[full] ?? 0;
      return tc.tag[c % tc.tag.length];
    }
    if (mode === "tag") {
      const ts = tagsRef.current[full];
      if (ts && ts.length) {
        let h = 0;
        for (const c of ts[0]) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return tc.tag[h % tc.tag.length];
      }
    }
    if (mode === "folder") {
      const p = pathsRef.current[full] ?? "";
      const seg = p.split("/");
      const folder = seg.length > 1 ? seg[0] : "";
      if (folder) {
        let h = 0;
        for (const c of folder) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return tc.tag[h % tc.tag.length];
      }
    }
    return tc.note;
  };
  const basename = (p: string) => p.split("/").pop() ?? p;

  // Recolor only — repaints the current active subset's node colors without a
  // full rebuild (which would re-seed the force sim and reset the camera).
  // colorMode/theme affect only the color array, not positions/physics.
  recolorRef.current = () => {
    const renderer = rendererRef.current;
    const map = activeMapRef.current;
    if (!renderer || !map.length) return;
    const cols = new Float32Array(map.length * 3);
    for (let i = 0; i < map.length; i++) {
      const c = colorFor(map[i]);
      cols[i * 3] = c[0];
      cols[i * 3 + 1] = c[1];
      cols[i * 3 + 2] = c[2];
    }
    renderer.setColors(cols);
    if (flagsRef.current.length === map.length) {
      flagsRef.current.fill(0);
      flagsDirtyRef.current = true;
    }
    dirtyRef.current = true;
  };

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
    themeColorsRef.current = readThemeColors();
    const tc = themeColorsRef.current;
    renderer.setEdgeColor(tc.edge);
    renderer.setHoverColors(tc.hoverFill, tc.hoverRing);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = glCanvas.clientWidth || 800;
      const cssH = glCanvas.clientHeight || 600;
      renderer.resize(cssW, cssH, dpr);
      labelCanvas.width = Math.round(cssW * dpr);
      labelCanvas.height = Math.round(cssH * dpr);
      labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirtyRef.current = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(glCanvas);

    const worker = new Worker(new URL("./GraphWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<GraphWorkerMessage>) => {
      const data = e.data;
      if ("action" in data) {
        // The only union member with `action` is the error message.
        setError((data as { message: string }).message);
        return;
      }
      frameRef.current = data;
      dirtyRef.current = true;
    };

    const loadSnapshot = async () => {
      try {
        const g = await invoke<GraphSnapshot>("get_graph");
        if (g.node_count === 0) {
          throw new Error("No notes are available to graph");
        }
        pathsRef.current = g.nodes.map((n) => n.path);
        tagsRef.current = g.nodes.map((n) => n.tags);
        attachRef.current = g.nodes.map((n) => n.is_attachment);
        isTagRef.current = g.nodes.map((n) => n.is_tag);
        edgesRef.current = Uint32Array.from(g.edges);
        edgeWeightsRef.current = Float32Array.from(g.edge_weights ?? []);
        clusterRef.current = Uint32Array.from(g.nodes.map((n) => n.cluster));
        clusterCountRef.current = new Set(clusterRef.current).size;
        syntheticRef.current = false;
        const adj: number[][] = Array.from({ length: g.nodes.length }, () => []);
        for (let e = 0; e < g.edges.length; e += 2) {
          const u = g.edges[e];
          const v = g.edges[e + 1];
          adj[u].push(v);
          adj[v].push(u);
        }
        adjRef.current = adj;

        // Sizing importance = number of *note* neighbors. Notes size by link
        // degree; the Rust-emitted tag nodes size by their note count. Tag→tag
        // (parent/child) edges don't inflate either.
        const isTag = isTagRef.current;
        const scaleInputs = new Float32Array(g.nodes.length);
        for (let i = 0; i < g.nodes.length; i++) {
          let d = 0;
          for (const j of adj[i]) if (!isTag[j]) d++;
          scaleInputs[i] = d;
        }
        scaleInputsRef.current = scaleInputs;
        console.log(
          `[graph] real vault graph: ${g.node_count} nodes, ${g.edges.length / 2} edges`,
        );
        setError(null);
      } catch (err) {
        console.error("[graph] get_graph failed:", err);
        syntheticRef.current = false;
        pathsRef.current = [];
        tagsRef.current = [];
        attachRef.current = [];
        edgesRef.current = new Uint32Array(0);
        edgeWeightsRef.current = new Float32Array(0);
        adjRef.current = [];
        scaleInputsRef.current = new Float32Array(0);
        isTagRef.current = [];
        activeMapRef.current = [];
        activeEdgesRef.current = new Uint32Array(0);
        activeEdgeWeightsRef.current = new Float32Array(0);
        activeAdjRef.current = [];
        frameRef.current = null;
        setError(err instanceof Error ? err.message : String(err));
      }
      setLoaded(true);
    };

    void loadSnapshot();
    let refreshTimer = 0;
    const unlisten = listen("vault://file-changed", () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        setLoaded(false);
        void loadSnapshot().then(() => rebuildRef.current());
      }, 150);
    });

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
        const isTag = isTagRef.current[i];
        if (isTag) {
          // Tags participate only via tag: queries; no active filter shows them.
          if (tagToks.length === 0 && pathToks.length === 0 && textToks.length === 0) return true;
          if (tagToks.length) return tagToks.every((tok) => paths[i].toLowerCase().includes(tok));
          return false;
        }
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
            let head = 0;
            while (head < q.length) {
              const u = q[head++]!;
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

      // Per-node diameter from sizing importance (link degree; tag nodes use note count).
      const subSizes = new Float32Array(map.length);
      const imp = scaleInputsRef.current;
      for (let sub = 0; sub < map.length; sub++) {
        subSizes[sub] = computeNodeSize(imp[map[sub]]);
      }
      sizesRef.current = subSizes;
      renderer.setSizes(subSizes);
      const subEdges: number[] = [];
      const subEdgeWeights: number[] = [];
      const fullW = edgeWeightsRef.current;
      for (let e = 0; e < fullEdges.length; e += 2) {
        const u = fullToSub.get(fullEdges[e]);
        const v = fullToSub.get(fullEdges[e + 1]);
        if (u !== undefined && v !== undefined) {
          subEdges.push(u, v);
          subEdgeWeights.push(fullW[e >> 1] ?? 1);
        }
      }
        const subAdj: number[][] = map.map(() => []);
      for (let e = 0; e < subEdges.length; e += 2) {
        subAdj[subEdges[e]].push(subEdges[e + 1]);
        subAdj[subEdges[e + 1]].push(subEdges[e]);
      }

      activeMapRef.current = map;
      activeEdgesRef.current = Uint32Array.from(subEdges);
      activeEdgeWeightsRef.current = Float32Array.from(subEdgeWeights);
      edgeFlagsRef.current = new Float32Array(subEdges.length / 2);
      edgeFlagsDirtyRef.current = true;
      activeAdjRef.current = subAdj;
      // Keep the current camera when narrowing the graph. The initial graph
      // still auto-fits because `fitted` starts false; users can explicitly
      // reframe any subset with the Fit graph action.
      viewRef.current.fitted = viewRef.current.fitted && map.length > 0;

      // Rebuild renderer color + reset hover flags for the new subset.
      const cols = new Float32Array(map.length * 3);
      for (let i = 0; i < map.length; i++) {
        const c = colorFor(map[i]);
        cols[i * 3] = c[0];
        cols[i * 3 + 1] = c[1];
        cols[i * 3 + 2] = c[2];
      }
      renderer.setColors(cols);
      renderer.setEdges(Uint32Array.from(subEdges), subEdges.length / 2);
      renderer.setEdgeWeights(Float32Array.from(subEdgeWeights));
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
      dirtyRef.current = true;
    };
    rebuildRef.current = rebuild;

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
      dirtyRef.current = true;
    };
    fitRef.current = fit;
    // Fly the camera to a node (snap): center it and zoom to a readable scale.
    const centerOn = (full: number) => {
      const f = frameRef.current;
      const sub = activeMapRef.current.indexOf(full);
      if (!f || sub < 0 || sub * 2 + 1 >= f.positions.length) return;
      const x = f.positions[sub * 2];
      const y = f.positions[sub * 2 + 1];
      const w = glCanvas.clientWidth || 800;
      const h = glCanvas.clientHeight || 600;
      const v = viewRef.current;
      const s = Math.max(v.scale, CENTER_SCALE);
      v.scale = s;
      v.ox = w / 2 - x * s;
      v.oy = h / 2 - y * s;
      dirtyRef.current = true;
    };
    centerOnRef.current = centerOn;
    const hitTest = (sx: number, sy: number): number => {
      // Grid is rebuilt each render (screen-space binning); reused while idle,
      // so this is O(local cells) instead of O(node count) per mousemove.
      return gridRef.current.query(sx, sy, 8, sizesRef.current, viewRef.current.scale);
    };

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
      dirtyRef.current = true;
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
        dirtyRef.current = true;
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
        if (hit !== hoverEdgeFullRef.current) {
          hoverEdgeFullRef.current = hit;
          const ef = edgeFlagsRef.current;
          if (ef.length === activeEdgesRef.current.length / 2) {
            const edges = activeEdgesRef.current;
            for (let e = 0; e < edges.length; e += 2) {
              ef[e / 2] = edges[e] === hit || edges[e + 1] === hit ? 1 : 0;
            }
            edgeFlagsDirtyRef.current = true;
          }
        }
        const isTag = isTagRef.current[full];
        const title = isTag
          ? `#${pathsRef.current[full] ?? ""}`
          : basename(pathsRef.current[full] ?? "");
        setHover({ x: px, y: py, title, full, isTag });
        if (isTag) {
          hoverFullRef.current = -1;
          setPreview(null);
        } else if (hoverFullRef.current !== full) {
          hoverFullRef.current = full;
          const path = pathsRef.current[full] ?? "";
          const cached = excerptCacheRef.current.get(path);
          if (cached !== undefined) {
            setPreview({ excerpt: cached });
          } else {
            const token = ++hoverFetchRef.current;
            window.setTimeout(() => {
              if (token !== hoverFetchRef.current) return;
              invoke<string>("open_file", { path })
                .then((text) => {
                  if (token !== hoverFetchRef.current) return;
                  const ex = noteExcerpt(text);
                  excerptCacheRef.current.set(path, ex);
                  setPreview({ excerpt: ex });
                })
                .catch(() => {
                  if (token !== hoverFetchRef.current) return;
                  setPreview({ excerpt: "" });
                });
            }, 120);
          }
        }
        glCanvas.style.cursor = "pointer";
      } else if (prevHover >= 0) {
        flagsRef.current.fill(0);
        flagsDirtyRef.current = true;
        edgeFlagsRef.current.fill(0);
        edgeFlagsDirtyRef.current = true;
        hoverEdgeFullRef.current = -1;
        renderer.setHasHover(false);
        setHover(null);
        setPreview(null);
        hoverFullRef.current = -1;
        hoverFetchRef.current++;
        if (hit !== prevHover) dirtyRef.current = true;
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
          if (isTagRef.current[full]) {
            setQuery(`tag:${title}`);
          } else if (title) {
            openNoteRef.current(title);
          }
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
      setPreview(null);
      hoverFullRef.current = -1;
      hoverFetchRef.current++;
      flagsRef.current.fill(0);
      flagsDirtyRef.current = true;
      edgeFlagsRef.current.fill(0);
      edgeFlagsDirtyRef.current = true;
      hoverEdgeFullRef.current = -1;
      renderer.setHasHover(false);
      dirtyRef.current = true;
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
        setMenu({ x: mx, y: my, full: activeMapRef.current[hit], isTag: isTagRef.current[activeMapRef.current[hit]] });
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

    let raf = 0;
    const draw = () => {
      const f = frameRef.current;
      const map = activeMapRef.current;
      const count = map.length;
      // Only redraw when something changed: a new sim frame, camera move,
      // hover, resize, or rebuild. When the sim settles the worker stops
      // posting frames, so an idle graph costs zero GPU/CPU work.
      if (f && count > 0 && dirtyRef.current) {
        const p = f.positions;
        if (!viewRef.current.fitted) fit();
        const v = viewRef.current;
        let renderer = rendererRef.current;
        if (renderer) {
          if (renderer.needsResourceRebuild()) {
            renderer.dispose();
            renderer = new GraphRenderer(glCanvas);
            rendererRef.current = renderer;
            const tc = themeColorsRef.current;
            renderer.setEdgeColor(tc.edge);
            renderer.setHoverColors(tc.hoverFill, tc.hoverRing);
            renderer.resize(glCanvas.clientWidth || 800, glCanvas.clientHeight || 600, window.devicePixelRatio || 1);
            renderer.setSizes(sizesRef.current);
            renderer.setColors(new Float32Array(activeMapRef.current.flatMap((full) => colorFor(full))));
            renderer.setEdges(activeEdgesRef.current, activeEdgesRef.current.length / 2);
            renderer.setEdgeWeights(activeEdgeWeightsRef.current);
            renderer.setFlags(flagsRef.current);
            renderer.setEdgeFlags(edgeFlagsRef.current);
          }
          renderer.setPositions(p);
          renderer.setView({ scale: v.scale, ox: v.ox, oy: v.oy });
          if (flagsDirtyRef.current) {
            renderer.setFlags(flagsRef.current);
            flagsDirtyRef.current = false;
          }
          if (edgeFlagsDirtyRef.current) {
            renderer.setEdgeFlags(edgeFlagsRef.current);
            edgeFlagsDirtyRef.current = false;
          }
          // Arrowheads depend on positions AND zoom; rebuild only when either changed.
          if (f !== lastArrowFrameRef.current || v.scale !== lastArrowScaleRef.current) {
            const n = Math.min(activeEdgesRef.current.length / 2, ARROW_EDGE_CAP);
            if (arrowOutRef.current.length !== n * 6) {
              arrowOutRef.current = new Float32Array(n * 6);
            }
            buildArrows(
              p,
              activeEdgesRef.current,
              activeEdgesRef.current.length / 2,
              v.scale,
              arrowOutRef.current,
            );
            renderer.setArrows(arrowOutRef.current);
            lastArrowFrameRef.current = f;
            lastArrowScaleRef.current = v.scale;
          }
          renderer.render();
          // Bin nodes in screen space for O(local) hover hit-testing; reused while idle.
          gridRef.current.build(p, count, toScreen);
        }
        // Labels on the transparent 2D overlay (only when zoomed past LABEL_SCALE).
        const w = glCanvas.clientWidth || 800;
        const h = glCanvas.clientHeight || 600;
        labelCtx.clearRect(0, 0, w, h);
        const hov = hoverRef.current;
        const neighbors = hov >= 0 ? activeAdjRef.current[hov] : null;
        // Set for O(1) membership below — `neighbors.includes(i)` inside the
        // per-node label loop would be O(n·deg) on every mouse move.
        const neighborSet = neighbors ? new Set(neighbors) : null;
        const hoverMode = hov >= 0;
        // On hover, the focused node's neighborhood is always labeled (Obsidian
        // behavior); outside hover, labels appear once the user zooms in.
        // LABEL_CAP stays as a hard safety bound either way.
        const showLabels = count < LABEL_CAP && (hoverMode || v.scale > LABEL_SCALE);
        if (showLabels) {
          labelCtx.font = "10px system-ui, sans-serif";
          labelCtx.fillStyle = themeColorsRef.current.label;
          for (let i = 0; i < count; i++) {
            if (i * 2 + 1 >= p.length) break;
            const full = map[i];
            const [px, py] = toScreen(p[i * 2], p[i * 2 + 1]);
            const related = hoverMode && (i === hov || (neighborSet && neighborSet.has(i)));
            if (hoverMode && !related) continue;
            labelCtx.globalAlpha = 1;
            const lbl = isTagRef.current[full] ? `#${pathsRef.current[full] ?? ""}` : basename(pathsRef.current[full] ?? "");
            labelCtx.fillText(lbl, px + NODE_R + 2, py + 3);
          }
          labelCtx.globalAlpha = 1;
        }
        dirtyRef.current = false;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      worker.terminate();
      rendererRef.current?.dispose();
      void unlisten.then((dispose) => dispose());
      window.clearTimeout(refreshTimer);
      glCanvas.removeEventListener("wheel", onWheel);
      glCanvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      glCanvas.removeEventListener("mouseleave", onLeave);
      glCanvas.removeEventListener("contextmenu", onContext);
    };
  }, [reloadNonce]);

  // Rebuild the visible subset whenever a control changes (debounced).
  // activeNotePath feeds the local-graph root, so it must rebuild in local
  // mode; in global mode it only affects the highlighted/hovered node, never
  // the visible subset — so we gate it to null there to avoid re-seeding the
  // force sim and resetting the camera whenever the user clicks between notes.
  const rebuildOnActiveNote = local ? activeNotePath : null;
  useEffect(() => {
    const t = setTimeout(() => rebuildRef.current(), 120);
    return () => clearTimeout(t);
  }, [query, showOrphans, showAttach, local, localDepth, localRoot, rebuildOnActiveNote, loaded]);

  const centerActive = () => {
    const p = activeNotePathRef.current;
    if (!p) return;
    const full = pathsRef.current.indexOf(p);
    if (full >= 0) centerOnRef.current(full);
  };

  const openInNewTab = (full: number) => {
    const path = pathsRef.current[full];
    if (!path) return;
    services.openPinned({ path, title: basename(path) });
  };
  const handleMenuOpen = (full: number) => {
    const path = pathsRef.current[full];
    if (path) services.openNote(path);
    setMenu(null);
  };
  const handleMenuOpenInNewTab = (full: number) => {
    openInNewTab(full);
    setMenu(null);
  };
  const handleMenuCenter = (full: number) => {
    centerOnRef.current(full);
    setMenu(null);
  };
  const handleMenuLocalGraph = (full: number) => {
    const path = pathsRef.current[full];
    if (path) setLocalRoot(path);
    setLocal(true);
    setMenu(null);
  };
  const handleMenuExpand = (full: number) => {
    const path = pathsRef.current[full];
    if (path) setLocalRoot(path);
    setLocal(true);
    setLocalDepth((d) => Math.min(d + 1, 4));
    setMenu(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        backgroundColor: "var(--sat-graph-background)",
      }}
    >
      {controlsOpen && <GraphControls
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        query={query}
        onQueryChange={setQuery}
        local={local}
        onToggleLocal={() => setLocal((l) => !l)}
        localDepth={localDepth}
        onLocalDepthChange={setLocalDepth}
        onCenter={centerActive}
        onFit={() => {
          viewRef.current.fitted = false;
          dirtyRef.current = true;
        }}
        showOrphans={showOrphans}
        onToggleOrphans={() => setShowOrphans((o) => !o)}
        showAttach={showAttach}
        onToggleAttach={() => setShowAttach((a) => !a)}
        onClose={() => setControlsOpen(false)}
      />}
      <div
        ref={wrapRef}
        style={{
          position: "relative",
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: "var(--sat-graph-background)",
        }}
      >
      {!controlsOpen && (
        <Button
          variant="outline"
          size="sm"
          style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
          onClick={() => setControlsOpen(true)}
        >
          Graph settings
        </Button>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
            color: "var(--sat-text-primary)",
            fontSize: 13,
            lineHeight: 1.5,
            zIndex: 6,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Graph failed to load
            </div>
            <div style={{ opacity: 0.75 }}>{error}</div>
            <Button
              variant="outline"
              size="sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setError(null);
                setLoaded(false);
                setReloadNonce((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}
      <canvas
        ref={glRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "var(--sat-graph-background)",
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
            maxWidth: 280,
            padding: "6px 8px",
            background: "var(--sat-surface-1)",
            color: "var(--sat-text-primary)",
            fontSize: 12,
            borderRadius: 6,
            pointerEvents: "none",
            whiteSpace: "pre-wrap",
            boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
            zIndex: 5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: hover.isTag || !preview ? 0 : 4 }}>
            {hover.title}
          </div>
          {!hover.isTag && preview && preview.excerpt && (
            <div
              style={{
                opacity: 0.85,
                lineHeight: 1.45,
                maxHeight: 120,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 6,
                WebkitBoxOrient: "vertical",
              }}
            >
              {preview.excerpt}
            </div>
          )}
        </div>
      )}
      <GraphContextMenu
        menu={menu}
        isTag={menu?.isTag ?? false}
        onOpen={handleMenuOpen}
        onOpenInNewTab={handleMenuOpenInNewTab}
        onCenter={handleMenuCenter}
        onOpenLocalGraph={handleMenuLocalGraph}
        onExpand={handleMenuExpand}
        onFilter={(full) => {
          setQuery(`tag:${pathsRef.current[full]}`);
          setMenu(null);
        }}
      />
      </div>
    </div>
  );
}
