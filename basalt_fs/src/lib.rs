use anyhow::Result;
use basalt_core::arena::StringArena;
use basalt_core::graph::NoteGraph;

pub mod indexer;
pub mod watcher;

pub trait FileSystem {
    fn read(&self, path: &str) -> Result<Vec<u8>>;
    fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    fn list(&self, path: &str) -> Result<Vec<String>>;
}

use basalt_core::extract_metadata;

#[derive(Debug, Default)]
pub struct Vault {
    pub arena: StringArena,
    pub graph: NoteGraph,
}

impl Vault {
    pub fn new() -> Self {
        Self {
            arena: StringArena::new(),
            graph: NoteGraph::new(),
        }
    }

    pub fn add_document(&mut self, path: &str, content: &str) {
        let meta = extract_metadata(content);
        self.graph.add_document(path, &meta, &mut self.arena);
    }

    pub fn remove_document(&mut self, path: &str) {
        self.graph.remove_document(path, &mut self.arena);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_push_api() {
        let mut vault = Vault::new();
        
        // Push document A which links to B
        vault.add_document("a.md", "This is a link to [[b.md]]");
        
        // Push document B which links to A and C
        vault.add_document("b.md", "Links: [[a.md]], [[c.md]]");
        
        // Verify documents are in the arena
        let id_a = vault.arena.get_id("a.md").expect("a.md should be in arena");
        let id_b = vault.arena.get_id("b.md").expect("b.md should be in arena");
        let id_c = vault.arena.get_id("c.md").expect("c.md should be in arena");
        
        // Verify forward links for a.md (should contain b.md)
        let fwd_a = vault.graph.get_forward_links(id_a).expect("a.md should have forward links");
        assert!(fwd_a.contains(&id_b), "a.md should link to b.md");
        
        // Verify back links for b.md (should be linked from a.md)
        let back_b = vault.graph.get_back_links(id_b).expect("b.md should have back links");
        assert!(back_b.contains(&id_a), "b.md should have backlink from a.md");
        
        // Verify forward links for b.md (should contain a.md and c.md)
        let fwd_b = vault.graph.get_forward_links(id_b).expect("b.md should have forward links");
        assert!(fwd_b.contains(&id_a), "b.md should link to a.md");
        assert!(fwd_b.contains(&id_c), "b.md should link to c.md");
    }
}
