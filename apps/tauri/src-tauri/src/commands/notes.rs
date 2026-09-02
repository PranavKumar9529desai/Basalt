//! Note lifecycle commands: create, rename (with wikilink rewriting), backlinks,
//! and autocomplete.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;

use super::common::{
    canonical_md_path, canonical_vault_path, ensure_inside_vault, index_remove,
    index_upsert, register_self_writes, strip_asset_ext, validate_name,
};
use basalt_parser::{rewrite_wikilinks, NoteRename};
use basalt_vault::path_utils::resolve_creation_path;

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
    validate_name(&name.trim_end())
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
) -> Result<RenameNoteResult, String> {
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
            .map_err(|_| "vault lock poisoned".to_string())?;
        vault.remove_document(&old_path_str);
        for (p, content) in &rewritten {
            vault.add_document(p, content);
        }
    }

    // 7. Search index: remove the old path, upsert every rewritten doc.
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

/// Move assets owned by the renamed note when organization is `by_note` and
/// `renameAttachmentsWithNote` is enabled; rewrite `![[...]]` embed targets in
/// every note that references a moved asset.
///
/// `settings` is the config settings map (may be `None` in tests → defaults:
/// enabled, org `flat`, folder `_attachments`).
fn rename_attachments_for_note(
    state: &AppState,
    settings: Option<&std::collections::HashMap<String, serde_json::Value>>,
    old_note_abs: &std::path::Path,
    _new_note_abs: &std::path::Path,
    old_stem: &str,
    new_stem: &str,
) -> Result<(), String> {
    use basalt_vault::asset_index::AssetInfo;

    let get = |key: &str| {
        settings
            .and_then(|s| s.get(key))
            .and_then(|v| v.as_str())
    };

    let rename_enabled = settings
        .and_then(|s| s.get("renameAttachmentsWithNote"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !rename_enabled {
        return Ok(());
    }

    let organization = get("attachmentOrganization").unwrap_or("flat");
    if organization != "by_note" {
        // Only by_note organization moves assets on note rename.
        return Ok(());
    }

    let attachments_dir = get("attachmentFolder").unwrap_or("_attachments");
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?
        .clone()
        .ok_or("no vault open")?;
    let vault_root = std::path::PathBuf::from(&vault_path);
    let old_note_str = old_note_abs.to_string_lossy().to_string();
    let old_dir = vault_root.join(attachments_dir).join(old_stem);
    let new_dir = vault_root.join(attachments_dir).join(new_stem);

    // Collect assets embedded by the old note, located under its by_note dir.
    let assets_to_move: Vec<AssetInfo> = {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        vault
            .asset_index
            .all()
            .into_iter()
            .filter(|a| {
                a.embeds_by.iter().any(|p| p == &old_note_str)
                    && std::path::Path::new(&a.abs_path).starts_with(&old_dir)
            })
            .collect()
    };

    if assets_to_move.is_empty() {
        return Ok(());
    }

    // Actually move files + update index; collect (old_abs, new_abs) pairs.
    let mut moved: Vec<(String, String)> = Vec::new();
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())?;

        for asset in &assets_to_move {
            let asset_path = std::path::Path::new(&asset.abs_path);
            let rel = asset_path
                .strip_prefix(&old_dir)
                .unwrap_or(std::path::Path::new(&asset.file_name));
            let new_abs = new_dir.join(rel);
            if let Some(parent) = new_abs.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            register_self_writes(&state, &[std::path::PathBuf::from(&asset.abs_path)]);
            if std::fs::rename(&asset.abs_path, &new_abs).is_err() {
                continue;
            }
            let new_abs_str = new_abs.to_string_lossy().to_string();
            let new_rel = new_abs
                .strip_prefix(&vault_root)
                .unwrap_or(&new_abs)
                .to_string_lossy()
                .to_string();

            vault.asset_index.remove(&asset.abs_path);
            let mut updated = asset.clone();
            updated.abs_path = new_abs_str.clone();
            updated.rel_path = new_rel;
            vault.asset_index.upsert(updated);

            moved.push((asset.abs_path.clone(), new_abs_str));
        }
    }

    // Rewrite embed targets in every note referencing a moved asset.
    if !moved.is_empty() {
        let candidates: Vec<String> = {
            let vault = state
                .vault
                .read()
                .map_err(|_| "vault lock poisoned".to_string())?;
            vault
                .arena
                .all_strings()
                .filter(|p| p.ends_with(".md"))
                .cloned()
                .collect()
        };

        for (old_abs, new_abs) in &moved {
            // Compute embed target: rel path without extension.
            // ![[old_target]] → ![[new_target]] preserves alias/anchor.
            let old_path_obj = std::path::Path::new(old_abs)
                .strip_prefix(&vault_root)
                .unwrap_or(std::path::Path::new(old_abs));
            let new_path_obj = std::path::Path::new(new_abs)
                .strip_prefix(&vault_root)
                .unwrap_or(std::path::Path::new(new_abs));
            let old_target = strip_asset_ext(old_path_obj);
            let new_target = strip_asset_ext(new_path_obj);

            let needle = format!("![[{}", old_target);
            let replacement = format!("![[{}", new_target);

            for note_path in &candidates {
                let Ok(content) = std::fs::read_to_string(note_path) else {
                    continue;
                };
                if !content.contains(&needle) {
                    continue;
                }
                let next = content.replace(&needle, &replacement);
                if next == content {
                    continue;
                }
                register_self_writes(&state, &[std::path::PathBuf::from(note_path)]);
                std::fs::write(note_path, &next)
                    .map_err(|e| format!("failed to update embeds in '{note_path}': {e}"))?;
            }
        }
    }

    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
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

    fn temp_vault() -> (std::path::PathBuf, crate::app_state::AppState) {
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

    fn temp_vault_with_self_refs() -> (std::path::PathBuf, crate::app_state::AppState) {
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
  #[test]
  fn rename_rewrites_links_in_other_notes_and_graph() {
      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();

      let res = rename_note_impl(&b_str, "renamedB", &state, None).unwrap();

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
      let res = rename_note_impl(&b_str, "renamedB", &state, None).unwrap();
      let content = std::fs::read_to_string(root.join("renamedB.md")).unwrap();
      assert!(content.contains("[[renamedB]]"));
      assert!(content.contains("[[renamedB|alias]]"));
      assert!(res.path.ends_with("renamedB.md"));
  }

  #[test]
  fn rename_rejects_collision() {
      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();
      let err = rename_note_impl(&b_str, "c", &state, None).unwrap_err();
      assert!(err.contains("already exists"));
  }

  #[test]
  fn rename_rejects_same_name() {
      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();
      let err = rename_note_impl(&b_str, "B", &state, None).unwrap_err();
      assert!(err.contains("already has that name"));
  }

  #[test]
  fn rename_strips_trailing_md_extension() {
      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();
      let res = rename_note_impl(&b_str, "final.md", &state, None).unwrap();
      assert_eq!(res.name, "final");
      assert!(root.join("final.md").exists());
  }

  #[test]
  fn rename_rejects_invalid_names() {
      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();
      assert!(rename_note_impl(&b_str, "   ", &state, None).is_err());
      assert!(rename_note_impl(&b_str, "a/b", &state, None).is_err());
      assert!(rename_note_impl(&b_str, "..", &state, None).is_err());
  }

  #[test]
  fn rename_with_note_moves_attachments_and_rewrites_embeds() {
      use basalt_vault::asset_index::AssetInfo;
      use std::collections::HashMap;

      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();
      let old_abs = root.join("b.md");
      let new_abs = root.join("renamedB.md");

      // Create _attachments/b/logo.png (simulating by_note org).
      let attach_dir = root.join("_attachments").join("b");
      std::fs::create_dir_all(&attach_dir).unwrap();
      let png_path = attach_dir.join("logo.png");
      std::fs::write(&png_path, &[0x89u8, 0x50, 0x4E, 0x47]).unwrap(); // PNG magic bytes
      let attach_abs = png_path.to_string_lossy().to_string();
      let attach_rel = "_attachments/b/logo.png".to_string();
      let embed_target = "_attachments/b/logo".to_string();

      // Register the asset in the index with embeds_by referencing note B.
      state.vault.write().unwrap().asset_index.upsert(AssetInfo {
          rel_path: attach_rel.clone(),
          abs_path: attach_abs.clone(),
          file_name: "logo.png".into(),
          file_type: basalt_vault::asset_index::FileType::Image,
          mime_type: "image/png".into(),
          size_bytes: 4,
          content_hash: "test123".into(),
          width: None,
          height: None,
          embeds_by: vec![old_abs.to_string_lossy().to_string()],
          linked_by: vec![],
      });

      // Note C references the asset via ![[embed_target]].
      let c_str = root.join("c.md").to_string_lossy().to_string();
      let c_content = format!("Logo: ![[{embed_target}]]\n");
      std::fs::write(&c_str, &c_content).unwrap();
      state.vault.write().unwrap().add_document(&c_str, &c_content);

      // Simulate by_note settings.
      let mut settings: HashMap<String, serde_json::Value> = HashMap::new();
      settings.insert("attachmentOrganization".into(), serde_json::Value::String("by_note".into()));
      settings.insert("renameAttachmentsWithNote".into(), serde_json::Value::Bool(true));
      settings.insert("attachmentFolder".into(), serde_json::Value::String("_attachments".into()));

      let res = rename_note_impl(&b_str, "renamedB", &state, Some(&settings)).unwrap();

      assert_eq!(res.name, "renamedB");
      assert!(root.join("renamedB.md").exists(), "note renamed");
      assert!(!root.join("b.md").exists(), "old note gone");

      // Asset moved from _attachments/b/ → _attachments/renamedB/.
      let new_attach = root.join("_attachments").join("renamedB").join("logo.png");
      assert!(new_attach.exists(), "asset moved to new note dir");
      assert!(!png_path.exists(), "old asset path gone");

      // Embed in note C rewritten to new path.
      let c_after = std::fs::read_to_string(&c_str).unwrap();
      assert!(
          c_after.contains("_attachments/renamedB/logo"),
          "embed rewritten: {c_after}"
      );
      assert!(!c_after.contains("_attachments/b/logo"), "old embed removed: {c_after}");
  }
}
