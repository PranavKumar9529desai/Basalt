use std::path::{Path, PathBuf};
use std::sync::Arc;

use basalt_vault::watcher::VaultWatcher;
use serde::Serialize;
use tauri::Emitter;

use crate::app_state::AppState;

#[derive(Serialize, Clone)]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
    pub needs_tree_refresh: bool,
}

pub fn start_watcher(
    state: &AppState,
    vault_path: &str,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let vault_arc = Arc::clone(&state.vault);
    let search_arc = Arc::clone(&state.search);
    let self_writes = Arc::clone(&state.self_writes);
    let app_handle = app.clone();

    let watcher = VaultWatcher::watch(
        Path::new(vault_path),
        vault_arc,
        move |changed_path: PathBuf, needs_refresh: bool| {
            // App-initiated writes (save_file) register themselves here
            // BEFORE writing. Consume the marker and skip: the save path
            // already updated the cache and the search index, and the
            // frontend knows about its own writes. vault://file-changed
            // must mean "changed by something OTHER than the app".
            if let Ok(mut guard) = self_writes.lock() {
                if guard.remove(&changed_path) {
                    return;
                }
            }

            // Update search index on .md file changes.
            if changed_path
                .extension()
                .and_then(|e| e.to_str())
                == Some("md")
            {
                if let Ok(mut guard) = search_arc.write() {
                    if let Some(ref mut search) = *guard {
                        let path_str = changed_path.to_string_lossy().to_string();
                        if changed_path.exists() {
                            if let Ok(content) = std::fs::read_to_string(&changed_path) {
                                // Extract inline tags (#tag) from content for the tags field.
                                let tags: String = content
                                    .split_whitespace()
                                    .filter(|w| w.starts_with('#') && w.len() > 1)
                                    .map(|w| w.trim_start_matches('#'))
                                    .collect::<Vec<_>>()
                                    .join(" ");
                                let _ = search.update_document(&path_str, &content, &tags);
                                let _ = search.commit();
                            }
                        } else {
                            let _ = search.remove_document(&path_str);
                        }
                    }
                }
            }

            // Emit event to frontend.
            let kind = if changed_path.exists() { "modified" } else { "deleted" };
            let _ = app_handle.emit(
                "vault://file-changed",
                FileChangeEvent {
                    path: changed_path.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                    needs_tree_refresh: needs_refresh,
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
