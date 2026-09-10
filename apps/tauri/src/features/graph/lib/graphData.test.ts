import { describe, it, expect } from "vitest";
import { decodeBinaryGraphSnapshot, snapshotToGraphData } from "./graphData";
import type { GraphNodeMeta } from "./graphWorker";

describe("decodeBinaryGraphSnapshot", () => {
  function createTestBinarySnapshot(
    nodes: GraphNodeMeta[],
    edges: number[],
    edgeWeights: number[],
  ): ArrayBuffer {
    const jsonStr = JSON.stringify(nodes);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const edgeCount = Math.floor(edges.length / 2);
    const padBytes = (4 - (jsonBytes.length % 4)) % 4;
    const totalSize =
      24 +
      jsonBytes.length +
      padBytes +
      edges.length * 4 +
      edgeWeights.length * 4;

    const buffer = new ArrayBuffer(totalSize);
    const u8 = new Uint8Array(buffer);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);

    // Magic "BGRP"
    u8[0] = 66;
    u8[1] = 71;
    u8[2] = 82;
    u8[3] = 80;

    u32[1] = 1; // version
    u32[2] = nodes.length; // node_count
    u32[3] = edgeCount; // edge_count
    u32[4] = jsonBytes.length; // json_meta_len
    u32[5] = padBytes; // pad_bytes

    u8.set(jsonBytes, 24);
    // padding bytes are naturally 0

    const edgesStart = 24 + jsonBytes.length + padBytes;
    const edgesOffsetU32 = edgesStart / 4;
    for (let i = 0; i < edges.length; i++) {
      u32[edgesOffsetU32 + i] = edges[i];
    }

    const weightsStart = edgesStart + edges.length * 4;
    const weightsOffsetF32 = weightsStart / 4;
    for (let i = 0; i < edgeWeights.length; i++) {
      f32[weightsOffsetF32 + i] = edgeWeights[i];
    }

    return buffer;
  }

  it("decodes binary graph snapshot correctly", () => {
    const nodes: GraphNodeMeta[] = [
      {
        path: "note-a.md",
        tags: ["tag1"],
        is_attachment: false,
        is_tag: false,
        cluster: 0,
      },
      {
        path: "note-b.md",
        tags: ["tag1", "tag2"],
        is_attachment: false,
        is_tag: false,
        cluster: 0,
      },
      {
        path: "tag1",
        tags: [],
        is_attachment: false,
        is_tag: true,
        cluster: 0,
      },
    ];
    const edges = [0, 2, 1, 2, 0, 1];
    const weights = [1.0, 2.0, 3.5];

    const buffer = createTestBinarySnapshot(nodes, edges, weights);
    const decoded = decodeBinaryGraphSnapshot(buffer);

    expect(decoded.node_count).toBe(3);
    expect(decoded.nodes).toEqual(nodes);
    expect(Array.from(decoded.edges as Uint32Array)).toEqual(edges);
    expect(Array.from(decoded.edge_weights as Float32Array)).toEqual(weights);
  });

  it("throws error on invalid magic bytes", () => {
    const buffer = new ArrayBuffer(32);
    expect(() => decodeBinaryGraphSnapshot(buffer)).toThrow(
      "Invalid graph snapshot binary format (bad magic)",
    );
  });

  it("snapshotToGraphData processes decoded binary snapshot without reallocation", () => {
    const nodes: GraphNodeMeta[] = [
      {
        path: "a.md",
        tags: ["t"],
        is_attachment: false,
        is_tag: false,
        cluster: 1,
      },
      {
        path: "b.md",
        tags: [],
        is_attachment: false,
        is_tag: false,
        cluster: 1,
      },
    ];
    const edges = [0, 1];
    const weights = [2.5];

    const buffer = createTestBinarySnapshot(nodes, edges, weights);
    const decoded = decodeBinaryGraphSnapshot(buffer);
    const graphData = snapshotToGraphData(decoded);

    expect(graphData.paths).toEqual(["a.md", "b.md"]);
    expect(graphData.clusterCount).toBe(1);
    expect(graphData.adj[0]).toEqual([1]);
    expect(graphData.adj[1]).toEqual([0]);
    expect(graphData.scaleInputs[0]).toBe(1);
    expect(graphData.scaleInputs[1]).toBe(1);
    // Ensure typed arrays were used directly
    expect(graphData.edges).toBe(decoded.edges);
    expect(graphData.edgeWeights).toBe(decoded.edge_weights);
  });
});
