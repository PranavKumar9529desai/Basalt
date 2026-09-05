use std::path::PathBuf;

use basalt_canvas::CanvasDocument;

/// Validate JSON Canvas content and return it for frontend deserialization.
/// The command validates the document structure (duplicate ids, dangling edges,
/// bad subpaths) but does not re-serialize — the frontend deserializes the
/// original JSON directly into its typed representation.
#[tauri::command]
pub fn parse_canvas(json: String) -> Result<String, String> {
    let doc: CanvasDocument = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    basalt_canvas::validate(&doc).map_err(|e| e.to_string())?;
    serde_json::to_string(&doc).map_err(|e| e.to_string())
}

/// Read a .canvas file from disk. Returns the raw JSON string.
#[tauri::command]
pub fn open_canvas(path: String) -> Result<String, String> {
    let abs = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("failed to resolve path: {e}"))?;
    std::fs::read_to_string(abs).map_err(|e| format!("failed to read file: {e}"))
}

/// Write validated canvas JSON to disk.
#[tauri::command]
pub fn save_canvas(path: String, content: String) -> Result<(), String> {
    // Validate the content before writing.
    let doc: CanvasDocument = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    basalt_canvas::validate(&doc).map_err(|e| e.to_string())?;

    let abs = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("failed to resolve path: {e}"))?;
    std::fs::write(abs, content).map_err(|e| format!("failed to write file: {e}"))
}
