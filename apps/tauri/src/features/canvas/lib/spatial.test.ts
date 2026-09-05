import { describe, it, expect } from "vitest";
import {
  SpatialIndex,
  aabbIntersects,
  aabbContainsPoint,
  aabbContainsAABB,
  aabbUnion,
} from "./spatial";

describe("AABB helpers", () => {
  it("aabbIntersects detects overlapping rects", () => {
    expect(aabbIntersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it("aabbIntersects rejects non-overlapping rects", () => {
    expect(aabbIntersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
  });

  it("aabbIntersects handles edge-touching as non-intersecting", () => {
    expect(aabbIntersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it("aabbContainsPoint works", () => {
    const r = { x: 5, y: 5, w: 10, h: 10 };
    expect(aabbContainsPoint(r, 7, 7)).toBe(true);
    expect(aabbContainsPoint(r, 3, 3)).toBe(false);
    expect(aabbContainsPoint(r, 5, 5)).toBe(true); // boundary
  });

  it("aabbContainsAABB detects containment", () => {
    const outer = { x: 0, y: 0, w: 100, h: 100 };
    expect(aabbContainsAABB(outer, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
    expect(aabbContainsAABB(outer, { x: 90, y: 90, w: 20, h: 20 })).toBe(false);
  });

  it("aabbUnion computes bounding box", () => {
    const u = aabbUnion({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 30, w: 5, h: 5 });
    expect(u).toEqual({ x: 0, y: 0, w: 25, h: 35 });
  });
});

describe("SpatialIndex", () => {
  it("inserts and queries a single entry", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    expect(idx.query({ x: 5, y: 5, w: 1, h: 1 })).toEqual(["a"]);
    expect(idx.size).toBe(1);
  });

  it("query returns empty for non-overlapping region", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    expect(idx.query({ x: 100, y: 100, w: 10, h: 10 })).toEqual([]);
  });

  it("query returns multiple entries", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    idx.insert("b", { x: 5, y: 5, w: 10, h: 10 });
    idx.insert("c", { x: 50, y: 50, w: 10, h: 10 });

    const result = idx.query({ x: 0, y: 0, w: 20, h: 20 });
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).not.toContain("c");
  });

  it("remove removes the entry", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    idx.remove("a");
    expect(idx.size).toBe(0);
    expect(idx.query({ x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });

  it("insert replaces existing entry (update semantics)", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    idx.insert("a", { x: 50, y: 50, w: 10, h: 10 });
    expect(idx.size).toBe(1);
    // Should find at new position.
    expect(idx.query({ x: 50, y: 50, w: 1, h: 1 })).toEqual(["a"]);
    // Should NOT find at old position.
    expect(idx.query({ x: 0, y: 0, w: 1, h: 1 })).toEqual([]);
  });

  it("queryPoint returns entries containing the point", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    idx.insert("b", { x: 20, y: 20, w: 10, h: 10 });
    const result = idx.queryPoint(5, 5);
    expect(result.map((e) => e.id)).toContain("a");
    expect(result.map((e) => e.id)).not.toContain("b");
  });

  it("handles many entries without errors (stress)", () => {
    const idx = new SpatialIndex();
    for (let i = 0; i < 500; i++) {
      const x = (i % 50) * 20;
      const y = Math.floor(i / 50) * 20;
      idx.insert(String(i), { x, y, w: 15, h: 15 });
    }
    expect(idx.size).toBe(500);

    // Query the entire area.
    const result = idx.query({ x: 0, y: 0, w: 1000, h: 200 });
    expect(result.length).toBe(500);

    // Query a sub-area.
    const sub = idx.query({ x: 0, y: 0, w: 100, h: 40 });
    expect(sub.length).toBeGreaterThan(0);
    expect(sub.length).toBeLessThan(500);
  });

  it("handles entries outside initial bounds", () => {
    const idx = new SpatialIndex();
    idx.insert("origin", { x: 0, y: 0, w: 10, h: 10 });
    idx.insert("far", { x: 100000, y: -50000, w: 10, h: 10 });
    expect(idx.size).toBe(2);
    expect(idx.query({ x: 100000, y: -50000, w: 5, h: 5 })).toEqual(["far"]);
  });

  it("getData returns associated data", () => {
    const idx = new SpatialIndex<{ kind: string }>();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 }, { kind: "node" });
    expect(idx.getData("a")).toEqual({ kind: "node" });
    expect(idx.getData("missing")).toBeUndefined();
  });

  it("clear removes everything", () => {
    const idx = new SpatialIndex();
    idx.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    idx.insert("b", { x: 20, y: 20, w: 10, h: 10 });
    idx.clear();
    expect(idx.size).toBe(0);
    expect(idx.query({ x: 0, y: 0, w: 100, h: 100 })).toEqual([]);
  });

  it("query returns deduplicated results", () => {
    const idx = new SpatialIndex();
    // Insert a large rect that spans multiple quadrants.
    idx.insert("big", { x: -100, y: -100, w: 200, h: 200 });
    const result = idx.query({ x: -50, y: -50, w: 100, h: 100 });
    expect(result).toEqual(["big"]);
  });
});
