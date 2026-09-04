use serde::{Deserialize, Serialize};

use super::file_type::FileType;

/// Metadata for a single non-markdown file in the vault.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct AssetInfo {
    /// Vault-relative path, e.g. `"assets/image.png"`.
    pub rel_path: String,
    /// Absolute path on disk.
    pub abs_path: String,
    /// Filename component, e.g. `"image.png"`.
    pub file_name: String,
    /// Classification by extension.
    pub file_type: FileType,
    /// MIME type derived from extension.
    pub mime_type: String,
    /// File size in bytes.
    pub size_bytes: u64,
    /// MD5 content hash for duplicate detection.
    pub content_hash: String,
    /// Image/video width in pixels (None until lazily computed).
    pub width: Option<u32>,
    /// Image/video height in pixels (None until lazily computed).
    pub height: Option<u32>,
    /// Absolute paths of notes that `![[...]]` this asset.
    pub embeds_by: Vec<String>,
    /// Absolute paths of notes that `[[...]]` this asset (via wikilink, not embed).
    pub linked_by: Vec<String>,
}

/// Result of a vault asset consistency audit.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AssetAuditReport {
    /// Assets with zero embeds and zero backlinks.
    pub orphan_count: usize,
    /// Asset groups sharing the same content_hash (each group contributes group_size - 1 duplicates).
    pub duplicate_count: usize,
    /// Full asset list for the frontend to display.
    pub assets: Vec<AssetInfo>,
}
