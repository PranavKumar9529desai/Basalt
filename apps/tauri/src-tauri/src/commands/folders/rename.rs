//! Rename folders and attachments: `rename_path` (with wikilink path
//! rewriting).

use std::path::{Path, PathBuf};

use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{
    canonical_vault_path, ensure_inside_vault, index_remove, index_upsert, register_self_writes,
    rel_prefix, resolve_rename_target_name,
};
use super::RenamePathResult;
use basalt_parser::{rewrite_wikilinks_path, PathRename};

#[path = "move_rename_tests.rs"]
#[cfg(test)]
mod tests;

/// Rename a folder or attachment (non-`.md`) in place (same parent) and keep
/// the vault consistent with itself. Notes must use [`rename_note`]; this
/// path exists for the tree's "Rename" on folders and non-note files.
///
/// Follows the write choke point contract (see the module header):
///   1. Self-write markers for the item, its new path, and every descendant
///      (both sides) BEFORE touching disk.
///   2. `fs::rename`; for folders, wikilinks pointing inside the old folder
///      are rewritten across the vault (content-diffed, only changed files
///      written back).
///   3. Vault cache + search index follow every moved document.
///   4. Emits NOTHING — the frontend refreshes its own tree.
#[tauri::command]
pub fn rename_path(
    path: String,
    new_name: String,
    state: State<AppState>,
) -> AppResult<RenamePathResult> {
    rename_path_impl(&path, &new_name, &state)
}

/// Testable core of [`rename_path`] — see the wrapper for the contract.
fn rename_path_impl(path: &str, new_name: &str, state: &AppState) -> AppResult<RenamePathResult> {
    let vault_root = canonical_vault_path(state)?;

    let old_abs = Path::new(path)
        .canonicalize()
        .map_err(|e| AppError::Io(format!("invalid path '{path}': {e}")))?;
    ensure_inside_vault(&old_abs, &vault_root)?;
    if !old_abs.exists() {
        return Err(AppError::Validation(format!(
            "path does not exist: {}",
            old_abs.display()
        )));
    }

    let is_folder = old_abs.is_dir();
    let old_name = old_abs
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Validation("invalid path name".to_string()))?;

    // Notes are renamed via rename_note (wikilink rewrite by stem). Guard the
    // generic entry so an accidental call never silently skips link rewriting.
    if !is_folder && old_name.to_ascii_lowercase().ends_with(".md") {
        return Err(AppError::Validation(
            "notes must be renamed with rename_note".to_string(),
        ));
    }

    let target = resolve_rename_target_name(old_name, new_name, is_folder)?;
    let parent = old_abs
        .parent()
        .ok_or_else(|| AppError::Validation("invalid parent directory".to_string()))?;
    let new_abs = parent.join(&target);

    if new_abs == old_abs {
        return Err(AppError::Validation(
            "the item already has that name".to_string(),
        ));
    }
    if new_abs.exists() {
        return Err(AppError::Validation(format!(
            "an item named '{target}' already exists"
        )));
    }

    let old_str = old_abs.to_string_lossy().to_string();
    let new_str = new_abs.to_string_lossy().to_string();

    // Every moved `.md` document (old → new absolute pair).
    let mut descendants: Vec<(String, String)> = Vec::new();
    if is_folder {
        let prefix = format!("{old_str}/");
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        for p in vault.paths_under(&old_str) {
            let suffix = p.trim_start_matches(&prefix).to_string();
            descendants.push((p, format!("{new_str}/{suffix}")));
        }
    }

    // 1. Self-writes BEFORE disk: the item, its new path, and both sides of
    //    every descendant transition.
    let mut self_write_paths: Vec<PathBuf> = vec![old_abs.clone(), new_abs.clone()];
    for (old_d, new_d) in &descendants {
        self_write_paths.push(PathBuf::from(old_d));
        self_write_paths.push(PathBuf::from(new_d));
    }
    register_self_writes(state, &self_write_paths);

    // 2. Move the item.
    std::fs::rename(&old_abs, &new_abs)
        .map_err(|e| AppError::Io(format!("failed to rename '{}': {e}", old_abs.display())))?;

    if !is_folder {
        return Ok(RenamePathResult {
            path: new_str,
            name: target,
            moved: Vec::new(),
            updated_files: Vec::new(),
        });
    }

    // 3. Folder: find every note (anywhere) whose wikilinks point inside the
    //    old folder, then rewrite them at their (possibly new) on-disk path.
    let path_rename = PathRename::new(
        &rel_prefix(&old_abs, &vault_root),
        &rel_prefix(&new_abs, &vault_root),
    );
    let mut candidates: Vec<String> = Vec::new();
    {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        for p in vault.note_paths() {
            if !p.ends_with(".md") {
                continue;
            }
            let has_link = vault
                .metadata(&p)
                .map(|meta| meta.links.iter().any(|t| path_rename.matches(t)))
                .unwrap_or(false);
            if has_link {
                candidates.push(p);
            }
        }
    }

    let mut updated_files: Vec<String> = Vec::new();
    let mut rewritten: Vec<(String, String)> = Vec::new();
    for c in &candidates {
        // A candidate that moved is read/rewritten at its NEW path.
        let disk = descendants
            .iter()
            .find(|(old_d, _)| old_d == c)
            .map(|(_, new_d)| new_d.clone())
            .unwrap_or_else(|| c.clone());
        let Ok(content) = std::fs::read_to_string(&disk) else {
            continue;
        };
        let next = rewrite_wikilinks_path(&content, &path_rename);
        if next != content {
            std::fs::write(&disk, &next)
                .map_err(|e| AppError::Io(format!("failed to update '{disk}': {e}")))?;
            updated_files.push(disk.clone());
            rewritten.push((disk, next));
        }
    }

    // 4. Cache: drop every old document, re-add at its new path. Content for
    //    rewritten candidates comes from the rewrite pass; everything else is
    //    read fresh (moved members unchanged by a rewrite).
    let mut contents: Vec<(String, String, String)> = Vec::new();
    for (old_d, new_d) in &descendants {
        let content = if let Some((_, next)) = rewritten.iter().find(|(p, _)| p == new_d) {
            next.clone()
        } else {
            std::fs::read_to_string(new_d).unwrap_or_default()
        };
        contents.push((old_d.clone(), new_d.clone(), content));
    }
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;
        for (old_d, _, _) in &contents {
            vault.remove_document(old_d);
        }
        for (_, new_d, content) in &contents {
            vault.add_document(new_d, content);
        }
    }

    // 5. Search index follows every moved document.
    for (old_d, new_d, content) in &contents {
        index_remove(state, old_d);
        index_upsert(state, new_d, content);
    }

    Ok(RenamePathResult {
        path: new_str,
        name: target,
        moved: descendants,
        updated_files,
    })
}
