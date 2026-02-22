use crate::arena::{NodeId, StringArena};
use crate::metadata::FileMetadata;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct NoteGraph {
    pub forward_links: HashMap<NodeId, HashSet<NodeId>>,
    pub back_links: HashMap<NodeId, HashSet<NodeId>>,
    pub metadata_cache: HashMap<NodeId, FileMetadata>,
}

impl NoteGraph {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn add_document(&mut self, id: &str, metadata: FileMetadata, arena: &mut StringArena) {
        let doc_id = arena.get_or_insert(id);

        // Remove old forward links for this document
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

        self.forward_links.insert(doc_id, new_links);
        self.metadata_cache.insert(doc_id, metadata);
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
}
