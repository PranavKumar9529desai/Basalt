// The graph leaf's engine hook (ADR-038 §3 graph split). Owns every
// per-instance ref, state, and effect that previously lived in Graph.tsx's
// giant mount effect: WebGL2 renderer + resize loop, the C-ABI wasm worker
// (lib/graphWorker.ts) and its snapshot data store, subset rebuild
// (lib/filters + lib/localGraph), the rAF draw loop, and the canvas event
// surface (lib/interactions). The component keeps JSX + store wiring and
// composes this hook with lib/persistedState.
//
// Kept in its own file (not folded into graphWorker.ts) so main-thread code
// never statically imports the worker module — the worker is loaded only via
// `new Worker(new URL(...))`, preserving the original side-effect boundary.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { GraphRenderer } from "@workspace/graph";
import { SpatialGrid } from "../spatialGrid";
import type { GraphColorMode } from "../components/GraphControls";
import { createInteractions, type HoverState, type MenuState, type Ref } from "./interactions";
import {
  ARROW_EDGE_CAP,
  LABEL_CAP,
  LABEL_SCALE,
  NODE_R,
  buildArrows,
  centerView,
  fitView,
  toScreen,
  toWorld,
  type ViewTransform,
} from "./geometry";
import {
  colorFor,
  FALLBACK_COLORS,
  readThemeColors,
  type ColorContext,
  type ThemeColors,
} from "./themeColors";
import { basename, buildVisible } from "./filters";
import { buildSubset, localSubset } from "./localGraph";
import type { GraphFrame, GraphSnapshot, GraphWorkerMessage } from "./graphWorker";

/** Live mirror of the leaf controls, written during render so the mount-only
 * engine reads current values without re-mounting. */
export interface GraphEngineControls {
  query: string;
  local: boolean;
  showOrphans: boolean;
  showAttach: boolean;
  activeNotePath: string | null;
  localDepth: number;
  localRoot: string | null;
  colorMode: GraphColorMode;
}

export interface GraphEngineOptions {
  openNoteRef: Ref<(path: string) => void>;
  setQuery: (query: string) => void;
  controls: Ref<GraphEngineControls>;
}

export interface GraphEngine {
  glRef: Ref<HTMLCanvasElement | null>;
  labelRef: Ref<HTMLCanvasElement | null>;
  wrapRef: Ref<HTMLDivElement | null>;
  pathsRef: Ref<string[]>;
  viewRef: Ref<ViewTransform & { fitted: boolean }>;
  hover: HoverState | null;
  preview: { excerpt: string } | null;
  menu: MenuState | null;
  loaded: boolean;
  error: string | null;
  recolor: () => void;
  rebuild: () => void;
  centerOn: (full: number) => void;
  refit: () => void;
  retry: () => void;
  closeMenu: () => void;
}

interface GraphData {
  paths: string[];
  tags: string[][];
  attach: boolean[];
  isTag: boolean[];
  edges: Uint32Array;
  edgeWeights: Float32Array;
  cluster: Uint32Array;
  clusterCount: number;
  adj: number[][];
  scaleInputs: Float32Array;
}

/** Shape the `get_graph` snapshot into the engine's full-graph arrays. */
function snapshotToGraphData(g: GraphSnapshot): GraphData {
  const paths = g.nodes.map((n) => n.path);
  const tags = g.nodes.map((n) => n.tags);
  const attach = g.nodes.map((n) => n.is_attachment);
  const isTag = g.nodes.map((n) => n.is_tag);
  const edges = Uint32Array.from(g.edges);
  const edgeWeights = Float32Array.from(g.edge_weights ?? []);
  const cluster = Uint32Array.from(g.nodes.map((n) => n.cluster));
  const clusterCount = new Set(cluster).size;
  const adj: number[][] = Array.from({ length: g.nodes.length }, () => []);
  for (let e = 0; e < g.edges.length; e += 2) {
    const u = g.edges[e];
    const v = g.edges[e + 1];
    adj[u].push(v);
    adj[v].push(u);
  }
  // Sizing importance = number of *note* neighbors. Notes size by link
  // degree; the Rust-emitted tag nodes size by their note count. Tag→tag
  // (parent/child) edges don't inflate either.
  const scaleInputs = new Float32Array(g.nodes.length);
  for (let i = 0; i < g.nodes.length; i++) {
    let d = 0;
    for (const j of adj[i]) if (!isTag[j]) d++;
    scaleInputs[i] = d;
  }
  return { paths, tags, attach, isTag, edges, edgeWeights, cluster, clusterCount, adj, scaleInputs };
}

export function useGraphEngine(opts: GraphEngineOptions): GraphEngine {
  const { openNoteRef, setQuery, controls } = opts;

  const glRef = useRef<HTMLCanvasElement | null>(null);
  const labelRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
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
  const themeColorsRef = useRef<ThemeColors>(FALLBACK_COLORS);
  const adjRef = useRef<number[][]>([]);
  const syntheticRef = useRef(false);

  // Active (visible) subset, recomputed by `rebuild`.
  const activeMapRef = useRef<number[]>([]); // subset idx -> full idx
  const activeEdgesRef = useRef<Uint32Array>(new Uint32Array(0));
  const activeEdgeWeightsRef = useRef<Float32Array>(new Float32Array(0));
  const activeAdjRef = useRef<number[][]>([]);

  const frameRef = useRef<GraphFrame | null>(null);
  const viewRef = useRef<ViewTransform & { fitted: boolean }>({
    scale: 1,
    ox: 0,
    oy: 0,
    fitted: false,
  });
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
  const gridRef = useRef(new SpatialGrid());
  const arrowOutRef = useRef(new Float32Array(0));
  const lastArrowFrameRef = useRef<GraphFrame | null>(null);
  const lastArrowScaleRef = useRef(1);
  const dirtyRef = useRef(true);
  const excerptCacheRef = useRef<Map<string, string>>(new Map());
  const hoverFetchRef = useRef(0);
  const hoverFullRef = useRef(-1);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [preview, setPreview] = useState<{ excerpt: string } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const colorContext = (): ColorContext => ({
    colors: themeColorsRef.current,
    mode: controls.current.colorMode,
    isTag: isTagRef.current,
    paths: pathsRef.current,
    attach: attachRef.current,
    cluster: clusterRef.current,
    clusterCount: clusterCountRef.current,
    tags: tagsRef.current,
  });

  // Stable call-through: `colorContext` is re-created each render, so the
  // mount-only effect reads it via this ref instead of closing over the
  // function (exhaustive-deps would otherwise demand a per-render dep).
  const colorContextRef = useRef(colorContext);
  // full rebuild (which would re-seed the force sim and reset the camera).
  // colorMode/theme affect only the color array, not positions/physics.
  recolorRef.current = () => {
    const renderer = rendererRef.current;
    const map = activeMapRef.current;
    if (!renderer || !map.length) return;
    const cctx = colorContext();
    const cols = new Float32Array(map.length * 3);
    for (let i = 0; i < map.length; i++) {
      const c = colorFor(map[i], cctx);
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

  // Re-derive theme colors when the theme changes (class/style mutations).
  useEffect(() => {
    const ro = new MutationObserver(() => {
      themeColorsRef.current = readThemeColors();
      const tc = themeColorsRef.current;
      rendererRef.current?.setEdgeColor(tc.edge);
      rendererRef.current?.setHoverColors(tc.hoverFill, tc.hoverRing);
      recolorRef.current?.();
    });
    ro.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    return () => ro.disconnect();
  }, []);

  // Engine lifecycle: renderer, worker, data store, subset rebuild, the rAF
  // draw loop, and the canvas event surface. Everything here is per-instance
  // and re-runs only on Retry (`reloadNonce`).
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

    const worker = new Worker(new URL("./graphWorker.ts", import.meta.url), {
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
        const d = snapshotToGraphData(g);
        pathsRef.current = d.paths;
        tagsRef.current = d.tags;
        attachRef.current = d.attach;
        isTagRef.current = d.isTag;
        edgesRef.current = d.edges;
        edgeWeightsRef.current = d.edgeWeights;
        clusterRef.current = d.cluster;
        clusterCountRef.current = d.clusterCount;
        adjRef.current = d.adj;
        scaleInputsRef.current = d.scaleInputs;
        syntheticRef.current = false;
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
      const c = controls.current;
      let finalVisible = buildVisible(c.query, {
        paths,
        tags: tagsRef.current,
        isTag: isTagRef.current,
        adj: adjRef.current,
        attach: attachRef.current,
        showOrphans: c.showOrphans,
        showAttach: c.showAttach,
      });
      // Local graph: keep only nodes within BFS depth of the root note.
      if (c.local) {
        const sub = localSubset(
          finalVisible,
          adjRef.current,
          c.localRoot ?? c.activeNotePath,
          c.localDepth,
          paths,
        );
        if (sub) finalVisible = sub;
      }
      const subset = buildSubset({
        visible: finalVisible,
        fullEdges: edgesRef.current,
        fullWeights: edgeWeightsRef.current,
        scaleInputs: scaleInputsRef.current,
      });
      const map = subset.map;
      activeMapRef.current = map;
      activeEdgesRef.current = Uint32Array.from(subset.edges);
      activeEdgeWeightsRef.current = Float32Array.from(subset.edgeWeights);
      edgeFlagsRef.current = new Float32Array(subset.edges.length / 2);
      edgeFlagsDirtyRef.current = true;
      activeAdjRef.current = subset.adj;
      sizesRef.current = subset.sizes;
      // Keep the current camera when narrowing the graph. The initial graph
      // still auto-fits because `fitted` starts false; users can explicitly
      // reframe any subset with the Fit graph action.
      viewRef.current.fitted = viewRef.current.fitted && map.length > 0;

      // Rebuild renderer color + reset hover flags for the new subset.
      renderer.setSizes(subset.sizes);
            const cctx = colorContextRef.current();
      const cols = new Float32Array(map.length * 3);
      for (let i = 0; i < map.length; i++) {
        const c2 = colorFor(map[i], cctx);
        cols[i * 3] = c2[0];
        cols[i * 3 + 1] = c2[1];
        cols[i * 3 + 2] = c2[2];
      }
      renderer.setColors(cols);
      renderer.setEdges(Uint32Array.from(subset.edges), subset.edges.length / 2);
      renderer.setEdgeWeights(Float32Array.from(subset.edgeWeights));
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
          edges: Uint32Array.from(subset.edges),
        });
      }
      dirtyRef.current = true;
    };
    rebuildRef.current = rebuild;

    const fit = () => {
      const f = frameRef.current;
      const count = activeMapRef.current.length;
      if (!f || count === 0) return;
      fitView(
        viewRef.current,
        f.positions,
        count,
        glCanvas.clientWidth || 800,
        glCanvas.clientHeight || 600,
      );
      viewRef.current.fitted = true;
      dirtyRef.current = true;
    };
    fitRef.current = fit;
    // Fly the camera to a node (snap): center it and zoom to a readable scale.
    const centerOn = (full: number) => {
      const f = frameRef.current;
      const sub = activeMapRef.current.indexOf(full);
      if (!f || sub < 0 || sub * 2 + 1 >= f.positions.length) return;
      centerView(
        viewRef.current,
        f.positions[sub * 2],
        f.positions[sub * 2 + 1],
        glCanvas.clientWidth || 800,
        glCanvas.clientHeight || 600,
      );
      dirtyRef.current = true;
    };
    centerOnRef.current = centerOn;

    const project = (wx: number, wy: number): [number, number] =>
      toScreen(wx, wy, viewRef.current);

    const handlers = createInteractions({
      canvas: glCanvas,
      view: viewRef,
      frame: frameRef,
      drag: dragRef,
      pan: panRef,
      down: downRef,
      hover: hoverRef,
      activeMap: activeMapRef,
      activeAdj: activeAdjRef,
      activeEdges: activeEdgesRef,
      flags: flagsRef,
      flagsDirty: flagsDirtyRef,
      edgeFlags: edgeFlagsRef,
      edgeFlagsDirty: edgeFlagsDirtyRef,
      hoverEdgeFull: hoverEdgeFullRef,
      sizes: sizesRef,
      isTag: isTagRef,
      paths: pathsRef,
      grid: gridRef,
      renderer: rendererRef,
      excerptCache: excerptCacheRef,
      hoverFetch: hoverFetchRef,
      hoverFull: hoverFullRef,
      dirty: dirtyRef,
      worker: workerRef,
      openNote: openNoteRef,
      setMenu,
      setHover,
      setPreview,
      setQuery,
      openFile: (path) => invoke<string>("open_file", { path }),
      toScreen: (wx, wy) => toScreen(wx, wy, viewRef.current),
      toWorld: (sx, sy) => toWorld(sx, sy, viewRef.current),
    });
    glCanvas.addEventListener("wheel", handlers.onWheel, { passive: false });
    glCanvas.addEventListener("mousedown", handlers.onDown);
    window.addEventListener("mousemove", handlers.onMove);
    window.addEventListener("mouseup", handlers.onUp);
    glCanvas.addEventListener("mouseleave", handlers.onLeave);
    glCanvas.addEventListener("contextmenu", handlers.onContext);

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
            renderer.resize(
              glCanvas.clientWidth || 800,
              glCanvas.clientHeight || 600,
              window.devicePixelRatio || 1,
            );
            renderer.setSizes(sizesRef.current);
            const cctx = colorContextRef.current();
            renderer.setColors(
              new Float32Array(
                activeMapRef.current.flatMap((full) => colorFor(full, cctx)),
              ),
            );
            renderer.setEdges(
              activeEdgesRef.current,
              activeEdgesRef.current.length / 2,
            );
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
          if (
            f !== lastArrowFrameRef.current ||
            v.scale !== lastArrowScaleRef.current
          ) {
            const n = Math.min(
              activeEdgesRef.current.length / 2,
              ARROW_EDGE_CAP,
            );
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
          gridRef.current.build(p, count, project);
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
        const showLabels =
          count < LABEL_CAP && (hoverMode || v.scale > LABEL_SCALE);
        if (showLabels) {
          labelCtx.font = "10px system-ui, sans-serif";
          labelCtx.fillStyle = themeColorsRef.current.label;
          for (let i = 0; i < count; i++) {
            if (i * 2 + 1 >= p.length) break;
            const full = map[i];
            const [px, py] = project(p[i * 2], p[i * 2 + 1]);
            const related =
              hoverMode && (i === hov || (neighborSet && neighborSet.has(i)));
            if (hoverMode && !related) continue;
            labelCtx.globalAlpha = 1;
            const lbl = isTagRef.current[full]
              ? `#${pathsRef.current[full] ?? ""}`
              : basename(pathsRef.current[full] ?? "");
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
      glCanvas.removeEventListener("wheel", handlers.onWheel);
      glCanvas.removeEventListener("mousedown", handlers.onDown);
      window.removeEventListener("mousemove", handlers.onMove);
      window.removeEventListener("mouseup", handlers.onUp);
      glCanvas.removeEventListener("mouseleave", handlers.onLeave);
      glCanvas.removeEventListener("contextmenu", handlers.onContext);
    };
  }, [reloadNonce, setQuery, controls, openNoteRef]);

  const recolor = useCallback(() => recolorRef.current?.(), []);
  const rebuild = useCallback(() => rebuildRef.current?.(), []);
  const centerOn = useCallback((full: number) => centerOnRef.current(full), []);
  const refit = useCallback(() => {
    viewRef.current.fitted = false;
    dirtyRef.current = true;
  }, []);
  const retry = useCallback(() => {
    setError(null);
    setLoaded(false);
    setReloadNonce((value) => value + 1);
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  return {
    glRef,
    labelRef,
    wrapRef,
    pathsRef,
    viewRef,
    hover,
    preview,
    menu,
    loaded,
    error,
    recolor,
    rebuild,
    centerOn,
    refit,
    retry,
    closeMenu,
  };
}