//! Templates "core plugin" (ADR-036): list and read template notes from the
//! user-configured template folder.
//!
//! A template is a plain Markdown note inside `templateFolder` (default
//! `Templates`). Variable expansion (`{{date}}`, `{{time}}`, `{{title}}`,
//! colon format overrides) is a frontend concern — see
//! `features/templates/lib/expand-template.ts` — so these commands only
//! enumerate and read files; they never format dates.

use std::collections::HashMap;
use std::path::Path;

use tauri::State;

use crate::app_state::AppState;
use crate::commands::common::{canonical_vault_path, ensure_inside_vault};
use crate::config::load_config;
use crate::error::{AppError, AppResult};

/// The configured template folder, relative to the vault root.
fn template_folder(settings: &HashMap<String, serde_json::Value>) -> &str {
    settings
        .get("templateFolder")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("Templates")
}

/// List template file names (e.g. `meeting.md`) in the template folder,
/// sorted. Missing folder → empty list (the plugin is lenient at setup).
pub fn list_templates_impl(
    settings: &HashMap<String, serde_json::Value>,
    vault_root: &Path,
) -> AppResult<Vec<String>> {
    let dir = vault_root.join(template_folder(settings));
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut names = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| AppError::Io(format!("failed to read template folder: {e}")))?;
    for entry in entries {
        let entry =
            entry.map_err(|e| AppError::Io(format!("failed to read template folder: {e}")))?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Some(s) = path.file_name().and_then(|s| s.to_str()) {
                names.push(s.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Read a single template's raw content. `name` must be a bare file name
/// (no path separators, no `..`) inside the template folder; the resolved
/// path is canonicalized and verified inside the vault.
pub fn read_template_impl(
    state: &AppState,
    settings: &HashMap<String, serde_json::Value>,
    name: &str,
) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.split(['/', '\\']).any(|c| c == "..")
    {
        return Err(AppError::Validation(
            "template name must be a bare file name".to_string(),
        ));
    }

    let vault_root = canonical_vault_path(state)?;
    let candidate = vault_root.join(template_folder(settings)).join(name);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| AppError::Io(format!("template not found: {name}")))?;
    ensure_inside_vault(&canonical, &vault_root)?;
    if !canonical.is_file() {
        return Err(AppError::Io(format!("template not found: {name}")));
    }

    std::fs::read_to_string(&canonical)
        .map_err(|e| AppError::Io(format!("failed to read template '{name}': {e}")))
}

#[tauri::command]
pub fn list_templates(state: State<AppState>, app: tauri::AppHandle) -> AppResult<Vec<String>> {
    let config = load_config(&app);
    let vault_root = canonical_vault_path(&state)?;
    list_templates_impl(&config.settings, &vault_root)
}

#[tauri::command]
pub fn read_template(
    name: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<String> {
    let config = load_config(&app);
    read_template_impl(&state, &config.settings, &name)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::app_state::AppState;

    use super::{list_templates_impl, read_template_impl};

    fn temp_vault() -> (std::path::PathBuf, AppState) {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("basalt-templates-test-{n}"));
        std::fs::create_dir_all(&root).unwrap();
        let state = AppState::default();
        *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
        (root, state)
    }

    #[test]
    fn list_returns_empty_when_folder_missing() {
        let (root, _state) = temp_vault();
        let settings = HashMap::new();
        let names = list_templates_impl(&settings, &root).unwrap();
        assert!(names.is_empty());
    }

    #[test]
    fn list_returns_sorted_md_only() {
        let (root, _state) = temp_vault();
        std::fs::create_dir_all(root.join("Templates")).unwrap();
        std::fs::write(root.join("Templates/meeting.md"), "one").unwrap();
        std::fs::write(root.join("Templates/lecture.md"), "two").unwrap();
        std::fs::write(root.join("Templates/notes.txt"), "not a template").unwrap();
        std::fs::write(root.join("Templates/sublink.md"), "link").unwrap();

        let settings = HashMap::new();
        let names = list_templates_impl(&settings, &root).unwrap();
        assert_eq!(
            names,
            vec![
                "lecture.md".to_string(),
                "meeting.md".to_string(),
                "sublink.md".to_string()
            ]
        );
    }

    #[test]
    fn read_returns_template_content() {
        let (root, state) = temp_vault();
        std::fs::create_dir_all(root.join("Templates")).unwrap();
        std::fs::write(root.join("Templates/meeting.md"), "# {{date}} Meeting\n").unwrap();

        let settings = HashMap::new();
        let content = read_template_impl(&state, &settings, "meeting.md").unwrap();
        assert_eq!(content, "# {{date}} Meeting\n");
    }

    #[test]
    fn read_rejects_traversal_and_nested_names() {
        let (root, state) = temp_vault();
        std::fs::create_dir_all(root.join("Templates")).unwrap();
        std::fs::write(root.join("secret.txt"), "sensitive").unwrap();

        let settings = HashMap::new();
        assert!(read_template_impl(&state, &settings, "../secret.txt").is_err());
        assert!(read_template_impl(&state, &settings, "Templates/meeting.md").is_err());
        assert!(read_template_impl(&state, &settings, "").is_err());
    }

    #[test]
    fn read_uses_custom_template_folder_setting() {
        let (root, state) = temp_vault();
        std::fs::create_dir_all(root.join("_tpl")).unwrap();
        std::fs::write(root.join("_tpl/custom.md"), "custom").unwrap();

        let mut settings = HashMap::new();
        settings.insert("templateFolder".to_string(), serde_json::json!("_tpl"));
        let content = read_template_impl(&state, &settings, "custom.md").unwrap();
        assert_eq!(content, "custom");
    }
}
