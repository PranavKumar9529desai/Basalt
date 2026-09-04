mod file_type;
mod hash;
mod info;

pub use file_type::{infer_file_type, infer_mime_type, FileType};
pub use hash::compute_md5;
pub use info::{AssetAuditReport, AssetInfo};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

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

        AssetAuditReport {
            orphan_count,
            duplicate_count,
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
    /// referenced — without it every `![[image]]` looks orphaned.
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

#[cfg(test)]
mod tests;
