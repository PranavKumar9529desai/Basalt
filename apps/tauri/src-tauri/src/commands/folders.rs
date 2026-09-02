//! Folder lifecycle commands: create, delete, move, and rename (with wikilink
//! path rewriting).

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;

use super::common::{
    canonical_vault_path, ensure_inside_vault, index_remove, index_upsert,
    prune_nested_paths, register_self_writes, validate_name,
};
use basalt_parser::{rewrite_wikilinks_path, PathRename};
use basalt_vault::path_utils::resolve_creation_path;

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

fn sanitize_path_name(raw: &str) -> Result<String, String> {
    validate_name(raw)
}

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

    fn temp_vault_with_folder() -> (std::path::PathBuf, crate::app_state::AppState) {
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
