use crate::arena::NodeId;
use crate::graph::NoteGraph;
use std::collections::HashMap;

/// Sparse graph reduced to the dense form the simulator needs.
#[derive(Debug, Clone)]
pub struct LayoutGraph {
    pub node_count: usize,
    /// Edges as dense index pairs `(u, v)`.
    pub edges: Vec<(u32, u32)>,
    /// Combined in+out degree per node (used as inertia mass).
    pub degree: Vec<u32>,
    /// Per-node kind: `0` = note, `1` = tag. Parallel to the dense node order.
    /// Lets the renderer style/filter tags and the local graph traverse through
    /// them (see docs/tag-graph-connections.md).
    pub node_types: Vec<u8>,
}

impl LayoutGraph {
    /// Build the dense layout graph from a `NoteGraph`, collapsing the sparse
    /// arena ids into `0..n`. Nodes are the union of every note that has
    /// outgoing links and every note referenced as a link target (so dangling
    /// link targets appear as nodes, matching Obsidian with "existing files
    /// only" off) **plus every tag node** (notes link to the tags they carry,
    /// and nested tags link parent->child, so the tag tree is present). Edges are
    /// the forward links.
    pub fn from_note_graph(g: &NoteGraph) -> Self {
        let mut ids: Vec<NodeId> = g
            .forward_links
            .keys()
            .chain(g.back_links.keys())
            .copied()
            .collect();
        ids.sort_unstable();
        ids.dedup();

        let remap: HashMap<NodeId, u32> = ids
            .iter()
            .enumerate()
            .map(|(i, id)| (*id, i as u32))
            .collect();

        let mut degree = vec![0u32; ids.len()];
        let mut edges = Vec::new();
        for (src, targets) in &g.forward_links {
            let u = remap[src];
            for t in targets {
                if let Some(&v) = remap.get(t) {
                    edges.push((u, v));
                    degree[u as usize] += 1;
                    degree[v as usize] += 1;
                }
            }
        }

        let node_types = ids
            .iter()
            .map(|id| if g.tag_nodes.contains(id) { 1 } else { 0 })
            .collect::<Vec<_>>();

        Self {
            node_count: ids.len(),
            edges,
            degree,
            node_types,
        }
    }

    pub fn new(
        node_count: usize,
        edges: Vec<(u32, u32)>,
        degree: Vec<u32>,
        node_types: Vec<u8>,
    ) -> Self {
        Self {
            node_count,
            edges,
            degree,
            node_types,
        }
    }
}
