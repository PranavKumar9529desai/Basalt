use std::path::{Path, PathBuf};

use basalt_vault::path_utils::resolve_creation_path;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;

// ---------------------------------------------------------------------------
// Write choke point helpers (ADR-018)
//
// Every app-initiated filesystem mutation goes through the same contract as
// save_file:
//   1. Register self-write markers BEFORE touching disk — the watcher
//      consumes them and stays silent.
//   2. Update the vault cache directly.
//   3. Update the search index directly (in-memory; commit policy is owned
//      by the search layer) — the watcher no longer does it for us.
//   4. Emit NOTHING: the frontend initiated the operation and refreshes its
//      own tree. `vault://file-changed` means "changed by something OTHER
//      than the app".
// ---------------------------------------------------------------------------

fn register_self_writes(state: &AppState, paths: &[PathBuf]) {
    if let Ok(mut guard) = state.self_writes.lock() {
        for p in paths {
            guard.insert(p.clone());
        }
    }
}

fn index_upsert(state: &AppState, path_str: &str, content: &str) {
    if let Ok(mut guard) = state.search.write() {
        if let Some(ref mut search) = *guard {
            let tags = extract_inline_tags(content);
            let _ = search.update_document(path_str, content, &tags);
            let _ = search.flush_if_due();
        }
    }
}

fn index_remove(state: &AppState, path_str: &str) {
    if let Ok(mut guard) = state.search.write() {
        if let Some(ref mut search) = *guard {
            let _ = search.remove_document(path_str);
            let _ = search.flush_if_due();
        }
    }
}

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

/// Extract inline tags (#tag) from content for the search index tags field.
pub(crate) fn extract_inline_tags(content: &str) -> String {
    content
        .split_whitespace()
        .filter(|w| w.starts_with('#') && w.len() > 1)
        .map(|w| w.trim_start_matches('#'))
        .collect::<Vec<_>>()
        .join(" ")
}

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
pub fn save_file(
    path: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
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
) -> Result<CreateNoteResult, String> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
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

    let content = String::new();

    // Choke point: marker BEFORE the write. `file_path` is built from the
    // canonical vault root, so it matches the path the watcher reports.
    register_self_writes(&state, &[file_path.clone()]);

    if let Err(e) = std::fs::write(&file_path, &content) {
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&file_path);
        }
        return Err(format!("failed to write file: {e}"));
    }

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
    index_upsert(&state, &abs_path, &content);

    let clean_name = file_name.trim_end_matches(".md").to_string();

    Ok(CreateNoteResult {
        path: abs_path,
        name: clean_name,
    })
}

/// Create a new note with an auto-generated "Untitled" name.
/// Tries "Untitled", "Untitled 1", …, "Untitled 99" until a free slot is found.
#[tauri::command]
pub fn create_untitled_note(
    parent: Option<String>,
    state: State<AppState>,
) -> Result<CreateNoteResult, String> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault_root = Path::new(&vault_path_str)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))?;

    let parent_dir = match parent.as_deref() {
        Some(rel) if !rel.is_empty() => {
            let candidate = vault_root.join(rel);
            // Reject traversal attempts: canonicalize only if the dir exists,
            // otherwise check that no component is "..".
            if candidate.exists() {
                let canonical = candidate
                    .canonicalize()
                    .map_err(|e| format!("invalid parent path: {e}"))?;
                ensure_inside_vault(&canonical, &vault_root)?;
                canonical
            } else {
                // Dir doesn't exist yet (will be created). Reject ".." components.
                if rel.split('/').any(|c| c == "..") {
                    return Err("parent path must not contain '..'".to_string());
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
                .map_err(|e| format!("failed to create directory: {e}"))?;
        }

        let content = String::new();

        register_self_writes(&state, &[file_path.clone()]);
        if let Err(e) = std::fs::write(&file_path, &content) {
            if let Ok(mut guard) = state.self_writes.lock() {
                guard.remove(&file_path);
            }
            return Err(format!("failed to write file: {e}"));
        }

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
        index_upsert(&state, &abs_path, &content);

        return Ok(CreateNoteResult {
            path: abs_path,
            name,
        });
    }

    Err("too many untitled notes (Untitled through Untitled 99 all exist)".to_string())
}

#[tauri::command]
pub fn create_folder(
    name: String,
    parent: Option<String>, // relative folder path inside vault
    state: State<AppState>,
) -> Result<String, String> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
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

    // Choke point: suppress the watcher's mkdir event; the frontend refreshes
    // its own tree after this call returns.
    register_self_writes(&state, &[folder_path.clone()]);
    std::fs::create_dir_all(&folder_path).map_err(|e| format!("failed to create folder: {e}"))?;

    Ok(folder_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_file(path: String, state: State<AppState>) -> Result<(), String> {
    apply_delete_paths(vec![path], state)
}

fn canonical_vault_path(state: &AppState) -> Result<PathBuf, String> {
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

fn apply_delete_paths(raw_paths: Vec<String>, state: State<AppState>) -> Result<(), String> {
    if raw_paths.is_empty() {
        return Err("no paths provided".to_string());
    }

    let vault_root = canonical_vault_path(&state)?;

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

    // Choke point: enumerate every affected path (files + cached dir
    // descendants) and register markers BEFORE deleting, so the watcher's
    // per-file delete events are all suppressed.
    let mut self_write_paths: Vec<PathBuf> = Vec::new();
    let mut deleted_md_paths: Vec<String> = Vec::new();
    {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        for abs in &targets {
            self_write_paths.push(abs.clone());
            if abs.is_dir() {
                let abs_str = abs.to_string_lossy().to_string();
                let prefix = format!("{abs_str}/");
                for p in vault
                    .graph
                    .metadata_cache
                    .keys()
                    .filter_map(|id| vault.arena.get_string(*id).cloned())
                    .filter(|p| p == &abs_str || p.starts_with(&prefix))
                {
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

    // The watcher is suppressed for self-deletes — take over its index duty.
    for path in &deleted_md_paths {
        index_remove(&state, path);
    }

    Ok(())
}

#[tauri::command]
pub fn delete_paths(paths: Vec<String>, state: State<AppState>) -> Result<(), String> {
    apply_delete_paths(paths, state)
}

#[tauri::command]
pub fn move_paths(
    source_paths: Vec<String>,
    destination_rel_path: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    if source_paths.is_empty() {
        return Err("no source paths provided".to_string());
    }

    let vault_root = canonical_vault_path(&state)?;

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
                .map_err(|_| "vault lock poisoned".to_string())?;
            for old_path in vault
                .graph
                .metadata_cache
                .keys()
                .filter_map(|id| vault.arena.get_string(*id).cloned())
                .filter(|p| p.starts_with(&prefix))
            {
                let suffix = old_path.trim_start_matches(&prefix).to_string();
                self_write_paths.push(PathBuf::from(&old_path));
                self_write_paths
                    .push(destination_item.join(&suffix));
            }
        }
    }
    register_self_writes(&state, &self_write_paths);

    for (source, destination_item) in &source_pairs {
        std::fs::rename(source, destination_item)
            .map_err(|e| format!("failed to move '{}': {e}", source.display()))?;
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
            let content = std::fs::read_to_string(&destination_str).ok();
            file_ops.push((source_str.clone(), destination_str.clone(), content));
        } else {
            // Read vault under a shared read lock to find folder descendants.
            let prefix = format!("{source_str}/");
            let vault = state
                .vault
                .read()
                .map_err(|_| "vault lock poisoned".to_string())?;
            let pairs: Vec<(String, String)> = vault
                .graph
                .metadata_cache
                .keys()
                .filter_map(|id| vault.arena.get_string(*id).cloned())
                .filter(|p| p.starts_with(&prefix))
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
            .map_err(|_| "vault lock poisoned".to_string())?;

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
