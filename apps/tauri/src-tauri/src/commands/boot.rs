use std::path::Path;

use basalt_vault::build_flat_tree;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::{load_or_index_vault, update_last_vault};
use crate::config::load_config;
use crate::watcher::{start_search_flusher, start_watcher};
use crate::workspace::load_workspace;

#[derive(Serialize)]
pub struct BootResult {
    /// Absolute path of the vault that was loaded, if any.
    pub vault_path: Option<String>,
    /// Number of notes in the vault.
    pub note_count: usize,
    /// One of: "no_vault" | "loaded_cache" | "incremental" | "full_index"
    pub status: String,
    /// Pre-built, pre-sorted flat tree — ready for the sidebar to render.
    /// Empty when `status == "no_vault"`.
    pub tree: Vec<basalt_vault::FlatTreeNode>,
    /// Persisted settings from config.json (Tier 1: global)
    pub settings: std::collections::HashMap<String, serde_json::Value>,
    /// Per-vault workspace state from .basalt/workspace.json (Tier 3: vault-local)
    pub workspace: std::collections::HashMap<String, serde_json::Value>,
}

#[tauri::command]
pub fn boot(state: State<AppState>, app: tauri::AppHandle) -> Result<BootResult, String> {
    let config = load_config(&app);

    let vault_path = match config.last_vault {
        Some(p) => p,
        None => {
            *state
                .vault_path
                .write()
                .map_err(|_| "vault path lock poisoned".to_string())? = None;
            return Ok(BootResult {
                vault_path: None,
                note_count: 0,
                status: "no_vault".into(),
                tree: Vec::new(),
                settings: config.settings,
                workspace: Default::default(),
            })
        }
    };

    *state
        .vault_path
        .write()
        .map_err(|_| "vault path lock poisoned".to_string())? = Some(vault_path.clone());

    // Ensure the vault directory still exists.
    if !Path::new(&vault_path).is_dir() {
        return Ok(BootResult {
            vault_path: None,
            note_count: 0,
            status: "no_vault".into(),
            tree: Vec::new(),
            settings: config.settings,
            workspace: Default::default(),
        });
    }

    let (status, note_count, known_mtimes) = load_or_index_vault(&vault_path, &state, &app)?;

    start_watcher(&state, &vault_path, &app)?;
    start_search_flusher(&state);

    // Initialise the search index (non-fatal — vault still works if this fails).
    // We minimise the search write lock scope: briefly set None to drop the
    // old IndexWriter and release its tantivy lockfile, build outside the lock,
    // then briefly acquire again to swap in the new SearchState.
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);

        // 1. Brief write lock: drop old writer + release lockfile.
        if let Ok(mut search_guard) = state.search.write() {
            *search_guard = None;
        }

        // 2. Build SearchState outside the search write lock.
        let search_state = if let Ok(vault_guard) = state.vault.read() {
            match SearchState::open_or_create(&index_dir, &vault_guard, &known_mtimes) {
                Ok(s) => Some(s),
                Err(e) => {
                    eprintln!("[boot] search index failed: {e}");
                    None
                }
            }
        } else {
            eprintln!("[boot] vault lock poisoned; skipping search init");
            None
        };

        // 3. Brief write lock: swap in the new SearchState.
        if let Ok(mut search_guard) = state.search.write() {
            *search_guard = search_state;
        }
    }

    let tree = {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        build_flat_tree(&vault, Path::new(&vault_path))
    };

    let workspace = load_workspace(&vault_path);

    Ok(BootResult {
        vault_path: Some(vault_path),
        note_count,
        status,
        tree,
        settings: config.settings,
        workspace,
    })
}

/// Set a vault by path (e.g. after the user picks one via the folder dialog).
/// Always does a full index on first set, saves the path to config, and
/// starts the watcher.
#[tauri::command]
pub fn set_vault(
    path: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<BootResult, String> {
    let root = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))?;

    if !root.is_dir() {
        return Err("path is not a directory".into());
    }

    let vault_path = root.to_string_lossy().to_string();

    *state
        .vault_path
        .write()
        .map_err(|_| "vault path lock poisoned".to_string())? = Some(vault_path.clone());

    let note_count = crate::cache::index_and_persist(&vault_path, &state, &app)?;

    update_last_vault(&app, &vault_path);

    // (Re-)start the watcher.
    start_watcher(&state, &vault_path, &app)?;
    start_search_flusher(&state);

    // Initialise the search index (non-fatal — vault still works if this fails).
    // Minimise search write lock scope: brief None, build outside, brief swap.
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);

        if let Ok(mut search_guard) = state.search.write() {
            *search_guard = None;
        }

        let empty_mtimes = std::collections::HashMap::new();
        let search_state = if let Ok(vault_guard) = state.vault.read() {
            match SearchState::open_or_create(&index_dir, &vault_guard, &empty_mtimes) {
                Ok(s) => Some(s),
                Err(e) => {
                    eprintln!("[set_vault] search index failed: {e}");
                    None
                }
            }
        } else {
            eprintln!("[set_vault] vault lock poisoned; skipping search init");
            None
        };

        if let Ok(mut search_guard) = state.search.write() {
            *search_guard = search_state;
        }
    }

    let tree = {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        build_flat_tree(&vault, &root)
    };

    let config = load_config(&app);
    let workspace = crate::workspace::load_workspace(&vault_path);

    Ok(BootResult {
        vault_path: Some(vault_path),
        note_count,
        status: "full_index".into(),
        tree,
        settings: config.settings,
        workspace,
    })
}
