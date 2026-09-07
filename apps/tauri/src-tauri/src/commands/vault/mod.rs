use std::path::Path;

use basalt_vault::{build_flat_tree, indexer::index_directory, VaultCache};
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::cache_path;
use crate::error::{AppError, AppResult};

mod cc;

mod graph;
pub(crate) use graph::{build_graph_snapshot, GraphSnapshot};

#[derive(Serialize)]
pub struct VaultSummary {
    pub note_count: usize,
}

#[tauri::command]
pub fn reindex_vault(state: State<AppState>, app: tauri::AppHandle) -> AppResult<VaultSummary> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault = index_directory(Path::new(&vault_path));
    let note_count = vault.note_count();

    let cache = VaultCache::build(&vault_path, vault);
    let cache_file = cache_path(&app, &vault_path);
    let _ = cache.save(&cache_file);
    *state
        .vault
        .write()
        .map_err(|_| AppError::LockPoisoned("vault"))? = cache.vault;

    Ok(VaultSummary { note_count })
}

/// Return the current vault's flat tree, freshly built from the in-memory
/// index.  The frontend calls this after any `vault://file-changed` event to
/// keep the sidebar in sync without a full restart.
#[tauri::command]
pub fn get_vault_tree(state: State<AppState>) -> AppResult<Vec<basalt_vault::FlatTreeNode>> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

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

#[tauri::command]
pub fn get_graph(state: State<AppState>) -> AppResult<GraphSnapshot> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    build_graph_snapshot(&vault, Path::new(&vault_path))
}
