use std::path::{Path, PathBuf};
use std::sync::Arc;

use basalt_fs::watcher::VaultWatcher;
use serde::Serialize;
use tauri::Manager;

use crate::app_state::AppState;

/// Emitted on `vault://file-changed` whenever the watcher detects a mutation.
/// Richer than a raw path string — the frontend can react precisely without
/// re-fetching the entire tree for every event.
#[derive(Serialize, Clone)]
pub struct FileChangeEvent {
    /// Absolute path of the file that changed.
    pub path: String,
    /// `"created"` | `"modified"` | `"deleted"`
    pub kind: String,
}

pub fn start_watcher(
    state: &AppState,
    vault_path: &str,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let vault_arc = Arc::clone(&state.vault);
    let app_handle = app.clone();
    let watcher = VaultWatcher::watch(
        Path::new(vault_path),
        vault_arc,
        move |changed_path: PathBuf| {
            let kind = if changed_path.exists() {
                "modified"
            } else {
                "deleted"
            };
            let _ = app_handle.emit(
                "vault://file-changed",
                FileChangeEvent {
                    path: changed_path.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                },
            );
        },
    )
    .map_err(|e| format!("failed to start watcher: {e}"))?;

    *state
        .watcher
        .write()
        .map_err(|_| "watcher lock poisoned".to_string())? = Some(watcher);

    Ok(())
}
