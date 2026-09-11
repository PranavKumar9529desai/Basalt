//! Camera control: fit-to-viewport, center-on-node (snap), and world→screen
//! projection used by interactions, the draw loop, and overlay labels.

import type { EngineContext } from "./context";
import { centerView, fitView, toScreen } from "../../lib/geometry";

/** World → screen projection under the current view transform. */
export function project(ctx: EngineContext, wx: number, wy: number): [number, number] {
  return toScreen(wx, wy, ctx.viewRef.current);
}

/** Auto-fit the visible subset into the canvas (initial graph + Fit action). */
export function fit(ctx: EngineContext): void {
  const f = ctx.frameRef.current;
  const count = ctx.activeMapRef.current.length;
  if (!f || count === 0) return;
  const canvas = ctx.glRef.current;
  fitView(
    ctx.viewRef.current,
    f.positions,
    count,
    canvas?.clientWidth || 800,
    canvas?.clientHeight || 600,
  );
  ctx.viewRef.current.fitted = true;
  ctx.dirtyRef.current = true;
}

/** Fly the camera to a node (snap): center it and zoom to a readable scale. */
export function centerOn(ctx: EngineContext, full: number): void {
  const f = ctx.frameRef.current;
  const sub = ctx.activeMapRef.current.indexOf(full);
  if (!f || sub < 0 || sub * 2 + 1 >= f.positions.length) return;
  const canvas = ctx.glRef.current;
  centerView(
    ctx.viewRef.current,
    f.positions[sub * 2],
    f.positions[sub * 2 + 1],
    canvas?.clientWidth || 800,
    canvas?.clientHeight || 600,
  );
  ctx.dirtyRef.current = true;
}

/** Wire the stable call-throughs (`fitRef`/`centerOnRef`) to the fns above. */
export function initCamera(ctx: EngineContext): void {
  ctx.fitRef.current = () => fit(ctx);
  ctx.centerOnRef.current = (full: number) => centerOn(ctx, full);
}