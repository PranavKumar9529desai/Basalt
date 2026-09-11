//! Color context + recolor. `buildColorContext` reads the live theme/controls
//! from refs so every caller (rebuild, draw, recolor) gets current values;
//! `setRecolor` recomputes + uploads the active subset's color array.

import { useEffect } from "react";
import type { EngineContext } from "./context";
import {
  buildColorArray,
  readThemeColors,
  type ColorContext,
} from "../../lib/themeColors";

/** Build the renderer's color input from the live refs + controls. */
export function buildColorContext(ctx: EngineContext): ColorContext {
  return {
    colors: ctx.themeColorsRef.current,
    mode: ctx.controls.current.colorMode,
    isTag: ctx.isTagRef.current,
    paths: ctx.pathsRef.current,
    attach: ctx.attachRef.current,
    cluster: ctx.clusterRef.current,
    clusterCount: ctx.clusterCountRef.current,
    tags: ctx.tagsRef.current,
  };
}

/**
 * Recompute the color array for the active subset and upload it. Fired from
 * the leaf when the color mode changes (or the theme changes).
 */
export function setRecolor(ctx: EngineContext): void {
  const renderer = ctx.rendererRef.current;
  const map = ctx.activeMapRef.current;
  if (!renderer || !map.length) return;
  renderer.setColors(buildColorArray(map, buildColorContext(ctx)));
  if (ctx.flagsRef.current.length === map.length) {
    ctx.flagsRef.current.fill(0);
    ctx.flagsDirtyRef.current = true;
  }
  ctx.dirtyRef.current = true;
}

/**
 * Re-derive theme colors when the theme changes (class/style mutations) and
 * reflect new edge/hover colors onto the renderer. Mirrors the original
 * mount-only effect; `ctx` is a bag of stable refs so the empty dep list is
 * intentional.
 */
export function useThemeObserver(ctx: EngineContext): void {
  useEffect(() => {
    const ro = new MutationObserver(() => {
      ctx.themeColorsRef.current = readThemeColors();
      const tc = ctx.themeColorsRef.current;
      ctx.rendererRef.current?.setEdgeColor(tc.edge);
      ctx.rendererRef.current?.setHoverColors(tc.hoverFill, tc.hoverRing);
      ctx.recolorRef.current?.();
    });
    ro.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    return () => ro.disconnect();
    // ctx is composed solely of stable refs/setters — never identity-changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}