//! WebGL2 renderer construction and the resize observer that keeps the
//! drawing-buffer size in sync with the CSS box (devicePixelRatio-aware).

import { GraphRenderer } from "@workspace/graph";
import type { EngineContext } from "./context";
import { readThemeColors } from "../../lib/themeColors";

/**
 * Build a fresh `GraphRenderer` for `glCanvas`, wiring the current theme
 * colors onto it. Shared by the initial setup and the draw loop's
 * resource-rebuild path (a disposed renderer must be recreated identically).
 */
export function createRenderer(
  ctx: EngineContext,
  glCanvas: HTMLCanvasElement,
): GraphRenderer {
  const renderer = new GraphRenderer(glCanvas);
  ctx.rendererRef.current = renderer;
  const tc = ctx.themeColorsRef.current;
  renderer.setEdgeColor(tc.edge);
  renderer.setHoverColors(tc.hoverFill, tc.hoverRing);
  return renderer;
}

export interface Scene {
  /** Disconnect the resize observer. */
  destroy: () => void;
}

/**
 * Acquire the WebGL2 + overlay-2D contexts, create the renderer, and resize
 * to the current box. Returns `null` when WebGL2 is unavailable (the graph
 * cannot draw at all).
 */
export function initScene(ctx: EngineContext): Scene | null {
  const glCanvas = ctx.glRef.current;
  const labelCanvas = ctx.labelRef.current;
  if (!glCanvas || !labelCanvas) return null;
  const gl = glCanvas.getContext("webgl2");
  if (!gl) {
    console.error("[graph] WebGL2 unavailable — graph requires WebGL2");
    return null;
  }
  const labelCtx = labelCanvas.getContext("2d");
  if (!labelCtx) return null;

  ctx.themeColorsRef.current = readThemeColors();
  const renderer = createRenderer(ctx, glCanvas);

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const cssW = glCanvas.clientWidth || 800;
    const cssH = glCanvas.clientHeight || 600;
    renderer.resize(cssW, cssH, dpr);
    labelCanvas.width = Math.round(cssW * dpr);
    labelCanvas.height = Math.round(cssH * dpr);
    labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.dirtyRef.current = true;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(glCanvas);

  return {
    destroy: () => ro.disconnect(),
  };
}