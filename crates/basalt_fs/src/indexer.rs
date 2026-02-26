#![cfg(not(target_arch = "wasm32"))]

use crate::utils::mtime_secs;
use crate::vault::Vault;
use ignore::WalkBuilder;
use std::collections::HashMap;
use std::path::Path;

pub fn index_directory(path: &Path) -> Vault {
    let mut vault = Vault::new();

    let walker = WalkBuilder::new(path).build();

    for result in walker {
        if let Ok(entry) = result {
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                let entry_path = entry.path();
                if entry_path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                    if let Ok(text) = std::fs::read_to_string(entry_path) {
                        if let Some(path_str) = entry_path.to_str() {
                            vault.add_document(path_str, &text);
                        }
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
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let path_str = match path.to_str() {
            Some(s) => s.to_string(),
            None => continue,
        };

        let current_mtime = mtime_secs(path).unwrap_or(0);
        new_mtimes.insert(path_str.clone(), current_mtime);

        let cached_mtime = cached_mtimes.get(&path_str).copied().unwrap_or(0);
        if current_mtime > cached_mtime {
            // New or modified — re-parse.
            if let Ok(content) = std::fs::read_to_string(path) {
                vault.add_document(&path_str, &content);
            }
        }
        // If mtime is unchanged the cached graph data is already correct.
    }

    // Remove documents that have been deleted since the cache was written.
    for cached_path in cached_mtimes.keys() {
        if !new_mtimes.contains_key(cached_path) {
            vault.remove_document(cached_path);
        }
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
        // arean hold the mapping of the id to the path
        let id_a = vault.arena.get_id(temp_dir.join("a.md").to_str().unwrap());
        let id_b = vault.arena.get_id(temp_dir.join("b.md").to_str().unwrap());
        let id_c = vault.arena.get_id(sub_dir.join("c.md").to_str().unwrap());

        assert!(id_a.is_some(), "a.md should be in arena");
        assert!(id_b.is_some(), "b.md should be in arena");
        assert!(id_c.is_some(), "c.md should be in arena");

        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
