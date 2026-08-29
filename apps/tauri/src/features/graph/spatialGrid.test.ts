import { describe, it, expect } from "vitest";
import { SpatialGrid } from "./spatialGrid";

// Identity projection: world coords == screen coords, so we can reason in
// absolute units and verify the grid's spatial contract directly.
const id = (x: number, y: number): [number, number] => [x, y];

describe("SpatialGrid", () => {
  it("returns -1 for an empty grid", () => {
    const g = new SpatialGrid();
    g.build(new Float32Array(0), 0, id);
    expect(g.query(0, 0, 8)).toBe(-1);
  });

  it("ignores the trailing tail of positions beyond count", () => {
    const g = new SpatialGrid();
    // count=1 but the array holds two coords; only the first is indexed.
    g.build(new Float32Array([100, 100, 500, 500]), 1, id);
    expect(g.query(100, 100, 8)).toBe(0);
    expect(g.query(500, 500, 8)).toBe(-1);
  });

  it("finds the node at the exact query point", () => {
    const g = new SpatialGrid();
    g.build(new Float32Array([100, 100]), 1, id);
    expect(g.query(100, 100, 8)).toBe(0);
  });

  it("finds a node within radius", () => {
    const g = new SpatialGrid();
    g.build(new Float32Array([100, 100]), 1, id);
    expect(g.query(105, 100, 8)).toBe(0);
  });

  it("returns -1 beyond radius", () => {
    const g = new SpatialGrid();
    g.build(new Float32Array([100, 100]), 1, id);
    expect(g.query(0, 0, 8)).toBe(-1);
  });

  it("treats radius as exclusive (boundary not selected)", () => {
    const g = new SpatialGrid();
    g.build(new Float32Array([100, 100]), 1, id);
    expect(g.query(108, 100, 8)).toBe(-1); // distance == radius
  });

  it("returns the nearest of multiple nodes", () => {
    const g = new SpatialGrid();
    // idx0 at (100,100), idx1 at (200,100)
    g.build(new Float32Array([100, 100, 200, 100]), 2, id);
    expect(g.query(120, 100, 30)).toBe(0); // closer to idx0 (dist 20)
    expect(g.query(180, 100, 30)).toBe(1); // closer to idx1 (dist 20)
  });

  it("selects a node only when within radius among many", () => {
    const g = new SpatialGrid();
    // Three well-separated nodes.
    g.build(new Float32Array([0, 0, 1000, 1000, 2000, 0]), 3, id);
    expect(g.query(5, 5, 8)).toBe(0);
    expect(g.query(1003, 1003, 8)).toBe(1);
    expect(g.query(2002, 1, 8)).toBe(2);
    expect(g.query(500, 500, 8)).toBe(-1);
  });

  it("reuses buffers across builds (no per-call allocation for steady size)", () => {
    const g = new SpatialGrid();
    g.build(new Float32Array([100, 100]), 1, id);
    const before = (g as unknown as { screen: Float32Array }).screen;
    g.build(new Float32Array([200, 200]), 1, id);
    const after = (g as unknown as { screen: Float32Array }).screen;
    expect(after).toBe(before); // same underlying buffer instance
  });
});
