use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use basalt_fs::{indexer::index_directory, watcher::VaultWatcher, Vault};
use serde::Serialize;
use tauri::{Emitter, State};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn canonical_md_path(path: &str) -> std::io::Result<PathBuf> {
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "only .md files are supported",
        ));
    }
    p.canonicalize()
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

struct AppState {
    /// Shared between the Tauri commands and the VaultWatcher thread.
    vault: Arc<RwLock<Vault>>,
    /// Keeps the watcher alive for the lifetime of the app.
    /// Replaced every time the user indexes a new vault.
    watcher: RwLock<Option<VaultWatcher>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Arc::new(RwLock::new(Vault::new())),
            watcher: RwLock::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Serialisable response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct VaultSummary {
    count: usize,
}

#[derive(Serialize)]
struct LinkSuggestion {
    name: String,
    path: String,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Index a vault directory and start the file watcher.
/// Emits `vault://file-changed` with the absolute path whenever an `.md`
/// file is created, modified, or removed externally.
#[tauri::command]
fn index_vault(
    path: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<VaultSummary, String> {
    let root = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))?;

    if !root.is_dir() {
        return Err("vault path is not a directory".into());
    }

    // Index the directory into a fresh vault.
    let new_vault = index_directory(&root);
    let count = new_vault.graph.metadata_cache.len();

    // Write the new vault into shared state.
    {
        let mut guard = state
            .vault
            .write()
            .map_err(|_| "vault lock is poisoned".to_string())?;
        *guard = new_vault;
    }

    // Start the watcher, sharing the same Arc<RwLock<Vault>>.
    // The callback emits a Tauri event so the frontend can react.
    let vault_arc = Arc::clone(&state.vault);
    let watcher = VaultWatcher::watch(&root, vault_arc, move |changed_path: PathBuf| {
        let path_str = changed_path.to_string_lossy().to_string();
        // Emit to all windows; ignore errors (window may be closing).
        let _ = app.emit("vault://file-changed", path_str);
    })
    .map_err(|e| format!("failed to start file watcher: {e}"))?;

    // Store the watcher, dropping any previous one.
    *state
        .watcher
        .write()
        .map_err(|_| "watcher lock is poisoned".to_string())? = Some(watcher);

    Ok(VaultSummary { count })
}

/// Read a markdown file from disk.
#[tauri::command]
fn open_file(path: String) -> Result<String, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}

/// Write content to a markdown file and re-index it in the vault.
#[tauri::command]
fn save_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;

    // Write to disk first.
    std::fs::write(&abs, &content).map_err(|e| e.to_string())?;

    // Re-index only this file so backlinks stay up to date.
    let mut vault = state
        .vault
        .write()
        .map_err(|_| "vault lock is poisoned".to_string())?;

    if let Some(path_str) = abs.to_str() {
        vault.add_document(path_str, &content);
    }

    Ok(())
}

/// Return the paths of all notes that link to the given file.
#[tauri::command]
fn get_backlinks(path: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock is poisoned".to_string())?;

    let Some(doc_id) = vault.arena.get_id(abs.to_str().unwrap_or_default()) else {
        return Ok(Vec::new());
    };

    let Some(backlinks) = vault.graph.get_back_links(doc_id) else {
        return Ok(Vec::new());
    };

    let results = backlinks
        .iter()
        .filter_map(|id| vault.arena.get_string(*id).cloned())
        .collect();

    Ok(results)
}

/// Return note names and paths whose filename starts with `prefix`.
#[tauri::command]
fn autocomplete_links(
    prefix: String,
    state: State<AppState>,
) -> Result<Vec<LinkSuggestion>, String> {
    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock is poisoned".to_string())?;

    let out = vault
        .arena
        .all_strings()
        .filter(|p| p.ends_with(".md"))
        .filter_map(|path_str| {
            let name = Path::new(path_str).file_name()?.to_str()?;
            if name.to_lowercase().starts_with(&prefix.to_lowercase()) {
                Some(LinkSuggestion {
                    name: name.to_string(),
                    path: path_str.to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(out)
}

/// Return all tags in the vault that start with `prefix`.
#[tauri::command]
fn autocomplete_tags(prefix: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock is poisoned".to_string())?;

    let mut tags: std::collections::HashSet<String> = vault
        .graph
        .metadata_cache
        .values()
        .flat_map(|meta| meta.tags.iter().cloned())
        .filter(|tag| tag.to_lowercase().starts_with(&prefix.to_lowercase()))
        .collect();

    let mut out: Vec<String> = tags.drain().collect();
    out.sort();
    Ok(out)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            index_vault,
            open_file,
            save_file,
            get_backlinks,
            autocomplete_links,
            autocomplete_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
