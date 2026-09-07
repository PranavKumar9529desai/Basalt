//! Asset management: list, audit, cleanup, reorganize, and save attachments.

use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::error::{AppError, AppResult};

use super::common::register_self_writes;

mod reorganize;
mod rewrite;
mod save;
pub use reorganize::reorganize_assets;
pub use save::save_attachment;

#[derive(Serialize)]
/// Result of a bulk asset reorganization.
pub struct ReorganizeResult {
    /// Number of attachment files moved to their correct location.
    pub files_moved: u32,
    /// Number of notes whose `![[...]]` / `[[...]]` asset targets were
    /// rewritten.
    pub embeds_rewritten: u32,
}

#[derive(Serialize)]
/// Result of saving a binary attachment to the vault.
pub struct SaveAttachmentResult {
    /// Vault-relative path, e.g. `"_attachments/image.png"`.
    pub rel_path: String,
    /// Absolute path on disk.
    pub abs_path: String,
    /// Filename written (may differ from input due to collision handling).
    pub name: String,
}

/// Return all non-markdown assets tracked in the vault.
#[tauri::command]
pub fn get_assets(state: State<AppState>) -> AppResult<Vec<basalt_vault::AssetInfo>> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    Ok(vault.asset_index.all())
}

/// Run a consistency audit: count orphans and duplicates.
#[tauri::command]
pub fn get_asset_audit(state: State<AppState>) -> AppResult<basalt_vault::AssetAuditReport> {
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    let report = vault.asset_index.audit();
    Ok(report)
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

#[cfg(test)]
mod tests {
    use super::*;

    use crate::commands::common::tests::temp_vault;

    /// Cleanup must never delete a referenced asset (even a byte-identical
    /// duplicate), and must keep one copy per unreferenced duplicate group.
    #[test]
    fn cleanup_preserves_referenced_duplicates_and_keeps_one_copy() {
        use basalt_vault::asset_index::AssetInfo;

        let (root, state) = temp_vault();
        let b_str = root.join("b.md").to_string_lossy().to_string();

        let add_asset = |name: &str, hash: &str, embeds_by: Vec<String>| {
            let abs = root.join(name).to_string_lossy().to_string();
            std::fs::write(root.join(name), [0x89u8]).unwrap();
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
        assert!(
            root.join("k1.png").exists(),
            "keeper of unreferenced dup group kept"
        );
        assert!(
            !root.join("k2.png").exists(),
            "extra unreferenced dup deleted"
        );

        assert_eq!(res.orphans_deleted, 1, "only the unique orphan");
        assert_eq!(res.duplicates_deleted, 2, "refdup + k2");
    }
}
