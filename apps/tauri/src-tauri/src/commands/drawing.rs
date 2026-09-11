use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use super::common::{ensure_inside_vault, index_upsert, register_self_writes};
use crate::app_state::AppState;
use crate::core::drawing::{
    atomic_write_file, create_drawing_file, is_drawing_content, parse_drawing_content,
    serialize_drawing_content, DrawingPayload, EMPTY_DRAWING_JSON,
};
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct CreateDrawingResult {
    pub path: String,
    pub name: String,
}

/// Fast-path extension check. The frontmatter marker ([`is_drawing_content`])
/// is the authoritative classifier — a drawing renamed to `carfleet.md` is
/// still a drawing — so this gate alone is never enough.
fn is_valid_drawing_extension(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    name.ends_with(".excalidraw.md")
        || path.extension().and_then(|e| e.to_str()) == Some("excalidraw")
}

fn resolve_drawing_path(path: &str, state: &AppState) -> AppResult<PathBuf> {
    let p = Path::new(path);
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
/// Parse drawing content (`.excalidraw.md` plugin shell or raw `.excalidraw`
/// JSON) into a structured payload. Used by the view-mode toggle to rebuild
/// the scene from raw markdown edits without a TS re-parse.
#[tauri::command]
pub fn parse_drawing(content: String) -> DrawingPayload {
    parse_drawing_content(&content)
}

/// Serialize a scene into the Obsidian Excalidraw shell without writing to
/// disk. Used by the view-mode toggle to preview the generated markdown.
#[tauri::command]
pub fn serialize_drawing(data_json: String, existing_markdown: Option<String>) -> String {
    serialize_drawing_content(&data_json, existing_markdown.as_deref())
}

/// Marker-authoritative drawing classification for a vault path. The frontend
/// routes plain `.md` files here: a drawing renamed to `carfleet.md` still
/// carries `excalidraw-plugin: parsed` and must open in the drawing leaf.
/// Reads only the one file — extension fast paths never call this.
#[tauri::command]
pub fn is_drawing_file(path: String, state: State<AppState>) -> bool {
    let Ok(abs) = resolve_drawing_path(&path, &state) else {
        return false;
    };
    let Ok(content) = std::fs::read_to_string(&abs) else {
        return false;
    };
    is_drawing_content(&content)
}

/// Read a drawing file from disk and return its structured DrawingPayload.
/// Classification is marker-authoritative: an `.md` renamed drawing
/// (`carfleet.md`) opens here, while a plain note is rejected even when it
/// wears a drawing-looking extension.
#[tauri::command]
pub fn read_drawing(path: String, state: State<AppState>) -> AppResult<DrawingPayload> {
    let abs = resolve_drawing_path(&path, &state)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|e| AppError::Io(format!("failed to read drawing: {e}")))?;
    if !is_drawing_content(&content) {
        return Err(AppError::Validation(
            "not a drawing file (missing the Excalidraw plugin marker)".to_string(),
        ));
    }
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

    // Never let a drawing scene overwrite a plain note: require the drawing
    // extension fast path or an existing file that actually carries the marker.
    let existing = std::fs::read_to_string(&abs).ok();
    let allowed = is_valid_drawing_extension(&abs)
        || existing.as_deref().map(is_drawing_content).unwrap_or(false);
    if !allowed {
        return Err(AppError::Validation(
            "not a drawing file (missing the Excalidraw plugin marker)".to_string(),
        ));
    }

    let content = if let Some(raw) = raw_markdown {
        raw
    } else {
        // Obsidian-shell files get a surgical in-place update (only the
        // `## Drawing` block changes); legacy Basalt hybrids are migrated to
        // the shell; missing files are created fresh with the full shell.
        serialize_drawing_content(&data_json, existing.as_deref())
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

/// Create a new untitled `.excalidraw.md` file under the given parent directory.
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

        let file_path = parent_dir.join(format!("{name}.excalidraw.md"));
        if file_path.exists() {
            continue;
        }

        if !parent_dir.exists() {
            std::fs::create_dir_all(&parent_dir)
                .map_err(|e| AppError::Io(format!("failed to create directory: {e}")))?;
        }

        let content = create_drawing_file(EMPTY_DRAWING_JSON);

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
        assert!(is_valid_drawing_extension(Path::new("test.excalidraw.md")));
        assert!(is_valid_drawing_extension(Path::new("test.excalidraw.md")));
        assert!(is_valid_drawing_extension(Path::new("test.excalidraw")));
        assert!(!is_valid_drawing_extension(Path::new("test.md")));
        assert!(!is_valid_drawing_extension(Path::new("test.canvas")));
    }
}
