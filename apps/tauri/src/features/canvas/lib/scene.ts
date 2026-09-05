// Scene types and geometry math for the infinite canvas.
//
// Pure business logic: no React, no DOM, no IPC. Types represent the
// in-memory canvas document; geometry functions compute edge attachment
// points, arrowhead vertices, and typed-array buffers for the WebGL
// viewport renderer.

import type { AABB } from "./spatial";

// ─── Scene model ────────────────────────────────────────────────────────────

export interface SceneNode {
  id: string;
  type: "text" | "file" | "link";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
}

export interface SceneGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  label?: string;
}

export interface Scene {
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
  nextNodeId: number;
}

// ─── Color helpers ──────────────────────────────────────────────────────────

const PRESET_RGB: Record<string, [number, number, number]> = {
  "1": [0.89, 0.29, 0.29],
  "2": [0.93, 0.56, 0.24],
  "3": [0.93, 0.83, 0.31],
  "4": [0.31, 0.75, 0.42],
  "5": [0.27, 0.71, 0.82],
  "6": [0.60, 0.40, 0.80],
};

const DEFAULT_RGB: [number, number, number] = [0.85, 0.85, 0.87];

export const toRgb = (c: string): [number, number, number] => {
  if (PRESET_RGB[c]) return PRESET_RGB[c];
  if (c.startsWith("#") && c.length === 7) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
  }
  return DEFAULT_RGB;
};

// ─── Scene → AABB (for spatial index) ──────────────────────────────────────

export const sceneNodeAABB = (n: SceneNode): AABB => ({
  x: n.x, y: n.y, w: n.width, h: n.height,
});

export const sceneGroupAABB = (g: SceneGroup): AABB => ({
  x: g.x, y: g.y, w: g.width, h: g.height,
});

// ─── Typed-array builders ───────────────────────────────────────────────────

export interface SceneBuffers {
  nodePos: Float32Array;
  nodeSz: Float32Array;
  nodeRgb: Float32Array;
  nodeA: Float32Array;
  grpPos: Float32Array;
  grpSz: Float32Array;
  grpRgb: Float32Array;
  grpA: Float32Array;
  edgeMids: Float32Array;
  edgeDirs: Float32Array;
  edgeRgb: Float32Array;
  edgeA: Float32Array;
  edgeCount: number;
}

export function buildBuffers(scene: Scene, visibleIds?: Set<string>): SceneBuffers {
  const { groups, edges } = scene;

  const visibleNodes = visibleIds
    ? scene.nodes.filter((n) => visibleIds.has(n.id))
    : scene.nodes;
  const visibleGroups = visibleIds
    ? groups.filter((g) => visibleIds.has(g.id))
    : groups;

  const nodePos = new Float32Array(visibleNodes.length * 2);
  const nodeSz = new Float32Array(visibleNodes.length * 2);
  const nodeRgb = new Float32Array(visibleNodes.length * 3);
  const nodeA = new Float32Array(visibleNodes.length);
  for (let i = 0; i < visibleNodes.length; i++) {
    const n = visibleNodes[i];
    nodePos[i * 2] = n.x;
    nodePos[i * 2 + 1] = n.y;
    nodeSz[i * 2] = n.width;
    nodeSz[i * 2 + 1] = n.height;
    const [r, g, b] = toRgb(n.color);
    nodeRgb[i * 3] = r;
    nodeRgb[i * 3 + 1] = g;
    nodeRgb[i * 3 + 2] = b;
    nodeA[i] = 1;
  }

  const grpPos = new Float32Array(visibleGroups.length * 2);
  const grpSz = new Float32Array(visibleGroups.length * 2);
  const grpRgb = new Float32Array(visibleGroups.length * 3);
  const grpA = new Float32Array(visibleGroups.length);
  for (let i = 0; i < visibleGroups.length; i++) {
    const g = visibleGroups[i];
    grpPos[i * 2] = g.x;
    grpPos[i * 2 + 1] = g.y;
    grpSz[i * 2] = g.width;
    grpSz[i * 2 + 1] = g.height;
    const [r, gr, b] = toRgb(g.color);
    grpRgb[i * 3] = r;
    grpRgb[i * 3 + 1] = gr;
    grpRgb[i * 3 + 2] = b;
    grpA[i] = 0.25;
  }

  // Edge midpoints and directions — compute from visible nodes+groups.
  const visibleAll = [...visibleNodes, ...visibleGroups];
  const idx = new Map<string, number>();
  for (let i = 0; i < visibleAll.length; i++) idx.set(visibleAll[i].id, i);

  const edgeMids = new Float32Array(edges.length * 2);
  const edgeDirs = new Float32Array(edges.length * 2);
  const edgeRgb = new Float32Array(edges.length * 3);
  const edgeA = new Float32Array(edges.length);
  let ec = 0;
  for (const e of edges) {
    const fi = idx.get(e.from);
    const ti = idx.get(e.to);
    if (fi === undefined || ti === undefined) continue;
    const f = visibleAll[fi];
    const t = visibleAll[ti];

    // Compute edge attachment points (center-to-center for now; refined in
    // edgeGeometry for the renderer; mid/dir is for the line-quad shader).
    const fx = f.x + f.width / 2;
    const fy = f.y + f.height / 2;
    const tx = t.x + t.width / 2;
    const ty = t.y + t.height / 2;
    edgeMids[ec * 2] = (fx + tx) / 2;
    edgeMids[ec * 2 + 1] = (fy + ty) / 2;
    edgeDirs[ec * 2] = tx - fx;
    edgeDirs[ec * 2 + 1] = ty - fy;
    const [r, g, b] = DEFAULT_RGB;
    edgeRgb[ec * 3] = r;
    edgeRgb[ec * 3 + 1] = g;
    edgeRgb[ec * 3 + 2] = b;
    edgeA[ec] = 0.5;
    ec++;
  }
  return {
    nodePos, nodeSz, nodeRgb, nodeA,
    grpPos, grpSz, grpRgb, grpA,
    edgeMids, edgeDirs, edgeRgb, edgeA, edgeCount: ec,
  };
}

// ─── Edge geometry ──────────────────────────────────────────────────────────

export type Side = "top" | "right" | "bottom" | "left";

/** Compute the point where a line from (cx,cy) to (tx,ty) intersects the
 *  rectangle at (rx,ry,rw,rh). Used for edge attachment points. */
export function rectLineIntersect(
  rx: number, ry: number, rw: number, rh: number,
  cx: number, cy: number, tx: number, ty: number,
): { x: number; y: number; side: Side } {
  const dx = tx - cx;
  const dy = ty - cy;

  if (dx === 0 && dy === 0) {
    // Fallback: center is the same as target; return top center.
    return { x: rx + rw / 2, y: ry, side: "top" };
  }

  const halfW = rw / 2;
  const halfH = rh / 2;
  const rcx = rx + halfW;
  const rcy = ry + halfH;

  // Check each side for intersection.
  const candidates: { t: number; side: Side }[] = [];

  // Top: y = ry
  if (dy !== 0) {
    const t = (ry - rcy) / dy;
    if (t > 0) {
      const ix = rcx + dx * t;
      if (ix >= rx && ix <= rx + rw) candidates.push({ t, side: "top" });
    }
  }
  // Bottom: y = ry + rh
  if (dy !== 0) {
    const t = (ry + rh - rcy) / dy;
    if (t > 0) {
      const ix = rcx + dx * t;
      if (ix >= rx && ix <= rx + rw) candidates.push({ t, side: "bottom" });
    }
  }
  // Left: x = rx
  if (dx !== 0) {
    const t = (rx - rcx) / dx;
    if (t > 0) {
      const iy = rcy + dy * t;
      if (iy >= ry && iy <= ry + rh) candidates.push({ t, side: "left" });
    }
  }
  // Right: x = rx + rw
  if (dx !== 0) {
    const t = (rx + rw - rcx) / dx;
    if (t > 0) {
      const iy = rcy + dy * t;
      if (iy >= ry && iy <= ry + rh) candidates.push({ t, side: "right" });
    }
  }

  if (candidates.length === 0) {
    // Fallback: nearest edge center.
    return { x: rcx, y: ry, side: "top" };
  }

  // Pick the closest intersection (smallest t).
  candidates.sort((a, b) => a.t - b.t);
  const best = candidates[0];
  const t = best.t;
  return { x: rcx + dx * t, y: rcy + dy * t, side: best.side };
}

/** Compute attachment points for an edge between two rects. Returns the
 *  point on the source rect boundary and the point on the target rect
 *  boundary, connected by a straight line. */
export function edgeAttachPoints(
  from: AABB, to: AABB,
  fromSide?: Side, toSide?: Side,
): { fx: number; fy: number; tx: number; ty: number } {
  const sideCenter = (rect: AABB, side: Side): { x: number; y: number } => {
    switch (side) {
      case "top": return { x: rect.x + rect.w / 2, y: rect.y };
      case "right": return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
      case "bottom": return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
      case "left": return { x: rect.x, y: rect.y + rect.h / 2 };
    }
  };

  // If both sides are specified, use them directly.
  if (fromSide && toSide) {
    const fc = sideCenter(from, fromSide);
    const tc = sideCenter(to, toSide);
    return { fx: fc.x, fy: fc.y, tx: tc.x, ty: tc.y };
  }

  // Auto-detect: intersect line from center→center with each rect boundary.
  const fcx = from.x + from.w / 2;
  const fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2;
  const tcy = to.y + to.h / 2;

  const fromPt = rectLineIntersect(from.x, from.y, from.w, from.h, fcx, fcy, tcx, tcy);
  const toPt = rectLineIntersect(to.x, to.y, to.w, to.h, tcx, tcy, fcx, fcy);

  return { fx: fromPt.x, fy: fromPt.y, tx: toPt.x, ty: toPt.y };
}

// ─── Arrowhead geometry ─────────────────────────────────────────────────────

/** Generate arrowhead triangle vertices (6 floats = 3 × (x,y)) for an
 *  edge ending at (tx, ty) coming from direction (dx, dy).
 *  Returns 6 floats: [tip_x, tip_y, base1_x, base1_y, base2_x, base2_y]. */
export function arrowVertices(
  tx: number, ty: number,
  dx: number, dy: number,
  size: number = 10,
): Float32Array {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return new Float32Array(6);

  const ux = dx / len;
  const uy = dy / len;

  // Base is perpendicular to edge direction.
  const px = -uy;
  const py = ux;

  const baseX = tx - ux * size;
  const baseY = ty - uy * size;
  const halfW = size * 0.4;

  return new Float32Array([
    tx, ty,
    baseX + px * halfW, baseY + py * halfW,
    baseX - px * halfW, baseY - py * halfW,
  ]);
}

/** Build arrowhead vertices for all edges. Returns a flat Float32Array of
 *  (x,y) pairs, 6 per edge (2 triangles). */
export function buildArrowBuffers(
  scene: Scene,
  visibleIds?: Set<string>,
): Float32Array {
  const { groups, edges } = scene;
  const nodes = visibleIds
    ? scene.nodes.filter((n) => visibleIds.has(n.id))
    : scene.nodes;
  const visGroups = visibleIds
    ? groups.filter((g) => visibleIds.has(g.id))
    : groups;

  const all = [...nodes, ...visGroups];
  const idx = new Map<string, number>();
  for (let i = 0; i < all.length; i++) idx.set(all[i].id, i);

  const parts: Float32Array[] = [];
  for (const e of edges) {
    const fi = idx.get(e.from);
    const ti = idx.get(e.to);
    if (fi === undefined || ti === undefined) continue;
    const f = all[fi];
    const t = all[ti];

    const dx = (t.x + t.width / 2) - (f.x + f.width / 2);
    const dy = (t.y + t.height / 2) - (f.y + f.height / 2);

    // Arrow sits on the target boundary.
    const toPt = rectLineIntersect(t.x, t.y, t.width, t.height,
      t.x + t.width / 2, t.y + t.height / 2,
      f.x + f.width / 2, f.y + f.height / 2);

    parts.push(arrowVertices(toPt.x, toPt.y, dx, dy));
  }

  if (parts.length === 0) return new Float32Array(0);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

// ─── Hit-testing ────────────────────────────────────────────────────────────

/** Hit-test a world-space point against scene elements. Returns the topmost
 *  element id (nodes beat groups; last-in-z-order wins). */
export function hitTest(scene: Scene, wx: number, wy: number): string | null {
  let hit: string | null = null;

  for (const g of scene.groups) {
    if (wx >= g.x && wx <= g.x + g.width && wy >= g.y && wy <= g.y + g.height) {
      hit = g.id;
    }
  }
  for (const n of scene.nodes) {
    if (wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) {
      hit = n.id;
    }
  }
  return hit;
}

/** Hit-test against a specific Set of ids. Returns only ids in `targetIds`. */
export function hitTestIds(
  scene: Scene, wx: number, wy: number, targetIds: Set<string>,
): string | null {
  for (const g of scene.groups) {
    if (targetIds.has(g.id) && wx >= g.x && wx <= g.x + g.width && wy >= g.y && wy <= g.y + g.height) {
      // Keep checking nodes — they win over groups.
    }
  }
  for (const n of scene.nodes) {
    if (targetIds.has(n.id) && wx >= n.x && wx <= n.x + n.width && wy >= n.y && wy <= n.y + n.height) {
      return n.id;
    }
  }
  // Fallback: check groups (nodes always win if both hit).
  for (const g of scene.groups) {
    if (targetIds.has(g.id) && wx >= g.x && wx <= g.x + g.width && wy >= g.y && wy <= g.y + g.height) {
      return g.id;
    }
  }
  return null;
}

// ─── Text extraction ────────────────────────────────────────────────────────

export function extractTitle(text?: string): string {
  if (!text) return "";
  const first = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return first.replace(/^#+\s*/, "").trim();
}

// ─── ID generation ──────────────────────────────────────────────────────────

export function nextId(scene: Scene): string {
  scene.nextNodeId++;
  return String(scene.nextNodeId);
}

// ─── Union bounds (for group creation) ──────────────────────────────────────

export function unionBounds(items: { x: number; y: number; width: number; height: number }[]): AABB | null {
  if (items.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ─── Mock scene ─────────────────────────────────────────────────────────────

export const MOCK_SCENE: Scene = {
  groups: [
    { id: "grp1", x: 30, y: 20, width: 660, height: 380, color: "3", label: "Project Brainstorm" },
  ],
  nodes: [
    { id: "card1", type: "text", x: 50, y: 50, width: 260, height: 140, color: "4", text: "# Core Idea\nBuild tools that respect user data ownership." },
    { id: "card2", type: "text", x: 400, y: 50, width: 260, height: 140, color: "1", text: "# Why?\nProprietary formats create lock-in." },
    { id: "card3", type: "link", x: 400, y: 260, width: 260, height: 80, color: "5" },
    { id: "card4", type: "file", x: 50, y: 400, width: 260, height: 120, color: "2" },
  ],
  edges: [
    { id: "e1", from: "card1", to: "card2" },
    { id: "e2", from: "card2", to: "card3" },
  ],
  nextNodeId: 100,
};
