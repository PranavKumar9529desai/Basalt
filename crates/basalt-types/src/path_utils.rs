//! Cross-crate shared filesystem/path utilities.
//!
//! These live in `basalt-types` (the leaf crate) because they are used by
//! `basalt-vault`, `basalt-search`, and `basalt-tables`.  Per CONVENTIONS
//! §12.8, cross-crate shared helpers go in the leaf crate both callers
//! depend on.

use std::path::Path;

/// Extract the filename stem from a path string.
///
/// `"/vault/notes/borrow-checker.md"` → `Some("borrow-checker")`
/// `"/vault/canvases/board.canvas"` → `Some("board")`
#[inline]
pub fn stem_of(path: &str) -> Option<&str> {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
}

/// Extract the filename stem, lowercased.
///
/// `"/vault/Notes/Borrow-Checker.md"` → `Some("borrow-checker")`
#[inline]
pub fn stem_lower(path: &str) -> Option<String> {
    stem_of(path).map(|s| s.to_lowercase())
}

/// Returns the modification time of `path` in seconds since UNIX epoch.
#[inline]
pub fn mtime_secs(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

/// True when the path has a `.md` extension (Markdown note).
#[inline]
pub fn is_md_path(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("md")
}

/// True when the path has a `.canvas` extension (JSON Canvas).
#[inline]
pub fn is_canvas_path(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("canvas")
}

/// True for the two document kinds the vault indexes and the tree shows:
/// Markdown notes (`.md`) and JSON Canvas files (`.canvas`).
#[inline]
pub fn is_document_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md" | "canvas")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stem_of_extracts_filename_stem() {
        assert_eq!(stem_of("/vault/notes/borrow-checker.md"), Some("borrow-checker"));
        assert_eq!(stem_of("file.canvas"), Some("file"));
        assert_eq!(stem_of("/a/b/c.txt"), Some("c"));
        assert_eq!(stem_of(""), Some(""));
    }

    #[test]
    fn stem_lower_is_case_insensitive() {
        assert_eq!(stem_lower("/vault/Notes/Borrow-Checker.md"), Some("borrow-checker".into()));
        assert_eq!(stem_lower("FILE.CANVAS"), Some("file".into()));
    }

    #[test]
    fn document_type_predicates() {
        assert!(is_md_path(Path::new("note.md")));
        assert!(!is_md_path(Path::new("note.canvas")));
        assert!(is_canvas_path(Path::new("board.canvas")));
        assert!(!is_canvas_path(Path::new("board.md")));
        assert!(is_document_path(Path::new("note.md")));
        assert!(is_document_path(Path::new("board.canvas")));
        assert!(!is_document_path(Path::new("image.png")));
    }
}
