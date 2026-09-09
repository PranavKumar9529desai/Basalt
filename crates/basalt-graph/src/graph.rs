use crate::arena::{NodeId, StringArena};
use basalt_types::FileMetadata;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use std::collections::{HashMap, HashSet};

/// Prefix used to intern tag nodes in the `StringArena`, keeping them distinct
/// from note/file-path nodes (and from wikilink targets). `#` is not a valid
/// filename character, so collisions with real notes are impossible.
const TAG_PREFIX: &str = "#";

#[inline]
fn insert_sorted(vec: &mut SmallVec<[NodeId; 8]>, id: NodeId) {
    if let Err(pos) = vec.binary_search(&id) {
        vec.insert(pos, id);
    }
}

#[inline]
fn remove_sorted(vec: &mut SmallVec<[NodeId; 8]>, id: NodeId) {
    if let Ok(pos) = vec.binary_search(&id) {
        vec.remove(pos);
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct NoteGraph {
    pub forward_links: HashMap<NodeId, SmallVec<[NodeId; 8]>>,
    pub back_links: HashMap<NodeId, SmallVec<[NodeId; 8]>>,
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
        let had_old_links = if let Some(old_links) = self.forward_links.get(&doc_id) {
            for &link_id in old_links {
                if let Some(back_links) = self.back_links.get_mut(&link_id) {
                    remove_sorted(back_links, doc_id);
                }
            }
            true
        } else {
            false
        };

        let mut new_links: SmallVec<[NodeId; 8]> = SmallVec::new();
        for link in &metadata.links {
            let link_id = arena.get_or_insert(link);
            insert_sorted(&mut new_links, link_id);

            // Add to back_links of the target
            insert_sorted(self.back_links.entry(link_id).or_default(), doc_id);
        }

        // Embeds (`![[image.png]]`) create directed note→asset edges in the
        // graph so the graph view can show which notes reference which assets.
        for embed in &metadata.embeds {
            let embed_id = arena.get_or_insert(embed);
            insert_sorted(&mut new_links, embed_id);
            insert_sorted(self.back_links.entry(embed_id).or_default(), doc_id);
        }

        // Tags become first-class nodes, connected to this note. Nested tags
        // also get parent->child chain edges so the graph forms a tag *tree*
        // (not a flat set of disconnected nodes).
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
                insert_sorted(&mut new_links, leaf);
                insert_sorted(self.back_links.entry(leaf).or_default(), doc_id);
            }
            // Parent -> child chain edges.
            for w in chain.windows(2) {
                let (parent, child) = (w[0], w[1]);
                insert_sorted(self.forward_links.entry(parent).or_default(), child);
                insert_sorted(self.back_links.entry(child).or_default(), parent);
            }
        }

        new_links.sort_unstable();
        new_links.dedup();
        self.forward_links.insert(doc_id, new_links);
        self.metadata_cache.insert(doc_id, metadata);

        // Drop tag nodes that are no longer anchored to any note.
        // Only run if an existing note was updated; adding a fresh note can never orphan tags.
        if had_old_links {
            self.prune_orphan_tags();
        }
    }

    pub fn remove_document(&mut self, id: &str, arena: &mut StringArena) {
        if let Some(doc_id) = arena.get_id(id) {
            // 1. Remove from metadata cache
            self.metadata_cache.remove(&doc_id);

            // 2. Remove forward links: cleanup targets' back_links to us
            if let Some(links) = self.forward_links.remove(&doc_id) {
                for link_id in links {
                    if let Some(back_links) = self.back_links.get_mut(&link_id) {
                        remove_sorted(back_links, doc_id);
                    }
                }
            }

            // 3. Remove incoming links: cleanup sources' forward_links to us
            if let Some(incoming_links) = self.back_links.remove(&doc_id) {
                for source_id in incoming_links {
                    if let Some(forward_links) = self.forward_links.get_mut(&source_id) {
                        remove_sorted(forward_links, doc_id);
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
    /// as at least one note uses some tag under it).
    pub fn prune_orphan_tags(&mut self) {
        // Live = has a direct note reference (a back_link that is not a tag node).
        let mut live: HashSet<NodeId> = HashSet::new();
        let mut worklist: Vec<NodeId> = Vec::new();

        for &t in &self.tag_nodes {
            let has_direct_note_ref = self
                .back_links
                .get(&t)
                .is_some_and(|srcs| srcs.iter().any(|s| !self.tag_nodes.contains(s)));
            if has_direct_note_ref {
                live.insert(t);
                worklist.push(t);
            }
        }

        // Propagate liveness upward through parent tag nodes in O(K) worklist traversal.
        while let Some(child_id) = worklist.pop() {
            if let Some(parents) = self.back_links.get(&child_id) {
                for &parent_id in parents {
                    if self.tag_nodes.contains(&parent_id) && live.insert(parent_id) {
                        worklist.push(parent_id);
                    }
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
                        remove_sorted(bl, t);
                    }
                }
            }
            if let Some(sources) = self.back_links.remove(&t) {
                for src in sources {
                    if let Some(fl) = self.forward_links.get_mut(&src) {
                        remove_sorted(fl, t);
                    }
                }
            }
        }
    }

    pub fn get_forward_links(&self, id: NodeId) -> Option<&[NodeId]> {
        self.forward_links.get(&id).map(|v| v.as_slice())
    }

    pub fn get_back_links(&self, id: NodeId) -> Option<&[NodeId]> {
        self.back_links.get(&id).map(|v| v.as_slice())
    }

    pub fn has_forward_link(&self, src: NodeId, target: NodeId) -> bool {
        self.forward_links
            .get(&src)
            .is_some_and(|links| links.binary_search(&target).is_ok())
    }

    pub fn has_back_link(&self, target: NodeId, src: NodeId) -> bool {
        self.back_links
            .get(&target)
            .is_some_and(|links| links.binary_search(&src).is_ok())
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
