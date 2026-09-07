//! Shared helpers for the folder move/rename commands.

use std::path::Path;

use crate::error::AppResult;

pub(super) use crate::commands::common::{
    canonical_vault_path, ensure_inside_vault, index_remove, index_upsert, register_self_writes,
    validate_name,
};

/// Trim + validate a rename target name (stem or path segment).
pub(super) fn sanitize_path_name(raw: &str) -> AppResult<String> {
    validate_name(raw)
}

/// Resolve the final rename target name: the validated user input, with the
/// original extension appended for non-folder items unless the user already
/// supplied it (any case).
pub(super) fn resolve_rename_target_name(
    old_name: &str,
    raw: &str,
    is_folder: bool,
) -> AppResult<String> {
    let base = sanitize_path_name(raw)?;
    if is_folder {
        return Ok(base);
    }
    let Some(ext) = Path::new(old_name).extension().and_then(|e| e.to_str()) else {
        return Ok(base);
    };
    let ext_suffix = format!(".{ext}");
    if base.to_ascii_lowercase().ends_with(&ext_suffix) {
        Ok(base)
    } else {
        Ok(format!("{base}{ext_suffix}"))
    }
}

/// Vault-relative slash-normalized prefix of an absolute path.
pub(super) fn rel_prefix(abs: &std::path::Path, vault_root: &Path) -> String {
    abs.strip_prefix(vault_root)
        .unwrap_or(abs)
        .to_string_lossy()
        .replace('\\', "/")
}