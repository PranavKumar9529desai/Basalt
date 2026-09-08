//! Note lifecycle commands: create, rename (with wikilink rewriting), backlinks,
//! and autocomplete.

use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{canonical_md_path, resolve_parent_dir, write_markdown_note};
use basalt_vault::path_utils::resolve_creation_path;
use basalt_vault::BacklinkContext;
mod rename;
mod rename_attachments;
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


/// Return the notes that link to `path` with the concrete mention lines
/// (line number + excerpt) inside each one. Resolution matches Obsidian: bare
/// name, vault-relative path, `.md` variants, arbitrary casing, and declared
/// aliases all count.
#[tauri::command]
pub fn get_backlinks(path: String, state: State<AppState>) -> AppResult<Vec<BacklinkContext>> {
    let abs = canonical_md_path(&path)?;
    let abs_str = abs.to_str().unwrap_or_default();

    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

    Ok(vault.backlink_contexts(abs_str))
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
pub struct TagCount {
    /// Tag name as written in notes (no leading `#`).
    pub tag: String,
    /// Number of notes carrying this tag.
    pub count: u64,
}

/// Every tag in the vault with its note count, sorted by count descending
/// then name — feeds the Tags pane.
#[tauri::command]
pub fn get_tag_counts(state: State<AppState>) -> AppResult<Vec<TagCount>> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

    Ok(vault
        .tag_counts()
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect())
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

    let vault_root = Path::new(&vault_path_str)
        .canonicalize()
        .map_err(AppError::InvalidVaultPath)?;

    let parent_dir = resolve_parent_dir(&vault_root, parent.as_deref())?;
    let (abs_path, clean_name) = write_markdown_note(&state, &parent_dir, &name, "")?;

    Ok(CreateNoteResult {
        path: abs_path.to_string_lossy().to_string(),
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

    let parent_dir = resolve_parent_dir(&vault_root, parent.as_deref())?;

    for i in 0u32..=99 {
        let name = if i == 0 {
            "Untitled".to_string()
        } else {
            format!("Untitled {i}")
        };

        let (_, file_path, _) = resolve_creation_path(&parent_dir, None, &name, false)?;
        if file_path.exists() {
            continue;
        }

        let (abs_path, clean_name) = write_markdown_note(&state, &parent_dir, &name, "")?;
        return Ok(CreateNoteResult {
            path: abs_path.to_string_lossy().to_string(),
            name: clean_name,
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
