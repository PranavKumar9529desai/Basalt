use crate::asset_index::AssetIndex;
use basalt_graph::StringArena;
use basalt_parser::extract_metadata;
use basalt_graph::NoteGraph;
use basalt_types::FileMetadata;
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

    /// All cached document paths — the real files parsed into the graph.
    /// Tag nodes and dangling wikilink targets are interned in the arena but
    /// never land here, so this is the authoritative "which notes exist" list.
    pub fn note_paths(&self) -> Vec<String> {
        self.graph
            .metadata_cache
            .keys()
            .filter_map(|id| self.arena.get_string(*id).cloned())
            .collect()
    }

    /// Document paths equal to `prefix` or nested beneath it. Used for folder
    /// delete / move / rename bookkeeping where every cached descendant must
    /// be enumerated alongside the folder itself.
    pub fn paths_under(&self, prefix: &str) -> Vec<String> {
        let boundary = format!("{prefix}/");
        self.note_paths()
            .into_iter()
            .filter(|p| p == prefix || p.starts_with(&boundary))
            .collect()
    }

    /// Number of cached documents.
    pub fn note_count(&self) -> usize {
        self.graph.metadata_cache.len()
    }

    /// Absolute paths of the notes that link to `path`.
    pub fn backlinks_for(&self, path: &str) -> Vec<String> {
        let Some(doc_id) = self.arena.get_id(path) else {
            return Vec::new();
        };
        let Some(backlinks) = self.graph.get_back_links(doc_id) else {
            return Vec::new();
        };
        backlinks
            .iter()
            .filter_map(|id| self.arena.get_string(*id).cloned())
            .collect()
    }

    /// All distinct frontmatter/in-body tags across the vault, sorted.
    pub fn all_tags(&self) -> Vec<String> {
        let mut tags: Vec<String> = self
            .graph
            .metadata_cache
            .values()
            .flat_map(|meta| meta.tags.iter().cloned())
            .collect();
        tags.sort();
        tags.dedup();
        tags
    }

    /// Metadata for the document at `path`, if it is cached.
    pub fn metadata(&self, path: &str) -> Option<&FileMetadata> {
        let id = self.arena.get_id(path)?;
        self.graph.metadata_cache.get(&id)
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
