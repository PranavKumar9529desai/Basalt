//! Union-find / connected-components helpers backing the graph snapshot's
//! cluster grouping (consumed by `graph::build_graph_snapshot`).

use std::collections::HashMap;

/// Union-find root lookup with path compression.
pub(crate) fn cc_find(parent: &mut [u32], mut x: u32) -> u32 {
    while parent[x as usize] != x {
        parent[x as usize] = parent[parent[x as usize] as usize];
        x = parent[x as usize];
    }
    x
}

/// Assign a deterministic 0-based cluster id to every node of a graph given
/// as flat dense pairs (`edges[0..2]` = src/dst of the first edge, and so
/// on). Deterministic order: union edges in `edges` order, then number
/// roots in node-index order — cluster ids are stable for a fixed snapshot.
pub(crate) fn cc_clusters(node_count: usize, edges: &[u32]) -> Vec<u32> {
    // Union the endpoints of every edge into components.
    let mut parent: Vec<u32> = (0..node_count as u32).collect();
    for e in (0..edges.len()).step_by(2) {
        let a = edges[e];
        let b = edges[e + 1];
        let ra = cc_find(&mut parent, a);
        let rb = cc_find(&mut parent, b);
        if ra != rb {
            parent[ra as usize] = rb;
        }
    }
    // Number each connected component in node-index order.
    let mut root_to_id: HashMap<u32, u32> = HashMap::new();
    let mut next_id = 0u32;
    let mut clusters = vec![0u32; node_count];
    for i in 0..node_count as u32 {
        let r = cc_find(&mut parent, i);
        let id = *root_to_id.entry(r).or_insert_with(|| {
            let id = next_id;
            next_id += 1;
            id
        });
        clusters[i as usize] = id;
    }
    clusters
}