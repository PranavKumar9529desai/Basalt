// 2D AABB + quadtree spatial index for the infinite canvas viewport.
//
// Pure business logic: no React, no DOM, no IPC. Powers viewport culling
// (only upload visible nodes to GPU) and O(log n) hit-testing for pointer
// interactions (hover, click, marquee select).
//
// Single source of truth for node/group rects. The tree is rebuilt on
// structural changes (load, add, delete) and incrementally updated during
// drag (remove + insert per move — O(log n), cheap at any canvas scale).

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function aabbContainsPoint(a: AABB, px: number, py: number): boolean {
  return px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h;
}

export function aabbContainsAABB(outer: AABB, inner: AABB): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function aabbUnion(a: AABB, b: AABB): AABB {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ─── Quadtree ───────────────────────────────────────────────────────────────

const LEAF_CAPACITY = 16;
const MAX_DEPTH = 24;

interface Entry<T> {
  id: string;
  rect: AABB;
  data: T;
}

interface QuadNode<T> {
  bounds: AABB;
  entries: Entry<T>[];
  children: [QuadNode<T>, QuadNode<T>, QuadNode<T>, QuadNode<T>] | null;
}

function createNode<T>(bounds: AABB): QuadNode<T> {
  return { bounds, entries: [], children: null };
}

/** Split a leaf node into 4 children and distribute entries. */
function split<T>(node: QuadNode<T>): void {
  const { bounds } = node;
  const mx = bounds.x + bounds.w / 2;
  const my = bounds.y + bounds.h / 2;

  const nw = createNode<T>({ x: bounds.x, y: bounds.y, w: bounds.w / 2, h: bounds.h / 2 });
  const ne = createNode<T>({ x: mx, y: bounds.y, w: bounds.w / 2, h: bounds.h / 2 });
  const sw = createNode<T>({ x: bounds.x, y: my, w: bounds.w / 2, h: bounds.h / 2 });
  const se = createNode<T>({ x: mx, y: my, w: bounds.w / 2, h: bounds.h / 2 });

  node.children = [nw, ne, sw, se];

  const entries = node.entries;
  node.entries = [];

  for (const entry of entries) {
    insertInto(node, entry, 0);
  }
}

/** Get the child index(es) that a rect belongs to. */
function childIndices(bounds: AABB, rect: AABB): number[] {
  const mx = bounds.x + bounds.w / 2;
  const my = bounds.y + bounds.h / 2;
  const indices: number[] = [];

  // 0=nw, 1=ne, 2=sw, 3=se
  const inNW = rect.x < mx && rect.y < my;
  const inNE = rect.x + rect.w > mx && rect.y < my;
  const inSW = rect.x < mx && rect.y + rect.h > my;
  const inSE = rect.x + rect.w > mx && rect.y + rect.h > my;

  if (inNW) indices.push(0);
  if (inNE) indices.push(1);
  if (inSW) indices.push(2);
  if (inSE) indices.push(3);

  // If rect is tiny and sits exactly on a boundary, it might match zero children.
  // Ensure at least one child gets it.
  if (indices.length === 0) {
    indices.push(0);
  }

  return indices;
}

/** Insert an entry into the tree rooted at `node`. */
function insertInto<T>(node: QuadNode<T>, entry: Entry<T>, depth: number): void {
  if (!node.bounds) {
    // Shouldn't happen, but defensive.
    return;
  }

  // If entry doesn't intersect this node, skip.
  if (!aabbIntersects(node.bounds, entry.rect)) return;

  // Internal node: recurse into children.
  if (node.children) {
    const indices = childIndices(node.bounds, entry.rect);
    for (const idx of indices) {
      insertInto(node.children[idx], entry, depth + 1);
    }
    return;
  }

  // Leaf node: add entry.
  node.entries.push(entry);

  // Split if over capacity and not at max depth.
  if (node.entries.length > LEAF_CAPACITY && depth < MAX_DEPTH) {
    split(node);
  }
}

/** Collect all entries whose rects intersect `queryRect`. */
function queryNode<T>(node: QuadNode<T>, queryRect: AABB, out: Entry<T>[]): void {
  if (!aabbIntersects(node.bounds, queryRect)) return;

  if (node.children) {
    for (const child of node.children) {
      queryNode(child, queryRect, out);
    }
  } else {
    for (const entry of node.entries) {
      if (aabbIntersects(entry.rect, queryRect)) {
        out.push(entry);
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class SpatialIndex<T = void> {
  private entries = new Map<string, Entry<T>>();
  private root: QuadNode<T> | null = null;

  /** Total number of indexed entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Insert or update an entry. O(log n). */
  insert(id: string, rect: AABB, data?: T): void {
    const entry: Entry<T> = { id, rect: { ...rect }, data: data as T };
    const isUpdate = this.entries.has(id);

    // Update the map first so rebuild (if called) sees the new rect.
    this.entries.set(id, entry);

    if (isUpdate) {
      this.rebuild();
      return;
    }

    if (!this.root) {
      const pad = Math.max(rect.w, rect.h, 1000) * 10;
      this.root = createNode<T>({
        x: rect.x + rect.w / 2 - pad,
        y: rect.y + rect.h / 2 - pad,
        w: pad * 2,
        h: pad * 2,
      });
      insertInto(this.root, entry, 0);
      return;
    }

    // Entry outside the current root bounds: rebuild the whole tree so the
    // root grows to contain everything. Rare (only far-out-of-bounds inserts),
    // so O(n log n) rebuild is fine.
    if (!aabbContainsAABB(this.root.bounds, rect)) {
      this.rebuild();
      return;
    }

    insertInto(this.root, entry, 0);
  }

  /** Remove an entry by id. O(log n) amortized. */
  remove(id: string): void {
    if (!this.entries.has(id)) return;
    this.entries.delete(id);
    this.rebuild();
  }

  /** Query: return all entry ids whose rects intersect `rect`. */
  query(rect: AABB): string[] {
    if (!this.root) return [];
    const raw: Entry<T>[] = [];
    queryNode(this.root, rect, raw);
    // Deduplicate: an entry can match multiple children if it spans quadrants.
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of raw) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        result.push(e.id);
      }
    }
    return result;
  }

  /** Query: return all entries whose rects contain the point (px, py). */
  queryPoint(px: number, py: number): Entry<T>[] {
    if (!this.root) return [];
    const raw: Entry<T>[] = [];
    queryNode(this.root, { x: px, y: py, w: 0, h: 0 }, raw);
    // Filter to actual point containment (queryNode uses AABB intersection which
    // matches for degenerate 0×0 rect, but entries may be larger).
    return raw.filter((e) => aabbContainsPoint(e.rect, px, py));
  }

  /** Get the data payload for an entry. */
  getData(id: string): T | undefined {
    return this.entries.get(id)?.data;
  }

  /** Get the rect for an entry. */
  getRect(id: string): AABB | undefined {
    return this.entries.get(id)?.rect;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.clear();
    this.root = null;
  }

  /** Rebuild the tree from scratch. O(n log n). Called on structural changes. */
  private rebuild(): void {
    const all = Array.from(this.entries.values());
    this.root = null;
    if (all.length === 0) return;

    // Compute bounding box of all entries.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of all) {
      minX = Math.min(minX, e.rect.x);
      minY = Math.min(minY, e.rect.y);
      maxX = Math.max(maxX, e.rect.x + e.rect.w);
      maxY = Math.max(maxY, e.rect.y + e.rect.h);
    }
    const pad = Math.max(maxX - minX, maxY - minY, 1000) * 0.1;
    this.root = createNode<T>({
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    });

    for (const entry of all) {
      insertInto(this.root, entry, 0);
    }
  }
}
