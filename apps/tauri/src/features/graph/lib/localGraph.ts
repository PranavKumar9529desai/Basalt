// Local-graph mode (ADR-038 §3 graph split): BFS reachability from a root
// note, plus the subset re-map (full idx -> subset idx) the engine feeds to
// the renderer and the wasm worker.
import { computeNodeSize } from "./nodeScale";

/** Set of full indices reachable from `root` within `depth` hops. */
export function bfsReachable(
  adj: number[][],
  root: number,
  depth: number,
): Set<number> {
  const dist = new Map<number, number>();
  const q = [root];
  dist.set(root, 0);
  let head = 0;
  while (head < q.length) {
    const u = q[head++]!;
    const d = dist.get(u)!;
    if (d >= depth) continue;
    for (const v of adj[u]) {
      if (!dist.has(v)) {
        dist.set(v, d + 1);
        q.push(v);
      }
    }
  }
  return new Set(dist.keys());
}

/**
 * Restrict `visible` to nodes within `depth` of `rootPath`. Returns null when
 * no root resolves (no local-root selected, or the path is not in the graph).
 */
export function localSubset(
  visible: readonly number[],
  adj: number[][],
  rootPath: string | null,
  depth: number,
  paths: string[],
): number[] | null {
  if (!rootPath) return null;
  const root = paths.indexOf(rootPath);
  if (root < 0) return null;
  const reach = bfsReachable(adj, root, depth);
  return visible.filter((i) => reach.has(i));
}

export interface SubsetResult {
  map: number[]; // subset idx -> full idx
  edges: number[];
  edgeWeights: number[];
  adj: number[][];
  sizes: Float32Array;
}

export interface SubsetInputs {
  visible: readonly number[];
  fullEdges: Uint32Array;
  fullWeights: Float32Array;
  scaleInputs: Float32Array;
}

/** Remap a visible subset to subset-indexed edges/adjacency/sizes. */
export function buildSubset({
  visible,
  fullEdges,
  fullWeights,
  scaleInputs,
}: SubsetInputs): SubsetResult {
  const fullToSub = new Map<number, number>();
  const map: number[] = [];
  visible.forEach((full, sub) => {
    fullToSub.set(full, sub);
    map.push(full);
  });

  // Per-node diameter from sizing importance (link degree; tag nodes use note count).
  const sizes = new Float32Array(map.length);
  for (let sub = 0; sub < map.length; sub++) {
    sizes[sub] = computeNodeSize(scaleInputs[map[sub]]);
  }

  const edges: number[] = [];
  const edgeWeights: number[] = [];
  for (let e = 0; e < fullEdges.length; e += 2) {
    const u = fullToSub.get(fullEdges[e]);
    const v = fullToSub.get(fullEdges[e + 1]);
    if (u !== undefined && v !== undefined) {
      edges.push(u, v);
      edgeWeights.push(fullWeights[e >> 1] ?? 1);
    }
  }
  const adj: number[][] = map.map(() => []);
  for (let e = 0; e < edges.length; e += 2) {
    adj[edges[e]].push(edges[e + 1]);
    adj[edges[e + 1]].push(edges[e]);
  }
  return { map, edges, edgeWeights, adj, sizes };
}
