use std::collections::{HashMap, HashSet};
use crate::metadata::FileMetadata;
use crate::arena::{NodeId, StringArena};

#[derive(Debug, Default)]
pub struct NoteGraph {
    pub forward_links: HashMap<NodeId, HashSet<NodeId>>,
    pub back_links: HashMap<NodeId, HashSet<NodeId>>,
}

impl NoteGraph {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn add_document(&mut self, id: &str, metadata: &FileMetadata, arena: &mut StringArena) {
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
            self.back_links
                .entry(link_id)
                .or_default()
                .insert(doc_id);
        }
        
        self.forward_links.insert(doc_id, new_links);
    }
    
    pub fn remove_document(&mut self, id: &str, arena: &mut StringArena) {
        if let Some(doc_id) = arena.get_id(id) {
            if let Some(links) = self.forward_links.remove(&doc_id) {
                for link_id in links {
                     if let Some(back_links) = self.back_links.get_mut(&link_id) {
                         back_links.remove(&doc_id);
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
}
