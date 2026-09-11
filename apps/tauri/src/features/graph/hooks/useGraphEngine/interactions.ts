//! Canvas event surface: build the interaction handlers (pan, drag, hover,
//! context menu, excerpt hover fetches) and own their event listeners.

import { invoke } from "@tauri-apps/api/core";
import type { EngineContext } from "./context";
import { createInteractions } from "../../lib/interactions";
import { toScreen, toWorld } from "../../lib/geometry";

export interface Interactions {
  destroy: () => void;
}

/** Create the handlers, bind them to the canvas/window, return cleanup. */
export function bindInteractions(ctx: EngineContext): Interactions {
  const glCanvas = ctx.glRef.current;
  if (!glCanvas) return { destroy: () => {} };

  const handlers = createInteractions({
    canvas: glCanvas,
    view: ctx.viewRef,
    frame: ctx.frameRef,
    drag: ctx.dragRef,
    pan: ctx.panRef,
    down: ctx.downRef,
    hover: ctx.hoverRef,
    activeMap: ctx.activeMapRef,
    activeAdj: ctx.activeAdjRef,
    activeEdges: ctx.activeEdgesRef,
    flags: ctx.flagsRef,
    flagsDirty: ctx.flagsDirtyRef,
    edgeFlags: ctx.edgeFlagsRef,
    edgeFlagsDirty: ctx.edgeFlagsDirtyRef,
    hoverEdgeFull: ctx.hoverEdgeFullRef,
    sizes: ctx.sizesRef,
    isTag: ctx.isTagRef,
    paths: ctx.pathsRef,
    grid: ctx.gridRef,
    renderer: ctx.rendererRef,
    excerptCache: ctx.excerptCacheRef,
    hoverFetch: ctx.hoverFetchRef,
    hoverFull: ctx.hoverFullRef,
    dirty: ctx.dirtyRef,
    worker: ctx.workerRef,
    openNote: ctx.openNoteRef,
    setMenu: ctx.setMenu,
    setHover: ctx.setHover,
    setPreview: ctx.setPreview,
    setQuery: ctx.setQuery,
    openFile: (path) => invoke<string>("open_file", { path }),
    toScreen: (wx, wy) => toScreen(wx, wy, ctx.viewRef.current),
    toWorld: (sx, sy) => toWorld(sx, sy, ctx.viewRef.current),
  });

  glCanvas.addEventListener("wheel", handlers.onWheel, { passive: false });
  glCanvas.addEventListener("mousedown", handlers.onDown);
  window.addEventListener("mousemove", handlers.onMove);
  window.addEventListener("mouseup", handlers.onUp);
  glCanvas.addEventListener("mouseleave", handlers.onLeave);
  glCanvas.addEventListener("contextmenu", handlers.onContext);

  return {
    destroy: () => {
      glCanvas.removeEventListener("wheel", handlers.onWheel);
      glCanvas.removeEventListener("mousedown", handlers.onDown);
      window.removeEventListener("mousemove", handlers.onMove);
      window.removeEventListener("mouseup", handlers.onUp);
      glCanvas.removeEventListener("mouseleave", handlers.onLeave);
      glCanvas.removeEventListener("contextmenu", handlers.onContext);
    },
  };
}