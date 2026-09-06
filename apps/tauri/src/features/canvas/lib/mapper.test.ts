import { describe, it, expect } from "vitest";
import { mapToXYFlow, mapToCanvasDocument } from "./mapper";
import type { CanvasDocument } from "../types";

describe("canvas mapper", () => {
  it("converts JSON Canvas document to XYFlow nodes and edges", () => {
    const doc: CanvasDocument = {
      nodes: [
        { id: "text-1", type: "text", text: "Hello Canvas", x: 100, y: 150, width: 250, height: 140 },
        { id: "file-1", type: "file", file: "Notes/Idea.md", x: 400, y: 150, width: 300, height: 220 },
      ],
      edges: [
        { id: "edge-1", fromNode: "text-1", fromSide: "right", toNode: "file-1", toSide: "left" },
      ],
    };

    const { nodes, edges } = mapToXYFlow(doc);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    expect(nodes[0].id).toBe("text-1");
    expect(nodes[0].type).toBe("canvasText");
    expect(nodes[0].position).toEqual({ x: 100, y: 150 });
    expect(nodes[0].style?.width).toBe(250);
    expect(nodes[0].style?.height).toBe(140);
    expect(nodes[0].data.text).toBe("Hello Canvas");

    expect(edges[0].id).toBe("edge-1");
    expect(edges[0].source).toBe("text-1");
    expect(edges[0].target).toBe("file-1");
    expect(edges[0].sourceHandle).toBe("right");
    expect(edges[0].targetHandle).toBe("left");
  });

  it("converts XYFlow nodes and edges back to JSON Canvas document", () => {
    const xyNodes: any[] = [
      {
        id: "text-1",
        type: "canvasText",
        position: { x: 120, y: 180 },
        style: { width: 280, height: 160 },
        data: { text: "Updated Note" },
      },
      {
        id: "ghost-1",
        type: "canvasGhost",
        position: { x: 500, y: 500 },
        style: { width: 220, height: 100 },
        data: {},
      },
    ];

    const xyEdges: any[] = [
      {
        id: "edge-1",
        source: "text-1",
        target: "text-1",
        sourceHandle: "bottom",
        targetHandle: "top",
      },
      {
        id: "ghost-edge-1",
        source: "text-1",
        target: "ghost-1",
      },
    ];

    const doc = mapToCanvasDocument(xyNodes, xyEdges);

    // Ghost nodes and ghost edges must be stripped out of saved document
    expect(doc.nodes).toHaveLength(1);
    expect(doc.edges).toHaveLength(1);

    expect(doc.nodes?.[0]).toEqual({
      id: "text-1",
      type: "text",
      text: "Updated Note",
      x: 120,
      y: 180,
      width: 280,
      height: 160,
      color: undefined,
    });
  });
});
