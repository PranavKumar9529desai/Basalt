use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant, UNIX_EPOCH};

use anyhow::Result;
use basalt_vault::Vault;

use crate::nucleo_scorer::NucleoScorer;
use crate::tantivy::{extract_file_matches, TantivyIndex};
use basalt_types::{FileMatch, FileResult, SearchContentResult};

/// How long the index may hold uncommitted in-memory updates before the
/// next flush writes them to disk. Commits create a new tantivy segment
/// and fsync — they must never run per autosave. Queries flush earlier
/// anyway (freshness exactly when it matters).
const IDLE_COMMIT_DELAY: Duration = Duration::from_secs(10);

/// Top-level search engine for Basalt.
/// Owns both the tantivy full-text index and the nucleo in-memory file scorer.
/// Stored in `AppState` behind an `Arc<RwLock<Option<SearchState>>>`.
///
/// Commit policy: `update_document`/`remove_document` only touch the
/// in-memory index and mark it pending. Commits happen via
/// [`SearchState::flush_if_due`] (idle timer) or
/// [`SearchState::flush_pending`] (forced before queries).
pub struct SearchState {
    tantivy: TantivyIndex,
    nucleo: NucleoScorer,
    /// Uncommitted in-memory updates exist.
    pending: bool,
    /// When the last pending update was made.
    last_change: Option<Instant>,
}

impl SearchState {
    /// Open the persisted tantivy index at `index_dir` (creates it if absent).
    ///
    /// Indexing strategy:
    /// - **Empty index** (first launch or after cache clear): bulk-index every `.md`
    ///   file in the vault so content search works immediately.
    /// - **Existing index** (subsequent launches): only re-index files whose
    ///   on-disk mtime is newer than the mtime recorded in `known_mtimes` (the
    ///   vault cache). This avoids clobbering the persisted tantivy segments with
    ///   an unnecessary full re-index that can race with reader visibility.
    pub fn open_or_create(
        index_dir: &Path,
        vault: &Vault,
        known_mtimes: &HashMap<String, u64>,
    ) -> Result<Self> {
        let mut tantivy = TantivyIndex::open_or_create(index_dir)?;

        // Collect all .md paths from the vault arena.
        let paths: Vec<String> = vault
            .arena
            .all_strings()
            .filter(|p| p.ends_with(".md"))
            .cloned()
            .collect();

        let is_fresh = tantivy.doc_count() == 0;
        let mut any_indexed = false;

        for path in &paths {
            // On a fresh index: always index. On existing: only index if mtime changed.
            let needs_index = if is_fresh {
                true
            } else {
                let current_mtime = std::fs::metadata(path)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());

                match (current_mtime, known_mtimes.get(path)) {
                    (Some(cur), Some(&known)) => cur > known,
                    (Some(_), None) => true, // new file not in cache
                    _ => false,
                }
            };

            if needs_index {
                if let Ok(content) = std::fs::read_to_string(path) {
                    let title = Path::new(path)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(path.as_str())
                        .to_string();
                    let tags: String = content
                        .split_whitespace()
                        .filter(|w| w.starts_with('#') && w.len() > 1)
                        .map(|w| w.trim_start_matches('#'))
                        .collect::<Vec<_>>()
                        .join(" ");
                    let _ = tantivy.update_document(path, &title, &content, &tags);
                    any_indexed = true;
                }
            }
        }

        // Only commit if something actually changed (avoids a no-op commit on
        // an existing index with no stale files, which is the common case).
        if any_indexed {
            tantivy.commit()?;
        }

        let nucleo = NucleoScorer::new(paths);
        Ok(Self {
            tantivy,
            nucleo,
            pending: false,
            last_change: None,
        })
    }

    /// BM25 full-text search. Reads matched note bodies from disk to build
    /// line-level matches for the preview pane. Returns the display files plus
    /// `total_hits` — the total number of matching lines across the top
    /// `COUNT_WINDOW` BM25 documents (exact unless more than that many files
    /// match, which is rare). Flushes pending updates first.
    pub fn search_content(&mut self, query: &str, limit: usize) -> SearchContentResult {
        let _ = self.flush_pending();
        const COUNT_WINDOW: usize = 100;
        const MAX_MATCHES_PER_FILE: usize = 30;
        const CONTEXT_LINES: usize = 4;
        let terms: Vec<&str> = query.split_whitespace().collect();

        let docs = match self.tantivy.search(query, COUNT_WINDOW) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[search] tantivy error: {e}");
                return SearchContentResult {
                    total_hits: 0,
                    files: vec![],
                };
            }
        };

        let mut total_hits: u32 = 0;
        let mut files: Vec<FileMatch> = Vec::with_capacity(limit.min(docs.len()));
        for (i, mut file) in docs.into_iter().enumerate() {
            if let Ok(body) = std::fs::read_to_string(&file.path) {
                let matches =
                    extract_file_matches(&body, &terms, MAX_MATCHES_PER_FILE, CONTEXT_LINES);
                total_hits += matches.len() as u32;
                if i < limit {
                    file.text = body;
                    file.matches = matches;
                    files.push(file);
                }
            }
        }

        SearchContentResult { total_hits, files }
    }

    /// Fuzzy file-name search via nucleo. Requires `&mut self` because
    /// `nucleo_matcher::Matcher::score` takes `&mut self`.
    pub fn search_files(&mut self, query: &str, limit: usize) -> Vec<FileResult> {
        let _ = self.flush_pending();
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
        self.mark_pending();
        Ok(())
    }

    /// Commit all pending tantivy writes. Prefer [`flush_if_due`] /
    /// [`flush_pending`] — direct commits defeat the batching policy.
    pub fn commit(&mut self) -> Result<()> {
        self.tantivy.commit()?;
        self.pending = false;
        self.last_change = None;
        Ok(())
    }

    /// Commit if updates have been idle for at least `IDLE_COMMIT_DELAY`.
    /// Cheap no-op while changes keep arriving (e.g. continuous typing).
    /// Call this from a low-frequency timer.
    pub fn flush_if_due(&mut self) -> Result<()> {
        if self.pending
            && self
                .last_change
                .is_some_and(|t| t.elapsed() >= IDLE_COMMIT_DELAY)
        {
            self.flush_pending()?;
        }
        Ok(())
    }

    /// Force-commit pending updates now (used before queries and by the
    /// idle flusher when due).
    pub fn flush_pending(&mut self) -> Result<()> {
        if self.pending {
            self.tantivy.commit()?;
            self.pending = false;
            self.last_change = None;
        }
        Ok(())
    }

    fn mark_pending(&mut self) {
        self.pending = true;
        self.last_change = Some(Instant::now());
    }

    /// Remove a note from both indexes when it is deleted.
    /// Marks the index pending — flushed by the normal commit policy.
    pub fn remove_document(&mut self, path: &str) -> Result<()> {
        self.tantivy.remove_document(path)?;
        self.nucleo.remove_item(path);
        self.mark_pending();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use basalt_vault::Vault;
    use tempfile::tempdir;

    #[test]
    fn test_open_or_create_empty_vault() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let state = SearchState::open_or_create(dir.path(), &vault, &HashMap::new());
        assert!(state.is_ok());
    }

    #[test]
    fn test_update_and_search_content() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault, &HashMap::new()).unwrap();
        let note_path = dir.path().join("rust.md");
        let body = "Rust is a systems language with a borrow checker.";
        std::fs::write(&note_path, body).unwrap();
        state
            .update_document(note_path.to_str().unwrap(), body, "rust")
            .unwrap();
        state.commit().unwrap();
        let results = state.search_content("borrow", 5);
        assert!(!results.files.is_empty());
        assert_eq!(results.files[0].path, note_path.to_str().unwrap());
        assert!(!results.files[0].matches.is_empty());
        assert_eq!(results.files[0].matches[0].line_number, 1);
    }

    #[test]
    fn test_search_files_fuzzy() {
        let dir = tempdir().unwrap();
        let vault = Vault::new();
        let mut state = SearchState::open_or_create(dir.path(), &vault, &HashMap::new()).unwrap();
        state
            .update_document("/vault/borrow-checker.md", "Body text", "")
            .unwrap();
        state.commit().unwrap();
        let results = state.search_files("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow"));
    }
}
