use tauri::State;

use crate::app_state::AppState;
use crate::config::{load_config, save_config};
use crate::workspace::{load_workspace, save_workspace};

#[tauri::command]
pub fn set_setting(key: String, value: serde_json::Value, app: tauri::AppHandle) {
    let mut config = load_config(&app);
    config.settings.insert(key, value);
    save_config(&app, &config);
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> std::collections::HashMap<String, serde_json::Value> {
    load_config(&app).settings
}

#[tauri::command]
pub fn get_workspace(
    app: tauri::AppHandle,
) -> std::collections::HashMap<String, serde_json::Value> {
    let config = load_config(&app);
    config
        .last_vault
        .map(|vp| load_workspace(&vp))
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_workspace_key(key: String, value: serde_json::Value, app: tauri::AppHandle) {
    let config = load_config(&app);
    if let Some(vault_path) = config.last_vault {
        let mut ws = load_workspace(&vault_path);
        ws.insert(key, value);
        save_workspace(&vault_path, &ws);
    }
}
