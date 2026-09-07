// Camera/viewBox math for the graph canvas (ADR-038 §3 graph split). Pure
// functions over the `ViewTransform` object the engine keeps in `viewRef` —
// fit/center/zoom mutate it in place so the sibling `fitted` flag survives.
export interface ViewTransform {
  scale: number;
  ox: number;
  oy: number;
}

// Node radius in screen px — matches the renderer's constant-size glyph.
export const NODE_R = 2.6;
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 12;
export const LABEL_SCALE = 1.4; // show node labels once zoomed past this
export const LABEL_CAP = 1500; // skip labels above this many visible nodes
export const CENTER_SCALE = 2.2; // zoom level used when flying to a node
export const ARROW_EDGE_CAP = 20000; // skip per-frame arrowheads past this many edges

/** World units -> screen CSS px. */
export function toScreen(
  wx: number,
  wy: number,
  view: ViewTransform,
): [number, number] {
  return [wx * view.scale + view.ox, wy * view.scale + view.oy];
}

/** Screen CSS px -> world units. */
export function toWorld(
  sx: number,
  sy: number,
  view: ViewTransform,
): [number, number] {
  return [(sx - view.ox) / view.scale, (sy - view.oy) / view.scale];
}

// Build a triangle (3 verts) at the target end of each edge for arrowheads.
// `r`/`w` are the tip offset and half-width in world units (so they shrink
// with zoom, staying proportional to the constant-size node glyph).
export function buildArrows(
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

/** Fit `count` positions into width×height with 40px padding, clamped. */
export function fitView(
  view: ViewTransform,
  positions: Float32Array,
  count: number,
  width: number,
  height: number,
): void {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const pad = 40;
  const bw = Math.max(1e-6, maxX - minX);
  const bh = Math.max(1e-6, maxY - minY);
  const s = Math.min((width - pad * 2) / bw, (height - pad * 2) / bh);
  view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  view.ox = width / 2 - ((minX + maxX) / 2) * view.scale;
  view.oy = height / 2 - ((minY + maxY) / 2) * view.scale;
}

/** Snap the camera to center a world point at a readable scale. */
export function centerView(
  view: ViewTransform,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const s = Math.max(view.scale, CENTER_SCALE);
  view.scale = s;
  view.ox = width / 2 - x * s;
  view.oy = height / 2 - y * s;
}

/** Wheel zoom about the cursor point (deltaY < 0 zooms in), clamped. */
export function zoomAt(
  view: ViewTransform,
  mx: number,
  my: number,
  deltaY: number,
): void {
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  view.ox = mx - (mx - view.ox) * (ns / view.scale);
  view.oy = my - (my - view.oy) * (ns / view.scale);
  view.scale = ns;
}