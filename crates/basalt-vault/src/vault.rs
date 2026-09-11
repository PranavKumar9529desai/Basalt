use crate::asset_index::AssetIndex;
use basalt_graph::NoteGraph;
use basalt_graph::StringArena;
use basalt_parser::extract_metadata;
use basalt_types::FileMetadata;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
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

    pub fn add_document_metadata(&mut self, path: &str, meta: FileMetadata) {
        self.asset_index.register_embeds(path, &meta.embeds);
        self.asset_index.register_links(path, &meta.links);
        self.graph.add_document(path, meta, &mut self.arena);
    }

    pub fn add_document(&mut self, path: &str, content: &str) {
        let meta = extract_metadata(content);
        self.add_document_metadata(path, meta);
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
    /// Every tag with the number of notes carrying it, sorted by count
    /// descending then name — feeds the Tags pane.
    pub fn tag_counts(&self) -> Vec<(String, u64)> {
        let mut counts: std::collections::HashMap<&str, u64> = std::collections::HashMap::new();
        for meta in self.graph.metadata_cache.values() {
            for tag in &meta.tags {
                *counts.entry(tag.as_str()).or_insert(0) += 1;
            }
        }
        let mut out: Vec<(String, u64)> = counts
            .into_iter()
            .map(|(tag, count)| (tag.to_string(), count))
            .collect();
        out.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        out
    }

    /// Metadata for the document at `path`, if it is cached.
    pub fn metadata(&self, path: &str) -> Option<&FileMetadata> {
        let id = self.arena.get_id(path)?;
        self.graph.metadata_cache.get(&id)
    }

    /// Note names + paths whose filename starts with `prefix`, ranked by usage
    /// (most-backlinked first, then name) — feeds the wikilink autocomplete.
    /// Usage = number of notes that link to the target (Obsidian's "linked"
    /// ordering intent): frequently-cited notes surface before rarely-cited ones.
    pub fn link_suggestions(&self, prefix: &str) -> Vec<(String, String)> {
        let prefix_lower = prefix.to_lowercase();
        let mut out: Vec<(String, String, u64)> = self
            .note_paths()
            .into_iter()
            .filter(|p| p.ends_with(".md"))
            .filter_map(|path_str| {
                let name = Path::new(&path_str).file_name()?.to_str()?.to_string();
                if !name.to_lowercase().starts_with(&prefix_lower) {
                    return None;
                }
                let usage = self
                    .arena
                    .get_id(&path_str)
                    .and_then(|id| self.graph.get_back_links(id))
                    .map_or(0, |s| s.len()) as u64;
                Some((name, path_str, usage))
            })
            .collect();
        out.sort_by(|a, b| {
            b.2.cmp(&a.2)
                .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
        });
        out.into_iter()
            .map(|(name, path, _)| (name, path))
            .collect()
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

    #[test]
    fn link_suggestions_rank_by_backlink_count_then_name() {
        let mut vault = Vault::new();
        // `target.md` is linked by two notes; `other.md` by one; `unused.md` by none.
        vault.add_document("target.md", "body");
        vault.add_document("other.md", "body");
        vault.add_document("unused.md", "body");
        vault.add_document("alpha.md", "[[target.md]]");
        vault.add_document("beta.md", "[[target.md]]");
        vault.add_document("gamma.md", "[[other.md]]");

        // Prefix `t` matches only `target.md`.
        let suggestions = vault.link_suggestions("t");
        assert_eq!(
            suggestions,
            vec![("target.md".to_string(), "target.md".to_string())],
            "single prefix match still surfaces"
        );

        // Broad prefix: most-backlinked first, ties broken alphabetically.
        let suggestions = vault.link_suggestions("");
        let names: Vec<&str> = suggestions.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "target.md",
                "other.md",
                "alpha.md",
                "beta.md",
                "gamma.md",
                "unused.md"
            ],
            "usage (backlink count) desc, then name asc"
        );
    }
}
