//! Note rename: file move and wikilink rewriting (attachment relocation lives in `rename_attachments`).

use std::path::PathBuf;

use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::RenameNoteResult;
use super::rename_attachments::rename_attachments_for_note;
use crate::commands::common::{
    canonical_md_path, canonical_vault_path, ensure_inside_vault, index_remove, index_upsert,
    register_self_writes, validate_name,
};
use basalt_parser::{rewrite_wikilinks, NoteRename};

/// Normalize and validate a user-supplied note name (a stem — no path).
/// Strips a trailing `.md`/`.markdown`, trims, and rejects directory
/// separators and empty/`.`/`..` names.
fn sanitize_name(raw: &str) -> AppResult<String> {
    let mut name = raw.trim().to_string();
    for ext in [".md", ".markdown"] {
        if name.len() > ext.len() && name.to_ascii_lowercase().ends_with(ext) {
            let cut = name.len() - ext.len();
            name.truncate(cut);
            break;
        }
    }
    validate_name(name.trim_end())
}

/// Rename a note in place (same folder) and keep the vault consistent with
/// itself: the note file moves, every other note that wikilinks it gets its
/// links rewritten, the graph + search index follow, and the watcher stays
/// silent for the whole operation.
///
/// Follows the write choke point contract (see the module header):
///   1. Self-write markers for old path, new path, and every candidate file
///      BEFORE touching disk.
///   2. Rewritten files are written directly (markers cover them).
///   3. Vault cache + search index updated directly.
///   4. Emits NOTHING — the frontend initiated this and refreshes its own
///      tree; `vault://file-changed` stays "external change only".
#[tauri::command]
pub fn rename_note(
    path: String,
    new_name: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<RenameNoteResult> {
    let config = crate::config::load_config(&app);
    rename_note_impl(&path, &new_name, &state, Some(&config.settings))
}

/// Testable core of [`rename_note`] — separated from the Tauri `State` wrapper
/// so a unit test can drive a real `AppState` over a temp vault.
/// `settings`: when `Some`, enables rename-with-note (moving assets on by_note org).
/// Tests pass `None` to use in-memory defaults.
fn rename_note_impl(
    path: &str,
    new_name: &str,
    state: &AppState,
    settings: Option<&std::collections::HashMap<String, serde_json::Value>>,
) -> AppResult<RenameNoteResult> {
    let vault_root = canonical_vault_path(state)?;

    let old_abs = canonical_md_path(path)?;
    ensure_inside_vault(&old_abs, &vault_root)?;
    if !old_abs.exists() {
        return Err(AppError::Validation(format!(
            "file does not exist: {}",
            old_abs.display()
        )));
    }

    let new_stem = sanitize_name(new_name)?;
    let old_stem = old_abs
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Validation("invalid old file name".to_string()))?;
    if new_stem.eq_ignore_ascii_case(old_stem) {
        return Err(AppError::Validation(
            "the note already has that name".to_string(),
        ));
    }

    let parent = old_abs
        .parent()
        .ok_or_else(|| AppError::Validation("invalid parent directory".to_string()))?;
    let new_abs = parent.join(format!("{new_stem}.md"));
    if new_abs.exists() {
        return Err(AppError::Validation(format!(
            "a note named '{new_stem}' already exists"
        )));
    }

    let rename = NoteRename::new(old_stem, &new_stem);
    let old_path_str = old_abs.to_string_lossy().to_string();
    let new_path_str = new_abs.to_string_lossy().to_string();

    // 1. Candidate notes: every cached note whose links resolve to the old
    //    note (mirrors the graph resolver's normalized forms), plus the note
    //    itself so self-links are rewritten too.
    let mut candidates: Vec<String> = Vec::new();
    {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        for path_str in vault.note_paths() {
            if !path_str.ends_with(".md") {
                continue;
            }
            let links_match = vault
                .metadata(&path_str)
                .map(|meta| meta.links.iter().any(|t| rename.matches(t)))
                .unwrap_or(false);
            if path_str == old_path_str || links_match {
                candidates.push(path_str);
            }
        }
    }

    // 2. Self-writes BEFORE the rename so the watcher observes no transitions.
    let mut self_write_paths: Vec<PathBuf> = vec![old_abs.clone(), new_abs.clone()];
    for c in &candidates {
        self_write_paths.push(PathBuf::from(c));
    }
    register_self_writes(state, &self_write_paths);

    // 3. Actually move the file.
    std::fs::rename(&old_abs, &new_abs)
        .map_err(|e| AppError::Io(format!("failed to rename: {e}")))?;

    // 4. Read + rewrite each candidate's content (no vault lock held).
    //    `rewritten` maps final on-disk path -> content to re-index.
    let mut rewritten: Vec<(String, String)> = Vec::new();
    let mut updated_files: Vec<String> = Vec::new();
    for c in &candidates {
        let disk = if *c == old_path_str {
            new_abs.clone()
        } else {
            PathBuf::from(c)
        };
        let Ok(content) = std::fs::read_to_string(&disk) else {
            continue;
        };
        let next = rewrite_wikilinks(&content, &rename);
        if next != content {
            std::fs::write(&disk, &next)
                .map_err(|e| AppError::Io(format!("failed to update '{c}': {e}")))?;
        }
        let key = if *c == old_path_str {
            new_path_str.clone()
        } else {
            c.clone()
        };
        if next != content {
            updated_files.push(key.clone());
        }
        // Re-index the renamed note even when its text is untouched (new
        // path); only re-index other candidates when they actually changed.
        if *c == old_path_str || next != content {
            rewritten.push((key, next));
        }
    }
    // 5. Rename attachments when `renameAttachmentsWithNote` + `by_note` org.
    //    Run BEFORE the vault cache update so the old note's embeds_by
    //    references are still present in the asset index. Updates index paths;
    //    step 6 re-registers references against the renamed note.
    rename_attachments_for_note(state, settings, &old_abs, &new_abs, old_stem, &new_stem)?;

    // 6. Vault cache: drop the old node, (re)insert rewritten contents.
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        vault.remove_document(&old_path_str);
        for (p, content) in &rewritten {
            vault.add_document(p, content);
        }
    }

    // 7. Search index: remove the old path, upsert every rewritten doc.
    index_remove(state, &old_path_str);
    for (p, content) in &rewritten {
        index_upsert(state, p, content);
    }

    Ok(RenameNoteResult {
        path: new_path_str,
        name: new_stem,
        updated_files,
    })
}

#[path = "rename_tests.rs"]
#[cfg(test)]
mod tests;
