use serde::{Deserialize, Serialize};

/// A highlighted byte-range within a snippet's text.
/// `start` and `end` are byte offsets into `Snippet::text`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub start: usize,
    pub end: usize,
}

/// A short excerpt from a note body with match positions marked.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    /// Plain text excerpt (~120 chars).
    pub text: String,
    /// Byte ranges within `text` that match the query.
    pub highlights: Vec<Highlight>,
}

/// One result from `search_content` (full-text BM25 search).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentResult {
    /// Absolute path of the note on disk.
    pub path: String,
    /// Filename stem (e.g. `"borrow-checker"` from `rust/borrow-checker.md`).
    pub title: String,
    /// BM25 relevance score.
    pub score: f32,
    /// Up to 3 highlighted excerpts from the note body.
    pub snippets: Vec<Snippet>,
}

/// One result from `search_files` (nucleo fuzzy file switcher).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResult {
    /// Absolute path of the note on disk.
    pub path: String,
    /// Filename stem (e.g. `"borrow-checker"` from `rust/borrow-checker.md`).
    pub title: String,
    /// Nucleo alignment score (higher = better match).
    pub score: u32,
}
