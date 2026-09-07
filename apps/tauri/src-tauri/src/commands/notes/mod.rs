//! Note lifecycle commands: create, rename (with wikilink rewriting), backlinks,
//! and autocomplete.

use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{canonical_md_path, ensure_inside_vault, index_upsert, register_self_writes};
use basalt_vault::path_utils::resolve_creation_path;

mod rename;
pub use rename::rename_note;

/// Result of renaming a note.
#[derive(Debug, Serialize)]
pub struct RenameNoteResult {
    /// Absolute path of the renamed file.
    pub path: String,
    /// Display name (filename without extension).
    pub name: String,
    /// Absolute paths of other notes whose wikilinks were rewritten.
    pub updated_files: Vec<String>,
}

/// Return the paths of all notes that link to the given file.
#[tauri::command]
pub fn get_backlinks(path: String, state: State<AppState>) -> AppResult<Vec<String>> {
    let abs = canonical_md_path(&path)?;

    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

    Ok(vault.backlinks_for(abs.to_str().unwrap_or_default()))
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
) -> AppResult<Vec<LinkSuggestion>> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

    let out = vault
        .note_paths()
        .into_iter()
        .filter(|p| p.ends_with(".md"))
        .filter_map(|path_str| {
            let name = Path::new(&path_str).file_name()?.to_str()?;
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
pub fn autocomplete_tags(prefix: String, state: State<AppState>) -> AppResult<Vec<String>> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

    let prefix_lower = prefix.to_lowercase();
    let mut out: Vec<String> = vault
        .all_tags()
        .into_iter()
        .filter(|tag| tag.to_lowercase().starts_with(&prefix_lower))
        .collect();

    out.sort();
    Ok(out)
}

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
) -> AppResult<CreateNoteResult> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault_path = Path::new(&vault_path_str);

    let (target_dir, file_path, file_name) =
        resolve_creation_path(vault_path, parent.as_deref(), &name, false)?;

    if file_path.exists() {
        return Err(AppError::Validation(format!("'{name}' already exists")));
    }

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| AppError::Io(format!("failed to create directory: {e}")))?;
    }

    let content = String::new();

    // Choke point: marker BEFORE the write. `file_path` is built from the
    // canonical vault root, so it matches the path the watcher reports.
    register_self_writes(&state, std::slice::from_ref(&file_path));

    if let Err(e) = std::fs::write(&file_path, &content) {
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&file_path);
        }
        return Err(AppError::Io(format!("failed to write file: {e}")));
    }

    let abs_path = file_path
        .canonicalize()
        .map_err(|e| AppError::Io(format!("canonicalize failed: {e}")))?
        .to_string_lossy()
        .to_string();

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        vault.add_document(&abs_path, &content);
    }
    index_upsert(&state, &abs_path, &content);

    let clean_name = file_name.trim_end_matches(".md").to_string();

    Ok(CreateNoteResult {
        path: abs_path,
        name: clean_name,
    })
}

#[tauri::command]
pub fn create_untitled_note(
    parent: Option<String>,
    state: State<AppState>,
) -> AppResult<CreateNoteResult> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault_root = Path::new(&vault_path_str)
        .canonicalize()
        .map_err(AppError::InvalidVaultPath)?;

    let parent_dir = match parent.as_deref() {
        Some(rel) if !rel.is_empty() => {
            let candidate = vault_root.join(rel);
            // Reject traversal attempts: canonicalize only if the dir exists,
            // otherwise check that no component is "..".
            if candidate.exists() {
                let canonical = candidate
                    .canonicalize()
                    .map_err(|e| AppError::Io(format!("invalid parent path: {e}")))?;
                ensure_inside_vault(&canonical, &vault_root)?;
                canonical
            } else {
                // Dir doesn't exist yet (will be created). Reject ".." components.
                if rel.split('/').any(|c| c == "..") {
                    return Err(AppError::Validation(
                        "parent path must not contain '..'".to_string(),
                    ));
                }
                candidate
            }
        }
        _ => vault_root.clone(),
    };

    for i in 0u32..=99 {
        let name = if i == 0 {
            "Untitled".to_string()
        } else {
            format!("Untitled {i}")
        };

        let file_path = parent_dir.join(format!("{name}.md"));
        if file_path.exists() {
            continue;
        }

        // Create parent directory if needed (e.g. the parent folder was just created).
        if !parent_dir.exists() {
            std::fs::create_dir_all(&parent_dir)
                .map_err(|e| AppError::Io(format!("failed to create directory: {e}")))?;
        }

        let content = String::new();

        register_self_writes(&state, std::slice::from_ref(&file_path));
        if let Err(e) = std::fs::write(&file_path, &content) {
            if let Ok(mut guard) = state.self_writes.lock() {
                guard.remove(&file_path);
            }
            return Err(AppError::Io(format!("failed to write file: {e}")));
        }

        let abs_path = file_path
            .canonicalize()
            .map_err(|e| AppError::Io(format!("canonicalize failed: {e}")))?
            .to_string_lossy()
            .to_string();

        {
            let mut vault = state
                .vault
                .write()
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            vault.add_document(&abs_path, &content);
        }
        index_upsert(&state, &abs_path, &content);

        return Ok(CreateNoteResult {
            path: abs_path,
            name,
        });
    }

    Err(AppError::Other(
        "too many untitled notes (Untitled through Untitled 99 all exist)".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use basalt_vault::path_utils::resolve_creation_path;
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
    #[test]
    fn test_untitled_name_sequence() {
        // Verify the name generation logic in isolation.
        // "Untitled" is index 0, "Untitled 1" is index 1, etc.
        let name_for = |i: u32| -> String {
            if i == 0 {
                "Untitled".to_string()
            } else {
                format!("Untitled {i}")
            }
        };

        assert_eq!(name_for(0), "Untitled");
        assert_eq!(name_for(1), "Untitled 1");
        assert_eq!(name_for(99), "Untitled 99");
    }
}
