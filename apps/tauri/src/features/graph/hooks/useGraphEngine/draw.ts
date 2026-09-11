//! The rAF draw loop: upload the latest sim frame + camera, rebuild renderer
//! resources when the GL context needs it, draw arrowheads, render, and paint
//! overlay labels. Idle when nothing changed (dirty flag off) — a settled
//! graph costs zero GPU/CPU work.

import type { GraphRenderer } from "@workspace/graph";
import type { EngineContext } from "./context";
import { createRenderer } from "./scene";
import { buildColorArray } from "../../lib/themeColors";
import { buildColorContext } from "./theme";
import { drawOverlayLabels } from "../../lib/labels";
import { ARROW_EDGE_CAP, buildArrows } from "../../lib/geometry";
import { project } from "./camera";

export interface DrawLoop {
  destroy: () => void;
}

/** Kick off the rAF loop; returns its cancellation handle. */
export function startDrawLoop(ctx: EngineContext): DrawLoop {
  const glCanvas = ctx.glRef.current;
  const labelCanvas = ctx.labelRef.current;
  const labelCtx = labelCanvas?.getContext("2d");
  let raf = 0;

  const draw = () => {
    const f = ctx.frameRef.current;
    const map = ctx.activeMapRef.current;
    const count = map.length;
    // Only redraw when something changed: a new sim frame, camera move,
    // hover, resize, or rebuild.
    if (f && count > 0 && ctx.dirtyRef.current) {
      const p = f.positions;
      if (!ctx.viewRef.current.fitted) ctx.fitRef.current();
      const v = ctx.viewRef.current;
      let renderer = ctx.rendererRef.current;
      if (renderer) {
        if (renderer.needsResourceRebuild()) {
          // The GL context was lost/regrown — dispose and recreate the
          // renderer with the current subset uploaded into it.
          renderer.dispose();
          renderer = reinitRenderer(ctx, glCanvas);
          if (!renderer) return;
        }
        renderer.setPositions(p);
        renderer.setView({ scale: v.scale, ox: v.ox, oy: v.oy });
        if (ctx.flagsDirtyRef.current) {
          renderer.setFlags(ctx.flagsRef.current);
          ctx.flagsDirtyRef.current = false;
        }
        if (ctx.edgeFlagsDirtyRef.current) {
          renderer.setEdgeFlags(ctx.edgeFlagsRef.current);
          ctx.edgeFlagsDirtyRef.current = false;
        }
        // Arrowheads depend on positions AND zoom; rebuild only when either
        // changed.
        if (
          f !== ctx.lastArrowFrameRef.current ||
          v.scale !== ctx.lastArrowScaleRef.current
        ) {
          const n = Math.min(
            ctx.activeEdgesRef.current.length / 2,
            ARROW_EDGE_CAP,
          );
          if (ctx.arrowOutRef.current.length !== n * 6) {
            ctx.arrowOutRef.current = new Float32Array(n * 6);
          }
          buildArrows(
            p,
            ctx.activeEdgesRef.current,
            ctx.activeEdgesRef.current.length / 2,
            v.scale,
            ctx.arrowOutRef.current,
          );
          renderer.setArrows(ctx.arrowOutRef.current);
          ctx.lastArrowFrameRef.current = f;
          ctx.lastArrowScaleRef.current = v.scale;
        }
        renderer.render();
        // Bin nodes in screen space for O(local) hover hit-testing; reused
        // while idle.
        ctx.gridRef.current.build(p, count, (wx, wy) => project(ctx, wx, wy));
      }
      // Labels on the transparent 2D overlay (only when zoomed past
      // LABEL_SCALE); the hovered node's neighborhood is always labeled.
      if (labelCtx) {
        drawOverlayLabels(labelCtx, {
          canvasW: glCanvas?.clientWidth || 800,
          canvasH: glCanvas?.clientHeight || 600,
          positions: p,
          count,
          map,
          hoverIndex: ctx.hoverRef.current,
          neighbors:
            ctx.hoverRef.current >= 0
              ? ctx.activeAdjRef.current[ctx.hoverRef.current]
              : null,
          project: (wx, wy) => project(ctx, wx, wy),
          isTag: ctx.isTagRef.current,
          paths: ctx.pathsRef.current,
          labelColor: ctx.themeColorsRef.current.label,
          scale: v.scale,
        });
      }
      ctx.dirtyRef.current = false;
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return {
    destroy: () => cancelAnimationFrame(raf),
  };
}

/**
 * Recreate the renderer after a resource rebuild (GL context regrow) and
 * re-upload the current subset: colors, edges, weights, hover flags.
 */
function reinitRenderer(
  ctx: EngineContext,
  glCanvas: HTMLCanvasElement | null,
): GraphRenderer | null {
  if (!glCanvas) return null;
  const renderer = createRenderer(ctx, glCanvas);
  renderer.resize(
    glCanvas.clientWidth || 800,
    glCanvas.clientHeight || 600,
    window.devicePixelRatio || 1,
  );
  renderer.setSizes(ctx.sizesRef.current);
  renderer.setColors(
    buildColorArray(ctx.activeMapRef.current, buildColorContext(ctx)),
  );
  renderer.setEdges(
    ctx.activeEdgesRef.current,
    ctx.activeEdgesRef.current.length / 2,
  );
  renderer.setEdgeWeights(ctx.activeEdgeWeightsRef.current);
  renderer.setFlags(ctx.flagsRef.current);
  renderer.setEdgeFlags(ctx.edgeFlagsRef.current);
  return renderer;
}
