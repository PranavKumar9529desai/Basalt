import { useRef, useState } from "react";
import type { GraphRenderer } from "@workspace/graph";
import type { GraphColorMode } from "../../components/GraphControls";
import type { HoverState, MenuState, Ref } from "../../lib/interactions";
import { FALLBACK_COLORS, type ThemeColors } from "../../lib/themeColors";
import type { ViewTransform } from "../../lib/geometry";
import { SpatialGrid } from "../../lib/spatialGrid";
import type { GraphFrame } from "../../lib/graphWorker";

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

/**
 * Every per-instance ref and state setter the engine sub-modules share.
 * Created once per render (hooks rules); the mount-only effect and the
 * call-throughs read/write through it, so nothing closes over stale values.
 */
export interface EngineContext {
  glRef: Ref<HTMLCanvasElement | null>;
  labelRef: Ref<HTMLCanvasElement | null>;
  wrapRef: Ref<HTMLDivElement | null>;
  workerRef: Ref<Worker | null>;
  rendererRef: Ref<GraphRenderer | null>;

  // Full-graph data (set once on load).
  pathsRef: Ref<string[]>;
  tagsRef: Ref<string[][]>;
  attachRef: Ref<boolean[]>;
  isTagRef: Ref<boolean[]>;
  edgesRef: Ref<Uint32Array>;
  edgeWeightsRef: Ref<Float32Array>;
  clusterRef: Ref<Uint32Array>;
  clusterCountRef: Ref<number>;
  themeColorsRef: Ref<ThemeColors>;
  adjRef: Ref<number[][]>;
  syntheticRef: Ref<boolean>;

  // Active (visible) subset, recomputed by rebuild.
  activeMapRef: Ref<number[]>;
  activeEdgesRef: Ref<Uint32Array>;
  activeEdgeWeightsRef: Ref<Float32Array>;
  activeAdjRef: Ref<number[][]>;

  frameRef: Ref<GraphFrame | null>;
  viewRef: Ref<ViewTransform & { fitted: boolean }>;
  dragRef: Ref<{ index: number; moved: boolean } | null>;
  panRef: Ref<{ x: number; y: number } | null>;
  downRef: Ref<{ x: number; y: number } | null>;
  hoverRef: Ref<number>;
  rebuildRef: Ref<() => void>;
  recolorRef: Ref<() => void>;
  centerOnRef: Ref<(full: number) => void>;
  fitRef: Ref<() => void>;
  flagsRef: Ref<Float32Array>;
  flagsDirtyRef: Ref<boolean>;
  edgeFlagsRef: Ref<Float32Array>;
  edgeFlagsDirtyRef: Ref<boolean>;
  hoverEdgeFullRef: Ref<number>;
  sizesRef: Ref<Float32Array>;
  scaleInputsRef: Ref<Float32Array>;
  gridRef: Ref<SpatialGrid>;
  arrowOutRef: Ref<Float32Array>;
  lastArrowFrameRef: Ref<GraphFrame | null>;
  lastArrowScaleRef: Ref<number>;
  dirtyRef: Ref<boolean>;
  excerptCacheRef: Ref<Map<string, string>>;
  hoverFetchRef: Ref<number>;
  hoverFullRef: Ref<number>;

  // Render-phase values from the options (opts is re-created each render;
  // effects read the refs instead of closing over it).
  openNoteRef: Ref<(path: string) => void>;
  setQuery: (query: string) => void;
  controls: Ref<GraphEngineControls>;
  reloadNonce: number;
  setReloadNonce: (fn: (v: number) => number) => void;

  // React state setters.
  setLoaded: (v: boolean) => void;
  setError: (e: string | null) => void;
  setHover: (h: HoverState | null) => void;
  setPreview: (p: { excerpt: string } | null) => void;
  setMenu: (m: MenuState | null) => void;

  // React state values (returned from the hook to the leaf).
  loaded: boolean;
  error: string | null;
  hover: HoverState | null;
  preview: { excerpt: string } | null;
  menu: MenuState | null;
}

export function createEngineContext(opts: GraphEngineOptions): EngineContext {
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
  const activeMapRef = useRef<number[]>([]);
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
  // Per-subset hover flag buffer for the renderer (uploaded when dirty).
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

  return {
    glRef,
    labelRef,
    wrapRef,
    workerRef,
    rendererRef,
    pathsRef,
    tagsRef,
    attachRef,
    isTagRef,
    edgesRef,
    edgeWeightsRef,
    clusterRef,
    clusterCountRef,
    themeColorsRef,
    adjRef,
    syntheticRef,
    activeMapRef,
    activeEdgesRef,
    activeEdgeWeightsRef,
    activeAdjRef,
    frameRef,
    viewRef,
    dragRef,
    panRef,
    downRef,
    hoverRef,
    rebuildRef,
    recolorRef,
    centerOnRef,
    fitRef,
    flagsRef,
    flagsDirtyRef,
    edgeFlagsRef,
    edgeFlagsDirtyRef,
    hoverEdgeFullRef,
    sizesRef,
    scaleInputsRef,
    gridRef,
    arrowOutRef,
    lastArrowFrameRef,
    lastArrowScaleRef,
    dirtyRef,
    excerptCacheRef,
    hoverFetchRef,
    hoverFullRef,
    openNoteRef: opts.openNoteRef,
    setQuery: opts.setQuery,
    controls: opts.controls,
    setLoaded,
    setError,
    setHover,
    setPreview,
    setMenu,
    reloadNonce,
    setReloadNonce,
    loaded,
    error,
    hover,
    preview,
    menu,
  };
}
