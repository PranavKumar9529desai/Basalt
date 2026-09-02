use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

// ---------------------------------------------------------------------------
// FileType
// ---------------------------------------------------------------------------

/// Classification of non-markdown file types by extension.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FileType {
    Image,
    Video,
    Audio,
    Document,
    Other,
}

impl FileType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Document => "document",
            Self::Other => "other",
        }
    }
}

/// Infer file type from a filename's extension.
pub fn infer_file_type(filename: &str) -> FileType {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" | "tif"
        | "heic" | "heif" => FileType::Image,
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" => FileType::Video,
        "mp3" | "wav" | "aac" | "ogg" | "flac" | "wma" | "m4a" | "opus" => FileType::Audio,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "csv" | "rtf"
        | "odt" => FileType::Document,
        _ => FileType::Other,
    }
}

/// Infer MIME type from a filename's extension.
pub fn infer_mime_type(filename: &str) -> String {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "opus" => "audio/opus",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        _ => "application/octet-stream",
    };
    mime.to_string()
}

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/// Compute MD5 hex-digest of a byte slice.
pub fn compute_md5(data: &[u8]) -> String {
    let digest = md5::compute(data);
    format!("{:x}", digest)
}

// ---------------------------------------------------------------------------
// AssetInfo
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Audit report
// ---------------------------------------------------------------------------

/// Result of a vault asset consistency audit.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AssetAuditReport {
    /// Assets with zero embeds and zero backlinks.
    pub orphan_count: usize,
    /// Asset groups sharing the same content_hash (each group contributes group_size - 1 duplicates).
    pub duplicate_count: usize,
    /// Number of notes with `![[target]]` where `target` cannot be resolved to a file.
    pub broken_embed_count: usize,
    /// Full asset list for the frontend to display.
    pub assets: Vec<AssetInfo>,
}

// ---------------------------------------------------------------------------
// AssetIndex
// ---------------------------------------------------------------------------

/// In-memory index of every non-markdown file in the vault.
///
/// Built during the vault walk (`indexer.rs`) and kept up-to-date by
/// incremental re-indexing.  The index maps vault-relative paths to
/// [`AssetInfo`] and provides methods to populate the bidirectional
/// `embeds_by` / `linked_by` relationships.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AssetIndex {
    /// Keyed by absolute path.
    assets: HashMap<String, AssetInfo>,
}

impl AssetIndex {
    pub fn new() -> Self {
        Self {
            assets: HashMap::new(),
        }
    }

    /// Insert or update an asset entry.  Returns a mutable reference so the
    /// caller can attach embed/link relationships.
    pub fn upsert(&mut self, info: AssetInfo) {
        self.assets.insert(info.abs_path.clone(), info);
    }

    /// Remove an asset by its absolute path.
    pub fn remove(&mut self, abs_path: &str) -> Option<AssetInfo> {
        self.assets.remove(abs_path)
    }

    /// Look up an asset by its absolute path.
    pub fn get(&self, abs_path: &str) -> Option<&AssetInfo> {
        self.assets.get(abs_path)
    }

    /// Iterate over all assets.
    pub fn iter(&self) -> impl Iterator<Item = &AssetInfo> {
        self.assets.values()
    }

    /// Return all assets as a `Vec`, sorted by `rel_path` for a stable,
    /// deterministic UI order (the backing `HashMap` is unordered).
    pub fn all(&self) -> Vec<AssetInfo> {
        let mut v: Vec<AssetInfo> = self.assets.values().cloned().collect();
        v.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        v
    }

    /// Number of tracked assets.
    pub fn len(&self) -> usize {
        self.assets.len()
    }

    /// Whether the index is empty.
    pub fn is_empty(&self) -> bool {
        self.assets.is_empty()
    }

    /// Register a note's embed targets.  Each `target` string is resolved
    /// against the asset index by basename and rel_path.
    pub fn register_embeds(&mut self, note_abs_path: &str, targets: &[String]) {
        for target in targets {
            if let Some(asset) = self.resolve_asset(target) {
                let asset_path = asset.abs_path.clone();
                if let Some(a) = self.assets.get_mut(&asset_path) {
                    if !a.embeds_by.contains(&note_abs_path.to_string()) {
                        a.embeds_by.push(note_abs_path.to_string());
                    }
                }
            }
        }
    }

    /// Register a note's wikilink targets (non-embed).  Same resolution
    /// logic as embeds but populates `linked_by`.
    pub fn register_links(&mut self, note_abs_path: &str, targets: &[String]) {
        for target in targets {
            if let Some(asset) = self.resolve_asset(target) {
                let asset_path = asset.abs_path.clone();
                if let Some(a) = self.assets.get_mut(&asset_path) {
                    if !a.linked_by.contains(&note_abs_path.to_string()) {
                        a.linked_by.push(note_abs_path.to_string());
                    }
                }
            }
        }
    }

    /// Clear all embed/link relationships (call before a full re-index).
    pub fn clear_references(&mut self) {
        for asset in self.assets.values_mut() {
            asset.embeds_by.clear();
            asset.linked_by.clear();
        }
    }

    /// Remove a note from all `embeds_by` / `linked_by` lists (e.g. on
    /// document deletion).
    pub fn remove_note_references(&mut self, note_abs_path: &str) {
        for asset in self.assets.values_mut() {
            asset.embeds_by.retain(|p| p != note_abs_path);
            asset.linked_by.retain(|p| p != note_abs_path);
        }
    }

    /// Rename a note in all `embeds_by` / `linked_by` lists.
    pub fn rename_note_references(&mut self, old_path: &str, new_path: &str) {
        for asset in self.assets.values_mut() {
            for p in &mut asset.embeds_by {
                if p == old_path {
                    *p = new_path.to_string();
                }
            }
            for p in &mut asset.linked_by {
                if p == old_path {
                    *p = new_path.to_string();
                }
            }
        }
    }

    /// Build a consistency audit report.
    pub fn audit(&self) -> AssetAuditReport {
        let mut orphan_count = 0;
        let mut hash_groups: HashMap<&str, Vec<&str>> = HashMap::new();
        let broken_embed_count = 0;

        for asset in self.assets.values() {
            // Orphan: no embeds and no links
            if asset.embeds_by.is_empty() && asset.linked_by.is_empty() {
                orphan_count += 1;
            }
            // Duplicate tracking: group by content_hash
            if !asset.content_hash.is_empty() {
                hash_groups
                    .entry(asset.content_hash.as_str())
                    .or_default()
                    .push(&asset.abs_path);
            }
        }

        // Count duplicates: each group of N contributes N-1 duplicates
        let duplicate_count: usize = hash_groups
            .values()
            .filter(|g| g.len() > 1)
            .map(|g| g.len() - 1)
            .sum();

        // Note: broken_embed_count would require scanning notes' metadata
        // for targets that don't resolve. This is computed at the Tauri
        // command level where we have access to both the graph and index.

        AssetAuditReport {
            orphan_count,
            duplicate_count,
            broken_embed_count,
            assets: self.all(),
        }
    }

    /// Resolve a wikilink/embed target string to an asset in the index.
    ///
    /// Tries, in order:
    /// 1. Exact match on `rel_path` (case-insensitive)
    /// 2. Bare filename match (basename only, case-insensitive)
    /// 3. Stem match (extension-less target like `![[image]]` → `image.png`),
    ///    preferring the shortest `rel_path` when several files share a stem.
    ///
    /// Stem matching is what lets extension-less embeds be counted as
    /// referenced — without it every `![[image]]` looks orphaned and Clean up
    pub fn resolve_asset(&self, target: &str) -> Option<&AssetInfo> {
        let target_lower = target.trim().to_lowercase();

        // 1. Exact rel_path match
        for asset in self.assets.values() {
            if asset.rel_path.to_lowercase() == target_lower {
                return Some(asset);
            }
        }

        // 2. Bare filename match
        if let Some(target_name) = Path::new(&target_lower)
            .file_name()
            .and_then(|n| n.to_str())
        {
            for asset in self.assets.values() {
                if asset.file_name.to_lowercase() == target_name {
                    return Some(asset);
                }
            }
        }

        // 3. Stem match — `![[image]]` (no extension) → `image.png`.
        let target_stem = Path::new(&target_lower)
            .file_stem()
            .and_then(|s| s.to_str());
        if let Some(stem) = target_stem {
            if !stem.is_empty() {
                let mut best: Option<&AssetInfo> = None;
                for asset in self.assets.values() {
                    let file_stem = Path::new(&asset.file_name)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    if file_stem.eq_ignore_ascii_case(stem) {
                        let better = match best {
                            None => true,
                            Some(cur) => {
                                asset.rel_path.len() < cur.rel_path.len()
                                    || (asset.rel_path.len() == cur.rel_path.len()
                                        && asset.rel_path < cur.rel_path)
                            }
                        };
                        if better {
                            best = Some(asset);
                        }
                    }
                }
                if best.is_some() {
                    return best;
                }
            }
        }

        None
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_asset(rel: &str) -> AssetInfo {
        let path = Path::new(rel);
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        AssetInfo {
            rel_path: rel.to_string(),
            abs_path: format!("/vault/{rel}"),
            file_name,
            file_type: infer_file_type(rel),
            mime_type: infer_mime_type(rel),
            size_bytes: 1024,
            content_hash: "abc123".to_string(),
            width: None,
            height: None,
            embeds_by: Vec::new(),
            linked_by: Vec::new(),
        }
    }

    #[test]
    fn test_infer_file_type() {
        assert_eq!(infer_file_type("photo.png"), FileType::Image);
        assert_eq!(infer_file_type("photo.JPG"), FileType::Image);
        assert_eq!(infer_file_type("video.mp4"), FileType::Video);
        assert_eq!(infer_file_type("song.flac"), FileType::Audio);
        assert_eq!(infer_file_type("report.pdf"), FileType::Document);
        assert_eq!(infer_file_type("archive.zip"), FileType::Other);
    }

    #[test]
    fn test_infer_mime_type() {
        assert_eq!(infer_mime_type("a.png"), "image/png");
        assert_eq!(infer_mime_type("a.webp"), "image/webp");
        assert_eq!(infer_mime_type("a.mp3"), "audio/mpeg");
        assert_eq!(infer_mime_type("a.unknown"), "application/octet-stream");
    }

    #[test]
    fn test_compute_md5_deterministic() {
        let h1 = compute_md5(b"hello world");
        let h2 = compute_md5(b"hello world");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 32); // hex-encoded MD5 is 32 chars
    }

    #[test]
    fn test_compute_md5_differs_for_different_content() {
        let h1 = compute_md5(b"hello");
        let h2 = compute_md5(b"world");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_asset_index_upsert_and_get() {
        let mut idx = AssetIndex::new();
        let a = sample_asset("img/photo.png");
        idx.upsert(a.clone());
        assert_eq!(idx.len(), 1);
        assert_eq!(idx.get("/vault/img/photo.png").unwrap().rel_path, "img/photo.png");
    }

    #[test]
    fn test_asset_index_remove() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("a.png"));
        assert!(idx.remove("/vault/a.png").is_some());
        assert!(idx.is_empty());
    }

    #[test]
    fn test_register_embeds_by_basename() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("assets/image.png"));

        idx.register_embeds("/vault/note.md", &vec!["image.png".to_string()]);

        let a = idx.get("/vault/assets/image.png").unwrap();
        assert_eq!(a.embeds_by, vec!["/vault/note.md"]);
    }

    #[test]
    fn test_register_links_by_rel_path() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("docs/diagram.pdf"));

        idx.register_links("/vault/note.md", &vec!["docs/diagram.pdf".to_string()]);

        let a = idx.get("/vault/docs/diagram.pdf").unwrap();
        assert_eq!(a.linked_by, vec!["/vault/note.md"]);
    }

    #[test]
    fn test_no_duplicate_references() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("a.png"));

        idx.register_embeds("/vault/note.md", &vec!["a.png".to_string(), "a.png".to_string()]);

        let a = idx.get("/vault/a.png").unwrap();
        assert_eq!(a.embeds_by.len(), 1);
    }

    #[test]
    fn test_clear_references() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("a.png"));
        idx.register_embeds("/vault/note.md", &vec!["a.png".to_string()]);

        idx.clear_references();
        let a = idx.get("/vault/a.png").unwrap();
        assert!(a.embeds_by.is_empty());
        assert!(a.linked_by.is_empty());
    }

    #[test]
    fn test_remove_note_references() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("a.png"));
        idx.upsert(sample_asset("b.png"));
        idx.register_embeds("/vault/note1.md", &vec!["a.png".to_string()]);
        idx.register_embeds("/vault/note2.md", &vec!["a.png".to_string(), "b.png".to_string()]);
        // line removed — the vec! on line 469 already covers this

        idx.remove_note_references("/vault/note1.md");

        let a = idx.get("/vault/a.png").unwrap();
        assert_eq!(a.embeds_by, vec!["/vault/note2.md"]);
        let b = idx.get("/vault/b.png").unwrap();
        assert_eq!(b.embeds_by, vec!["/vault/note2.md"]);
    }

    #[test]
    fn test_rename_note_references() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("a.png"));
        idx.register_embeds("/vault/old.md", &vec!["a.png".to_string()]);

        idx.rename_note_references("/vault/old.md", "/vault/new.md");

        let a = idx.get("/vault/a.png").unwrap();
        assert_eq!(a.embeds_by, vec!["/vault/new.md"]);
    }

    #[test]
    fn test_audit_report() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("orphan.png")); // orphan
        idx.upsert({
            let mut a = sample_asset("dup1.png");
            a.content_hash = "same_hash".into();
            a
        });
        idx.upsert({
            let mut a = sample_asset("dup2.png");
            a.content_hash = "same_hash".into();
            a
        });
        // Not an orphan (has embeds)
        idx.upsert({
            let mut a = sample_asset("linked.png");
            a.embeds_by = vec!["/vault/note.md".into()];
            a
        });

        let report = idx.audit();
        assert_eq!(report.orphan_count, 3); // orphan.png, dup1.png, dup2.png — all have no references
        assert_eq!(report.duplicate_count, 2); // {dup1,dup2} + {orphan,linked} share hashes
    }

    #[test]
    fn test_resolve_case_insensitive() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("Assets/Photo.PNG"));

        assert!(idx.resolve_asset("assets/photo.png").is_some());
        assert!(idx.resolve_asset("Assets/Photo.PNG").is_some());
    }
    #[test]
    fn test_resolve_asset_stem_match() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("_attachments/image.png"));

        // Extension-less target resolves via stem match
        assert!(idx.resolve_asset("image").is_some());
        // With extension resolves via exact file_name (pass 2)
        assert!(idx.resolve_asset("image.png").is_some());
        // Fully-qualified rel_path resolves (pass 1)
        assert!(idx.resolve_asset("_attachments/image.png").is_some());
        // Non-existent name
        assert!(idx.resolve_asset("video.mp4").is_none());
    }

    #[test]
    fn test_resolve_asset_stem_deterministic_tiebreak() {
        let mut idx = AssetIndex::new();
        // Two assets share the stem "image" — shorter rel_path wins.
        idx.upsert(sample_asset("z/image.png"));
        idx.upsert(sample_asset("a/image.png"));

        let resolved = idx.resolve_asset("image").unwrap();
        assert_eq!(resolved.rel_path, "a/image.png");
    }

    #[test]
    fn test_all_sorted_by_rel_path() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("z.png"));
        idx.upsert(sample_asset("a.png"));
        idx.upsert(sample_asset("m.png"));
        let paths: Vec<String> = idx.all().into_iter().map(|a| a.rel_path).collect();
        assert_eq!(paths, vec!["a.png".to_string(), "m.png".to_string(), "z.png".to_string()]);
    }

    #[test]
    fn test_resolve_asset_stem_prefers_file_name_when_possible() {
        let mut idx = AssetIndex::new();
        idx.upsert(sample_asset("_attachments/photo.png"));
        idx.upsert(sample_asset("_attachments/other/photo.jpg"));

        // Pass 2 (exact file_name) fires before pass 3 (stem) — file_name
        // "photo.png" == target "photo.png" matches the first asset directly.
        let resolved = idx.resolve_asset("photo.png").unwrap();
        assert_eq!(resolved.rel_path, "_attachments/photo.png");
    }
}
