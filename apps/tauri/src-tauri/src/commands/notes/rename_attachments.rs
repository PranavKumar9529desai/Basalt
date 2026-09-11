//! Attachment relocation when a note is renamed: moves assets owned by the
//! renamed note and rewrites embed targets.

use crate::app_state::AppState;
use crate::commands::common::{register_self_writes, strip_asset_ext};
use crate::error::{AppError, AppResult};

/// Move assets owned by the renamed note when organization is `by_note` and
/// `renameAttachmentsWithNote` is enabled; rewrite `![[...]]` embed targets in
/// every note that references a moved asset.
///
/// `settings` is the config settings map (may be `None` in tests → defaults:
/// enabled, org `flat`, folder `_attachments`).
pub(super) fn rename_attachments_for_note(
    state: &AppState,
    settings: Option<&std::collections::HashMap<String, serde_json::Value>>,
    old_note_abs: &std::path::Path,
    _new_note_abs: &std::path::Path,
    old_stem: &str,
    new_stem: &str,
) -> AppResult<()> {
    use basalt_vault::asset_index::AssetInfo;

    let get = |key: &str| settings.and_then(|s| s.get(key)).and_then(|v| v.as_str());

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
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::Other("no vault open".to_string()))?;
    let vault_root = std::path::PathBuf::from(&vault_path);
    let old_note_str = old_note_abs.to_string_lossy().to_string();
    let old_dir = vault_root.join(attachments_dir).join(old_stem);
    let new_dir = vault_root.join(attachments_dir).join(new_stem);

    // Collect assets embedded by the old note, located under its by_note dir.
    let assets_to_move: Vec<AssetInfo> = {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
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
            .map_err(|_| AppError::LockPoisoned("vault"))?;

        for asset in &assets_to_move {
            let asset_path = std::path::Path::new(&asset.abs_path);
            let rel = asset_path
                .strip_prefix(&old_dir)
                .unwrap_or(std::path::Path::new(&asset.file_name));
            let new_abs = new_dir.join(rel);
            if let Some(parent) = new_abs.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            register_self_writes(state, &[std::path::PathBuf::from(&asset.abs_path)]);
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
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            vault
                .note_paths()
                .into_iter()
                .filter(|p| p.ends_with(".md"))
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
                register_self_writes(state, &[std::path::PathBuf::from(note_path)]);
                std::fs::write(note_path, &next).map_err(|e| {
                    AppError::Io(format!("failed to update embeds in '{note_path}': {e}"))
                })?;
            }
        }
    }

    Ok(())
}
