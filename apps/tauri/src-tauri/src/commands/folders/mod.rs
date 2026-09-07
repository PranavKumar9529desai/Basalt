//! Folder lifecycle commands: create, delete, move, and rename (with wikilink
//! path rewriting).

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{
    canonical_vault_path, ensure_inside_vault, index_remove, prune_nested_paths,
    register_self_writes,
};
use basalt_vault::path_utils::resolve_creation_path;

mod common;
#[path = "move.rs"]
mod mv;
mod rename;
pub use mv::move_paths;
pub use rename::rename_path;

/// Result of renaming a folder or attachment. The `.moved` pairs cover every
/// document that relocated, so the frontend can repoint any open tab tracking
/// a moved note (tabs are keyed by path for this purpose).
#[derive(Debug, Serialize)]
pub struct RenamePathResult {
    /// Absolute path of the renamed file/folder.
    pub path: String,
    /// New file/folder name (extension preserved for files).
    pub name: String,
    /// Absolute path pairs (old → new) of every `.md` document the rename
    /// moved. Empty for attachment (non-`.md`) renames.
    pub moved: Vec<(String, String)>,
    /// Absolute paths of notes whose wikilinks were rewritten.
    pub updated_files: Vec<String>,
}

#[tauri::command]
pub fn create_folder(
    name: String,
    parent: Option<String>, // relative folder path inside vault
    state: State<AppState>,
) -> AppResult<String> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault_path = Path::new(&vault_path_str);

    let (_, folder_path, _) = resolve_creation_path(vault_path, parent.as_deref(), &name, true)?;

    if folder_path.exists() {
        let clean_name = name.trim();
        let components: Vec<&str> = clean_name
            .split(['/', '\\'])
            .filter(|s| !s.is_empty())
            .collect();
        let last = components.last().unwrap_or(&clean_name);
        return Err(AppError::Validation(format!("'{last}' already exists")));
    }

    // Choke point: suppress the watcher's mkdir event; the frontend refreshes
    // its own tree after this call returns.
    register_self_writes(&state, std::slice::from_ref(&folder_path));
    std::fs::create_dir_all(&folder_path)
        .map_err(|e| AppError::Io(format!("failed to create folder: {e}")))?;

    Ok(folder_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_file(path: String, state: State<AppState>) -> AppResult<()> {
    apply_delete_paths(vec![path], state)
}

fn apply_delete_paths(raw_paths: Vec<String>, state: State<AppState>) -> AppResult<()> {
    if raw_paths.is_empty() {
        return Err(AppError::Validation("no paths provided".to_string()));
    }

    let vault_root = canonical_vault_path(&state)?;

    let mut canonical: Vec<PathBuf> = Vec::new();
    for raw in raw_paths {
        let abs = Path::new(&raw)
            .canonicalize()
            .map_err(|e| AppError::Io(format!("invalid path '{raw}': {e}")))?;
        ensure_inside_vault(&abs, &vault_root)?;
        if !abs.exists() {
            return Err(AppError::Validation(format!(
                "path does not exist: {}",
                abs.display()
            )));
        }
        canonical.push(abs);
    }

    let targets = prune_nested_paths(canonical);

    // Choke point: enumerate every affected path (files + cached dir
    // descendants) and register markers BEFORE deleting, so the watcher's
    // per-file delete events are all suppressed.
    let mut self_write_paths: Vec<PathBuf> = Vec::new();
    let mut deleted_md_paths: Vec<String> = Vec::new();
    {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        for abs in &targets {
            self_write_paths.push(abs.clone());
            if abs.is_dir() {
                let abs_str = abs.to_string_lossy().to_string();
                for p in vault.paths_under(&abs_str) {
                    self_write_paths.push(PathBuf::from(&p));
                    if p.ends_with(".md") {
                        deleted_md_paths.push(p);
                    }
                }
            } else if abs.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(p) = abs.to_str() {
                    deleted_md_paths.push(p.to_string());
                }
            }
        }
    }
    register_self_writes(&state, &self_write_paths);

    let mut delete_order = targets.clone();
    delete_order.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for abs in &delete_order {
        if abs.is_dir() {
            std::fs::remove_dir_all(abs)
                .map_err(|e| AppError::Io(format!("failed to delete directory: {e}")))?;
        } else {
            std::fs::remove_file(abs)
                .map_err(|e| AppError::Io(format!("failed to delete file: {e}")))?;
        }
    }

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;

        for abs in &targets {
            if abs.is_dir() {
                let abs_str = abs.to_string_lossy().to_string();
                let to_remove: Vec<String> = vault.paths_under(&abs_str);
                for path in to_remove {
                    vault.remove_document(&path);
                }
            } else {
                vault.remove_document(abs.to_str().unwrap_or_default());
            }
        }
    }

    // The watcher is suppressed for self-deletes — take over its index duty.
    for path in &deleted_md_paths {
        index_remove(&state, path);
    }

    Ok(())
}

#[tauri::command]
pub fn delete_paths(paths: Vec<String>, state: State<AppState>) -> AppResult<()> {
    apply_delete_paths(paths, state)
}

#[cfg(test)]
mod tests {
    use basalt_vault::path_utils::resolve_creation_path;
    #[test]
    fn test_valid_folder_creation() {
        let vault = std::path::PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "my_folder", true).unwrap();
        assert_eq!(dir, std::path::PathBuf::from("/vault"));
        assert_eq!(file, std::path::PathBuf::from("/vault/my_folder"));
        assert_eq!(name, "my_folder");
    }

    #[test]
    fn test_valid_nested_folder() {
        let vault = std::path::PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "a/b/c", true).unwrap();
        assert_eq!(dir, std::path::PathBuf::from("/vault/a/b"));
        assert_eq!(file, std::path::PathBuf::from("/vault/a/b/c"));
        assert_eq!(name, "c");
    }

    #[test]
    fn test_respects_parent_dir() {
        let vault = std::path::PathBuf::from("/vault");
        let (dir, file, name) =
            resolve_creation_path(&vault, Some("parent"), "child", false).unwrap();
        assert_eq!(dir, std::path::PathBuf::from("/vault/parent"));
        assert_eq!(file, std::path::PathBuf::from("/vault/parent/child.md"));
        assert_eq!(name, "child.md");
    }
    #[test]
    fn test_rejects_empty_name() {
        let vault = std::path::PathBuf::from("/vault");
        assert!(resolve_creation_path(&vault, None, "   ", false).is_err());
        assert!(resolve_creation_path(&vault, None, "///", false).is_err());
    }

    #[test]
    fn test_rejects_invalid_chars() {
        let vault = std::path::PathBuf::from("/vault");
        assert!(resolve_creation_path(&vault, None, "foo*bar", false).is_err());
        assert!(resolve_creation_path(&vault, None, "foo/bar?baz", false).is_err());
    }

    #[test]
    fn test_rejects_too_deep() {
        let vault = std::path::PathBuf::from("/vault");
        assert!(resolve_creation_path(&vault, None, "1/2/3/4/5/6/7/8/9/10/11", false).is_err());
        assert!(resolve_creation_path(&vault, None, "1/2/3/4/5/6/7/8/9/10", false).is_ok());
    }

    #[test]
    fn test_rejects_long_components() {
        let vault = std::path::PathBuf::from("/vault");
        let long_name = "a".repeat(256);
        assert!(resolve_creation_path(&vault, None, &long_name, false).is_err());

        let valid_deep = "a".repeat(255);
        assert!(resolve_creation_path(&vault, None, &valid_deep, false).is_ok());
    }
}
