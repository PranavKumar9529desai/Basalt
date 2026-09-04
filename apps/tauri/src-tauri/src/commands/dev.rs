use std::path::PathBuf;

use crate::error::AppError;

/// Write a developer report (e.g. editor benchmark results) to a temp file so
/// results can be read WITHOUT devtools open (devtools inflate measurements).
/// Deliberately not routed through the vault — reports are not notes.
#[tauri::command]
pub fn write_dev_report(file_name: String, contents: String) -> Result<String, AppError> {
    // Sanitize: plain file name only, no path traversal.
    if file_name.is_empty()
        || !file_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        || file_name.starts_with('.')
    {
        return Err(AppError::Validation("invalid file name".to_string()));
    }

    let dir = std::env::temp_dir().join("basalt-reports");
    std::fs::create_dir_all(&dir)?;
    let path: PathBuf = dir.join(file_name);
    std::fs::write(&path, contents)?;
    Ok(path.to_string_lossy().into_owned())
}
