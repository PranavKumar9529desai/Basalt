use std::path::Path;

use basalt_vault::{fast_scan_flat_tree, indexer::index_directory, VaultCache};
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::cache_path;
use crate::error::{AppError, AppResult};

mod cc;

mod graph;
pub(crate) use graph::{build_graph_snapshot, encode_graph_snapshot_binary};

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
    let paths: Vec<String> = cache
        .vault
        .arena
        .all_strings()
        .filter(|p| p.ends_with(".md") || p.ends_with(".canvas"))
        .cloned()
        .collect();

    let index_dir = crate::cache::search_index_dir(&app, &vault_path);
    if let Ok(mut search_guard) = state.search.write() {
        if let Ok(s) = basalt_search::SearchState::open_fast(&index_dir, paths.clone()) {
            let stale_paths = s.filter_stale_paths(&paths, &std::collections::HashMap::new());
            if !stale_paths.is_empty() {
                crate::core::search_indexer::start_background_indexing(&state, &app, stale_paths);
            }
            *search_guard = Some(s);
        }
    }

    *state
        .vault
        .write()
        .map_err(|_| AppError::LockPoisoned("vault"))? = cache.vault;

    Ok(VaultSummary { note_count })
}

/// Return the current vault's flat tree via a direct filesystem scan. Pure
/// disk walk (ADR-046 Tier 1): the tree never depends on vault population or
/// graph state, so refreshes are correct during background indexing. The
/// frontend calls this after any `vault://file-changed` event to keep the
/// sidebar in sync without a full restart.
#[tauri::command]
pub fn get_vault_tree(state: State<AppState>) -> AppResult<Vec<basalt_vault::FlatTreeNode>> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    Ok(fast_scan_flat_tree(Path::new(&vault_path)))
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
pub fn get_graph(state: State<AppState>) -> AppResult<tauri::ipc::Response> {
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
    let snapshot = build_graph_snapshot(&vault, Path::new(&vault_path))?;
    let bytes = encode_graph_snapshot_binary(&snapshot)?;
    Ok(tauri::ipc::Response::new(bytes))
}
