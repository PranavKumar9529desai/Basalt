use basalt_canvas::CanvasDocument;

/// Validate JSON Canvas content and return it for frontend deserialization.
/// The command validates the document structure (duplicate ids, dangling edges,
/// bad subpaths) but does not re-serialize — the frontend deserializes the
/// original JSON directly into its typed representation.
#[tauri::command]
pub fn parse_canvas(json: String) -> Result<String, String> {
    let doc: CanvasDocument = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    basalt_canvas::validate(&doc).map_err(|e| e.to_string())?;
    // Return validated doc as compact JSON so frontend gets a canonical form.
    serde_json::to_string(&doc).map_err(|e| e.to_string())
}
