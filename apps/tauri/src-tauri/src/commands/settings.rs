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
    state: State<'_, AppState>,
) -> std::collections::HashMap<String, serde_json::Value> {
    let vault_path = match state.vault_path.read() {
        Ok(guard) => guard.clone(),
        Err(_) => return std::collections::HashMap::new(),
    };
    match vault_path {
        Some(vp) => load_workspace(&vp),
        None => std::collections::HashMap::new(),
    }
}

#[tauri::command]
pub fn set_workspace_key(key: String, value: serde_json::Value, state: State<'_, AppState>) {
    let vault_path = match state.vault_path.read() {
        Ok(guard) => guard.clone(),
        Err(_) => return,
    };
    if let Some(vp) = vault_path {
        let mut ws = load_workspace(&vp);
        ws.insert(key, value);
        save_workspace(&vp, &ws);
    }
}
