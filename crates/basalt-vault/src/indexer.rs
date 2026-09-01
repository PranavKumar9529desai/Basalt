#![cfg(not(target_arch = "wasm32"))]

use crate::asset_index::{AssetInfo, infer_file_type, infer_mime_type, compute_md5};
use crate::utils::mtime_secs;
use crate::vault::Vault;
use ignore::WalkBuilder;
use std::collections::HashMap;
use std::path::Path;

/// Build an `AssetInfo` from a filesystem entry.
fn build_asset_info(abs_path: &Path, vault_root: &Path) -> Option<AssetInfo> {
    let meta = abs_path.metadata().ok()?;
    let rel_path = abs_path
        .strip_prefix(vault_root)
        .ok()
        .and_then(|s| s.to_str())?
        .to_string();
    let file_name = abs_path
        .file_name()
        .and_then(|n| n.to_str())?
        .to_string();

    // Compute MD5 content hash (skip for very large files to avoid stalling).
    let content_hash = if meta.len() <= 100 * 1024 * 1024 {
        // ≤100 MiB: read and hash
        std::fs::read(abs_path)
            .map(|data| compute_md5(&data))
            .unwrap_or_default()
    } else {
        String::new()
    };

    Some(AssetInfo {
        rel_path,
        abs_path: abs_path.to_string_lossy().to_string(),
        file_name,
        file_type: infer_file_type(&abs_path.to_string_lossy()),
        mime_type: infer_mime_type(&abs_path.to_string_lossy()),
        size_bytes: meta.len(),
        content_hash,
        width: None,
        height: None,
        embeds_by: Vec::new(),
        linked_by: Vec::new(),
    })
}

pub fn index_directory(path: &Path) -> Vault {
    let mut vault = Vault::new();

    let walker = WalkBuilder::new(path).build();

    for result in walker {
        if let Ok(entry) = result {
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                let entry_path = entry.path();
                if let Some(path_str) = entry_path.to_str() {
                    if entry_path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                        // Markdown: parse into graph
                        if let Ok(text) = std::fs::read_to_string(entry_path) {
                            vault.add_document(path_str, &text);
                        }
                    } else if let Some(info) = build_asset_info(entry_path, path) {
                        // Non-markdown: register in asset index
                        vault.asset_index.upsert(info);
                    }
                }
            }
        }
    }

    vault
}

/// Walk `vault_path`, re-parsing only files whose mtime is newer than the
/// recorded value in `cached_mtimes`.  Also removes documents that no longer
/// exist on disk.  Returns the updated mtime map.
pub fn incremental_reindex(
    vault_path: &Path,
    vault: &mut Vault,
    cached_mtimes: &HashMap<String, u64>,
) -> HashMap<String, u64> {
    let mut new_mtimes: HashMap<String, u64> = HashMap::new();

    let walker = WalkBuilder::new(vault_path).build();
    for entry in walker.flatten() {
        if !entry.file_type().map_or(false, |ft| ft.is_file()) {
            continue;
        }
        let path = entry.path();
        let path_str = match path.to_str() {
            Some(s) => s.to_string(),
            None => continue,
        };

        let current_mtime = mtime_secs(path).unwrap_or(0);
        let cached_mtime = cached_mtimes.get(&path_str).copied().unwrap_or(0);
        new_mtimes.insert(path_str.clone(), current_mtime);

        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            // Markdown: re-parse if modified
            if current_mtime > cached_mtime {
                if let Ok(content) = std::fs::read_to_string(path) {
                    vault.add_document(&path_str, &content);
                }
            }
        } else if current_mtime > cached_mtime {
            // Non-markdown: register/update in asset index if modified
            if let Some(info) = build_asset_info(path, vault_path) {
                vault.asset_index.upsert(info);
            }
        }
    }

    // Remove documents that have been deleted since the cache was written.
    for cached_path in cached_mtimes.keys() {
        if !new_mtimes.contains_key(cached_path) {
            let p = Path::new(cached_path);
            if p.extension().and_then(|e| e.to_str()) == Some("md") {
                vault.remove_document(cached_path);
            } else {
                vault.asset_index.remove(cached_path);
            }
        }
    }

    // Defensive cleanup: if graph/arena contains any markdown path not present
    // on disk, remove it even when it's missing from cached_mtimes.
    let stale_paths: Vec<String> = vault
        .arena
        .all_strings()
        .filter(|p| p.ends_with(".md"))
        .filter(|p| !new_mtimes.contains_key(*p))
        .cloned()
        .collect();
    for path in stale_paths {
        vault.remove_document(&path);
    }

    // Defensive cleanup: asset index entries not present on disk
    let stale_assets: Vec<String> = vault
        .asset_index
        .iter()
        .filter(|a| !new_mtimes.contains_key(&a.abs_path))
        .map(|a| a.abs_path.clone())
        .collect();
    for abs_path in stale_assets {
        vault.asset_index.remove(&abs_path);
    }

    new_mtimes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_index_directory() {
        let temp_dir = std::env::temp_dir().join("basalt_test_dummy");
        let _ = fs::remove_dir_all(&temp_dir); // clean up before
        fs::create_dir_all(&temp_dir).unwrap();

        fs::write(temp_dir.join("a.md"), "Link to [B](b.md)").unwrap();
        fs::write(temp_dir.join("b.md"), "Link to [A](a.md)").unwrap();

        let sub_dir = temp_dir.join("sub");
        fs::create_dir(&sub_dir).unwrap();
        fs::write(sub_dir.join("c.md"), "No links here").unwrap();

        let vault = index_directory(&temp_dir);
        let id_a = vault.arena.get_id(temp_dir.join("a.md").to_str().unwrap());
        let id_b = vault.arena.get_id(temp_dir.join("b.md").to_str().unwrap());
        let id_c = vault.arena.get_id(sub_dir.join("c.md").to_str().unwrap());

        assert!(id_a.is_some(), "a.md should be in arena");
        assert!(id_b.is_some(), "b.md should be in arena");
        assert!(id_c.is_some(), "c.md should be in arena");

        fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn test_index_directory_populates_asset_index() {
        let temp_dir = std::env::temp_dir().join("basalt_test_asset_idx");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        fs::write(temp_dir.join("note.md"), "# Hello\n\n![[image.png]]").unwrap();
        fs::write(temp_dir.join("image.png"), b"fake png data").unwrap();
        fs::write(temp_dir.join("doc.pdf"), b"fake pdf data").unwrap();

        let vault = index_directory(&temp_dir);

        // Both non-md files should be in the asset index
        assert_eq!(vault.asset_index.len(), 2);
        let img = vault.asset_index.get(&format!("{}/image.png", temp_dir.display()));
        assert!(img.is_some(), "image.png should be in asset index");
        let pdf = vault.asset_index.get(&format!("{}/doc.pdf", temp_dir.display()));
        assert!(pdf.is_some(), "doc.pdf should be in asset index");

        // The note's embed should be registered against the asset
        let img = img.unwrap();
        assert_eq!(img.embeds_by.len(), 1);
        assert!(img.embeds_by[0].ends_with("note.md"));

        fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn test_incremental_reindex_cleans_deleted_assets() {
        let temp_dir = std::env::temp_dir().join("basalt_test_reidx_asset");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        fs::write(temp_dir.join("a.md"), "content").unwrap();
        fs::write(temp_dir.join("old.png"), b"data").unwrap();

        let mut vault = index_directory(&temp_dir);
        assert_eq!(vault.asset_index.len(), 1);

        // Simulate: old.png deleted, new.pdf added
        fs::remove_file(temp_dir.join("old.png")).unwrap();
        fs::write(temp_dir.join("new.pdf"), b"data").unwrap();

        let old_mtimes = incremental_reindex(&temp_dir, &mut vault, &HashMap::new());
        // old.png should be gone, new.pdf should be present
        assert_eq!(vault.asset_index.len(), 1);
        assert!(vault.asset_index.get(&format!("{}/new.pdf", temp_dir.display())).is_some());
        assert!(vault.asset_index.get(&format!("{}/old.png", temp_dir.display())).is_none());

        // Cache should now track both
        assert!(old_mtimes.contains_key(&format!("{}/a.md", temp_dir.display())));
        assert!(old_mtimes.contains_key(&format!("{}/new.pdf", temp_dir.display())));

        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
