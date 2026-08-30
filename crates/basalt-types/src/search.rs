use serde::{Deserialize, Serialize};

/// A highlighted range within a line's text.
/// `start`/`end` are CHARACTER offsets (Unicode scalar values) into
/// `LineMatch::text`, so the TS frontend can slice with `String.prototype.slice`
/// correctly for all BMP text (byte offsets would corrupt multi-byte content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub start: usize,
    pub end: usize,
}

/// One line of context shown around a match in the preview pane.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLine {
    /// 1-based line number within the source file.
    pub line_number: usize,
    /// Full text of the line.
    pub text: String,
}

/// A single line that contains one or more query-term matches.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// 1-based line number within the source file.
    pub line_number: usize,
    /// Full text of the matched line.
    pub text: String,
    /// Character ranges within `text` that match the query terms.
    pub highlights: Vec<Highlight>,
    /// Up to N lines preceding the match, closest first.
    pub context_before: Vec<ContextLine>,
    /// Up to N lines following the match, closest first.
    pub context_after: Vec<ContextLine>,
}

/// One file with at least one matching line (LazyVim-style grep grouping).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatch {
    /// Absolute path of the note on disk.
    pub path: String,
    /// Filename stem (e.g. `"borrow-checker"` from `rust/borrow-checker.md`).
    pub title: String,
    /// BM25 relevance score (higher = better).
    pub score: f32,
    /// Matching lines, in document order.
    pub matches: Vec<LineMatch>,
}
/// Top-level result of `search_content`.
///
/// `total_hits` is the total number of matching documents, returned instantly by
/// tantivy's `Count` collector (independent of vault size). `files` is the subset
/// returned for display (top `limit`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchContentResult {
    /// Total number of matching documents (instant, from the `Count` collector).
    pub total_hits: u32,
    /// Files returned for display, in relevance order.
    pub files: Vec<FileMatch>,
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
