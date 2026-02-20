use std::collections::{HashMap, HashSet};
use crate::types::Document;

#[derive(Debug, Default)]
pub struct NoteGraph {
    pub forward_links: HashMap<String, HashSet<String>>,
    pub back_links: HashMap<String, HashSet<String>>,
}

impl NoteGraph {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn add_document(&mut self, id: &str, document: &Document) {
        let id_string = id.to_string();
        
        // Remove old forward links for this document
        if let Some(old_links) = self.forward_links.get(&id_string) {
            for link in old_links {
                if let Some(back_links) = self.back_links.get_mut(link) {
                    back_links.remove(&id_string);
                }
            }
        }
        
        let mut new_links = HashSet::new();
        for link in &document.links {
            let link_string = link.to_string();
            new_links.insert(link_string.clone());
            
            // Add to back_links of the target
            self.back_links
                .entry(link_string)
                .or_insert_with(HashSet::new)
                .insert(id_string.clone());
        }
        
        self.forward_links.insert(id_string, new_links);
    }
    
    pub fn remove_document(&mut self, id: &str) {
        let id_string = id.to_string();
        if let Some(links) = self.forward_links.remove(&id_string) {
            for link in links {
                 if let Some(back_links) = self.back_links.get_mut(&link) {
                     back_links.remove(&id_string);
                 }
            }
        }
    }

    pub fn get_forward_links(&self, id: &str) -> Option<&HashSet<String>> {
        self.forward_links.get(id)
    }

    pub fn get_back_links(&self, id: &str) -> Option<&HashSet<String>> {
        self.back_links.get(id)
    }
}
