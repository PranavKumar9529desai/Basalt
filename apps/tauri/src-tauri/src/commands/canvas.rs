use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use basalt_canvas::CanvasDocument;
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use super::common::{ensure_inside_vault, register_self_writes, index_upsert};

#[derive(Serialize)]
pub struct CreateCanvasResult {
    pub path: String,
    pub name: String,
}

/// Validate JSON Canvas content and return it for frontend deserialization.
#[tauri::command]
pub fn parse_canvas(json: String) -> Result<String, String> {
    let doc: CanvasDocument = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    basalt_canvas::validate(&doc).map_err(|e| e.to_string())?;
    serde_json::to_string(&doc).map_err(|e| e.to_string())
}

fn resolve_canvas_path(path: &str, state: &AppState) -> AppResult<PathBuf> {
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) != Some("canvas") {
        return Err(AppError::Validation(
            "only .canvas files are supported".to_string(),
        ));
    }
    if p.is_absolute() && p.exists() {
        return p
            .canonicalize()
            .map_err(|e| AppError::Io(format!("failed to resolve path: {e}")));
    }

    if let Ok(guard) = state.vault_path.read() {
        if let Some(vault_path_str) = guard.as_ref() {
            if let Ok(vault_root) = Path::new(vault_path_str).canonicalize() {
                let candidate = vault_root.join(path);
                if candidate.exists() {
                    let canonical = candidate
                        .canonicalize()
                        .map_err(|e| AppError::Io(format!("failed to resolve path: {e}")))?;
                    ensure_inside_vault(&canonical, &vault_root)?;
                    return Ok(canonical);
                }
                if !p.is_absolute() {
                    ensure_inside_vault(&candidate, &vault_root)?;
                    return Ok(candidate);
                }
            }
        }
    }

    p.canonicalize()
        .map_err(|e| AppError::Io(format!("failed to resolve path: {e}")))
}

/// Read a .canvas file from disk.
#[tauri::command]
pub fn open_canvas(path: String, state: State<AppState>) -> AppResult<String> {
    let abs = resolve_canvas_path(&path, &state)?;
    std::fs::read_to_string(abs).map_err(|e| AppError::Io(format!("failed to read file: {e}")))
}

/// Write validated canvas JSON to disk.
#[tauri::command]
pub fn save_canvas(path: String, content: String, state: State<AppState>) -> AppResult<()> {
    let doc: CanvasDocument = serde_json::from_str(&content).map_err(|e| AppError::Validation(e.to_string()))?;
    basalt_canvas::validate(&doc).map_err(|e| AppError::Validation(e.to_string()))?;
    let abs = resolve_canvas_path(&path, &state)?;

    register_self_writes(&state, std::slice::from_ref(&abs));
    if let Err(e) = std::fs::write(&abs, content) {
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&abs);
        }
        return Err(AppError::Io(format!("failed to write file: {e}")));
    }
    Ok(())
}

/// Create a new untitled .canvas file under the given parent directory.
#[tauri::command]
pub fn create_untitled_canvas(
    parent: Option<String>,
    state: State<AppState>,
) -> AppResult<CreateCanvasResult> {
    let vault_path_str = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault_root = Path::new(&vault_path_str)
        .canonicalize()
        .map_err(AppError::InvalidVaultPath)?;

    let parent_dir = match parent.as_deref() {
        Some(rel) if !rel.is_empty() => {
            let candidate = vault_root.join(rel);
            if candidate.exists() {
                let canonical = candidate
                    .canonicalize()
                    .map_err(|e| AppError::Io(format!("invalid parent path: {e}")))?;
                ensure_inside_vault(&canonical, &vault_root)?;
                canonical
            } else {
                if rel.split('/').any(|c| c == "..") {
                    return Err(AppError::Validation(
                        "parent path must not contain '..'".to_string(),
                    ));
                }
                candidate
            }
        }
        _ => vault_root.clone(),
    };

    for i in 0u32..=99 {
        let name = if i == 0 {
            "Untitled Canvas".to_string()
        } else {
            format!("Untitled Canvas {i}")
        };

        let file_path = parent_dir.join(format!("{name}.canvas"));
        if file_path.exists() {
            continue;
        }

        if !parent_dir.exists() {
            std::fs::create_dir_all(&parent_dir)
                .map_err(|e| AppError::Io(format!("failed to create directory: {e}")))?;
        }

        let content = "{}".to_string();

        register_self_writes(&state, std::slice::from_ref(&file_path));
        if let Err(e) = std::fs::write(&file_path, &content) {
            if let Ok(mut guard) = state.self_writes.lock() {
                guard.remove(&file_path);
            }
            return Err(AppError::Io(format!("failed to write file: {e}")));
        }

        let abs_path = file_path
            .canonicalize()
            .map_err(|e| AppError::Io(format!("canonicalize failed: {e}")))?
            .to_string_lossy()
            .to_string();

        {
            let mut vault = state
                .vault
                .write()
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            vault.add_document(&abs_path, &content);
        }
        index_upsert(&state, &abs_path, &content);

        return Ok(CreateCanvasResult {
            path: abs_path,
            name,
        });
    }

    Err(AppError::Other(
        "too many untitled canvases (all 100 slots taken)".to_string(),
    ))
}
