use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use std::collections::HashSet;

use basalt_types::FileResult;

/// Scores vault file paths against a query using nucleo's Smith-Waterman
/// fuzzy algorithm — the same engine used by the Helix editor.
/// Operates entirely in RAM on the paths already held in the vault arena.
pub struct NucleoScorer {
    matcher: Matcher,
    /// Each item is (absolute_path, title) — title is the filename stem.
    items: Vec<(String, String)>,
    /// O(1) membership check for deduplication.
    path_set: HashSet<String>,
}

/// Extract the filename stem from an absolute path.
/// e.g. "/vault/rust-notes/borrow-checker.md" -> "borrow-checker"
fn stem_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

impl NucleoScorer {
    /// Create a scorer from a list of absolute paths.
    /// Titles are derived automatically as the filename stem.
    pub fn new(paths: Vec<String>) -> Self {
        let items = paths
            .iter()
            .map(|p| {
                let title = stem_from_path(p);
                (p.clone(), title)
            })
            .collect();
        let path_set: HashSet<String> = paths.into_iter().collect();
        Self {
            matcher: Matcher::new(Config::DEFAULT),
            items,
            path_set,
        }
    }

    /// Score all items against `query` and return top `limit` results.
    /// Scores against the title (filename stem) for best UX.
    /// If `query` is empty, returns the first `limit` items with score 0.
    pub fn search(&mut self, query: &str, limit: usize) -> Vec<FileResult> {
        if query.is_empty() {
            return self
                .items
                .iter()
                .take(limit)
                .map(|(path, title)| FileResult {
                    path: path.clone(),
                    title: title.clone(),
                    score: 0,
                })
                .collect();
        }

        let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
        let mut char_buf: Vec<char> = Vec::new();
        let mut scored: Vec<(u32, usize)> = Vec::new();

        for (idx, (_, title)) in self.items.iter().enumerate() {
            let haystack = Utf32Str::new(title.as_str(), &mut char_buf);
            // Score against the title stem (not the full path) — gives cleaner
            // fuzzy scores for short queries and matches user mental model of
            // "find file by name, not by directory". Directory context shown in UI.
            if let Some(s) = pattern.score(haystack, &mut self.matcher) {
                scored.push((s, idx));
            }
        }

        scored.sort_unstable_by_key(|a| std::cmp::Reverse(a.0));
        scored.truncate(limit);

        scored
            .into_iter()
            .map(|(score, idx)| {
                let (path, title) = &self.items[idx];
                FileResult {
                    path: path.clone(),
                    title: title.clone(),
                    score,
                }
            })
            .collect()
    }

    /// Add a new path with provided title (falls back to stem if title is empty).
    /// No-op if path already present.
    pub fn add_item(&mut self, path: String, title: String) {
        if self.path_set.contains(&path) {
            return;
        }
        let resolved = if title.is_empty() {
            stem_from_path(&path)
        } else {
            title
        };
        self.path_set.insert(path.clone());
        self.items.push((path, resolved));
    }

    /// Remove a path. No-op if not present.
    pub fn remove_item(&mut self, path: &str) {
        if self.path_set.remove(path) {
            self.items.retain(|(p, _)| p != path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzzy_match_finds_best() {
        let paths = vec![
            "/vault/rust-notes/borrow-checker.md".to_string(),
            "/vault/daily/2026-04-01.md".to_string(),
            "/vault/projects/basalt.md".to_string(),
        ];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("borrow", 5);
        assert!(!results.is_empty());
        assert!(results[0].path.contains("borrow-checker"));
    }

    #[test]
    fn test_empty_query_returns_top_items() {
        let paths = vec!["/a.md".to_string(), "/b.md".to_string()];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("", 5);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_add_and_remove_item() {
        let mut scorer = NucleoScorer::new(vec!["/a.md".to_string()]);
        scorer.add_item("/b.md".to_string(), "b".to_string());
        let results = scorer.search("b", 5);
        assert!(results.iter().any(|r| r.path == "/b.md"));

        scorer.remove_item("/b.md");
        let results = scorer.search("b", 5);
        assert!(!results.iter().any(|r| r.path == "/b.md"));
    }

    #[test]
    fn test_add_item_uses_provided_title() {
        let mut scorer = NucleoScorer::new(vec![]);
        scorer.add_item("/vault/my-note.md".to_string(), "Custom Title".to_string());
        let results = scorer.search("custom", 5);
        assert!(results.iter().any(|r| r.title == "Custom Title"));
    }
}
