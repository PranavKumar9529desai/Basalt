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
    /// Score all items against `query` and return top `limit` results.
    ///
    /// Implements ADR-043 Two-Stage Scoring:
    /// - Stage 1 (Score Only): Evaluates candidates with `pattern.score`,
    ///   requiring zero heap allocations.
    /// - Bounded Top-K: Selects top `limit` elements in O(N) using
    ///   `select_nth_unstable_by_key`, avoiding full vector sort.
    /// - Stage 2 (Highlight Top `limit` Only): Only computes match indices
    ///   for the top `limit` items using reusable scratch buffers, with an
    ///   ASCII fast-path.
    pub fn search(&mut self, query: &str, limit: usize) -> Vec<FileResult> {
        if limit == 0 {
            return Vec::new();
        }

        if query.is_empty() {
            return self
                .items
                .iter()
                .take(limit)
                .map(|(path, title)| FileResult {
                    path: path.clone(),
                    title: title.clone(),
                    score: 0,
                    indices: Vec::new(),
                })
                .collect();
        }

        let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
        let mut char_buf: Vec<char> = Vec::new();
        let mut scored: Vec<(u32, usize)> = Vec::with_capacity(self.items.len().min(1024));

        // Stage 1: score-only filter across all candidates (zero allocations in loop).
        for (idx, (_, title)) in self.items.iter().enumerate() {
            let haystack = Utf32Str::new(title.as_str(), &mut char_buf);
            if let Some(score) = pattern.score(haystack, &mut self.matcher) {
                scored.push((score, idx));
            }
        }

        if scored.is_empty() {
            return Vec::new();
        }

        // Bounded Top-K: O(N) selection when candidate count exceeds limit.
        if scored.len() > limit {
            scored.select_nth_unstable_by_key(limit, |a| (std::cmp::Reverse(a.0), a.1));
            scored.truncate(limit);
        }
        scored.sort_unstable_by_key(|a| (std::cmp::Reverse(a.0), a.1));

        // Stage 2: compute highlight indices only for the top `limit` candidates.
        let mut match_indices: Vec<u32> = Vec::new();
        let mut results = Vec::with_capacity(scored.len());

        for (score, idx) in scored {
            let (path, title) = &self.items[idx];
            match_indices.clear();
            let haystack = Utf32Str::new(title.as_str(), &mut char_buf);
            if pattern
                .indices(haystack, &mut self.matcher, &mut match_indices)
                .is_some()
            {
                match_indices.sort_unstable();
                match_indices.dedup();

                let byte_indices = if title.is_ascii() {
                    // Fast path: for ASCII titles, char offset == byte offset.
                    match_indices.clone()
                } else {
                    let char_to_byte: Vec<u32> = title
                        .char_indices()
                        .map(|(byte, _)| byte as u32)
                        .collect();
                    match_indices
                        .iter()
                        .filter_map(|&i| char_to_byte.get(i as usize).copied())
                        .collect()
                };

                results.push(FileResult {
                    path: path.clone(),
                    title: title.clone(),
                    score,
                    indices: byte_indices,
                });
            } else {
                results.push(FileResult {
                    path: path.clone(),
                    title: title.clone(),
                    score,
                    indices: Vec::new(),
                });
            }
        }

        results
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
        assert!(results.iter().all(|r| r.indices.is_empty()));
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
    #[test]
    fn test_indices_reconstruct_query_chars() {
        let paths = vec![
            "/vault/rust-notes/borrow-checker.md".to_string(),
            "/vault/daily/2026-04-01.md".to_string(),
            "/vault/projects/basalt.md".to_string(),
        ];
        let mut scorer = NucleoScorer::new(paths);

        // Consecutive prefix run — optimal alignment lands on chars 0..6.
        let results = scorer.search("borrow", 5);
        let first = &results[0];
        assert_eq!(first.title, "borrow-checker");
        assert!(first.indices.windows(2).all(|w| w[0] < w[1]));
        let matched: String = first
            .indices
            .iter()
            .map(|&b| first.title.as_bytes()[b as usize] as char)
            .collect();
        assert_eq!(matched, "borrow");

        // Non-contiguous subsequences — byte offsets spell the query in order.
        for q in ["owch", "rr", "bcr"] {
            let results = scorer.search(q, 3);
            let r = &results[0];
            let matched: String = r
                .indices
                .iter()
                .map(|&b| r.title.as_bytes()[b as usize] as char)
                .collect();
            assert_eq!(matched, q, "indices should spell '{q}'");
        }
    }

    #[test]
    fn test_zero_limit_returns_empty() {
        let paths = vec!["/vault/note.md".to_string()];
        let mut scorer = NucleoScorer::new(paths);
        assert!(scorer.search("note", 0).is_empty());
        assert!(scorer.search("", 0).is_empty());
    }

    #[test]
    fn test_bounded_top_k_selection() {
        let paths: Vec<String> = (0..100)
            .map(|i| format!("/vault/item_{i:03}.md"))
            .collect();
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("item_05", 5);
        assert!(!results.is_empty());
        assert!(results.len() <= 5);
        // Scores should be sorted descending.
        for window in results.windows(2) {
            assert!(window[0].score >= window[1].score);
        }
        assert_eq!(results[0].title, "item_050");
    }

    #[test]
    fn test_non_ascii_indices_correctness() {
        let paths = vec![
            "/vault/café-notes.md".to_string(),
            "/vault/resume.md".to_string(),
        ];
        let mut scorer = NucleoScorer::new(paths);
        let results = scorer.search("notes", 5);
        assert_eq!(results[0].title, "café-notes");
        // "café-notes": 'c' (0), 'a' (1), 'f' (2), 'é' (3..5, 2 bytes), '-' (5), 'n' (6)
        // Match for "notes" starts at byte 6.
        assert_eq!(results[0].indices, vec![6, 7, 8, 9, 10]);
    }
}
