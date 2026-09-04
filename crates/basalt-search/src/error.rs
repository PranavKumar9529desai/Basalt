/// Errors from the search/codex index layer.
///
/// Library-internal typed error (per ADR-030 §2.2): callers can match variants
/// instead of string-matching. The Tauri app boundary wraps this in `AppError`.
#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    /// An I/O operation (index dir management, schema wipe) failed.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// A tantivy operation (open, commit, add, delete, search) failed.
    #[error("{0}")]
    Tantivy(#[from] tantivy::TantivyError),
}
