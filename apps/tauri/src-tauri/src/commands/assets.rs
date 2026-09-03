//! Asset management: list, audit, cleanup, reorganize, and save attachments.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::{register_self_writes, strip_asset_ext};


/// Return all non-markdown assets tracked in the vault.
#[tauri::command]
pub fn get_assets(state: State<AppState>) -> AppResult<Vec<basalt_vault::AssetInfo>> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    Ok(vault.asset_index.all())
}

/// Run a consistency audit: count orphans, duplicates, and broken embed refs.
///
/// `broken_embed_count` is computed here (not in `AssetIndex::audit`, which
/// only sees assets) because resolving an embed target requires the note
/// graph + arena as well as the asset index.
#[tauri::command]
pub fn get_asset_audit(state: State<AppState>) -> AppResult<basalt_vault::AssetAuditReport> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    let mut report = vault.asset_index.audit();
    report.broken_embed_count = count_broken_embeds(&vault);
    Ok(report)
}

/// Number of notes whose `![[target]]` resolves to neither a tracked asset
/// nor a note in the vault. Reads only the in-memory graph metadata + arena —
/// no disk I/O.
fn count_broken_embeds(vault: &basalt_vault::Vault) -> usize {
    // Index of note stems (lowercased, no extension) for O(1) note-target lookup.
    let note_stems: std::collections::HashSet<String> = vault
        .note_paths()
        .into_iter()
        .map(|p| {
            Path::new(&p)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
        })
        .collect();

    let mut broken = 0usize;
    for path in vault.note_paths() {
        let Some(meta) = vault.metadata(&path) else {
            continue;
        };
        for target in &meta.embeds {
            if vault.asset_index.resolve_asset(target).is_some() {
                continue;
            }
            let t = target.trim().to_lowercase();
            let t_no_md = t.strip_suffix(".md").unwrap_or(&t).to_string();
            let t_stem = Path::new(&t_no_md)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if note_stems.contains(&t_no_md)
                || (!t_stem.is_empty() && note_stems.contains(&t_stem))
            {
                continue;
            }
            broken += 1;
        }
    }
    broken
}

#[derive(Serialize)]
pub struct CleanupResult {
    pub orphans_deleted: u32,
    pub duplicates_deleted: u32,
}

/// Delete orphaned assets and consolidate duplicates.
///
/// Safety contract — cleanup NEVER breaks a note's references:
/// - Only assets with zero `embeds_by`/`linked_by` references are deleted;
///   a referenced asset is never removed, even as a byte-identical duplicate.
/// - Within a same-`content_hash` group where no copy is referenced, exactly
///   one copy (shortest `rel_path`) is kept so cleanup never destroys the
///   last remaining copy of an asset.
///
/// Front-end must refresh the asset list after calling this.
#[tauri::command]
pub fn cleanup_assets(state: State<AppState>) -> AppResult<CleanupResult> {
    cleanup_assets_impl(state.inner())
}

/// Testable core of `cleanup_assets` (no `tauri::State`).
fn cleanup_assets_impl(state: &AppState) -> AppResult<CleanupResult> {
    let _vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let mut orphans_deleted: u32 = 0;
    let mut duplicates_deleted: u32 = 0;

    // Phase 1: Identify deletable assets.
    let to_delete: Vec<(String, bool)> = {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;

        let all_assets = vault.asset_index.all();

        // Group by content hash; membership in a >1 group flags duplicates.
        let mut hash_groups: std::collections::HashMap<String, Vec<&basalt_vault::AssetInfo>> =
            std::collections::HashMap::new();
        for asset in &all_assets {
            if !asset.content_hash.is_empty() {
                hash_groups
                    .entry(asset.content_hash.clone())
                    .or_default()
                    .push(asset);
            }
        }

        // One keeper per unreferenced duplicate group (shortest rel_path).
        let mut keep: std::collections::HashSet<String> = std::collections::HashSet::new();
        for group in hash_groups.values().filter(|g| g.len() > 1) {
            let referenced = group
                .iter()
                .any(|a| !a.embeds_by.is_empty() || !a.linked_by.is_empty());
            if referenced {
                // Content survives in the referenced copy(ies); every
                // unreferenced member is a spare copy and safe to delete.
                continue;
            }
            let keeper = group
                .iter()
                .min_by(|a, b| a.rel_path.cmp(&b.rel_path))
                .expect("group is non-empty");
            keep.insert(keeper.abs_path.clone());
        }

        let mut out: Vec<(String, bool)> = Vec::new();
        for asset in &all_assets {
            let referenced = !asset.embeds_by.is_empty() || !asset.linked_by.is_empty();
            if referenced || keep.contains(&asset.abs_path) {
                continue;
            }
            let is_duplicate = hash_groups
                .get(&asset.content_hash)
                .is_some_and(|g| g.len() > 1);
            out.push((asset.abs_path.clone(), !is_duplicate));
        }
        out
    };

    // Phase 2: Delete files from disk and remove from the index.
    if !to_delete.is_empty() {
        register_self_writes(
            state,
            &to_delete
                .iter()
                .map(|(p, _)| PathBuf::from(p))
                .collect::<Vec<_>>(),
        );

        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;

        for (abs_path, is_orphan) in &to_delete {
            if std::fs::remove_file(abs_path).is_ok() {
                vault.asset_index.remove(abs_path);
                if *is_orphan {
                    orphans_deleted += 1;
                } else {
                    duplicates_deleted += 1;
                }
            }
        }
    }

    Ok(CleanupResult {
        orphans_deleted,
        duplicates_deleted,
    })
}

/// Strip only the final extension segment of a path-like string, keeping any
/// directory components. `"_attachments/foo.png"` → `"_attachments/foo"`;
/// `"_attachments/foo"` (no dot) is returned unchanged.
fn strip_last_ext(s: &str) -> &str {
    let slash = s.rfind('/').map_or(0, |v| v + 1);
    match s[slash..].rfind('.') {
        Some(dot) => &s[..slash + dot],
        None => s,
    }
}

/// Rewrite `[[old_target]]` / `![[old_target]]` wikilink targets (preserving
/// aliases, anchors, and the target's extension) to `new_target`.
///
/// Boundary-aware: a target only matches when its extension-stripped form
/// equals `old_target`, so moving `_attachments/foo.png` never corrupts
/// `![[foobar.png]]` or `![[foo/bar.png]]`. Both plain links and embeds are
/// rewritten. Matching is case-insensitive; the canonical `new_target` (with
/// the original extension) is written back.
fn rewrite_asset_embeds(content: &str, old_target: &str, new_target: &str) -> String {
    let bytes = content.as_bytes();
    let n = bytes.len();
    let mut out = String::with_capacity(content.len() + 16);
    let mut last = 0usize;
    let mut i = 0usize;
    while i < n {
        let is_embed = i + 2 < n
            && bytes[i] == b'!'
            && bytes[i + 1] == b'['
            && bytes[i + 2] == b'[';
        let is_link = i + 1 < n && bytes[i] == b'[' && bytes[i + 1] == b'[';
        if !(is_embed || is_link) {
            i += 1;
            continue;
        }
        let target_start = i + if is_embed { 3 } else { 2 };
        let mut j = target_start;
        while j < n && !matches!(bytes[j], b']' | b'|' | b'#') {
            j += 1;
        }
        let raw_target = &content[target_start..j];
        let trimmed = raw_target.trim();
        if strip_last_ext(trimmed).eq_ignore_ascii_case(old_target) {
            out.push_str(&content[last..i]);
            out.push_str(&content[i..target_start]); // keep `![[` / `[[`
            out.push_str(new_target);
            if let Some(ext) = Path::new(trimmed).extension().and_then(|e| e.to_str()) {
                out.push('.');
                out.push_str(ext);
            }
            let trailing = &content[target_start + trimmed.len()..j];
            out.push_str(trailing);
            last = j;
            i = j;
        } else {
            i = j; // skip past this target, keep scanning
        }
    }
    out.push_str(&content[last..]);
    out
}

#[derive(Serialize)]
pub struct ReorganizeResult {
    /// Number of attachment files moved to their correct location.
    pub files_moved: u32,
    /// Number of notes whose `![[...]]` / `[[...]]` asset targets were
    /// rewritten.
    pub embeds_rewritten: u32,
}

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
            let na = Path::new(a).file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let nb = Path::new(b).file_stem().and_then(|s| s.to_str()).unwrap_or("");
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
    let compute_target_dir =
        |asset: &AssetInfo| -> std::path::PathBuf {
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
            let target_dir = Path::new(&mv.new_abs)
                .parent()
                .unwrap_or(&vault_root);
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
                updated.mime_type = basalt_vault::asset_index::infer_mime_type(&updated.file_name);
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

#[derive(Serialize)]
pub struct SaveAttachmentResult {
    /// Vault-relative path, e.g. `"_attachments/image.png"`.
    pub rel_path: String,
    /// Absolute path on disk.
    pub abs_path: String,
    /// Filename written (may differ from input due to collision handling).
    pub name: String,
}

/// Save a binary attachment (pasted/dropped image, PDF, etc.) to the vault.
///
/// Organization rules (from settings):
/// - `flat`: all in `{attachments_dir}/`
/// - `by_note`: in `{attachments_dir}/{note_stem}/`
/// - `by_type`: in `{attachments_dir}/{type}/` (images/, audio/, etc.)
/// - `by_date`: in `{attachments_dir}/{YYYY-MM}/`
///
/// Naming templates:
/// - `{original_name}`: the original filename
/// - `{note_name}-{n}`: note stem + counter
/// - `{date}-{original_name}`: date prefix + original
///
/// Dedup: before writing, checks `content_hash` against existing assets —
/// returns the existing file's path if a match is found.
#[tauri::command]
pub fn save_attachment(
    name: String,
    data: Vec<u8>,
    note_path: Option<String>,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<SaveAttachmentResult> {
    use crate::config::load_config;
    use basalt_vault::asset_index::{AssetInfo, compute_md5, infer_file_type, infer_mime_type};

    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let config = load_config(&app);
    let attachments_dir = config
        .settings
        .get("attachmentFolder")
        .and_then(|v| v.as_str())
        .unwrap_or("_attachments");
    let organization = config
        .settings
        .get("attachmentOrganization")
        .and_then(|v| v.as_str())
        .unwrap_or("flat");
    let naming = config
        .settings
        .get("attachmentNaming")
        .and_then(|v| v.as_str())
        .unwrap_or("{original_name}");

    // Determine extension.
    let ext = infer_ext_from_name(&name)
        .or_else(|| infer_ext_from_data(&data))
        .unwrap_or("bin");
    let original_stem = strip_ext_from_name(&name);

    // Compute organization subdirectory.
    let vault_root = PathBuf::from(&vault_path);
    let base_dir = vault_root.join(attachments_dir);
    let sub_dir = match organization {
        "by_note" => {
            let note_stem = note_path
                .as_deref()
                .and_then(|p| Path::new(p).file_stem())
                .and_then(|s| s.to_str())
                .unwrap_or("_unfiled");
            base_dir.join(note_stem)
        }
        "by_type" => {
            let type_dir = match ext {
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => "images",
                "mp3" | "wav" | "flac" | "ogg" | "aac" | "m4a" => "audio",
                "mp4" | "mov" | "avi" | "webm" | "mkv" => "video",
                "pdf" | "doc" | "docx" | "xls" | "xlsx" => "documents",
                _ => "other",
            };
            base_dir.join(type_dir)
        }
        "by_date" => {
            let (y, m, _) = current_date();
            base_dir.join(format!("{y:04}-{m:02}"))
        }
        _ => base_dir, // "flat" or unknown
    };

    std::fs::create_dir_all(&sub_dir).map_err(|e| AppError::Io(format!("failed to create dir: {e}")))?;

    // Apply naming template.
    let base_name = match naming {
        "{note_name}-{n}" => {
            let note_stem = note_path
                .as_deref()
                .and_then(|p| Path::new(p).file_stem())
                .and_then(|s| s.to_str())
                .unwrap_or("note");
            // Counter will be applied in collision loop.
            format!("{note_stem}")
        }
        "{date}-{original_name}" => {
            let (y, m, d) = current_date();
            format!("{y:04}{m:02}{d:02}-{original_stem}")
        }
        _ => original_stem.to_string(), // "{original_name}" or unknown
    };

    // Content hash for dedup check.
    let content_hash = compute_md5(&data);

    // Dedup: check if an asset with this content hash already exists.
    if let Ok(vault) = state.vault.read() {
        for existing in vault.asset_index.all() {
            if existing.content_hash == content_hash && !existing.content_hash.is_empty() {
                // Found a duplicate — return the existing file's path.
                return Ok(SaveAttachmentResult {
                    rel_path: existing.rel_path.clone(),
                    abs_path: existing.abs_path.clone(),
                    name: existing.file_name.clone(),
                });
            }
        }
    }

    // Collision handling: append -1, -2, … until we find a free name.
    let mut final_name = format!("{base_name}.{ext}");
    let mut final_path = sub_dir.join(&final_name);
    let mut counter = 1u32;
    while final_path.exists() {
        final_name = format!("{base_name}-{counter}.{ext}");
        final_path = sub_dir.join(&final_name);
        counter += 1;
    }

    // Register self-write BEFORE writing so the watcher stays silent.
    let abs_path = final_path.to_string_lossy().to_string();
    register_self_writes(&state, &[final_path.clone()]);

    std::fs::write(&final_path, &data).map_err(|e| {
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&final_path);
        }
        AppError::Io(format!("failed to write attachment: {e}"))
    })?;

    // Rel path is relative to vault root.
    let rel_path = final_path.strip_prefix(&vault_root)
        .unwrap_or(&final_path)
        .to_string_lossy()
        .to_string();

    // Update the asset index.
    if let Ok(mut vault) = state.vault.write() {
        vault.asset_index.upsert(AssetInfo {
            rel_path: rel_path.clone(),
            abs_path: abs_path.clone(),
            file_name: final_name.clone(),
            file_type: infer_file_type(&final_name),
            mime_type: infer_mime_type(&final_name),
            size_bytes: data.len() as u64,
            content_hash,
            width: None,
            height: None,
            embeds_by: Vec::new(),
            linked_by: Vec::new(),
        });

        // Register note→asset embed if caller provided a source note. Use the
        // full `rel_path` (with extension) — it resolves via exact match, and
        // the pasted note writes `![[rel_path]]` verbatim.
        if let Some(note) = &note_path {
            vault.asset_index.register_embeds(note, &[rel_path.clone()]);
        }
    }

    Ok(SaveAttachmentResult {
        rel_path,
        abs_path,
        name: final_name,
    })
}

/// Infer extension from the last `.` segment of a name, if it looks like a
/// real extension (1–8 lowercase alphanum chars).
fn infer_ext_from_name(name: &str) -> Option<&'static str> {
    let ext = Path::new(name)
        .extension()?
        .to_str()?;
    // Match known extensions and return a static string literal (not a
    // borrow of `name`).
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("png"),
        "jpg" | "jpeg" => Some("jpg"),
        "gif" => Some("gif"),
        "webp" => Some("webp"),
        "svg" => Some("svg"),
        "bmp" => Some("bmp"),
        "pdf" => Some("pdf"),
        "mp3" => Some("mp3"),
        "wav" => Some("wav"),
        "mp4" => Some("mp4"),
        "mov" => Some("mov"),
        "webm" => Some("webm"),
        "ico" => Some("ico"),
        _ => None,
    }
}

/// Try to guess extension from file magic bytes.
fn infer_ext_from_data(data: &[u8]) -> Option<&'static str> {
    if data.len() < 8 {
        return None;
    }
    if data.starts_with(b"\x89PNG\r\n\x1a\n") { return Some("png"); }
    if data.starts_with(b"\xff\xd8\xff") { return Some("jpg"); }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") { return Some("gif"); }
    if data.starts_with(b"RIFF") && data.len() > 12 && &data[8..12] == b"WEBP" { return Some("webp"); }
    if data.starts_with(b"%PDF") { return Some("pdf"); }
    if data.starts_with(b"\x00\x00\x00") && data.len() > 12 && &data[4..8] == b"ftyp" {
        // MP4 / MOV / HEIC etc — default to mp4
        return Some("mp4");
    }
    None
}

/// Strip the file extension from a name, if present and known.
fn strip_ext_from_name(name: &str) -> &str {
    let stem = Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    if stem.len() == name.len() { name } else { stem }
}

/// Convert an epoch-day count to a civil (year, month, day) triple using the
/// Howard Hinnant civil date algorithm (no `chrono` dependency).
fn date_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let d = doy - (153 * mp + 2) / 5 + 1;
    let yr = if m <= 2 { y + 1 } else { y };
    (yr as i32, m as u32, d as u32)
}

/// Return today's date as (year, month, day).
fn current_date() -> (i32, u32, u32) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    date_from_days((secs / 86400) as i64)
}

/// Return a file's last-modified date as (year, month, day), falling back to
/// today when the mtime is unavailable. Used for `by_date` organization.
fn file_mtime_date(path: &std::path::Path) -> (i32, u32, u32) {
    use std::time::UNIX_EPOCH;
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() / 86400 as u64);
    match mtime {
        Some(days) => date_from_days(days as i64),
        None => current_date(),
    }
}


#[cfg(test)]
mod tests {
    use super::*;
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

  #[test]
  fn current_date_returns_plausible_values() {
      let (y, m, d) = super::current_date();
      assert!(y >= 2024 && y <= 2030, "year should be around now: {y}");
      assert!(m >= 1 && m <= 12, "month should be 1..=12: {m}");
      assert!(d >= 1 && d <= 31, "day should be 1..=31: {d}");
  }

  #[test]
  fn reorganize_flat_to_by_note_moves_assets_and_rewrites_embeds() {
      use basalt_vault::asset_index::AssetInfo;
      use std::collections::HashMap;

      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();

      // Asset lives flat alongside the note root: _attachments/logo.png
      let attach_dir = root.join("_attachments");
      std::fs::create_dir_all(&attach_dir).unwrap();
      let png_path = attach_dir.join("logo.png");
      std::fs::write(&png_path, &[0x89u8, 0x50, 0x4E, 0x47]).unwrap(); // PNG magic
      let abs = png_path.to_string_lossy().to_string();
      let rel = "_attachments/logo.png".to_string();
      let old_target = "_attachments/logo".to_string();

      state.vault.write().unwrap().asset_index.upsert(AssetInfo {
          rel_path: rel.clone(),
          abs_path: abs.clone(),
          file_name: "logo.png".into(),
          file_type: basalt_vault::asset_index::FileType::Image,
          mime_type: "image/png".into(),
          size_bytes: 4,
          content_hash: "hash123".into(),
          width: None,
          height: None,
          embeds_by: vec![b_str.clone()],
          linked_by: vec![],
      });

      // Note A embeds the asset via ![[...]].
      let a_str = root.join("a.md").to_string_lossy().to_string();
      let a_content = format!("Logo: ![[{old_target}]]\n");
      std::fs::write(&a_str, &a_content).unwrap();
      state.vault.write().unwrap().add_document(&a_str, &a_content);

      // Settings: organization=by_note, naming={original_name}
      let mut settings: HashMap<String, serde_json::Value> = HashMap::new();
      settings.insert("attachmentOrganization".into(), serde_json::Value::String("by_note".into()));
      settings.insert("attachmentNaming".into(), serde_json::Value::String("{original_name}".into()));
      settings.insert("attachmentFolder".into(), serde_json::Value::String("_attachments".into()));

      let res = reorganize_assets_impl(&state, &settings).unwrap();

      assert_eq!(res.files_moved, 1, "one asset moved");

      // Asset should now live under _attachments/a/ (note A embeds it via
      // ![[...]] and "a" sorts first alphabetically in note_from_embeds).
      let new_path = root.join("_attachments").join("a").join("logo.png");
      assert!(new_path.exists(), "asset moved to by_note dir: {}", new_path.display());
      assert!(!png_path.exists(), "old flat asset gone");

      // Embed in note A rewritten.
      let a_after = std::fs::read_to_string(&a_str).unwrap();
      assert!(
          a_after.contains("_attachments/a/logo"),
          "embed rewritten: {a_after}"
      );
      assert!(!a_after.contains("_attachments/logo"), "old flat target gone: {a_after}");
  }

  /// Reorganize with no-op settings: already-organized asset stays put.
  #[test]
  fn reorganize_noop_when_already_correct() {
      use basalt_vault::asset_index::AssetInfo;
      use std::collections::HashMap;

      let (root, state) = temp_vault();

      let attach_dir = root.join("_attachments");
      std::fs::create_dir_all(&attach_dir).unwrap();
      let png_path = attach_dir.join("logo.png");
      std::fs::write(&png_path, &[0x89u8]).unwrap();
      let abs = png_path.to_string_lossy().to_string();

      state.vault.write().unwrap().asset_index.upsert(AssetInfo {
          rel_path: "_attachments/logo.png".into(),
          abs_path: abs.clone(),
          file_name: "logo.png".into(),
          file_type: basalt_vault::asset_index::FileType::Image,
          mime_type: "image/png".into(),
          size_bytes: 1,
          content_hash: "".into(),
          width: None,
          height: None,
          embeds_by: vec![],
          linked_by: vec![],
      });

      let settings: HashMap<String, serde_json::Value> = HashMap::new(); // all defaults (flat/original_name)
      let res = reorganize_assets_impl(&state, &settings).unwrap();
      assert_eq!(res.files_moved, 0, "no files should move");
      assert!(png_path.exists(), "asset unchanged");
  }
  #[test]
  fn rewrite_asset_embeds_boundary() {
      let content = concat!(
          "A ![[_attachments/foo.png]] and ![[_attachments/foobar.png]] and\n",
          "![[_attachments/foo/bar.png]] and [[_attachments/foo.png|alias]] and\n",
          "![[_attachments/foo.png#anchor]]",
      );
      let out = rewrite_asset_embeds(content, "_attachments/foo", "_attachments/images/foo");
      assert!(out.contains("![[_attachments/images/foo.png]]"), "exact embed rewritten");
      assert!(
          out.contains("![[_attachments/foobar.png]]"),
          "sibling prefix must not be rewritten: {out}"
      );
      assert!(
          out.contains("![[_attachments/foo/bar.png]]"),
          "nested target must not be rewritten: {out}"
      );
      assert!(
          out.contains("[[_attachments/images/foo.png|alias]]"),
          "plain link + alias preserved: {out}"
      );
      assert!(
          out.contains("![[_attachments/images/foo.png#anchor]]"),
          "anchor preserved: {out}"
      );
  }

  /// Cleanup must never delete a referenced asset (even a byte-identical
  /// duplicate), and must keep one copy per unreferenced duplicate group.
  #[test]
  fn cleanup_preserves_referenced_duplicates_and_keeps_one_copy() {
      use basalt_vault::asset_index::AssetInfo;

      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();

      let add_asset = |name: &str, hash: &str, embeds_by: Vec<String>| {
          let abs = root.join(name).to_string_lossy().to_string();
          std::fs::write(root.join(name), &[0x89u8]).unwrap();
          state.vault.write().unwrap().asset_index.upsert(AssetInfo {
              rel_path: name.into(),
              abs_path: abs,
              file_name: name.into(),
              file_type: basalt_vault::asset_index::FileType::Image,
              mime_type: "image/png".into(),
              size_bytes: 1,
              content_hash: hash.into(),
              width: None,
              height: None,
              embeds_by,
              linked_by: vec![],
          });
      };

      // Referenced asset + an unreferenced identical copy.
      add_asset("ref.png", "H", vec![b_str.clone()]);
      add_asset("refdup.png", "H", vec![]);
      // Unique orphan.
      add_asset("orphan.png", "O", vec![]);
      // Unreferenced duplicate pair — exactly one copy must survive.
      add_asset("k1.png", "K", vec![]);
      add_asset("k2.png", "K", vec![]);

      let res = cleanup_assets_impl(&state).unwrap();

      assert!(root.join("ref.png").exists(), "referenced asset kept");
      assert!(
          !root.join("refdup.png").exists(),
          "unreferenced duplicate of referenced content deleted"
      );
      assert!(!root.join("orphan.png").exists(), "unique orphan deleted");
      assert!(root.join("k1.png").exists(), "keeper of unreferenced dup group kept");
      assert!(!root.join("k2.png").exists(), "extra unreferenced dup deleted");

      assert_eq!(res.orphans_deleted, 1, "only the unique orphan");
      assert_eq!(res.duplicates_deleted, 2, "refdup + k2");
  }

  /// `{note_name}-{n}` naming must match save_attachment's scheme: base is
  /// the note stem, `-N` is a collision counter, not the original stem.
  #[test]
  fn reorganize_note_name_counter_parity() {
      use basalt_vault::asset_index::AssetInfo;
      use std::collections::HashMap;

      let (root, state) = temp_vault();
      let b_str = root.join("b.md").to_string_lossy().to_string();

      let attach_dir = root.join("_attachments");
      std::fs::create_dir_all(&attach_dir).unwrap();
      for name in ["logo.png", "logo2.png"] {
          let abs = attach_dir.join(name).to_string_lossy().to_string();
          std::fs::write(attach_dir.join(name), &[0x89u8]).unwrap();
          state.vault.write().unwrap().asset_index.upsert(AssetInfo {
              rel_path: format!("_attachments/{name}"),
              abs_path: abs,
              file_name: name.into(),
              file_type: basalt_vault::asset_index::FileType::Image,
              mime_type: "image/png".into(),
              size_bytes: 1,
              content_hash: "hash123".into(),
              width: None,
              height: None,
              embeds_by: vec![b_str.clone()],
              linked_by: vec![],
          });
      }

      let mut settings: HashMap<String, serde_json::Value> = HashMap::new();
      settings.insert("attachmentOrganization".into(), serde_json::Value::String("by_note".into()));
      settings.insert("attachmentNaming".into(), serde_json::Value::String("{note_name}-{n}".into()));
      settings.insert("attachmentFolder".into(), serde_json::Value::String("_attachments".into()));

      let res = reorganize_assets_impl(&state, &settings).unwrap();
      assert_eq!(res.files_moved, 2, "both assets filed under the note");

      assert!(root.join("_attachments").join("b").join("b.png").exists());
      assert!(root.join("_attachments").join("b").join("b-1.png").exists());
      assert!(!root.join("_attachments").join("logo.png").exists());
      assert!(!root.join("_attachments").join("logo2.png").exists());
  }

  /// Broken-embed count resolves both asset and note targets, and counts a
  /// note only when at least one embed resolves to neither.
  #[test]
  fn count_broken_embeds_resolves_assets_and_notes() {
      use basalt_vault::asset_index::AssetInfo;

      let (root, state) = temp_vault();
      let note1 = root.join("note1.md").to_string_lossy().to_string();
      let note2 = root.join("note2.md").to_string_lossy().to_string();

      state.vault.write().unwrap().add_document(
          &note1,
          "A ![[present.png]] and a broken ![[missing.png]]",
      );
      state.vault.write().unwrap().add_document(&note2, "Note embed ![[b]]");

      state.vault.write().unwrap().asset_index.upsert(AssetInfo {
          rel_path: "present.png".into(),
          abs_path: root.join("present.png").to_string_lossy().to_string(),
          file_name: "present.png".into(),
          file_type: basalt_vault::asset_index::FileType::Image,
          mime_type: "image/png".into(),
          size_bytes: 1,
          content_hash: "h".into(),
          width: None,
          height: None,
          embeds_by: vec![],
          linked_by: vec![],
      });

      let vault = state.vault.read().unwrap();
      assert_eq!(count_broken_embeds(&vault), 1, "only ![[missing.png]] is broken");
  }
}
