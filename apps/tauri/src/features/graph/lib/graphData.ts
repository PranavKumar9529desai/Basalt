import type { GraphSnapshot } from "./graphWorker";

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

/** Shape the `get_graph` snapshot into the engine's full-graph arrays. */
export function snapshotToGraphData(g: GraphSnapshot): GraphData {
  const paths = g.nodes.map((n) => n.path);
  const tags = g.nodes.map((n) => n.tags);
  const attach = g.nodes.map((n) => n.is_attachment);
  const isTag = g.nodes.map((n) => n.is_tag);
  const edges = Uint32Array.from(g.edges);
  const edgeWeights = Float32Array.from(g.edge_weights ?? []);
  const cluster = Uint32Array.from(g.nodes.map((n) => n.cluster));
  const clusterCount = new Set(cluster).size;
  const adj: number[][] = Array.from({ length: g.nodes.length }, () => []);
  for (let e = 0; e < g.edges.length; e += 2) {
    const u = g.edges[e];
    const v = g.edges[e + 1];
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
  return { paths, tags, attach, isTag, edges, edgeWeights, cluster, clusterCount, adj, scaleInputs };
}