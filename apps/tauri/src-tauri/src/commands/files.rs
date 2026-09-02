//! Read/write choke point for markdown files.  This is the WRITE CHOKE POINT
//! for editor autosaves (see `common` module header for the full contract).
//!
//! Heavy mutations (create, rename, delete, move, assets) live in sibling
//! modules: `notes`, `folders`, `assets`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;

use super::common::{canonical_md_path, index_upsert, register_self_writes};

/// Read a markdown file from disk.
#[tauri::command]
pub fn open_file(path: String) -> Result<String, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}

/// Write content to a markdown file and re-index it in the vault.
/// Save a markdown file — the WRITE CHOKE POINT for editor autosaves
/// (ADR-018 follow-up: single source of truth for file changes).
///
/// Contract:
///   - Registers the path as a SELF-WRITE before touching disk, so the OS
///     watcher consumes the marker and stays silent: no duplicate events,
///     no search reindex churn from the watcher path.
///   - Updates the vault cache and search index directly (the index update
///     is in-memory; commit policy is owned by the search layer).
///   - Emits NOTHING: the frontend initiated this write and already knows.
///     `vault://file-changed` therefore means "changed by something OTHER
///     than the app" — the contract graph view and plugins will rely on.
#[tauri::command]
pub fn save_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;

    // Register BEFORE the write so the watcher can never observe the file
    // in a written-but-unregistered state.
    if let Ok(mut guard) = state.self_writes.lock() {
        guard.insert(abs.clone());
    }

    if let Err(e) = std::fs::write(&abs, &content) {
        // Roll the marker back so a failed save doesn't swallow the next
        // genuine external event for this file.
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&abs);
        }
        return Err(e.to_string());
    }

    let mut vault = state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())?;

    if let Some(path_str) = abs.to_str() {
        vault.add_document(path_str, &content);
    }

    drop(vault);

    // Commit policy is owned by the search layer.
    if let Some(path_str) = abs.to_str() {
        index_upsert(&state, path_str, &content);
    }

    Ok(())
}

/// Read multiple markdown files from disk in a single IPC call.
/// Returns content + mtime for each file.
#[tauri::command]
pub fn open_files(paths: Vec<String>) -> Result<Vec<OpenFileResult>, String> {
    let mut results = Vec::with_capacity(paths.len());
    for p in paths {
        let abs = canonical_md_path(&p).map_err(|e| e.to_string())?;
        let content = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
        let mtime = std::fs::metadata(&abs)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        results.push(OpenFileResult {
            path: abs.to_string_lossy().to_string(),
            content,
            mtime_ms: mtime,
        });
    }
    Ok(results)
}

/// Write multiple markdown files to disk in a single IPC call.
/// Goes through the write choke point: self-write markers registered per
/// file before its write, cache + index updated directly, nothing emitted.
#[tauri::command]
pub fn save_files(files: Vec<SaveFileInput>, state: State<AppState>) -> Result<(), String> {
    let mut abs_paths: Vec<PathBuf> = Vec::new();
    for file in &files {
        let abs = canonical_md_path(&file.path).map_err(|e| e.to_string())?;
        // Register BEFORE the write so the watcher can never observe the file
        // in a written-but-unregistered state.
        register_self_writes(&state, &[abs.clone()]);
        if let Err(e) = std::fs::write(&abs, &file.content) {
            if let Ok(mut guard) = state.self_writes.lock() {
                guard.remove(&abs);
            }
            return Err(e.to_string());
        }
        abs_paths.push(abs);
    }

    // Single vault lock for all files.
    let mut vault = state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())?;
    for (file, abs) in files.iter().zip(&abs_paths) {
        if let Some(path_str) = abs.to_str() {
            vault.add_document(path_str, &file.content);
        }
    }
    drop(vault);

    for (file, abs) in files.iter().zip(&abs_paths) {
        if let Some(path_str) = abs.to_str() {
            index_upsert(&state, path_str, &file.content);
        }
    }

    Ok(())
}

#[derive(Serialize)]
pub struct OpenFileResult {
    pub path: String,
    pub content: String,
    pub mtime_ms: Option<u64>,
}

#[derive(Deserialize)]
pub struct SaveFileInput {
    pub path: String,
    pub content: String,
    pub expected_mtime_ms: Option<u64>,
}
