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

pub(super) fn canonical_vault_path(state: &AppState) -> Result<PathBuf, String> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "no vault configured".to_string())?;
    Path::new(&vault_path_str)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))
}

pub(super) fn ensure_inside_vault(path: &Path, vault_root: &Path) -> Result<(), String> {
    if path.starts_with(vault_root) {
        Ok(())
    } else {
        Err("path is outside the current vault".to_string())
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
                std::borrow::Cow::Owned(
                    format!("{}/{}", parent.display(), stem.to_string_lossy()),
                )
            }
        }
        None => p.to_string_lossy(),
    }
}

/// Validate a user-supplied name (stem or path segment): trimmed, non-empty,
/// not `.`/`..`, and free of path separators.
pub(super) fn validate_name(raw: &str) -> Result<String, String> {
    let name = raw.trim().to_string();
    if name.is_empty() {
        return Err("name cannot be empty".to_string());
    }
    if name == "." || name == ".." {
        return Err("invalid name".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("name must not contain '/' or '\\' characters".to_string());
    }
    Ok(name)
}

