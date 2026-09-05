// Pure geometry helpers + interaction types for the infinite canvas.
// Zero DOM, zero React — testable in isolation.

import type { SceneNode } from "./scene";
import type { Side } from "./scene";
import type { CanvasTransform } from "@workspace/canvas-viewport";

// ─── Constants ──────────────────────────────────────────────────────────────

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
export const SCALE_STEP = 1.08;
export const MARQUEE_THRESHOLD = 4; // px before pointer-move becomes a marquee
export const HANDLE_RADIUS = 12; // px grab area around a side midpoint

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScreenRect { sx: number; sy: number; sw: number; sh: number }

export type DragMode =
  | { kind: "pan"; startX: number; startY: number; startOx: number; startOy: number }
  | { kind: "node"; offsets: Map<string, { dx: number; dy: number }> }
  | { kind: "marquee"; startX: number; startY: number; additive: boolean }
  | { kind: "edge"; fromId: string; fromSide: Side };

export interface EdgeDraft { fx: number; fy: number; tx: number; ty: number }

// ─── Geometry ───────────────────────────────────────────────────────────────

/** Convert canvas entity coords to screen pixels. */
export const toScreen = (
  x: number, y: number, w: number, h: number, v: CanvasTransform,
): ScreenRect => ({
  sx: x * v.scale + v.ox,
  sy: y * v.scale + v.oy,
  sw: w * v.scale,
  sh: h * v.scale,
});

/** Convert a pointer event's client coords to world-space. */
export function worldPos(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  v: CanvasTransform,
): { wx: number; wy: number } {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  return { wx: (sx - v.ox) / v.scale, wy: (sy - v.oy) / v.scale };
}

/** Screen position of a node's side midpoint (for handle rendering). */
export function sideMidpoint(
  node: SceneNode, side: Side, v: CanvasTransform,
): { x: number; y: number } {
  let wx: number, wy: number;
  switch (side) {
    case "top": wx = node.x + node.width / 2; wy = node.y; break;
    case "right": wx = node.x + node.width; wy = node.y + node.height / 2; break;
    case "bottom": wx = node.x + node.width / 2; wy = node.y + node.height; break;
    case "left": wx = node.x; wy = node.y + node.height / 2; break;
  }
  return { x: wx * v.scale + v.ox, y: wy * v.scale + v.oy };
}

/** Find the node side whose midpoint is within HANDLE_RADIUS px of (sx, sy). */
export function nearestHandle(
  node: SceneNode, sx: number, sy: number, v: CanvasTransform,
): Side | null {
  const sides: Side[] = ["top", "right", "bottom", "left"];
  for (const side of sides) {
    const m = sideMidpoint(node, side, v);
    const dx = sx - m.x;
    const dy = sy - m.y;
    if (dx * dx + dy * dy <= HANDLE_RADIUS * HANDLE_RADIUS) return side;
  }
  return null;
}
