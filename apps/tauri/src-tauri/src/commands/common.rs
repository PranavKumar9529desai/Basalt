//! Shared filesystem + index helpers for the file-management command modules.
//!
//! Every app-initiated filesystem mutation goes through the same contract:
//!   1. Register self-write markers BEFORE touching disk — the watcher
//!      consumes them and stays silent.
//!   2. Update the vault cache directly.
//!   3. Update the search index directly (in-memory; commit policy is owned
//!      by the search layer) — the watcher no longer does it for us.
//!   4. Emit NOTHING: the frontend initiated the operation and refreshes its
//!      own tree. `vault://file-changed` means "changed by something OTHER
//!      than the app".

use std::path::{Path, PathBuf};

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

pub(super) fn register_self_writes(state: &AppState, paths: &[PathBuf]) {
    if let Ok(mut guard) = state.self_writes.lock() {
        for p in paths {
            guard.insert(p.clone());
        }
    }
}

pub(super) fn index_upsert(state: &AppState, path_str: &str, content: &str) {
    if let Ok(mut guard) = state.search.write() {
        if let Some(ref mut search) = *guard {
            let tags = extract_inline_tags(content);
            let _ = search.update_document(path_str, content, &tags);
            let _ = search.flush_if_due();
        }
    }
}

pub(super) fn index_remove(state: &AppState, path_str: &str) {
    if let Ok(mut guard) = state.search.write() {
        if let Some(ref mut search) = *guard {
            let _ = search.remove_document(path_str);
            let _ = search.flush_if_due();
        }
    }
}

pub(super) fn canonical_md_path(path: &str) -> std::io::Result<std::path::PathBuf> {
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "only .md files are supported",
        ));
    }
    p.canonicalize()
}

/// Extract inline tags (#tag) from content for the search index tags field.
fn extract_inline_tags(content: &str) -> String {
    content
        .split_whitespace()
        .filter(|w| w.starts_with('#') && w.len() > 1)
        .map(|w| w.trim_start_matches('#'))
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn canonical_vault_path(state: &AppState) -> AppResult<PathBuf> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;
    Path::new(&vault_path_str)
        .canonicalize()
        .map_err(AppError::InvalidVaultPath)
}

pub(super) fn ensure_inside_vault(path: &Path, vault_root: &Path) -> AppResult<()> {
    if path.starts_with(vault_root) {
        Ok(())
    } else {
        Err(AppError::Validation(
            "path is outside the current vault".to_string(),
        ))
    }
}

pub(super) fn prune_nested_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
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

/// Strip the extension from an asset path for use as an embed target.
/// `"_attachments/foo/image.png"` → `"_attachments/foo/image"`.
pub(super) fn strip_asset_ext(p: &std::path::Path) -> std::borrow::Cow<'_, str> {
    match p.file_stem() {
        Some(stem) => {
            let parent = p.parent().unwrap_or(std::path::Path::new(""));
            if parent.as_os_str().is_empty() {
                std::borrow::Cow::Owned(stem.to_string_lossy().to_string())
            } else {
                std::borrow::Cow::Owned(format!("{}/{}", parent.display(), stem.to_string_lossy()))
            }
        }
        None => p.to_string_lossy(),
    }
}

/// Validate a user-supplied name (stem or path segment): trimmed, non-empty,
/// not `.`/`..`, and free of path separators.
pub(super) fn validate_name(raw: &str) -> AppResult<String> {
    let name = raw.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("name cannot be empty".to_string()));
    }
    if name == "." || name == ".." {
        return Err(AppError::Validation("invalid name".to_string()));
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(AppError::Validation(
            "name must not contain '/' or '\\' characters".to_string(),
        ));
    }
    Ok(name)
}

/// Canonicalize a creation-parent folder (or the vault root), rejecting
/// traversal: `..` components in a not-yet-existing path, and any resolved
/// path that escapes the vault.
pub(super) fn resolve_parent_dir(vault_root: &Path, parent: Option<&str>) -> AppResult<PathBuf> {
    match parent {
        Some(rel) if !rel.is_empty() => {
            let candidate = vault_root.join(rel);
            if candidate.exists() {
                let canonical = candidate
                    .canonicalize()
                    .map_err(|e| AppError::Io(format!("invalid parent path: {e}")))?;
                ensure_inside_vault(&canonical, vault_root)?;
                Ok(canonical)
            } else {
                if rel.split(['/', '\\']).any(|c| c == "..") {
                    return Err(AppError::Validation(
                        "parent path must not contain '..'".to_string(),
                    ));
                }
                Ok(candidate)
            }
        }
        _ => Ok(vault_root.to_path_buf()),
    }
}

/// Write a new Markdown file and update every index (self-write marker, vault
/// cache, search) in the canonical order all creation commands use.
///
/// `parent_dir` must already be resolved and inside the vault — use
/// [`resolve_parent_dir`]. The `name` may contain `/` segments to create
/// nested folders (e.g. a date format like `2026/March/2026-Mar-08`).
/// Returns the canonical absolute path and the display name (stem).
pub(super) fn write_markdown_note(
    state: &AppState,
    parent_dir: &Path,
    name: &str,
    content: &str,
) -> AppResult<(PathBuf, String)> {
    let (target_dir, file_path, file_name) =
        basalt_vault::path_utils::resolve_creation_path(parent_dir, None, name, false)?;

    if file_path.exists() {
        return Err(AppError::Validation(format!("'{name}' already exists")));
    }

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| AppError::Io(format!("failed to create directory: {e}")))?;
    }

    // Choke point: marker BEFORE the write. `file_path` is built from the
    // canonical vault root, so it matches the path the watcher reports.
    register_self_writes(state, std::slice::from_ref(&file_path));

    if let Err(e) = std::fs::write(&file_path, content) {
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
        vault.add_document(&abs_path, content);
    }
    index_upsert(state, &abs_path, content);

    let clean_name = file_name.trim_end_matches(".md").to_string();
    Ok((PathBuf::from(abs_path), clean_name))
}
