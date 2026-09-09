import type { GraphNodeMeta, GraphSnapshot } from "./graphWorker";

/** The full-graph arrays the engine derives once from a `get_graph`
 * snapshot (see `snapshotToGraphData`). All fixed-size typed arrays; used by
 * filters/localGraph (read-only) and the rebuild path. */
export interface GraphData {
  paths: string[];
  tags: string[][];
  attach: boolean[];
  isTag: boolean[];
  edges: Uint32Array;
  edgeWeights: Float32Array;
  cluster: Uint32Array;
  clusterCount: number;
  adj: number[][];
  scaleInputs: Float32Array;
}

/** Decode a binary graph snapshot produced by Rust `encode_graph_snapshot_binary`. */
export function decodeBinaryGraphSnapshot(buffer: ArrayBuffer): GraphSnapshot {
  if (buffer.byteLength < 24) {
    throw new Error("Invalid graph snapshot binary format (buffer too small)");
  }
  const u8 = new Uint8Array(buffer, 0, 4);
  // Magic "BGRP"
  if (u8[0] !== 66 || u8[1] !== 71 || u8[2] !== 82 || u8[3] !== 80) {
    throw new Error("Invalid graph snapshot binary format (bad magic)");
  }

  const u32Header = new Uint32Array(buffer, 0, 6);
  const version = u32Header[1];
  if (version !== 1) {
    throw new Error(`Unsupported graph snapshot binary version ${version}`);
  }

  const nodeCount = u32Header[2];
  const edgeCount = u32Header[3];
  const jsonMetaLen = u32Header[4];
  const padBytes = u32Header[5];

  const jsonBytes = new Uint8Array(buffer, 24, jsonMetaLen);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const nodes = JSON.parse(jsonStr) as GraphNodeMeta[];

  const edgesStart = 24 + jsonMetaLen + padBytes;
  const edges = new Uint32Array(buffer, edgesStart, edgeCount * 2);

  const weightsStart = edgesStart + edgeCount * 8;
  const edgeWeights = new Float32Array(buffer, weightsStart, edgeCount);

  return {
    node_count: nodeCount,
    nodes,
    edges,
    edge_weights: edgeWeights,
  };
}

/** Shape the `get_graph` snapshot into the engine's full-graph arrays. */
export function snapshotToGraphData(g: GraphSnapshot): GraphData {
  const paths = g.nodes.map((n) => n.path);
  const tags = g.nodes.map((n) => n.tags);
  const attach = g.nodes.map((n) => n.is_attachment);
  const isTag = g.nodes.map((n) => n.is_tag);
  const edges =
    g.edges instanceof Uint32Array ? g.edges : Uint32Array.from(g.edges);
  const edgeWeights =
    g.edge_weights instanceof Float32Array
      ? g.edge_weights
      : Float32Array.from(g.edge_weights ?? []);
  const cluster = Uint32Array.from(g.nodes.map((n) => n.cluster));
  const clusterCount = new Set(cluster).size;
  const adj: number[][] = Array.from({ length: g.nodes.length }, () => []);
  for (let e = 0; e < edges.length; e += 2) {
    const u = edges[e];
    const v = edges[e + 1];
    adj[u].push(v);
    adj[v].push(u);
  }
  // Sizing importance = number of *note* neighbors. Notes size by link
  // degree; the Rust-emitted tag nodes size by their note count. Tag→tag
  // (parent/child) edges don't inflate either.
  const scaleInputs = new Float32Array(g.nodes.length);
  for (let i = 0; i < g.nodes.length; i++) {
    let d = 0;
    for (const j of adj[i]) if (!isTag[j]) d++;
    scaleInputs[i] = d;
  }
  return {
    paths,
    tags,
    attach,
    isTag,
    edges,
    edgeWeights,
    cluster,
    clusterCount,
    adj,
    scaleInputs,
  };
}
