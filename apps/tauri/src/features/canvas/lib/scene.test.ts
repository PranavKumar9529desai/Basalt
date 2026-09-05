import { describe, it, expect } from "vitest";
import {
  toRgb,
  buildBuffers,
  buildArrowBuffers,
  rectLineIntersect,
  edgeAttachPoints,
  arrowVertices,
  hitTest,
  extractTitle,
  unionBounds,
  MOCK_SCENE,
  type Scene,
} from "./scene";

describe("toRgb", () => {
  it("resolves preset colors", () => {
    const [r, g, b] = toRgb("1");
    expect(r).toBeCloseTo(0.89, 1);
    expect(g).toBeCloseTo(0.29, 1);
    expect(b).toBeCloseTo(0.29, 1);
  });

  it("parses hex colors", () => {
    const [r, g, b] = toRgb("#FF8800");
    expect(r).toBeCloseTo(1.0, 2);
    expect(g).toBeCloseTo(0x88 / 255, 2);
    expect(b).toBe(0);
  });

  it("falls back to default for empty string", () => {
    expect(toRgb("")).toEqual([0.85, 0.85, 0.87]);
  });
});

describe("buildBuffers", () => {
  it("produces correct-sized arrays for a scene", () => {
    const buf = buildBuffers(MOCK_SCENE);
    // 4 nodes
    expect(buf.nodePos.length).toBe(4 * 2);
    expect(buf.nodeRgb.length).toBe(4 * 3);
    expect(buf.nodeA.length).toBe(4);
    // 1 group
    expect(buf.grpPos.length).toBe(1 * 2);
    expect(buf.grpA.length).toBe(1);
    // 2 edges
    expect(buf.edgeCount).toBe(2);
    expect(buf.edgeMids.length).toBe(2 * 2);
    expect(buf.edgeDirs.length).toBe(2 * 2);
  });

  it("filters by visible ids", () => {
    const visible = new Set(["card1", "card3"]);
    const buf = buildBuffers(MOCK_SCENE, visible);
    expect(buf.nodePos.length).toBe(2 * 2); // only card1 + card3
    // Edge e1 (card1→card2): card2 not visible, so skipped.
    // Edge e2 (card2→card3): card2 not visible, so skipped.
    expect(buf.edgeCount).toBe(0);
  });

  it("handles empty scene", () => {
    const empty: Scene = { nodes: [], groups: [], edges: [], nextNodeId: 0 };
    const buf = buildBuffers(empty);
    expect(buf.nodePos.length).toBe(0);
    expect(buf.edgeCount).toBe(0);
  });
});

describe("rectLineIntersect", () => {
  it("finds intersection with top edge", () => {
    const pt = rectLineIntersect(0, 0, 100, 100, 50, 50, 50, -50);
    expect(pt.side).toBe("top");
    expect(pt.y).toBeCloseTo(0, 5);
  });

  it("finds intersection with right edge", () => {
    const pt = rectLineIntersect(0, 0, 100, 100, 50, 50, 150, 50);
    expect(pt.side).toBe("right");
    expect(pt.x).toBeCloseTo(100, 5);
  });

  it("finds intersection with left edge", () => {
    const pt = rectLineIntersect(0, 0, 100, 100, 50, 50, -50, 50);
    expect(pt.side).toBe("left");
    expect(pt.x).toBeCloseTo(0, 5);
  });

  it("returns center fallback for zero direction", () => {
    const pt = rectLineIntersect(0, 0, 100, 100, 50, 50, 50, 50);
    expect(pt.x).toBeCloseTo(50, 5);
    expect(pt.y).toBeCloseTo(0, 5);
  });
});

describe("edgeAttachPoints", () => {
  it("computes auto-detect attachment between two non-overlapping rects", () => {
    const from = { x: 0, y: 0, w: 100, h: 60 };
    const to = { x: 200, y: 0, w: 100, h: 60 };
    const pts = edgeAttachPoints(from, to);
    // From rect right edge, to rect left edge.
    expect(pts.fx).toBeCloseTo(100, 5);
    expect(pts.tx).toBeCloseTo(200, 5);
  });

  it("uses specified sides when provided", () => {
    const from = { x: 0, y: 0, w: 100, h: 100 };
    const to = { x: 200, y: 200, w: 100, h: 100 };
    const pts = edgeAttachPoints(from, to, "bottom", "top");
    expect(pts.fx).toBeCloseTo(50, 5);
    expect(pts.fy).toBeCloseTo(100, 5);
    expect(pts.tx).toBeCloseTo(250, 5);
    expect(pts.ty).toBeCloseTo(200, 5);
  });
});

describe("arrowVertices", () => {
  it("produces 6 floats for a triangle", () => {
    const v = arrowVertices(100, 50, 10, 0);
    expect(v.length).toBe(6);
    // Tip should be at (100, 50).
    expect(v[0]).toBeCloseTo(100, 5);
    expect(v[1]).toBeCloseTo(50, 5);
  });

  it("returns zeroed array for zero direction", () => {
    const v = arrowVertices(100, 50, 0, 0);
    expect(v.every((f) => f === 0)).toBe(true);
  });
});

describe("buildArrowBuffers", () => {
  it("produces arrow vertices for each valid edge", () => {
    const arrows = buildArrowBuffers(MOCK_SCENE);
    // 2 edges → 2 arrows × 6 verts = 12 floats.
    expect(arrows.length).toBe(12);
  });

  it("filters arrows by visible ids", () => {
    const visible = new Set(["card1"]); // card2 missing → both edges skipped.
    const arrows = buildArrowBuffers(MOCK_SCENE, visible);
    expect(arrows.length).toBe(0);
  });
});

describe("hitTest", () => {
  it("returns node id when point is inside", () => {
    const result = hitTest(MOCK_SCENE, 100, 100);
    expect(result).toBe("card1");
  });

  it("returns null when point is outside all elements", () => {
    expect(hitTest(MOCK_SCENE, 9999, 9999)).toBeNull();
  });

  it("node beats group when point overlaps both", () => {
    // card1 at (50,50,260,140) is inside grp1 at (30,20,660,380).
    const result = hitTest(MOCK_SCENE, 100, 100);
    expect(result).toBe("card1"); // not "grp1"
  });
});

describe("extractTitle", () => {
  it("strips markdown heading prefix", () => {
    expect(extractTitle("# Hello World\nSome body text")).toBe("Hello World");
  });

  it("returns first non-empty line", () => {
    expect(extractTitle("\n\n  \nSecond line")).toBe("Second line");
  });

  it("returns empty for undefined", () => {
    expect(extractTitle(undefined)).toBe("");
  });
});

describe("unionBounds", () => {
  it("computes bounding box of items", () => {
    const result = unionBounds([
      { x: 10, y: 20, width: 50, height: 30 },
      { x: 100, y: 50, width: 20, height: 10 },
    ]);
    expect(result).toEqual({ x: 10, y: 20, w: 110, h: 40 });
  });

  it("returns null for empty array", () => {
    expect(unionBounds([])).toBeNull();
  });
});
