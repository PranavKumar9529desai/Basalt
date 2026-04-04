use std::path::Path;

use anyhow::Result;
use basalt_fs::Vault;

use crate::nucleo_scorer::NucleoScorer;
use crate::tantivy_index::{extract_snippets, TantivyIndex};
use crate::types::{ContentResult, FileResult};

/// Top-level search engine for Basalt.
/// Owns both the tantivy full-text index and the nucleo in-memory file scorer.
/// Stored in `AppState` behind an `Arc<RwLock<Option<SearchState>>>`.
pub struct SearchState {
    tantivy: TantivyIndex,
    nucleo: NucleoScorer,
}

impl SearchState {
    /// Open the persisted tantivy index at `index_dir` (creates it if absent),
    /// then populate the nucleo scorer from the paths already in `vault.arena`.
    pub fn open_or_create(index_dir: &Path, vault: &Vault) -> Result<Self> {
        let tantivy = TantivyIndex::open_or_create(index_dir)?;

        // Collect all .md paths from the vault arena for the file switcher.
        let paths: Vec<String> = vault
            .arena
            .all_strings()
            .filter(|p| p.ends_with(".md"))
            .cloned()
            .collect();

        let nucleo = NucleoScorer::new(paths);
        Ok(Self { tantivy, nucleo })
    }

    /// BM25 full-text search. Reads matched note bodies from disk to build snippets.
    pub fn search_content(&self, query: &str, limit: usize) -> Vec<ContentResult> {
        let mut results = match self.tantivy.search(query, limit) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[search] tantivy error: {e}");
                return vec![];
            }
        };

        let terms: Vec<&str> = query.split_whitespace().collect();

        for result in &mut results {
            if let Ok(body) = std::fs::read_to_string(&result.path) {
                result.snippets = extract_snippets(&body, &terms, 3);
            }
        }

        results
    }

    /// Fuzzy file-name search via nucleo. Requires `&mut self` because
    /// `nucleo_matcher::Matcher::score` takes `&mut self`.
    pub fn search_files(&mut self, query: &str, limit: usize) -> Vec<FileResult> {
        self.nucleo.search(query, limit)
    }

    /// Index or re-index a note after it is created or saved.
    /// Extracts inline #tags from content automatically.
    /// Does NOT commit — callers must call `commit()` after batching updates.
    pub fn update_document(&mut self, path: &str, content: &str, tags: &str) -> Result<()> {
        let title = Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(path)
            .to_string();

        self.tantivy.update_document(path, &title, content, tags)?;
        self.nucleo.add_item(path.to_string(), title);
        Ok(())
    }

    /// Commit all pending tantivy writes. Call after one or more `update_document` calls.
    pub fn commit(&mut self) -> Result<()> {
        self.tantivy.commit()
    }

    /// Remove a note from both indexes when it is deleted.
    pub fn remove_document(&mut self, path: &str) -> Result<()> {
        self.tantivy.remove_document(path)?;
        self.tantivy.commit()?;
        self.nucleo.remove_item(path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use basalt_fs::Vault;
    use tempfile::tempdir;

    #[test]
    fn test_open_or_create_empty_vault() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let state = SearchState::open_or_create(dir.path(), &vault);
        assert!(state.is_ok());
    }

    #[test]
    fn test_update_and_search_content() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault).unwrap();
        state
            .update_document(
                "/vault/rust.md",
                "Rust is a systems language with a borrow checker.",
                "rust",
            )
            .unwrap();
        state.commit().unwrap();
        let results = state.search_content("borrow", 5);
        assert!(!results.is_empty());
        assert_eq!(results[0].path, "/vault/rust.md");
    }

    #[test]
    fn test_search_files_fuzzy() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault).unwrap();
        state
            .update_document("/vault/borrow-checker.md", "Body text", "")
            .unwrap();
        state.commit().unwrap();
        let results = state.search_files("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow"));
    }
}
