use std::path::{Path, PathBuf};

use basalt_fs::path_utils::resolve_creation_path;
use serde::Serialize;
use tauri::Emitter;
use tauri::State;

use crate::app_state::AppState;
use crate::config::load_config;
use crate::watcher::FileChangeEvent;

fn canonical_md_path(path: &str) -> std::io::Result<std::path::PathBuf> {
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "only .md files are supported",
        ));
    }
    p.canonicalize()
}

/// Read a markdown file from disk.
#[tauri::command]
pub fn open_file(path: String) -> Result<String, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}

/// Write content to a markdown file and re-index it in the vault.
#[tauri::command]
pub fn save_file(
    path: String,
    content: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::write(&abs, &content).map_err(|e| e.to_string())?;

    let mut vault = state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())?;

    if let Some(path_str) = abs.to_str() {
        vault.add_document(path_str, &content);
    }

    let _ = app.emit(
        "vault://file-changed",
        FileChangeEvent {
            path: abs.to_string_lossy().to_string(),
            kind: "modified".into(),
        },
    );

    Ok(())
}

/// Return the paths of all notes that link to the given file.
#[tauri::command]
pub fn get_backlinks(path: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

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

#[derive(Serialize)]
pub struct LinkSuggestion {
    pub name: String,
    pub path: String,
}

/// Return note names and paths whose filename starts with `prefix`.
#[tauri::command]
pub fn autocomplete_links(
    prefix: String,
    state: State<AppState>,
) -> Result<Vec<LinkSuggestion>, String> {
    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

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
pub fn autocomplete_tags(prefix: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

    let mut out: Vec<String> = vault
        .graph
        .metadata_cache
        .values()
        .flat_map(|meta| meta.tags.iter().cloned())
        .filter(|tag| tag.to_lowercase().starts_with(&prefix.to_lowercase()))
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    out.sort();
    Ok(out)
}

/// File creation result payload.
#[derive(Serialize)]
pub struct CreateNoteResult {
    /// Absolute path of the newly created file.
    pub path: String,
    /// Display name (filename without extension).
    pub name: String,
}

#[tauri::command]
pub fn create_note(
    name: String,
    parent: Option<String>, // relative folder path inside vault, e.g. "Daily Journal"
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<CreateNoteResult, String> {
    let config = load_config(&app);
    let vault_path_str = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault_path = Path::new(&vault_path_str);

    let (target_dir, file_path, file_name) =
        resolve_creation_path(vault_path, parent.as_deref(), &name, false)?;

    if file_path.exists() {
        return Err(format!("'{name}' already exists"));
    }

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("failed to create directory: {e}"))?;
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let content = format!(
        "---\ntype: note\ntopic:\nstatus: inbox\ncreated: {today}\nupdated: {today}\ntags: []\naliases: []\n---\n\n"
    );

    std::fs::write(&file_path, &content).map_err(|e| format!("failed to write file: {e}"))?;

    let abs_path = file_path
        .canonicalize()
        .map_err(|e| format!("canonicalize failed: {e}"))?
        .to_string_lossy()
        .to_string();

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;
        vault.add_document(&abs_path, &content);
    }

    // Emit change so the frontend refreshes immediately.
    let _ = app.emit(
        "vault://file-changed",
        FileChangeEvent {
            path: abs_path.clone(),
            kind: "created".into(),
        },
    );

    let clean_name = file_name.trim_end_matches(".md").to_string();

    Ok(CreateNoteResult {
        path: abs_path,
        name: clean_name,
    })
}

#[tauri::command]
pub fn create_folder(
    name: String,
    parent: Option<String>, // relative folder path inside vault
    app: tauri::AppHandle,
) -> Result<String, String> {
    let config = load_config(&app);
    let vault_path_str = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault_path = Path::new(&vault_path_str);

    let (_, folder_path, _) = resolve_creation_path(vault_path, parent.as_deref(), &name, true)?;

    if folder_path.exists() {
        let clean_name = name.trim();
        let components: Vec<&str> = clean_name
            .split(|c| c == '/' || c == '\\')
            .filter(|s| !s.is_empty())
            .collect();
        let last = components.last().unwrap_or(&clean_name);
        return Err(format!("'{last}' already exists"));
    }

    std::fs::create_dir_all(&folder_path).map_err(|e| format!("failed to create folder: {e}"))?;

    // Emit change so the frontend refreshes immediately (watchers may miss mkdir).
    let _ = app.emit(
        "vault://file-changed",
        FileChangeEvent {
            path: folder_path.to_string_lossy().to_string(),
            kind: "created".into(),
        },
    );

    Ok(folder_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_file(path: String, state: State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    apply_delete_paths(vec![path], state, app)
}

fn canonical_vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config = load_config(app);
    let vault_path_str = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;
    Path::new(&vault_path_str)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))
}

fn ensure_inside_vault(path: &Path, vault_root: &Path) -> Result<(), String> {
    if path.starts_with(vault_root) {
        Ok(())
    } else {
        Err("path is outside the current vault".to_string())
    }
}

fn prune_nested_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut sorted = paths;
    sorted.sort_by_key(|p| p.components().count());

    let mut kept: Vec<PathBuf> = Vec::new();
    for path in sorted {
        let has_ancestor = kept.iter().any(|parent| path.starts_with(parent));
        if !has_ancestor {
            kept.push(path);
        }
    }
    kept
}

fn apply_delete_paths(
    raw_paths: Vec<String>,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if raw_paths.is_empty() {
        return Err("no paths provided".to_string());
    }

    let vault_root = canonical_vault_path(&app)?;

    let mut canonical: Vec<PathBuf> = Vec::new();
    for raw in raw_paths {
        let abs = Path::new(&raw)
            .canonicalize()
            .map_err(|e| format!("invalid path '{raw}': {e}"))?;
        ensure_inside_vault(&abs, &vault_root)?;
        if !abs.exists() {
            return Err(format!("path does not exist: {}", abs.display()));
        }
        canonical.push(abs);
    }

    let targets = prune_nested_paths(canonical);

    let mut delete_order = targets.clone();
    delete_order.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for abs in &delete_order {
        if abs.is_dir() {
            std::fs::remove_dir_all(abs).map_err(|e| format!("failed to delete directory: {e}"))?;
        } else {
            std::fs::remove_file(abs).map_err(|e| format!("failed to delete file: {e}"))?;
        }
    }

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;

        for abs in &targets {
            if abs.is_dir() {
                let abs_str = abs.to_string_lossy().to_string();
                let prefix = format!("{abs_str}/");
                let to_remove: Vec<String> = vault
                    .graph
                    .metadata_cache
                    .keys()
                    .filter_map(|id| vault.arena.get_string(*id).cloned())
                    .filter(|p| p == &abs_str || p.starts_with(&prefix))
                    .collect();
                for path in to_remove {
                    vault.remove_document(&path);
                }
            } else {
                vault.remove_document(abs.to_str().unwrap_or_default());
            }
        }
    }

    let _ = app.emit(
        "vault://file-changed",
        FileChangeEvent {
            path: vault_root.to_string_lossy().to_string(),
            kind: "modified".into(),
        },
    );

    Ok(())
}

#[tauri::command]
pub fn delete_paths(
    paths: Vec<String>,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    apply_delete_paths(paths, state, app)
}

#[tauri::command]
pub fn move_paths(
    source_paths: Vec<String>,
    destination_rel_path: Option<String>,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if source_paths.is_empty() {
        return Err("no source paths provided".to_string());
    }

    let vault_root = canonical_vault_path(&app)?;

    let destination_path = match destination_rel_path.as_deref() {
        Some(rel) if !rel.is_empty() => vault_root.join(rel),
        _ => vault_root.clone(),
    };

    if !destination_path.exists() {
        return Err("destination folder does not exist".to_string());
    }

    if !destination_path.is_dir() {
        return Err("destination must be a folder".to_string());
    }

    let destination_path = destination_path
        .canonicalize()
        .map_err(|e| format!("invalid destination: {e}"))?;
    ensure_inside_vault(&destination_path, &vault_root)?;

    let mut source_pairs: Vec<(PathBuf, PathBuf)> = Vec::new();
    for raw_source in &source_paths {
        let source = Path::new(raw_source)
            .canonicalize()
            .map_err(|e| format!("invalid source path '{raw_source}': {e}"))?;
        ensure_inside_vault(&source, &vault_root)?;

        if source == destination_path {
            return Err("cannot move an item into itself".to_string());
        }

        if source.is_dir() && destination_path.starts_with(&source) {
            return Err("cannot move a folder into itself or its descendant".to_string());
        }

        let Some(file_name) = source.file_name() else {
            return Err(format!("failed to resolve file name for '{raw_source}'"));
        };

        let destination_item = destination_path.join(file_name);
        if destination_item.exists() {
            return Err(format!(
                "destination already contains '{}'",
                file_name.to_string_lossy()
            ));
        }

        source_pairs.push((source, destination_item));
    }

    for (source, destination_item) in &source_pairs {
        std::fs::rename(source, destination_item)
            .map_err(|e| format!("failed to move '{}': {e}", source.display()))?;
    }

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;

        let updates: Vec<(String, String)> = source_pairs
            .iter()
            .map(|(src, dst)| {
                (
                    src.to_string_lossy().to_string(),
                    dst.to_string_lossy().to_string(),
                )
            })
            .collect();

        for (source_str, destination_str) in updates {
            if source_str.ends_with(".md") {
                vault.remove_document(&source_str);
                if let Ok(content) = std::fs::read_to_string(&destination_str) {
                    vault.add_document(&destination_str, &content);
                }
            } else {
                let prefix = format!("{source_str}/");
                let descendants: Vec<String> = vault
                    .graph
                    .metadata_cache
                    .keys()
                    .filter_map(|id| vault.arena.get_string(*id).cloned())
                    .filter(|p| p.starts_with(&prefix))
                    .collect();

                for old_path in descendants {
                    let suffix = old_path.trim_start_matches(&prefix);
                    let new_path = format!("{destination_str}/{suffix}");
                    vault.remove_document(&old_path);
                    if let Ok(content) = std::fs::read_to_string(&new_path) {
                        vault.add_document(&new_path, &content);
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "vault://file-changed",
        FileChangeEvent {
            path: destination_path.to_string_lossy().to_string(),
            kind: "modified".into(),
        },
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_note_creation_path() {
        let vault = std::path::PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "test", false).unwrap();
        assert_eq!(dir, std::path::PathBuf::from("/vault"));
        assert_eq!(file, std::path::PathBuf::from("/vault/test.md"));
        assert_eq!(name, "test.md");
    }

    #[test]
    fn test_valid_nested_note() {
        let vault = std::path::PathBuf::from("/vault");
        let (dir, file, name) = resolve_creation_path(&vault, None, "a/b/c", false).unwrap();
        assert_eq!(dir, std::path::PathBuf::from("/vault/a/b"));
        assert_eq!(file, std::path::PathBuf::from("/vault/a/b/c.md"));
        assert_eq!(name, "c.md");
    }

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
