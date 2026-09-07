//! Bulk-reorganize existing attachments; embed-target rewriting lives in `rewrite`.

use std::path::{Path, PathBuf};

use tauri::State;

use crate::app_state::AppState;
use crate::commands::common::{register_self_writes, strip_asset_ext};
use crate::error::{AppError, AppResult};

use super::save::file_mtime_date;
use super::ReorganizeResult;
use super::rewrite::rewrite_asset_embeds;

/// Bulk-reorganize all existing attachments according to the current
/// `attachmentOrganization` and `attachmentNaming` settings.
///
/// For every tracked asset, computes where it *should* live under the active
/// rules.  Files already in the correct location are skipped.  Moves update
/// the asset index, and all `![[...]]` embed targets across every note are
/// rewritten to match.
#[tauri::command]
pub fn reorganize_assets(
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<ReorganizeResult> {
    use crate::config::load_config;
    let config = load_config(&app);
    reorganize_assets_impl(state.inner(), &config.settings)
}

/// Testable core of `reorganize_assets`. `settings` mirrors `config.settings`
/// so unit tests can drive the rules directly with a real `AppState`;
/// `None` uses in-memory defaults (flat / `_attachments` / `{original_name}`).
fn reorganize_assets_impl(
    state: &AppState,
    settings: &std::collections::HashMap<String, serde_json::Value>,
) -> AppResult<ReorganizeResult> {
    use basalt_vault::asset_index::AssetInfo;

    let get = |key: &str| settings.get(key).and_then(|v| v.as_str());

    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let attachments_dir = get("attachmentFolder").unwrap_or("_attachments");
    let organization = get("attachmentOrganization").unwrap_or("flat");
    let naming = get("attachmentNaming").unwrap_or("{original_name}");

    let vault_root = PathBuf::from(&vault_path);
    let base_dir = vault_root.join(attachments_dir);

    // Helper: file-type sub-directory for `by_type` organization.
    let type_dir_for = |ext: &str| -> &'static str {
        match ext {
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => "images",
            "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a" => "audio",
            "mp4" | "mov" | "avi" | "webm" | "mkv" => "video",
            "pdf" | "doc" | "docx" | "xls" | "xlsx" => "documents",
            _ => "other",
        }
    };

    // Helper: extract the embedding note stem from asset.embeds_by.
    // Returns (note_stem, note_abs_path) or None.
    let note_from_embeds = |embeds: &[String]| -> Option<(String, String)> {
        if embeds.is_empty() {
            return None;
        }
        // Pick the first embedding note by alphabetical basename.
        let mut notes: Vec<&String> = embeds.iter().collect();
        notes.sort_by(|a, b| {
            let na = Path::new(a)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let nb = Path::new(b)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            na.cmp(nb)
        });
        let note_abs = notes[0].clone();
        let stem = Path::new(&note_abs)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("_unfiled")
            .to_string();
        Some((stem, note_abs))
    };

    // Helper: extension from asset file_name.
    let ext_of = |fn_name: &str| -> String {
        Path::new(fn_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin")
            .to_string()
    };

    // Helper: compute the target directory for an asset under the current rules.
    let compute_target_dir = |asset: &AssetInfo| -> std::path::PathBuf {
        match organization {
            "by_note" => {
                if let Some((note_stem, _)) = note_from_embeds(&asset.embeds_by) {
                    base_dir.join(note_stem)
                } else {
                    base_dir.join("_unfiled")
                }
            }
            "by_type" => base_dir.join(type_dir_for(&ext_of(&asset.file_name))),
            "by_date" => {
                let (y, m, _d) = file_mtime_date(std::path::Path::new(&asset.abs_path));
                base_dir.join(format!("{y:04}-{m:02}"))
            }
            _ => base_dir.clone(), // "flat"
        }
    };

    // Helper: compute the target filename stem for an asset under naming rules.
    let compute_stem = |asset: &AssetInfo| -> String {
        match naming {
            "{note_name}-{n}" => {
                let note_stem = note_from_embeds(&asset.embeds_by)
                    .map(|(s, _)| s)
                    .unwrap_or_else(|| "note".to_string());
                // Parity with save_attachment: `{n}` is a collision counter
                // (`foo.png`, `foo-1.png`, …), not the original stem. Preserve
                // an existing `-N` suffix so reorganize doesn't renumber
                // already-filed assets.
                let cur_stem = Path::new(&asset.file_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                if let Some(rest) = cur_stem.strip_prefix(&format!("{note_stem}-")) {
                    if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
                        return format!("{note_stem}-{rest}");
                    }
                }
                note_stem
            }
            "{date}-{original_name}" => {
                let (y, m, d) = file_mtime_date(std::path::Path::new(&asset.abs_path));
                let original_stem = Path::new(&asset.file_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&asset.file_name);
                format!("{y:04}{m:02}{d:02}-{original_stem}")
            }
            _ => {
                // "{original_name}" or unknown — keep original filename stem.
                Path::new(&asset.file_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&asset.file_name)
                    .to_string()
            }
        }
    };

    // Phase 1: Plan moves — compute (old_abs, target_dir, target_stem, ext)
    // for assets whose current location differs from the target.
    struct PlannedMove {
        old_abs: String,
        new_abs: String,
        new_rel: String,
    }

    let all_assets: Vec<AssetInfo> = {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        vault.asset_index.all()
    };

    let mut planned: Vec<PlannedMove> = Vec::new();
    let mut claimed: std::collections::HashSet<String> = std::collections::HashSet::new();
    for asset in &all_assets {
        let ext = ext_of(&asset.file_name);
        let target_dir = compute_target_dir(asset);
        let target_stem = compute_stem(asset);

        // Resolve collision: if target path exists on disk or is claimed by
        // an earlier planned move, append -1, -2, … until free.
        let mut final_name = format!("{target_stem}.{ext}");
        let mut final_path = target_dir.join(&final_name);
        let mut counter = 1u32;
        loop {
            let p_str = final_path.to_string_lossy().to_string();
            if !final_path.exists() && !claimed.contains(&p_str) {
                break; // Free slot.
            }
            if p_str == asset.abs_path {
                break; // Already at the target — will be skipped below.
            }
            final_name = format!("{target_stem}-{counter}.{ext}");
            final_path = target_dir.join(&final_name);
            counter += 1;
        }

        let new_abs = final_path.to_string_lossy().to_string();
        let new_rel = final_path
            .strip_prefix(&vault_root)
            .unwrap_or(&final_path)
            .to_string_lossy()
            .to_string();

        // Skip if already in the correct location.
        if new_abs == asset.abs_path {
            continue;
        }

        claimed.insert(new_abs.clone());

        planned.push(PlannedMove {
            old_abs: asset.abs_path.clone(),
            new_abs,
            new_rel,
        });
    }
    if planned.is_empty() {
        return Ok(ReorganizeResult {
            files_moved: 0,
            embeds_rewritten: 0,
        });
    }

    // Phase 2: Execute moves, update asset index.
    let mut files_moved: u32 = 0;
    let mut moved_pairs: Vec<(String, String)> = Vec::new(); // (old_abs, new_abs)

    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;

        for mv in &planned {
            // Ensure target directory exists.
            let target_dir = Path::new(&mv.new_abs).parent().unwrap_or(&vault_root);
            let _ = std::fs::create_dir_all(target_dir);

            register_self_writes(state, &[PathBuf::from(&mv.old_abs)]);

            if std::fs::rename(&mv.old_abs, &mv.new_abs).is_err() {
                // Remove the self-write entry on failure.
                if let Ok(mut guard) = state.self_writes.lock() {
                    guard.remove(std::path::Path::new(&mv.old_abs));
                }
                continue;
            }

            // Update index: remove old entry, insert updated.
            if let Some(old_info) = vault.asset_index.remove(&mv.old_abs) {
                let mut updated = old_info;
                updated.abs_path = mv.new_abs.clone();
                updated.rel_path = mv.new_rel.clone();
                updated.file_name = Path::new(&mv.new_abs)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&updated.file_name)
                    .to_string();
                updated.file_type = basalt_vault::asset_index::infer_file_type(&updated.file_name);
                updated.mime_type =
                    basalt_vault::asset_index::infer_mime_type(&updated.file_name).to_string();
                vault.asset_index.upsert(updated);
            }

            files_moved += 1;
            moved_pairs.push((mv.old_abs.clone(), mv.new_abs.clone()));
        }
    }

    // Phase 3: Rewrite embed targets in all notes for moved assets.
    let mut embeds_rewritten: u32 = 0;
    if !moved_pairs.is_empty() {
        let candidates: Vec<String> = {
            let vault = state
                .vault
                .read()
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            vault.note_paths()
        };

        for (old_abs, new_abs) in &moved_pairs {
            let old_path_obj = Path::new(old_abs)
                .strip_prefix(&vault_root)
                .unwrap_or(Path::new(old_abs));
            let new_path_obj = Path::new(new_abs)
                .strip_prefix(&vault_root)
                .unwrap_or(Path::new(new_abs));
            let old_target = strip_asset_ext(old_path_obj);
            let new_target = strip_asset_ext(new_path_obj);

            for note_path in &candidates {
                let Ok(content) = std::fs::read_to_string(note_path) else {
                    continue;
                };
                if !content.contains(old_target.as_ref()) {
                    continue;
                }
                let next = rewrite_asset_embeds(&content, old_target.as_ref(), new_target.as_ref());
                if next == content {
                    continue;
                }
                register_self_writes(state, &[PathBuf::from(note_path)]);
                if std::fs::write(note_path, &next).is_ok() {
                    embeds_rewritten += 1;
                }
            }
        }
    }

    Ok(ReorganizeResult {
        files_moved,
        embeds_rewritten,
    })
}

#[path = "reorganize_tests.rs"]
#[cfg(test)]
mod tests;
