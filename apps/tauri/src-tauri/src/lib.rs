use std::path::{Path, PathBuf};
use std::sync::RwLock;

use basalt_fs::{indexer::index_directory, Vault};
use serde::Serialize;
use tauri::State;

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

#[derive(Default)]
struct AppState {
    vault: RwLock<Option<Vault>>,
}

#[derive(Serialize)]
struct VaultSummary {
    count: usize,
}

#[derive(Serialize)]
struct LinkSuggestion {
    name: String,
    path: String,
}

#[tauri::command]
fn index_vault(path: String, state: State<AppState>) -> Result<VaultSummary, String> {
    let root = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))?;
    if !root.is_dir() {
        return Err("vault path is not a directory".into());
    }

    let vault = index_directory(&root);
    let count = vault.graph.metadata_cache.len();

    let mut guard = state
        .vault
        .write()
        .map_err(|_| "vault state is poisoned".to_string())?;
    *guard = Some(vault);

    Ok(VaultSummary { count })
}

#[tauri::command]
fn open_file(path: String) -> Result<String, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::write(&abs, content).map_err(|e| e.to_string())?;

    let mut guard = state
        .vault
        .write()
        .map_err(|_| "vault state is poisoned".to_string())?;
    let vault = guard.get_or_insert_with(Vault::new);

    // Re-index just this file
    if let Ok(text) = std::fs::read_to_string(&abs) {
        if let Some(path_str) = abs.to_str() {
            vault.add_document(path_str, &text);
        }
    }
    Ok(())
}

#[tauri::command]
fn get_backlinks(path: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;

    let guard = state
        .vault
        .read()
        .map_err(|_| "vault state is poisoned".to_string())?;
    let vault = guard
        .as_ref()
        .ok_or_else(|| "vault not indexed yet".to_string())?;

    let Some(doc_id) = vault.arena.get_id(abs.to_str().unwrap_or_default()) else {
        return Ok(Vec::new());
    };

    let Some(backlinks) = vault.graph.get_back_links(doc_id) else {
        return Ok(Vec::new());
    };

    let mut results = Vec::new();
    for id in backlinks {
        if let Some(p) = vault.arena.get_string(*id) {
            results.push(p.clone());
        }
    }
    Ok(results)
}

#[tauri::command]
fn autocomplete_links(
    prefix: String,
    state: State<AppState>,
) -> Result<Vec<LinkSuggestion>, String> {
    let guard = state
        .vault
        .read()
        .map_err(|_| "vault state is poisoned".to_string())?;
    let vault = guard
        .as_ref()
        .ok_or_else(|| "vault not indexed yet".to_string())?;

    let mut out = Vec::new();
    for path_str in vault.arena.all_strings() {
        if !path_str.ends_with(".md") {
            continue;
        }
        if let Some(name) = Path::new(path_str).file_name().and_then(|n| n.to_str()) {
            if name.starts_with(&prefix) {
                out.push(LinkSuggestion {
                    name: name.to_string(),
                    path: path_str.to_string(),
                });
            }
        }
    }
    Ok(out)
}

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
            autocomplete_links
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
