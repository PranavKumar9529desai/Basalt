use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use basalt_search::SearchState;
use basalt_vault::{watcher::VaultWatcher, Vault};

/// Global application state shared across Tauri COMMANDS.
pub struct AppState {
    pub vault: Arc<RwLock<Vault>>,
    pub vault_path: RwLock<Option<String>>,
    pub watcher: RwLock<Option<VaultWatcher>>,
    /// `None` until the vault is loaded and the search index is ready.
    pub search: Arc<RwLock<Option<SearchState>>>,
    /// Paths the app itself is about to write (registered by `save_file`
    /// BEFORE the write). The watcher consumes the marker and skips the
    /// event — app-initiated writes must not surface as external changes
    /// or trigger search reindexes. Deterministic consume-on-match, not
    /// time-based. Future listeners (graph, plugins) get the same
    /// guarantee: `vault://file-changed` means "someone else wrote this".
    pub self_writes: Arc<Mutex<HashSet<PathBuf>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Arc::new(RwLock::new(Vault::new())),
            vault_path: RwLock::new(None),
            watcher: RwLock::new(None),
            search: Arc::new(RwLock::new(None)),
            self_writes: Arc::new(Mutex::new(HashSet::new())),
        }
    }
}
