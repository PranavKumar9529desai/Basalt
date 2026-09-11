//! Move paths: `move_paths` (with vault cache + search index updates).

use std::path::{Path, PathBuf};

use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{
    canonical_vault_path, ensure_inside_vault, index_remove, index_upsert, register_self_writes,
};

#[tauri::command]
pub fn move_paths(
    source_paths: Vec<String>,
    destination_rel_path: Option<String>,
    state: State<AppState>,
) -> AppResult<()> {
    if source_paths.is_empty() {
        return Err(AppError::Validation("no source paths provided".to_string()));
    }

    let vault_root = canonical_vault_path(&state)?;

    let destination_path = match destination_rel_path.as_deref() {
        Some(rel) if !rel.is_empty() => vault_root.join(rel),
        _ => vault_root.clone(),
    };

    if !destination_path.exists() {
        return Err(AppError::Validation(
            "destination folder does not exist".to_string(),
        ));
    }

    if !destination_path.is_dir() {
        return Err(AppError::Validation(
            "destination must be a folder".to_string(),
        ));
    }

    let destination_path = destination_path
        .canonicalize()
        .map_err(|e| AppError::Io(format!("invalid destination: {e}")))?;
    ensure_inside_vault(&destination_path, &vault_root)?;

    let mut source_pairs: Vec<(PathBuf, PathBuf)> = Vec::new();
    for raw_source in &source_paths {
        let source = Path::new(raw_source)
            .canonicalize()
            .map_err(|e| AppError::Io(format!("invalid source path '{raw_source}': {e}")))?;
        ensure_inside_vault(&source, &vault_root)?;

        if source == destination_path {
            return Err(AppError::Validation(
                "cannot move an item into itself".to_string(),
            ));
        }

        if source.is_dir() && destination_path.starts_with(&source) {
            return Err(AppError::Validation(
                "cannot move a folder into itself or its descendant".to_string(),
            ));
        }

        let Some(file_name) = source.file_name() else {
            return Err(AppError::Validation(format!(
                "failed to resolve file name for '{raw_source}'"
            )));
        };

        let destination_item = destination_path.join(file_name);
        if destination_item.exists() {
            return Err(AppError::Validation(format!(
                "destination already contains '{}'",
                file_name.to_string_lossy()
            )));
        }

        source_pairs.push((source, destination_item));
    }

    // Choke point: register BOTH sides of every move (plus cached dir
    // descendants) BEFORE renaming so the watcher's create/remove events are
    // all suppressed. The vault cache still holds pre-move paths here.
    let mut self_write_paths: Vec<PathBuf> = Vec::new();
    for (source, destination_item) in &source_pairs {
        self_write_paths.push(source.clone());
        self_write_paths.push(destination_item.clone());
        if source.is_dir() {
            let prefix = format!("{}/", source.to_string_lossy());
            let vault = state
                .vault
                .read()
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            for old_path in vault.paths_under(&source.to_string_lossy()) {
                let suffix = old_path.trim_start_matches(&prefix).to_string();
                self_write_paths.push(PathBuf::from(&old_path));
                self_write_paths.push(destination_item.join(&suffix));
            }
        }
    }
    register_self_writes(&state, &self_write_paths);

    for (source, destination_item) in &source_pairs {
        std::fs::rename(source, destination_item)
            .map_err(|e| AppError::Io(format!("failed to move '{}': {e}", source.display())))?;
    }

    // Pre-read all file content outside the vault write lock.
    let updates: Vec<(String, String)> = source_pairs
        .iter()
        .map(|(src, dst)| {
            (
                src.to_string_lossy().to_string(),
                dst.to_string_lossy().to_string(),
            )
        })
        .collect();

    let mut file_ops: Vec<(String, String, Option<String>)> = Vec::new();
    for (source_str, destination_str) in &updates {
        if source_str.ends_with(".md") {
            let content = std::fs::read_to_string(destination_str).ok();
            file_ops.push((source_str.clone(), destination_str.clone(), content));
        } else {
            // Read vault under a shared read lock to find folder descendants.
            let prefix = format!("{source_str}/");
            let vault = state
                .vault
                .read()
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            let pairs: Vec<(String, String)> = vault
                .paths_under(source_str)
                .into_iter()
                .map(|old_path| {
                    let suffix = old_path.trim_start_matches(&prefix).to_string();
                    let new_path = format!("{destination_str}/{suffix}");
                    (old_path, new_path)
                })
                .collect();
            drop(vault);

            for (old_path, new_path) in pairs {
                let content = std::fs::read_to_string(&new_path).ok();
                file_ops.push((old_path, new_path, content));
            }
        }
    }

    // Single vault write lock — no disk I/O inside.
    let moved_md: Vec<(String, String, Option<String>)>;
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;

        for (source_str, destination_str, content) in &file_ops {
            vault.remove_document(source_str);
            if let Some(c) = content {
                vault.add_document(destination_str, c);
            }
        }
        moved_md = file_ops; // all file_ops entries are .md by construction
    }

    // The watcher is suppressed for self-moves — take over its index duty:
    // remove old paths, upsert moved content at new paths.
    for (source_str, destination_str, content) in &moved_md {
        index_remove(&state, source_str);
        if let Some(c) = content {
            index_upsert(&state, destination_str, c);
        }
    }

    Ok(())
}
