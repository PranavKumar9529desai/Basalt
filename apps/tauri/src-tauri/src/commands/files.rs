use std::path::{Path, PathBuf};

use basalt_parser::{rewrite_wikilinks, rewrite_wikilinks_path, NoteRename, PathRename};
use basalt_vault::path_utils::resolve_creation_path;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;

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

/// Error payload for a failed rename — a structured message the title UI can
/// surface inline (e.g. "a note named 'X' already exists") without popping a
/// dialog.
#[derive(Debug, Serialize)]
pub struct RenameNoteResult {
    /// Absolute path of the renamed file.
    pub path: String,
    /// Display name (filename without extension).
    pub name: String,
    /// Absolute paths of other notes whose wikilinks were rewritten.
    pub updated_files: Vec<String>,
}

/// Normalize and validate a user-supplied note name (a stem — no path).
/// Strips a trailing `.md`/`.markdown`, trims, and rejects directory
/// separators and empty/`.`/`..` names.
fn sanitize_name(raw: &str) -> Result<String, String> {
    let mut name = raw.trim().to_string();
    for ext in [".md", ".markdown"] {
        if name.len() > ext.len() && name.to_ascii_lowercase().ends_with(ext) {
            let cut = name.len() - ext.len();
            name.truncate(cut);
            break;
        }
    }
    let name = name.trim_end().to_string();
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
) -> Result<RenameNoteResult, String> {
    rename_note_impl(&path, &new_name, &state)
}

/// Testable core of [`rename_note`] — separated from the Tauri `State` wrapper
/// so a unit test can drive a real `AppState` over a temp vault.
fn rename_note_impl(
    path: &str,
    new_name: &str,
    state: &AppState,
) -> Result<RenameNoteResult, String> {
    let vault_root = canonical_vault_path(state)?;

    let old_abs = canonical_md_path(path).map_err(|e| e.to_string())?;
    ensure_inside_vault(&old_abs, &vault_root)?;
    if !old_abs.exists() {
        return Err(format!("file does not exist: {}", old_abs.display()));
    }

    let new_stem = sanitize_name(new_name)?;
    let old_stem = old_abs
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid old file name".to_string())?;
    if new_stem.eq_ignore_ascii_case(old_stem) {
        return Err("the note already has that name".to_string());
    }

    let parent = old_abs
        .parent()
        .ok_or_else(|| "invalid parent directory".to_string())?;
    let new_abs = parent.join(format!("{new_stem}.md"));
    if new_abs.exists() {
        return Err(format!("a note named '{new_stem}' already exists"));
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
            .map_err(|_| "vault lock poisoned".to_string())?;
        for id in vault.graph.metadata_cache.keys() {
            let Some(path_str) = vault.arena.get_string(*id).cloned() else {
                continue;
            };
            if !path_str.ends_with(".md") {
                continue;
            }
            let meta = &vault.graph.metadata_cache[id];
            if path_str == old_path_str || meta.links.iter().any(|t| rename.matches(t)) {
                candidates.push(path_str);
            }
        }
    }

    // 2. Self-writes BEFORE the rename so the watcher observes no transitions.
    let mut self_write_paths: Vec<PathBuf> = vec![old_abs.clone(), new_abs.clone()];
    for c in &candidates {
        self_write_paths.push(PathBuf::from(c));
    }
    register_self_writes(&state, &self_write_paths);

    // 3. Actually move the file.
    std::fs::rename(&old_abs, &new_abs).map_err(|e| format!("failed to rename: {e}"))?;

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
            std::fs::write(&disk, &next).map_err(|e| format!("failed to update '{c}': {e}"))?;
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

    // 5. Vault cache: drop the old node, (re)insert rewritten contents.
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;
        vault.remove_document(&old_path_str);
        for (p, content) in &rewritten {
            vault.add_document(p, content);
        }
    }

    // 6. Search index: remove the old path, upsert every rewritten doc.
    index_remove(&state, &old_path_str);
    for (p, content) in &rewritten {
        index_upsert(&state, p, content);
    }

    Ok(RenameNoteResult {
        path: new_path_str,
        name: new_stem,
        updated_files,
    })
}

/// Result of a folder/attachment rename — `moved` carries every `.md`
/// document that relocated, so the frontend can repoint any open tab
/// tracking a moved note (tabs are keyed by path for this purpose).
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

/// Validate a user-supplied rename target for a folder or attachment:
/// trimmed, non-empty, not `.`/`..`, and free of path separators. Extension
/// handling is left to the caller (files preserve their own extension).
fn sanitize_path_name(raw: &str) -> Result<String, String> {
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

/// Resolve the final on-disk name for a rename. Folders keep the raw name;
/// files keep their original extension — the user's input is used as-is when
/// it already carries that extension (any case), otherwise it is appended.
fn resolve_rename_target_name(old_name: &str, raw: &str, is_folder: bool) -> Result<String, String> {
    let base = sanitize_path_name(raw)?;
    if is_folder {
        return Ok(base);
    }
    let Some(ext) = std::path::Path::new(old_name).extension().and_then(|e| e.to_str()) else {
        return Ok(base);
    };
    let ext_suffix = format!(".{ext}");
    if base.to_ascii_lowercase().ends_with(&ext_suffix) {
        Ok(base)
    } else {
        Ok(format!("{base}{ext_suffix}"))
    }
}

/// Vault-relative path of an absolute path (forward slashes), used as the
/// wikilink path-prefix for folder renames.
fn rel_prefix(abs: &std::path::Path, vault_root: &Path) -> String {
    abs.strip_prefix(vault_root)
        .unwrap_or(abs)
        .to_string_lossy()
        .replace('\\', "/")
}

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
) -> Result<RenamePathResult, String> {
    rename_path_impl(&path, &new_name, &state)
}

/// Testable core of [`rename_path`] — see the wrapper for the contract.
fn rename_path_impl(
    path: &str,
    new_name: &str,
    state: &AppState,
) -> Result<RenamePathResult, String> {
    let vault_root = canonical_vault_path(state)?;

    let old_abs = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("invalid path '{path}': {e}"))?;
    ensure_inside_vault(&old_abs, &vault_root)?;
    if !old_abs.exists() {
        return Err(format!("path does not exist: {}", old_abs.display()));
    }

    let is_folder = old_abs.is_dir();
    let old_name = old_abs
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid path name".to_string())?;

    // Notes are renamed via rename_note (wikilink rewrite by stem). Guard the
    // generic entry so an accidental call never silently skips link rewriting.
    if !is_folder && old_name.to_ascii_lowercase().ends_with(".md") {
        return Err("notes must be renamed with rename_note".to_string());
    }

    let target = resolve_rename_target_name(old_name, new_name, is_folder)?;
    let parent = old_abs
        .parent()
        .ok_or_else(|| "invalid parent directory".to_string())?;
    let new_abs = parent.join(&target);

    if new_abs == old_abs {
        return Err("the item already has that name".to_string());
    }
    if new_abs.exists() {
        return Err(format!("an item named '{target}' already exists"));
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
            .map_err(|_| "vault lock poisoned".to_string())?;
        for id in vault.graph.metadata_cache.keys() {
            let Some(p) = vault.arena.get_string(*id).cloned() else {
                continue;
            };
            if p.starts_with(&prefix) {
                let suffix = p.trim_start_matches(&prefix).to_string();
                descendants.push((p, format!("{new_str}/{suffix}")));
            }
        }
    }

    // 1. Self-writes BEFORE disk: the item, its new path, and both sides of
    //    every descendant transition.
    let mut self_write_paths: Vec<PathBuf> = vec![old_abs.clone(), new_abs.clone()];
    for (old_d, new_d) in &descendants {
        self_write_paths.push(PathBuf::from(old_d));
        self_write_paths.push(PathBuf::from(new_d));
    }
    register_self_writes(&state, &self_write_paths);

    // 2. Move the item.
    std::fs::rename(&old_abs, &new_abs)
        .map_err(|e| format!("failed to rename '{}': {e}", old_abs.display()))?;

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
    let path_rename = PathRename::new(&rel_prefix(&old_abs, &vault_root), &rel_prefix(&new_abs, &vault_root));
    let mut candidates: Vec<String> = Vec::new();
    {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        for id in vault.graph.metadata_cache.keys() {
            let Some(p) = vault.arena.get_string(*id).cloned() else {
                continue;
            };
            if !p.ends_with(".md") {
                continue;
            }
            let has_link = vault.graph.metadata_cache[id]
                .links
                .iter()
                .any(|t| path_rename.matches(t));
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
            std::fs::write(&disk, &next).map_err(|e| format!("failed to update '{disk}': {e}"))?;
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
        index_remove(&state, old_d);
        index_upsert(&state, new_d, content);
    }

    Ok(RenamePathResult {
        path: new_str,
        name: target,
        moved: descendants,
        updated_files,
    })
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

    // rename_note tests

    /// Scaffold a temp vault on disk with three notes, mirrored into a fresh
    /// `AppState` (search index left `None` — index calls become no-ops).
    fn temp_vault() -> (PathBuf, AppState) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("basalt-rename-test-{n}"));
        std::fs::create_dir_all(&root).unwrap();

        let a = root.join("a.md");
        let b = root.join("b.md");
        let c = root.join("c.md");
        std::fs::write(&a, "See [[b]] and [[b#Heading]].\n").unwrap();
        std::fs::write(&b, "I am B.\n").unwrap();
        std::fs::write(&c, "Unrelated.\n").unwrap();

        let state = AppState::default();
        for p in [&a, &b, &c] {
            let str = p.to_string_lossy().to_string();
            let content = std::fs::read_to_string(p).unwrap();
            state.vault.write().unwrap().add_document(&str, &content);
        }
        *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
        (root, state)
    }

    #[test]
    fn rename_rewrites_links_in_other_notes_and_graph() {
        let (root, state) = temp_vault();
        let b_str = root.join("b.md").to_string_lossy().to_string();

        let res = rename_note_impl(&b_str, "renamedB", &state).unwrap();

        assert_eq!(res.name, "renamedB");
        assert!(res.path.ends_with("renamedB.md"));
        assert!(root.join("renamedB.md").exists(), "file renamed on disk");
        assert!(!root.join("b.md").exists(), "old file removed");

        let a_str = root.join("a.md").to_string_lossy().to_string();
        let a_content = std::fs::read_to_string(&a_str).unwrap();
        assert!(a_content.contains("[[renamedB]]"), "bare link rewritten");
        assert!(
            a_content.contains("[[renamedB#Heading]]"),
            "anchored link rewritten"
        );
        assert!(!a_content.contains("[[b"), "no stale old-target links remain");
        assert!(
            res.updated_files.contains(&a_str),
            "a.md reported as updated"
        );

        // Graph: old node gone, new node present with rewritten links.
        let vault = state.vault.read().unwrap();
        let has_old = vault
            .graph
            .metadata_cache
            .keys()
            .filter_map(|id| vault.arena.get_string(*id))
            .any(|p| p == &b_str);
        let has_new = vault
            .graph
            .metadata_cache
            .keys()
            .filter_map(|id| vault.arena.get_string(*id))
            .any(|p| p == &res.path);
        assert!(!has_old, "old path dropped from cache");
        assert!(has_new, "new path indexed in cache");
        let a_id = vault.arena.get_id(&a_str).unwrap();
        let a_meta = vault.graph.metadata_cache.get(&a_id).unwrap();
        assert!(
            a_meta.links.contains(&"renamedB".to_string()),
            "a.md's cached links point at the new stem"
        );
    }

    #[test]
    fn rename_rewrites_self_links_inside_the_note() {
        let (root, state) = temp_vault_with_self_refs();
        let b_str = root.join("b.md").to_string_lossy().to_string();
        let res = rename_note_impl(&b_str, "renamedB", &state).unwrap();
        let content = std::fs::read_to_string(root.join("renamedB.md")).unwrap();
        assert!(content.contains("[[renamedB]]"));
        assert!(content.contains("[[renamedB|alias]]"));
        assert!(res.path.ends_with("renamedB.md"));
    }

    #[test]
    fn rename_rejects_collision() {
        let (root, state) = temp_vault();
        let b_str = root.join("b.md").to_string_lossy().to_string();
        let err = rename_note_impl(&b_str, "c", &state).unwrap_err();
        assert!(err.contains("already exists"));
    }

    #[test]
    fn rename_rejects_same_name() {
        let (root, state) = temp_vault();
        let b_str = root.join("b.md").to_string_lossy().to_string();
        let err = rename_note_impl(&b_str, "B", &state).unwrap_err();
        assert!(err.contains("already has that name"));
    }

    #[test]
    fn rename_strips_trailing_md_extension() {
        let (root, state) = temp_vault();
        let b_str = root.join("b.md").to_string_lossy().to_string();
        let res = rename_note_impl(&b_str, "final.md", &state).unwrap();
        assert_eq!(res.name, "final");
        assert!(root.join("final.md").exists());
    }

    #[test]
    fn rename_rejects_invalid_names() {
        let (root, state) = temp_vault();
        let b_str = root.join("b.md").to_string_lossy().to_string();
        assert!(rename_note_impl(&b_str, "   ", &state).is_err());
        assert!(rename_note_impl(&b_str, "a/b", &state).is_err());
        assert!(rename_note_impl(&b_str, "..", &state).is_err());
    }

    /// Variant of `temp_vault` whose b.md references itself — used by the
    /// self-link rewrite test.
    fn temp_vault_with_self_refs() -> (PathBuf, AppState) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("basalt-rename-test-self-{n}"));
        std::fs::create_dir_all(&root).unwrap();

        let state = AppState::default();
        for (file, content) in [
            ("a.md", "See [[b]].\n"),
            ("b.md", "Self: [[b]] and [[b|alias]].\n"),
            ("c.md", "Unrelated.\n"),
        ] {
            let p = root.join(file);
            std::fs::write(&p, content).unwrap();
            let str = p.to_string_lossy().to_string();
            state.vault.write().unwrap().add_document(&str, content);
        }
        *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
        (root, state)
    }

    // rename_path (folders + attachments) tests

    /// Temp vault with a small folder of notes plus a path-form link into it
    /// from the root, mirrored into a fresh `AppState`.
    fn temp_vault_with_folder() -> (PathBuf, AppState) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("basalt-path-rename-test-{n}"));
        let folder = root.join("Project");
        std::fs::create_dir_all(&folder).unwrap();

        let state = AppState::default();
        for (file, content) in [
            ("Project/a.md", "Self: [[Project/a.md]]\n"),
            ("Project/b.md", "I am B.\n"),
            ("c.md", "See [[Project/b]] and [[Bare]]\n"),
            ("other.md", "Unrelated [[NotHere]]\n"),
        ] {
            let p = root.join(file);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, content).unwrap();
            let str = p.to_string_lossy().to_string();
            state.vault.write().unwrap().add_document(&str, content);
        }
        *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
        (root, state)
    }

    #[test]
    fn rename_folder_rewrites_path_links_and_moves_docs() {
        let (root, state) = temp_vault_with_folder();
        let folder_str = root.join("Project").to_string_lossy().to_string();

        let res = rename_path_impl(&folder_str, "Docs", &state).unwrap();

        assert_eq!(res.name, "Docs");
        assert!(root.join("Docs").is_dir(), "folder renamed on disk");
        assert!(!root.join("Project").exists(), "old folder removed");

        // Wikilinks across the vault follow the folder.
        let c = std::fs::read_to_string(root.join("c.md")).unwrap();
        assert!(c.contains("[[Docs/b]]"), "path-form link rewritten");
        assert!(c.contains("[[Bare]]"), "bare links untouched");
        let a = std::fs::read_to_string(root.join("Docs/a.md")).unwrap();
        assert!(a.contains("[[Docs/a.md]]"), "moved note's self path-link rewritten");
        let other = std::fs::read_to_string(root.join("other.md")).unwrap();
        assert!(other.contains("[[NotHere]]"), "unrelated notes untouched");

        // Report the two moved documents.
        assert_eq!(res.moved.len(), 2, "both notes reported as moved");
        assert!(res.moved.iter().any(|(o, n)| o.ends_with("Project/a.md") && n.ends_with("Docs/a.md")));
        assert!(res.moved.iter().any(|(o, n)| o.ends_with("Project/b.md") && n.ends_with("Docs/b.md")));
        assert!(res.updated_files.contains(&root.join("c.md").to_string_lossy().to_string()));
        assert!(res.updated_files.contains(&root.join("Docs/a.md").to_string_lossy().to_string()));

        // Vault cache: old paths dropped, new paths present with rewritten links.
        let vault = state.vault.read().unwrap();
        let cached: Vec<String> = vault
            .graph
            .metadata_cache
            .keys()
            .filter_map(|id| vault.arena.get_string(*id).cloned())
            .collect();
        assert!(!cached.iter().any(|p| p.contains("/Project/")), "old paths dropped");
        let a_id = vault.arena.get_id(&root.join("Docs/a.md").to_string_lossy().to_string()).unwrap();
        assert!(
            vault.graph.metadata_cache.get(&a_id).unwrap().links.contains(&"Docs/a.md".to_string()),
            "cached links follow the folder"
        );
    }

    #[test]
    fn rename_attachment_preserves_extension() {
        let root = std::env::temp_dir().join(format!("basalt-attach-rename-test-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("img.png"), "fake bytes").unwrap();
        let state = AppState::default();
        *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());

        let old = root.join("img.png").to_string_lossy().to_string();
        let res = rename_path_impl(&old, "logo", &state).unwrap();

        assert_eq!(res.name, "logo.png");
        assert!(root.join("logo.png").is_file(), "extension preserved");
        assert!(!root.join("img.png").exists());
        assert!(res.moved.is_empty(), "attachments move no documents");

        // Explicit extension input is respected (any case).
        let res2 = rename_path_impl(&root.join("logo.png").to_string_lossy().to_string(), "final.PNG", &state).unwrap();
        assert_eq!(res2.name, "final.PNG");
        assert!(root.join("final.PNG").exists());
    }

    #[test]
    fn rename_path_rejects_collision_and_same_name() {
        let (root, state) = temp_vault_with_folder();
        let folder_str = root.join("Project").to_string_lossy().to_string();
        // Rename onto a folder that already exists is a collision.
        std::fs::create_dir_all(root.join("taken")).unwrap();
        let err = rename_path_impl(&folder_str, "taken", &state).unwrap_err();
        assert!(err.contains("already exists"), "got: {err}");

        // Renaming to the same (trimmed) name is a no-op rejection.
        let res = rename_path_impl(&folder_str, "Project", &state);
        assert!(
            res.is_err() && res.unwrap_err().contains("already has that name"),
            "same-name rename rejected"
        );
    }

    #[test]
    fn rename_path_rejects_notes_and_invalid_names() {
        let (root, state) = temp_vault_with_folder();
        let b_str = root.join("Project/b.md").to_string_lossy().to_string();
        assert!(
            rename_path_impl(&b_str, "renamedB", &state).is_err(),
            "notes must go through rename_note"
        );
        let folder_str = root.join("Project").to_string_lossy().to_string();
        assert!(rename_path_impl(&folder_str, "a/b", &state).is_err());
        assert!(rename_path_impl(&folder_str, "..", &state).is_err());
        assert!(rename_path_impl(&folder_str, "   ", &state).is_err());
    }
}
