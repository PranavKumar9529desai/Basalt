use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Three-tier storage:
///   Tier 1 – app_data_dir()/config.json    → global prefs, vault list (NOT portable)
///   Tier 2 – app_cache_dir()/<hash>.json   → vault index/metadata cache (regeneratable)
///   Tier 3 – vault_path/.basalt/           → per-vault workspace & appearance (portable)
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub last_vault: Option<String>,
    /// Modular settings map for scalability (themes, extensions, etc.)
    #[serde(default)]
    pub settings: std::collections::HashMap<String, serde_json::Value>,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir unavailable")
        .join("config.json")
}

pub fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = config_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(app: &tauri::AppHandle, config: &AppConfig) {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(path, json);
    }
}
