use std::path::Path;

use basalt_fs::{build_flat_tree, indexer::index_directory, VaultCache};
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::cache_path;
use crate::config::load_config;

#[derive(Serialize)]
pub struct VaultSummary {
    pub note_count: usize,
}

#[tauri::command]
pub fn reindex_vault(
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<VaultSummary, String> {
    let config = load_config(&app);
    let vault_path = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = index_directory(Path::new(&vault_path));
    let note_count = vault.graph.metadata_cache.len();

    let cache = VaultCache::build(&vault_path, vault);
    let cache_file = cache_path(&app, &vault_path);
    let _ = cache.save(&cache_file);

    if let Some(loaded) = VaultCache::load(&cache_file) {
        *state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())? = loaded.vault;
    }

    Ok(VaultSummary { note_count })
}

/// Return the current vault's flat tree, freshly built from the in-memory
/// index.  The frontend calls this after any `vault://file-changed` event to
/// keep the sidebar in sync without a full restart.
#[tauri::command]
pub fn get_vault_tree(
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<basalt_fs::FlatTreeNode>, String> {
    let config = load_config(&app);
    let vault_path = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

    Ok(build_flat_tree(&vault, Path::new(&vault_path)))
}

/// Open the native folder-picker dialog and return the chosen path (or null).
#[tauri::command]
pub async fn open_vault_dialog(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    app.dialog()
        .file()
        .set_title("Choose your Basalt vault folder")
        .blocking_pick_folder()
        .map(|p| p.to_string())
}
