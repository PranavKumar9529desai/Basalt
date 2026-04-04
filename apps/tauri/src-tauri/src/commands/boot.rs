use std::path::Path;

use basalt_vault::build_flat_tree;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::{load_or_index_vault, update_last_vault};
use crate::config::load_config;
use crate::watcher::start_watcher;
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

    let vault_path = match config.last_vault.clone() {
        Some(p) => p,
        None => {
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

    // Initialise the search index (non-fatal — vault still works if this fails).
    //
    // We hold the search write lock for the entire open_or_create call and set
    // it to None first. This is critical: tantivy allows only one IndexWriter
    // per directory. Without this, concurrent boot invocations (e.g. React
    // StrictMode double-invoking the boot effect in dev) both reach
    // open_or_create simultaneously and the second one fails with LockBusy.
    // Holding the write lock serialises them; setting None first drops any
    // existing IndexWriter so its lockfile is released before we open a new one.
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);
        if let Ok(vault_guard) = state.vault.read() {
            if let Ok(mut search_guard) = state.search.write() {
                *search_guard = None; // drop existing IndexWriter + release lockfile
                match SearchState::open_or_create(&index_dir, &vault_guard, &known_mtimes) {
                    Ok(search_state) => *search_guard = Some(search_state),
                    Err(e) => eprintln!("[boot] search index failed: {e}"),
                }
            }
        } else {
            eprintln!("[boot] vault lock poisoned; skipping search init");
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

    let note_count = crate::cache::index_and_persist(&vault_path, &state, &app)?;

    update_last_vault(&app, &vault_path);

    // (Re-)start the watcher.
    start_watcher(&state, &vault_path, &app)?;

    // Initialise the search index (non-fatal — vault still works if this fails).
    // Hold search write lock across open_or_create and set to None first to
    // drop any existing IndexWriter before creating a new one (same reasoning
    // as in `boot` — prevents LockBusy from concurrent invocations).
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);
        if let Ok(vault_guard) = state.vault.read() {
            if let Ok(mut search_guard) = state.search.write() {
                *search_guard = None; // drop existing IndexWriter + release lockfile
                // set_vault always does a full re-index, so no prior mtimes to compare.
                let empty_mtimes = std::collections::HashMap::new();
                match SearchState::open_or_create(&index_dir, &vault_guard, &empty_mtimes) {
                    Ok(search_state) => *search_guard = Some(search_state),
                    Err(e) => eprintln!("[set_vault] search index failed: {e}"),
                }
            }
        } else {
            eprintln!("[set_vault] vault lock poisoned; skipping search init");
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
