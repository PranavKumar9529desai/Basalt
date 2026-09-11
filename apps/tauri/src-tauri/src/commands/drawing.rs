use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use super::common::{ensure_inside_vault, index_upsert, register_self_writes};
use crate::app_state::AppState;
use crate::core::drawing::obsidian::{is_obsidian_excalidraw_format, serialize_obsidian_markdown};
use crate::core::drawing::{
    atomic_write_file, parse_drawing_content, serialize_drawing_markdown, DrawingPayload,
    EMPTY_DRAWING_JSON,
};
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct CreateDrawingResult {
    pub path: String,
    pub name: String,
}

fn is_valid_drawing_extension(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    name.ends_with(".drawing.md")
        || name.ends_with(".excalidraw.md")
        || path.extension().and_then(|e| e.to_str()) == Some("excalidraw")
}

fn resolve_drawing_path(path: &str, state: &AppState) -> AppResult<PathBuf> {
    let p = Path::new(path);
    if !is_valid_drawing_extension(p) {
        return Err(AppError::Validation(
            "only .drawing.md, .excalidraw.md, or .excalidraw files are supported".to_string(),
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

/// Read a drawing file from disk and return its structured DrawingPayload.
/// Parse drawing content (hybrid `.drawing.md`, Obsidian `.excalidraw.md`, or
/// raw `.excalidraw` JSON) into a structured payload. Used by the view-mode
/// toggle to rebuild the scene from raw markdown edits without a TS re-parse.
#[tauri::command]
pub fn parse_drawing(content: String) -> DrawingPayload {
    parse_drawing_content(&content)
}

/// Serialize a scene into the hybrid `.drawing.md` backplane without writing
/// to disk. Used by the view-mode toggle to preview the generated markdown.
#[tauri::command]
pub fn serialize_drawing(
    data_json: String,
    existing_markdown: Option<String>,
) -> Result<String, String> {
    serialize_drawing_markdown(&data_json, existing_markdown.as_deref())
}

/// Read a drawing file from disk and return its structured DrawingPayload.
#[tauri::command]
pub fn read_drawing(path: String, state: State<AppState>) -> AppResult<DrawingPayload> {
    let abs = resolve_drawing_path(&path, &state)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read drawing: {e}")))?;
    Ok(parse_drawing_content(&content))
}

/// Write drawing content atomically to disk and synchronize vault cache and search index.
#[tauri::command]
pub fn save_drawing(
    path: String,
    data_json: String,
    raw_markdown: Option<String>,
    state: State<AppState>,
) -> AppResult<()> {
    let abs = resolve_drawing_path(&path, &state)?;

    let content = if let Some(raw) = raw_markdown {
        raw
    } else {
        let existing = std::fs::read_to_string(&abs).ok();
        match existing.as_deref() {
            // Preserve Obsidian Excalidraw plugin files: update only the
            // Drawing block so the file stays round-trippable in Obsidian.
            Some(existing) if is_obsidian_excalidraw_format(existing) => {
                serialize_obsidian_markdown(&data_json, existing)
            }
            _ => serialize_drawing_markdown(&data_json, existing.as_deref())
                .map_err(AppError::Validation)?,
        }
    };

    register_self_writes(&state, std::slice::from_ref(&abs));
    if let Err(e) = atomic_write_file(&abs, &content) {
        if let Ok(mut guard) = state.self_writes.lock() {
            guard.remove(&abs);
        }
        return Err(AppError::Io(format!("failed to write drawing file: {e}")));
    }

    let abs_str = abs.to_string_lossy().to_string();
    {
        let mut vault = state
            .vault
            .write()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        vault.add_document(&abs_str, &content);
    }
    index_upsert(&state, &abs_str, &content);

    Ok(())
}

/// Create a new untitled `.drawing.md` file under the given parent directory.
#[tauri::command]
pub fn create_untitled_drawing(
    parent: Option<String>,
    state: State<AppState>,
) -> AppResult<CreateDrawingResult> {
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
            "Untitled".to_string()
        } else {
            format!("Untitled {i}")
        };

        let file_path = parent_dir.join(format!("{name}.drawing.md"));
        if file_path.exists() {
            continue;
        }

        if !parent_dir.exists() {
            std::fs::create_dir_all(&parent_dir)
                .map_err(|e| AppError::Io(format!("failed to create directory: {e}")))?;
        }

        let content = serialize_drawing_markdown(EMPTY_DRAWING_JSON, None)
            .map_err(AppError::Validation)?;

        register_self_writes(&state, std::slice::from_ref(&file_path));
        if let Err(e) = atomic_write_file(&file_path, &content) {
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

        return Ok(CreateDrawingResult {
            path: abs_path,
            name,
        });
    }

    Err(AppError::Other(
        "too many untitled drawings (all 100 slots taken)".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_drawing_extension() {
        assert!(is_valid_drawing_extension(Path::new("test.drawing.md")));
        assert!(is_valid_drawing_extension(Path::new("test.excalidraw.md")));
        assert!(is_valid_drawing_extension(Path::new("test.excalidraw")));
        assert!(!is_valid_drawing_extension(Path::new("test.md")));
        assert!(!is_valid_drawing_extension(Path::new("test.canvas")));
    }
}
