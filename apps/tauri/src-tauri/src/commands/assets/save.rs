//! Save binary attachments to the vault; the extension inference used when
//! naming them lives in `super::infer`.

use std::path::{Path, PathBuf};

use tauri::State;

use crate::app_state::AppState;
use crate::commands::common::register_self_writes;
use crate::error::{AppError, AppResult};

use super::infer::{infer_ext_from_data, infer_ext_from_name, strip_ext_from_name};
use super::SaveAttachmentResult;

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
    let vault_root = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;
    let (attachments_dir, organization, naming) = attachment_policy(&app);
    save_attachment_impl(
        &name,
        &data,
        note_path.as_deref(),
        &attachments_dir,
        &organization,
        &naming,
        Path::new(&vault_root),
        &state,
    )
}

/// Copy an external file (delivered as a `file://` URI from an OS paste) into
/// the vault. Reuses the exact `save_attachment_impl` pipeline so pasted-from-
/// disk and pasted-from-bytes files take identical organization/naming/dedup.
#[tauri::command]
pub fn copy_attachment_from_path(
    source_path: String,
    note_path: Option<String>,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<SaveAttachmentResult> {
    let vault_root = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;
    let (attachments_dir, organization, naming) = attachment_policy(&app);

    let (name, data) = read_external(&source_path)?;
    save_attachment_impl(
        &name,
        &data,
        note_path.as_deref(),
        &attachments_dir,
        &organization,
        &naming,
        Path::new(&vault_root),
        &state,
    )
}

/// Read an OS-delivered external file (`file://` URI or plain path) into a
/// `(name, bytes)` pair for the shared save pipeline.
fn read_external(source_path: &str) -> AppResult<(String, Vec<u8>)> {
    let source = source_path.strip_prefix("file://").unwrap_or(source_path);
    let path = Path::new(source);
    let data = std::fs::read(path)
        .map_err(|e| AppError::Io(format!("failed to read external file '{source}': {e}")))?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("attachment")
        .to_string();
    Ok((name, data))
}

/// Read the attachment org policy (`attachmentFolder` / `attachmentOrganization`
/// / `attachmentNaming`) from user settings so pasted/imported assets share one
/// code path for placement rules.
fn attachment_policy(app: &tauri::AppHandle) -> (String, String, String) {
    use crate::config::load_config;
    let config = load_config(app);
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
    (
        attachments_dir.to_string(),
        organization.to_string(),
        naming.to_string(),
    )
}

/// Shared save pipeline: resolve ext + org subdir + naming, dedup by content
/// hash, write, and update the asset index. Used by both paste-from-bytes
/// (`save_attachment`) and paste-from-disk (`copy_attachment_from_path`).
fn save_attachment_impl(
    name: &str,
    data: &[u8],
    note_path: Option<&str>,
    attachments_dir: &str,
    organization: &str,
    naming: &str,
    vault_root: &Path,
    state: &AppState,
) -> AppResult<SaveAttachmentResult> {
    use basalt_vault::asset_index::{compute_md5, infer_file_type, infer_mime_type, AssetInfo};

    // Determine extension.
    let ext = infer_ext_from_name(name)
        .or_else(|| infer_ext_from_data(data))
        .unwrap_or("bin");
    let original_stem = strip_ext_from_name(name);

    // Compute organization subdirectory. `vault_root` and `same_folder`
    // ignore `attachments_dir` entirely (Obsidian's "vault root" /
    // "same folder as note" attachment locations).
    let base_dir = vault_root.join(attachments_dir);
    let sub_dir = match organization {
        "vault_root" => vault_root.to_path_buf(),
        "same_folder" => {
            let note_dir = note_path
                .and_then(|p| Path::new(p).parent())
                .and_then(|s| s.to_str())
                .filter(|s| !s.is_empty())
                .map(PathBuf::from)
                .unwrap_or_default();
            vault_root.join(note_dir)
        }
        "by_note" => {
            let note_stem =
                note_path
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

    std::fs::create_dir_all(&sub_dir)
        .map_err(|e| AppError::Io(format!("failed to create dir: {e}")))?;

    // Apply naming template.
    let base_name = match naming {
        "{note_name}-{n}" => {
            let note_stem = note_path
                .and_then(|p| Path::new(p).file_stem())
                .and_then(|s| s.to_str())
                .unwrap_or("note");
            // Counter will be applied in collision loop.
            note_stem.to_string()
        }
        "{date}-{original_name}" => {
            let (y, m, d) = current_date();
            format!("{y:04}{m:02}{d:02}-{original_stem}")
        }
        _ => original_stem.to_string(), // "{original_name}" or unknown
    };

    // Content hash for dedup check.
    let content_hash = compute_md5(data);

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
    register_self_writes(state, &[final_path.clone()]);

    std::fs::write(&final_path, data).map_err(|e| {
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&final_path);
        }
        AppError::Io(format!("failed to write attachment: {e}"))
    })?;

    // Rel path is relative to vault root.
    let rel_path = final_path
        .strip_prefix(vault_root)
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
            mime_type: infer_mime_type(&final_name).to_string(),
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
        if let Some(note) = note_path {
            vault
                .asset_index
                .register_embeds(note, std::slice::from_ref(&rel_path));
        }
    }

    Ok(SaveAttachmentResult {
        rel_path,
        abs_path,
        name: final_name,
    })
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
pub(super) fn file_mtime_date(path: &std::path::Path) -> (i32, u32, u32) {
    use std::time::UNIX_EPOCH;
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() / 86400_u64);
    match mtime {
        Some(days) => date_from_days(days as i64),
        None => current_date(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::commands::common::tests::temp_vault;

    #[test]
    fn current_date_returns_plausible_values() {
        let (y, m, d) = super::current_date();
        assert!((2024..=2030).contains(&y), "year should be around now: {y}");
        assert!((1..=12).contains(&m), "month should be 1..=12: {m}");
        assert!((1..=31).contains(&d), "day should be 1..=31: {d}");
    }

    #[test]
    fn read_external_accepts_file_uris_and_plain_paths() {
        let (root, _state) = temp_vault();
        let src = root.join("photo.png");
        std::fs::write(&src, [0x89u8, b'P', b'N', b'G']).unwrap();

        let (name, data) = read_external(&format!("file://{}", src.display())).unwrap();
        assert_eq!(name, "photo.png");
        assert_eq!(data, vec![0x89u8, b'P', b'N', b'G']);

        let (plain_name, _) = read_external(&src.to_string_lossy()).unwrap();
        assert_eq!(plain_name, "photo.png");
    }

    #[test]
    fn save_impl_writes_then_dedups_on_content_hash() {
        let (root, state) = temp_vault();
        let bytes = b"same-bytes-every-time";

        let first = save_attachment_impl(
            "pic.png",
            bytes,
            None,
            "_attachments",
            "flat",
            "{original_name}",
            &root,
            &state,
        )
        .unwrap();
        assert_eq!(first.rel_path, "_attachments/pic.png");
        assert!(root.join("_attachments/pic.png").exists());

        // Same content → dedup returns the existing path rather than pic-1.png.
        let second = save_attachment_impl(
            "pic.png",
            bytes,
            None,
            "_attachments",
            "flat",
            "{original_name}",
            &root,
            &state,
        )
        .unwrap();
        assert_eq!(second.rel_path, "_attachments/pic.png");
        assert!(!root.join("_attachments/pic-1.png").exists());

        // Different bytes → collision counter kicks in.
        let third = save_attachment_impl(
            "pic.png",
            b"different-bytes",
            None,
            "_attachments",
            "flat",
            "{original_name}",
            &root,
            &state,
        )
        .unwrap();
        assert_eq!(third.rel_path, "_attachments/pic-1.png");
    }

    #[test]
    fn save_impl_by_note_org_places_under_note_stem() {
        let (root, state) = temp_vault();

        let res = save_attachment_impl(
            "scan.pdf",
            b"%PDF-1.7",
            Some("projects/report.md"),
            "_attachments",
            "by_note",
            "{original_name}",
            &root,
            &state,
        )
        .unwrap();
        assert_eq!(res.rel_path, "_attachments/report/scan.pdf");
        assert!(root.join("_attachments/report/scan.pdf").exists());
    }

    #[test]
    fn save_impl_same_folder_places_beside_the_note() {
        let (root, state) = temp_vault();

        let res = save_attachment_impl(
            "report.png",
            &[1u8, 2, 3],
            Some("notes/report.md"),
            "_attachments",
            "same_folder",
            "{original_name}",
            &root,
            &state,
        )
        .unwrap();
        assert_eq!(res.rel_path, "notes/report.png");
        assert!(root.join("notes/report.png").exists());
    }

    #[test]
    fn save_impl_vault_root_ignores_attachment_folder() {
        let (root, state) = temp_vault();

        let res = save_attachment_impl(
            "photo.png",
            b"PNGDATA",
            None,
            "_attachments",
            "vault_root",
            "{original_name}",
            &root,
            &state,
        )
        .unwrap();
        assert_eq!(res.rel_path, "photo.png");
        assert!(root.join("photo.png").exists());
    }
}
