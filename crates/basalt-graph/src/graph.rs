use crate::arena::{NodeId, StringArena};
use basalt_types::FileMetadata;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Prefix used to intern tag nodes in the `StringArena`, keeping them distinct
/// from note/file-path nodes (and from wikilink targets). `#` is not a valid
/// filename character, so collisions with real notes are impossible.
const TAG_PREFIX: &str = "#";

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct NoteGraph {
    pub forward_links: HashMap<NodeId, HashSet<NodeId>>,
    pub back_links: HashMap<NodeId, HashSet<NodeId>>,
    pub metadata_cache: HashMap<NodeId, FileMetadata>,
    /// Every tag node currently present in the graph (parent and leaf nodes of
    /// the tag tree). Used to type nodes and to anchor pruning.
    #[serde(default)]
    pub tag_nodes: HashSet<NodeId>,
}

impl NoteGraph {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn add_document(&mut self, id: &str, metadata: FileMetadata, arena: &mut StringArena) {
        let doc_id = arena.get_or_insert(id);

        // Remove old forward links for this document (incl. prior tag edges)
        // and clean each target's back_links to us.
        if let Some(old_links) = self.forward_links.get(&doc_id) {
            for link_id in old_links {
                if let Some(back_links) = self.back_links.get_mut(link_id) {
                    back_links.remove(&doc_id);
                }
            }
        }

        let mut new_links = HashSet::new();
        for link in &metadata.links {
            let link_id = arena.get_or_insert(link);
            new_links.insert(link_id);

            // Add to back_links of the target
            self.back_links.entry(link_id).or_default().insert(doc_id);
        }

        // Embeds (`![[image.png]]`) create directed note→asset edges in the
        // graph so the graph view can show which notes reference which assets.
        for embed in &metadata.embeds {
            let embed_id = arena.get_or_insert(embed);
            new_links.insert(embed_id);
            self.back_links.entry(embed_id).or_default().insert(doc_id);
        }

        // Tags become first-class nodes, connected to this note. Nested tags
        // also get parent->child chain edges so the graph forms a tag *tree*
        // (not a flat set of disconnected nodes). See docs/tag-graph-connections.md.
        let mut seen = HashSet::new();
        for tag in &metadata.tags {
            if !seen.insert(tag.clone()) {
                continue; // dedupe per document
            }
            // Build the root->leaf chain of ancestor tag nodes.
            let mut prefix = String::new();
            let mut chain: Vec<NodeId> = Vec::new();
            for part in tag.split('/') {
                prefix = if prefix.is_empty() {
                    part.to_string()
                } else {
                    format!("{prefix}/{part}")
                };
                let key = format!("{TAG_PREFIX}{prefix}");
                let tag_id = arena.get_or_insert(&key);
                self.tag_nodes.insert(tag_id);
                chain.push(tag_id);
            }
            // Note links to its exact (leaf) tag node only.
            if let Some(&leaf) = chain.last() {
                new_links.insert(leaf);
                self.back_links.entry(leaf).or_default().insert(doc_id);
            }
            // Parent -> child chain edges.
            for w in chain.windows(2) {
                let (parent, child) = (w[0], w[1]);
                self.forward_links.entry(parent).or_default().insert(child);
                self.back_links.entry(child).or_default().insert(parent);
            }
        }

        self.forward_links.insert(doc_id, new_links);
        self.metadata_cache.insert(doc_id, metadata);

        // Drop tag nodes that are no longer anchored to any note.
        self.prune_orphan_tags();
    }

    pub fn remove_document(&mut self, id: &str, arena: &mut StringArena) {
        if let Some(doc_id) = arena.get_id(id) {
            // 1. Remove from metadata cache
            self.metadata_cache.remove(&doc_id);

            // 2. Remove forward links: cleanup targets' back_links to us
            if let Some(links) = self.forward_links.remove(&doc_id) {
                for link_id in links {
                    if let Some(back_links) = self.back_links.get_mut(&link_id) {
                        back_links.remove(&doc_id);
                    }
                }
            }

            // 3. Remove incoming links: cleanup sources' forward_links to us
            if let Some(incoming_links) = self.back_links.remove(&doc_id) {
                for source_id in incoming_links {
                    if let Some(forward_links) = self.forward_links.get_mut(&source_id) {
                        forward_links.remove(&doc_id);
                    }
                }
            }
        }

        // A removed note may have been the last anchor for part of the tag tree.
        self.prune_orphan_tags();
    }

    /// Remove tag nodes that are no longer anchored to any note.
    ///
    /// A tag node is anchored if a note exactly carries it, or any of its
    /// descendant tag nodes is anchored (so the tag tree stays intact as long
    /// as at least one note uses some tag under it). See
    /// docs/tag-graph-connections.md ("What to avoid").
    fn prune_orphan_tags(&mut self) {
        // Live = has a direct note reference (a back_link that is not a tag node).
        let mut live: HashSet<NodeId> = self
            .tag_nodes
            .iter()
            .copied()
            .filter(|t| {
                self.back_links
                    .get(t)
                    .is_some_and(|srcs| srcs.iter().any(|s| !self.tag_nodes.contains(s)))
            })
            .collect();

        // Propagate liveness upward: a parent is live if a child is live.
        let mut changed = true;
        while changed {
            changed = false;
            for &t in &self.tag_nodes {
                if live.contains(&t) {
                    continue;
                }
                let anchored_by_child = self
                    .forward_links
                    .get(&t)
                    .is_some_and(|kids| kids.iter().any(|c| live.contains(c)));
                if anchored_by_child {
                    live.insert(t);
                    changed = true;
                }
            }
        }

        let dead: Vec<NodeId> = self
            .tag_nodes
            .iter()
            .copied()
            .filter(|t| !live.contains(t))
            .collect();
        for t in dead {
            self.tag_nodes.remove(&t);
            if let Some(targets) = self.forward_links.remove(&t) {
                for child in targets {
                    if let Some(bl) = self.back_links.get_mut(&child) {
                        bl.remove(&t);
                    }
                }
            }
            if let Some(sources) = self.back_links.remove(&t) {
                for src in sources {
                    if let Some(fl) = self.forward_links.get_mut(&src) {
                        fl.remove(&t);
                    }
                }
            }
        }
    }

    pub fn get_forward_links(&self, id: NodeId) -> Option<&HashSet<NodeId>> {
        self.forward_links.get(&id)
    }

    pub fn get_back_links(&self, id: NodeId) -> Option<&HashSet<NodeId>> {
        self.back_links.get(&id)
    }

    pub fn get_metadata(&self, id: NodeId) -> Option<&FileMetadata> {
        self.metadata_cache.get(&id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_graph_deletion_cleanup() {
        let mut graph = NoteGraph::new();
        let mut arena = StringArena::new();

        let a_meta = FileMetadata {
            links: vec!["b.md".to_string()],
            ..FileMetadata::new()
        };
        let b_meta = FileMetadata {
            links: vec!["a.md".to_string(), "c.md".to_string()],
            ..FileMetadata::new()
        };
        let c_meta = FileMetadata::new();

        graph.add_document("a.md", a_meta.clone(), &mut arena);
        graph.add_document("b.md", b_meta.clone(), &mut arena);
        graph.add_document("c.md", c_meta.clone(), &mut arena);

        let id_a = arena.get_id("a.md").unwrap();
        let id_b = arena.get_id("b.md").unwrap();
        let id_c = arena.get_id("c.md").unwrap();

        // Ensure links are present
        assert!(graph.get_forward_links(id_a).unwrap().contains(&id_b));
        assert!(graph.get_back_links(id_b).unwrap().contains(&id_a));
        assert!(graph.get_metadata(id_a).is_some());

        // Remove document B
        graph.remove_document("b.md", &mut arena);

        // B's metadata should be gone
        assert!(graph.get_metadata(id_b).is_none());
        assert!(graph.get_forward_links(id_b).is_none());
        assert!(graph.get_back_links(id_b).is_none());

        // A's forward links pointing to B should be cleaned up
        assert!(!graph.get_forward_links(id_a).unwrap().contains(&id_b));

        // C's back_links pointing to B should be cleaned up
        assert!(!graph.get_back_links(id_c).unwrap().contains(&id_b));

        // A shouldn't have been removed
        assert!(graph.get_metadata(id_a).is_some());
    }

    #[test]
    fn test_tags_create_nodes_and_tree() {
        let mut graph = NoteGraph::new();
        let mut arena = StringArena::new();

        // Duplicate "project/alpha" must be deduped; "standalone" is its own node.
        let meta = FileMetadata {
            tags: vec![
                "project/alpha".to_string(),
                "project/alpha".to_string(),
                "standalone".to_string(),
            ],
            ..FileMetadata::new()
        };
        graph.add_document("a.md", meta, &mut arena);

        let id_a = arena.get_id("a.md").unwrap();
        let id_proj = arena.get_id("#project").unwrap();
        let id_proj_alpha = arena.get_id("#project/alpha").unwrap();
        let id_standalone = arena.get_id("#standalone").unwrap();

        // Note links to its exact (leaf) tags only, never to ancestors.
        let fwd = graph.get_forward_links(id_a).unwrap();
        assert!(
            fwd.contains(&id_proj_alpha),
            "note must link to exact leaf tag"
        );
        assert!(fwd.contains(&id_standalone), "note must link to exact tag");
        assert!(
            !fwd.contains(&id_proj),
            "note must NOT link to ancestor tag"
        );

        // Tag tree: parent -> child.
        assert!(
            graph
                .get_forward_links(id_proj)
                .unwrap()
                .contains(&id_proj_alpha),
            "parent tag must link to child tag"
        );
        // Leaf's back_links include the note AND the parent tag.
        let back = graph.get_back_links(id_proj_alpha).unwrap();
        assert!(back.contains(&id_a), "leaf tag must link back to note");
        assert!(
            back.contains(&id_proj),
            "leaf tag must link back to parent tag"
        );

        // All three tag nodes are tracked as tag nodes.
        assert!(graph.tag_nodes.contains(&id_proj));
        assert!(graph.tag_nodes.contains(&id_proj_alpha));
        assert!(graph.tag_nodes.contains(&id_standalone));
    }

    #[test]
    fn test_tag_tree_pruned_when_unused() {
        let mut graph = NoteGraph::new();
        let mut arena = StringArena::new();
        let meta = FileMetadata {
            tags: vec!["x/y".to_string()],
            ..FileMetadata::new()
        };
        graph.add_document("a.md", meta, &mut arena);
        assert_eq!(graph.tag_nodes.len(), 2, "both #x and #x/y present");

        // Removing the only note using the x/ subtree must drop the whole tree.
        graph.remove_document("a.md", &mut arena);
        assert!(
            graph.tag_nodes.is_empty(),
            "tag tree must be pruned when no note uses it"
        );
    }

    #[test]
    fn test_shared_tag_connects_notes() {
        let mut graph = NoteGraph::new();
        let mut arena = StringArena::new();
        let ma = FileMetadata {
            tags: vec!["topic".to_string()],
            ..FileMetadata::new()
        };
        let mb = FileMetadata {
            tags: vec!["topic".to_string()],
            ..FileMetadata::new()
        };
        graph.add_document("a.md", ma, &mut arena);
        graph.add_document("b.md", mb, &mut arena);

        let id_topic = arena.get_id("#topic").unwrap();
        let id_a = arena.get_id("a.md").unwrap();
        let id_b = arena.get_id("b.md").unwrap();

        // Both notes connect to the shared tag node -> transitively connected.
        assert!(graph.get_forward_links(id_a).unwrap().contains(&id_topic));
        assert!(graph.get_forward_links(id_b).unwrap().contains(&id_topic));
        let back = graph.get_back_links(id_topic).unwrap();
        assert!(back.contains(&id_a) && back.contains(&id_b));
    }
}
