// Pointer interaction layer for the graph canvas (ADR-038 §3 graph split):
// click/drag/zoom/hover handlers + hit testing over the spatial grid. The
// engine (hooks/useGraphEngine) owns the refs/state and builds these handlers
// once per mount via `createInteractions`.
import { basename } from "./filters";
import { noteExcerpt } from "./excerpt";
import { zoomAt } from "./geometry";
import type { GraphFrame } from "./graphWorker";
import type { GraphRenderer } from "@workspace/graph";
import type { SpatialGrid } from "./spatialGrid";

/** Mutable reference slot (usable with React's stable `useRef` objects). */
export interface Ref<T> {
  current: T;
}

export interface HoverState {
  x: number;
  y: number;
  title: string;
  full: number;
  isTag: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  full: number;
  isTag: boolean;
}

type ViewTransformLike = {
  scale: number;
  ox: number;
  oy: number;
  fitted?: boolean;
};

export interface InteractionsContext {
  canvas: HTMLCanvasElement;
  view: Ref<ViewTransformLike>;
  frame: Ref<GraphFrame | null>;
  drag: Ref<{ index: number; moved: boolean } | null>;
  pan: Ref<{ x: number; y: number } | null>;
  down: Ref<{ x: number; y: number } | null>;
  hover: Ref<number>;
  activeMap: Ref<number[]>;
  activeAdj: Ref<number[][]>;
  activeEdges: Ref<Uint32Array>;
  flags: Ref<Float32Array>;
  flagsDirty: Ref<boolean>;
  edgeFlags: Ref<Float32Array>;
  edgeFlagsDirty: Ref<boolean>;
  hoverEdgeFull: Ref<number>;
  sizes: Ref<Float32Array>;
  isTag: Ref<boolean[]>;
  paths: Ref<string[]>;
  grid: Ref<SpatialGrid>;
  renderer: Ref<GraphRenderer | null>;
  excerptCache: Ref<Map<string, string>>;
  hoverFetch: Ref<number>;
  hoverFull: Ref<number>;
  dirty: Ref<boolean>;
  worker: Ref<Worker | null>;
  openNote: Ref<(path: string) => void>;
  setMenu: (menu: MenuState | null) => void;
  setHover: (hover: HoverState | null) => void;
  setPreview: (preview: { excerpt: string } | null) => void;
  setQuery: (query: string) => void;
  openFile: (path: string) => Promise<string>;
  toScreen: (wx: number, wy: number) => [number, number];
  toWorld: (sx: number, sy: number) => [number, number];
}

export interface GraphHandlers {
  onWheel: (e: WheelEvent) => void;
  onDown: (e: MouseEvent) => void;
  onMove: (e: MouseEvent) => void;
  onUp: (e: MouseEvent) => void;
  onLeave: () => void;
  onContext: (e: MouseEvent) => void;
}

export function createInteractions(ctx: InteractionsContext): GraphHandlers {
  const hitTest = (sx: number, sy: number): number =>
    ctx.grid.current.query(
      sx,
      sy,
      8,
      ctx.sizes.current,
      ctx.view.current.scale,
    );

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    zoomAt(ctx.view.current, mx, my, e.deltaY);
    ctx.dirty.current = true;
  };

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // ignore right/middle — context menu handles those
    ctx.setMenu(null);
    const rect = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    ctx.down.current = { x: mx, y: my };
    const hit = hitTest(mx, my);
    if (hit >= 0) {
      ctx.drag.current = { index: hit, moved: false };
      ctx.canvas.style.cursor = "grabbing";
    } else {
      ctx.pan.current = { x: mx, y: my };
      ctx.canvas.style.cursor = "grabbing";
    }
  };

  const onMove = (e: MouseEvent) => {
    const rect = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (ctx.drag.current) {
      const [wx, wy] = ctx.toWorld(mx, my);
      ctx.worker.current?.postMessage({
        action: "pin",
        index: ctx.drag.current.index,
        x: wx,
        y: wy,
      });
      ctx.drag.current.moved = true;
      return;
    }
    if (ctx.pan.current) {
      const dx = mx - ctx.pan.current.x;
      const dy = my - ctx.pan.current.y;
      const v = ctx.view.current;
      v.ox += dx;
      v.oy += dy;
      ctx.dirty.current = true;
      ctx.pan.current = { x: mx, y: my };
      return;
    }
    const hit = hitTest(mx, my);
    const prevHover = ctx.hover.current;
    ctx.hover.current = hit;
    if (hit >= 0) {
      const f = ctx.frame.current!;
      const [px, py] = ctx.toScreen(
        f.positions[hit * 2],
        f.positions[hit * 2 + 1],
      );
      const full = ctx.activeMap.current[hit];
      const nb = ctx.activeAdj.current[hit];
      // Hover flags: hovered = 1, neighbor = 2, else 0.
      const fl = ctx.flags.current;
      if (fl.length === ctx.activeMap.current.length) {
        const nbSet = new Set(nb);
        for (let i = 0; i < fl.length; i++) {
          fl[i] = i === hit ? 1 : nbSet.has(i) ? 2 : 0;
        }
      }
      ctx.flagsDirty.current = true;
      ctx.renderer.current?.setHasHover(true);
      if (hit !== ctx.hoverEdgeFull.current) {
        ctx.hoverEdgeFull.current = hit;
        const ef = ctx.edgeFlags.current;
        if (ef.length === ctx.activeEdges.current.length / 2) {
          const edges = ctx.activeEdges.current;
          for (let e = 0; e < edges.length; e += 2) {
            ef[e / 2] = edges[e] === hit || edges[e + 1] === hit ? 1 : 0;
          }
          ctx.edgeFlagsDirty.current = true;
        }
      }
      const isTag = ctx.isTag.current[full];
      const title = isTag
        ? `#${ctx.paths.current[full] ?? ""}`
        : basename(ctx.paths.current[full] ?? "");
      ctx.setHover({ x: px, y: py, title, full, isTag });
      if (isTag) {
        ctx.hoverFull.current = -1;
        ctx.setPreview(null);
      } else if (ctx.hoverFull.current !== full) {
        ctx.hoverFull.current = full;
        const path = ctx.paths.current[full] ?? "";
        const cached = ctx.excerptCache.current.get(path);
        if (cached !== undefined) {
          ctx.setPreview({ excerpt: cached });
        } else {
          const token = ++ctx.hoverFetch.current;
          window.setTimeout(() => {
            if (token !== ctx.hoverFetch.current) return;
            ctx
              .openFile(path)
              .then((text) => {
                if (token !== ctx.hoverFetch.current) return;
                const ex = noteExcerpt(text);
                ctx.excerptCache.current.set(path, ex);
                ctx.setPreview({ excerpt: ex });
              })
              .catch(() => {
                if (token !== ctx.hoverFetch.current) return;
                ctx.setPreview({ excerpt: "" });
              });
          }, 120);
        }
      }
      ctx.canvas.style.cursor = "pointer";
    } else if (prevHover >= 0) {
      ctx.flags.current.fill(0);
      ctx.flagsDirty.current = true;
      ctx.edgeFlags.current.fill(0);
      ctx.edgeFlagsDirty.current = true;
      ctx.hoverEdgeFull.current = -1;
      ctx.renderer.current?.setHasHover(false);
      ctx.setHover(null);
      ctx.setPreview(null);
      ctx.hoverFull.current = -1;
      ctx.hoverFetch.current++;
      if (hit !== prevHover) ctx.dirty.current = true;
      ctx.canvas.style.cursor = "grab";
    }
  };

  const onUp = (e: MouseEvent) => {
    const rect = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (ctx.drag.current) {
      const moved = ctx.drag.current.moved;
      const down = ctx.down.current;
      const wasClick = down && Math.hypot(mx - down.x, my - down.y) < 4;
      if (!moved && wasClick) {
        const full = ctx.activeMap.current[ctx.drag.current.index];
        const title = ctx.paths.current[full];
        if (ctx.isTag.current[full]) {
          ctx.setQuery(`tag:${title}`);
        } else if (title) {
          ctx.openNote.current(title);
        }
      }
      ctx.drag.current = null;
    }
    ctx.pan.current = null;
    ctx.down.current = null;
    ctx.canvas.style.cursor = "grab";
  };

  const onLeave = () => {
    ctx.hover.current = -1;
    ctx.setHover(null);
    ctx.setPreview(null);
    ctx.hoverFull.current = -1;
    ctx.hoverFetch.current++;
    ctx.flags.current.fill(0);
    ctx.flagsDirty.current = true;
    ctx.edgeFlags.current.fill(0);
    ctx.edgeFlagsDirty.current = true;
    ctx.hoverEdgeFull.current = -1;
    ctx.renderer.current?.setHasHover(false);
    ctx.dirty.current = true;
    ctx.pan.current = null;
    ctx.drag.current = null;
  };

  // Right-click a node -> context menu (Open / Open in New Tab / Center / Local).
  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    const rect = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTest(mx, my);
    if (hit >= 0) {
      ctx.setMenu({
        x: mx,
        y: my,
        full: ctx.activeMap.current[hit],
        isTag: ctx.isTag.current[ctx.activeMap.current[hit]],
      });
    } else {
      ctx.setMenu(null);
    }
  };

  return { onWheel, onDown, onMove, onUp, onLeave, onContext };
}
