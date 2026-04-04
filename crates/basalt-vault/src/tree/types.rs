use serde::{Deserialize, Serialize};

/// Discriminates between a file and a directory in the vault tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    File,
    Folder,
}

/// A single row in the pre-order DFS flat tree that Rust builds and the
/// frontend renders directly.  The frontend never needs to construct or sort
/// the tree — it only tracks which folders the user has opened.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlatTreeNode {
    /// Display name (the last path segment, e.g. `"api.md"` or `"docs"`).
    pub name: String,

    /// Absolute path on disk — used for all file I/O commands.
    pub path: String,

    /// Path relative to the vault root — used by the frontend to look up
    /// parent folders without knowing the vault root at all.
    /// e.g. `"docs/api/intro.md"`  or  `"docs/api"` for a folder.
    pub rel_path: String,

    /// Whether this node is a file or a directory.
    pub kind: NodeKind,

    /// Indentation level (0 = immediate child of vault root).
    pub depth: u32,

    /// Number of immediate children.  Always 0 for files.
    /// Lets the frontend render `▶ docs (3)` without extra data.
    pub child_count: u32,
}
