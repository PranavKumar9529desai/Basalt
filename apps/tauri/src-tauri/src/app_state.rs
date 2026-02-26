use std::sync::{Arc, RwLock};

use basalt_fs::{watcher::VaultWatcher, Vault};

/// Global application state shared across commands.
/// Holds the in-memory vault index and the active filesystem watcher.
pub struct AppState {
    pub vault: Arc<RwLock<Vault>>,
    pub watcher: RwLock<Option<VaultWatcher>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Arc::new(RwLock::new(Vault::new())),
            watcher: RwLock::new(None),
        }
    }
}
