use crate::asset_index::AssetIndex;
use basalt_graph::StringArena;
use basalt_parser::extract_metadata;
use basalt_graph::NoteGraph;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Vault {
    pub arena: StringArena,
    pub graph: NoteGraph,
    pub asset_index: AssetIndex,
}

impl Vault {
    pub fn new() -> Self {
        Self {
            arena: StringArena::new(),
            graph: NoteGraph::new(),
            asset_index: AssetIndex::new(),
        }
    }

    pub fn add_document(&mut self, path: &str, content: &str) {
        let meta = extract_metadata(content);
        // Register embed/link references in the asset index
        self.asset_index.register_embeds(path, &meta.embeds);
        self.asset_index.register_links(path, &meta.links);
        self.graph.add_document(path, meta, &mut self.arena);
    }

    pub fn remove_document(&mut self, path: &str) {
        self.asset_index.remove_note_references(path);
        self.graph.remove_document(path, &mut self.arena);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_push_api() {
        let mut vault = Vault::new();

        vault.add_document("a.md", "This is a link to [[b.md]]");
        vault.add_document("b.md", "Links: [[a.md]], [[c.md]]");

        let id_a = vault.arena.get_id("a.md").expect("a.md should be in arena");
        let id_b = vault.arena.get_id("b.md").expect("b.md should be in arena");
        let id_c = vault.arena.get_id("c.md").expect("c.md should be in arena");

        let fwd_a = vault
            .graph
            .get_forward_links(id_a)
            .expect("a.md should have forward links");
        assert!(fwd_a.contains(&id_b), "a.md should link to b.md");

        let back_b = vault
            .graph
            .get_back_links(id_b)
            .expect("b.md should have back links");
        assert!(
            back_b.contains(&id_a),
            "b.md should have backlink from a.md"
        );

        let fwd_b = vault
            .graph
            .get_forward_links(id_b)
            .expect("b.md should have forward links");
        assert!(fwd_b.contains(&id_a), "b.md should link to a.md");
        assert!(fwd_b.contains(&id_c), "b.md should link to c.md");
    }
}
