use std::sync::{Arc, RwLock};

use basalt_search::SearchState;
use basalt_vault::{watcher::VaultWatcher, Vault};

/// Global application state shared across Tauri COMMANDS.
pub struct AppState {
    pub vault: Arc<RwLock<Vault>>,
    pub vault_path: RwLock<Option<String>>,
    pub watcher: RwLock<Option<VaultWatcher>>,
    /// `None` until the vault is loaded and the search index is ready.
    pub search: Arc<RwLock<Option<SearchState>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Arc::new(RwLock::new(Vault::new())),
            vault_path: RwLock::new(None),
            watcher: RwLock::new(None),
            search: Arc::new(RwLock::new(None)),
        }
    }
}
