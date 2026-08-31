use std::path::{Path, PathBuf};

use basalt_vault::{incremental_reindex, indexer::index_directory, VaultCache};
use tauri::Manager;

use crate::app_state::AppState;
use crate::config::{load_config, save_config};

/// Simple djb2 hash — no external dep needed.
fn djb2_hash(s: &str) -> u32 {
    s.bytes().fold(5381u32, |acc, b| {
        acc.wrapping_mul(33).wrapping_add(b as u32)
    })
}

/// Derives a stable filename for the vault cache from the vault's root path.
/// Uses the folder name + a simple 8-char hex hash of the full path so two
/// vaults with the same folder name don't collide.
fn cache_filename(vault_path: &str) -> String {
    let folder_name = Path::new(vault_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vault");

    format!("{}_{:08x}.json", folder_name, djb2_hash(vault_path))
}

pub(crate) fn cache_path(app: &tauri::AppHandle, vault_path: &str) -> PathBuf {
    app.path()
        .app_cache_dir()
        .expect("app cache dir unavailable")
        .join(cache_filename(vault_path))
}

/// Returns `(status, note_count, known_mtimes)`.
/// `known_mtimes` is the mtime map from the cache BEFORE the incremental reindex —
/// used by the search engine to decide which files need re-indexing.
pub fn load_or_index_vault(
    vault_path: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<(String, usize, std::collections::HashMap<String, u64>), String> {
    let cache_file = cache_path(app, vault_path);

    if let Some(cache) = VaultCache::load(&cache_file) {
        // Snapshot the old mtimes before the incremental reindex so the search
        // engine can compare against them to find stale documents.
        let old_mtimes = cache.file_mtimes.clone();

        // Restore vault from cache then patch only the files that changed.
        let mut vault = cache.vault;
        let _new_mtimes = incremental_reindex(Path::new(vault_path), &mut vault, &old_mtimes);
        let note_count = vault.graph.metadata_cache.len();

        // Persist updated cache (rebuild to keep fresh file mtimes).
        let real_cache = VaultCache::build(vault_path, vault);
        let _ = real_cache.save(&cache_file);
        *state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())? = real_cache.vault;

        return Ok(("incremental".to_string(), note_count, old_mtimes));
    }

    // No valid cache — full index.
    let vault = index_directory(Path::new(vault_path));
    let note_count = vault.graph.metadata_cache.len();

    let cache = VaultCache::build(vault_path, vault);
    let _ = cache.save(&cache_file);
    *state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())? = cache.vault;

    // Fresh index — no prior mtimes.
    Ok((
        "full_index".into(),
        note_count,
        std::collections::HashMap::new(),
    ))
}

pub fn index_and_persist(
    vault_path: &str,
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<usize, String> {
    let vault = index_directory(Path::new(vault_path));
    let note_count = vault.graph.metadata_cache.len();

    let cache = VaultCache::build(vault_path, vault);
    let cache_file = cache_path(app, vault_path);
    let _ = cache.save(&cache_file);
    *state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())? = cache.vault;

    Ok(note_count)
}

pub fn update_last_vault(app: &tauri::AppHandle, vault_path: &str) {
    let mut config = load_config(app);
    config.last_vault = Some(vault_path.to_string());
    save_config(app, &config);
}

/// Returns the directory where the tantivy search index for `vault_path` is stored.
/// Uses the same djb2 hash as `cache_filename` so the index lives alongside the vault cache.
pub(crate) fn search_index_dir(app: &tauri::AppHandle, vault_path: &str) -> std::path::PathBuf {
    app.path()
        .app_cache_dir()
        .expect("app cache dir unavailable")
        .join(format!("search_{:08x}", djb2_hash(vault_path)))
}
