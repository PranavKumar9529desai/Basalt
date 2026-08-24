use std::path::PathBuf;

/// Write a developer report (e.g. editor benchmark results) to a temp file so
/// results can be read WITHOUT devtools open (devtools inflate measurements).
/// Deliberately not routed through the vault — reports are not notes.
#[tauri::command]
pub fn write_dev_report(file_name: String, contents: String) -> Result<String, String> {
    // Sanitize: plain file name only, no path traversal.
    if file_name.is_empty()
        || !file_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        || file_name.starts_with('.')
    {
        return Err("invalid file name".into());
    }

    let dir = std::env::temp_dir().join("basalt-reports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path: PathBuf = dir.join(file_name);
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
