use std::path::Path;

/// Returns the path to the `.basalt/` directory inside a vault root.
fn basalt_dir(vault_path: &str) -> std::path::PathBuf {
    Path::new(vault_path).join(".basalt")
}

/// Returns the path to the workspace.json file inside `.basalt/`.
fn workspace_path(vault_path: &str) -> std::path::PathBuf {
    basalt_dir(vault_path).join("workspace.json")
}

/// Load the per-vault workspace state. Returns an empty map if the file
/// doesn't exist yet (first time opening this vault).
pub fn load_workspace(vault_path: &str) -> std::collections::HashMap<String, serde_json::Value> {
    let path = workspace_path(vault_path);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist the full workspace state to `.basalt/workspace.json`.
pub fn save_workspace(
    vault_path: &str,
    workspace: &std::collections::HashMap<String, serde_json::Value>,
) {
    let dir = basalt_dir(vault_path);
    let _ = std::fs::create_dir_all(&dir);
    let path = workspace_path(vault_path);
    if let Ok(json) = serde_json::to_string_pretty(workspace) {
        let _ = std::fs::write(path, json);
    }
}
