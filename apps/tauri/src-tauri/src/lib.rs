use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use basalt_fs::{
    build_flat_tree, incremental_reindex, indexer::index_directory, watcher::VaultWatcher,
    FlatTreeNode, VaultCache,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

struct AppState {
    vault: Arc<RwLock<basalt_fs::Vault>>,
    watcher: RwLock<Option<VaultWatcher>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Arc::new(RwLock::new(basalt_fs::Vault::new())),
            watcher: RwLock::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Persistent config
// ---------------------------------------------------------------------------

/// Global application configuration.
///
/// STORAGE STRATEGY:
/// 1. Global (System-wide): Stored in `~/.local/share/...` (via app_data_dir).
///    Used for app-shell state: recent vaults, global preferences, window state.
/// 2. Local (Vault-specific): Stored in `vault_path/.basalt/`. (Planned)
///    Used for data context: graph metadata cache, per-vault plugins/themes.
#[derive(Serialize, Deserialize, Default, Clone)]
struct AppConfig {
    last_vault: Option<String>,
    /// Modular settings map for scalability (themes, extensions, etc.)
    #[serde(default)]
    settings: std::collections::HashMap<String, serde_json::Value>,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir unavailable")
        .join("config.json")
}

fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = config_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &tauri::AppHandle, config: &AppConfig) {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(path, json);
    }
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/// Derives a stable filename for the vault cache from the vault's root path.
/// Uses the folder name + a simple 8-char hex hash of the full path so two
/// vaults with the same folder name don't collide.
fn cache_filename(vault_path: &str) -> String {
    let folder_name = Path::new(vault_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vault");

    // Simple djb2 hash — no external dep needed.
    let hash: u32 = vault_path.bytes().fold(5381u32, |acc, b| {
        acc.wrapping_mul(33).wrapping_add(b as u32)
    });

    format!("{}_{:08x}.json", folder_name, hash)
}

fn cache_path(app: &tauri::AppHandle, vault_path: &str) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir unavailable")
        .join("cache")
        .join(cache_filename(vault_path))
}

// ---------------------------------------------------------------------------
// Shared watcher startup (used by both boot and set_vault)
// ---------------------------------------------------------------------------

fn start_watcher(state: &AppState, vault_path: &str, app: &tauri::AppHandle) -> Result<(), String> {
    let vault_arc = Arc::clone(&state.vault);
    let app_handle = app.clone();
    let watcher = VaultWatcher::watch(
        Path::new(vault_path),
        vault_arc,
        move |changed_path: PathBuf| {
            let kind = if changed_path.exists() {
                // The watcher calls on_change after updating the vault, so if
                // the file still exists it was created or modified.
                "modified"
            } else {
                "deleted"
            };
            let _ = app_handle.emit(
                "vault://file-changed",
                FileChangeEvent {
                    path: changed_path.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                },
            );
        },
    )
    .map_err(|e| format!("failed to start watcher: {e}"))?;

    *state
        .watcher
        .write()
        .map_err(|_| "watcher lock poisoned".to_string())? = Some(watcher);

    Ok(())
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct BootResult {
    /// Absolute path of the vault that was loaded, if any.
    vault_path: Option<String>,
    /// Number of notes in the vault.
    note_count: usize,
    /// One of: "no_vault" | "loaded_cache" | "incremental" | "full_index"
    status: String,
    /// Pre-built, pre-sorted flat tree — ready for the sidebar to render.
    /// Empty when `status == "no_vault"`.
    tree: Vec<FlatTreeNode>,
    /// Persisted settings from config.json
    settings: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Serialize)]
struct VaultSummary {
    note_count: usize,
}

#[derive(Serialize)]
struct LinkSuggestion {
    name: String,
    path: String,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

fn canonical_md_path(path: &str) -> std::io::Result<PathBuf> {
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "only .md files are supported",
        ));
    }
    p.canonicalize()
}

// ---------------------------------------------------------------------------
// Watcher event payload
// ---------------------------------------------------------------------------

/// Emitted on `vault://file-changed` whenever the watcher detects a mutation.
/// Richer than a raw path string — the frontend can react precisely without
/// re-fetching the entire tree for every event.
#[derive(Serialize, Clone)]
struct FileChangeEvent {
    /// Absolute path of the file that changed.
    path: String,
    /// `"created"` | `"modified"` | `"deleted"`
    kind: String,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Called once on app startup.
/// Reads the persisted config, loads the vault from cache (incrementally
/// re-indexing any files that changed while the app was closed), and starts
/// the file watcher.  If no vault has been configured yet it returns
/// `status: "no_vault"` so the frontend can show the picker UI.
#[tauri::command]
fn boot(state: State<AppState>, app: tauri::AppHandle) -> Result<BootResult, String> {
    let config = load_config(&app);

    let vault_path = match config.last_vault.clone() {
        Some(p) => p,
        None => {
            return Ok(BootResult {
                vault_path: None,
                note_count: 0,
                status: "no_vault".into(),
                tree: Vec::new(),
                settings: config.settings,
            })
        }
    };

    // Make sure the vault directory still exists.
    if !Path::new(&vault_path).is_dir() {
        return Ok(BootResult {
            vault_path: None,
            note_count: 0,
            status: "no_vault".into(),
            tree: Vec::new(),
            settings: config.settings,
        });
    }

    let cache_file = cache_path(&app, &vault_path);
    let (status, note_count) = if let Some(cache) = VaultCache::load(&cache_file) {
        // Restore vault from cache then patch only the files that changed.
        let mut vault = cache.vault;
        let new_mtimes =
            incremental_reindex(Path::new(&vault_path), &mut vault, &cache.file_mtimes);
        let note_count = vault.graph.metadata_cache.len();

        // Persist updated cache.
        let updated = VaultCache {
            version: 1,
            vault_path: vault_path.clone(),
            file_mtimes: new_mtimes,
            vault: basalt_fs::Vault::new(), // placeholder — replaced below
        };
        // We need to write the vault we just built, not a placeholder.
        // Build the real cache directly.
        let real_cache = VaultCache::build(&vault_path, vault);
        let _ = real_cache.save(&cache_file);

        // Restore into app state from the saved cache (avoids a second walk).
        if let Some(loaded) = VaultCache::load(&cache_file) {
            *state
                .vault
                .write()
                .map_err(|_| "vault lock poisoned".to_string())? = loaded.vault;
        }

        let _ = updated; // suppress warning on placeholder
        ("incremental".to_string(), note_count)
    } else {
        // No valid cache — full index.
        let vault = index_directory(Path::new(&vault_path));
        let note_count = vault.graph.metadata_cache.len();

        let cache = VaultCache::build(&vault_path, vault);
        let _ = cache.save(&cache_file);

        // Re-load from cache so AppState holds the same data.
        if let Some(loaded) = VaultCache::load(&cache_file) {
            *state
                .vault
                .write()
                .map_err(|_| "vault lock poisoned".to_string())? = loaded.vault;
        }

        ("full_index".to_string(), note_count)
    };

    start_watcher(&state, &vault_path, &app)?;

    // Build the tree from the freshly-loaded vault so the frontend gets
    // everything it needs in a single boot round-trip.
    let tree = {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        build_flat_tree(&vault, Path::new(&vault_path))
    };

    Ok(BootResult {
        vault_path: Some(vault_path),
        note_count,
        status,
        tree,
        settings: config.settings,
    })
}

/// Set a vault by path (e.g. after the user picks one via the folder dialog).
/// Always does a full index on first set, saves the path to config, and
/// starts the watcher.
#[tauri::command]
fn set_vault(
    path: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<BootResult, String> {
    let root = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("invalid vault path: {e}"))?;

    if !root.is_dir() {
        return Err("path is not a directory".into());
    }

    let vault_path = root.to_string_lossy().to_string();

    // Full index.
    let vault = index_directory(&root);
    let note_count = vault.graph.metadata_cache.len();

    // Build and persist cache.
    let cache = VaultCache::build(&vault_path, vault);
    let cache_file = cache_path(&app, &vault_path);
    let _ = cache.save(&cache_file);

    // Load into app state from the just-written cache.
    if let Some(loaded) = VaultCache::load(&cache_file) {
        *state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())? = loaded.vault;
    }

    // Persist config so next boot auto-loads this vault.
    let mut config = load_config(&app);
    config.last_vault = Some(vault_path.clone());
    save_config(&app, &config);

    // (Re-)start the watcher.
    start_watcher(&state, &vault_path, &app)?;

    let tree = {
        let vault = state
            .vault
            .read()
            .map_err(|_| "vault lock poisoned".to_string())?;
        build_flat_tree(&vault, &root)
    };

    Ok(BootResult {
        vault_path: Some(vault_path),
        note_count,
        status: "full_index".into(),
        tree,
        settings: config.settings,
    })
}

/// Stores a configuration setting in the app config.
#[tauri::command]
fn set_setting(key: String, value: serde_json::Value, app: tauri::AppHandle) {
    let mut config = load_config(&app);
    config.settings.insert(key, value);
    save_config(&app, &config);
}

/// Re-index the current vault from scratch (e.g. user presses "Re-index").
#[tauri::command]
fn reindex_vault(state: State<AppState>, app: tauri::AppHandle) -> Result<VaultSummary, String> {
    let config = load_config(&app);
    let vault_path = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = index_directory(Path::new(&vault_path));
    let note_count = vault.graph.metadata_cache.len();

    let cache = VaultCache::build(&vault_path, vault);
    let cache_file = cache_path(&app, &vault_path);
    let _ = cache.save(&cache_file);

    if let Some(loaded) = VaultCache::load(&cache_file) {
        *state
            .vault
            .write()
            .map_err(|_| "vault lock poisoned".to_string())? = loaded.vault;
    }

    Ok(VaultSummary { note_count })
}

/// Return the current vault's flat tree, freshly built from the in-memory
/// index.  The frontend calls this after any `vault://file-changed` event to
/// keep the sidebar in sync without a full restart.
#[tauri::command]
fn get_vault_tree(
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<FlatTreeNode>, String> {
    let config = load_config(&app);
    let vault_path = config
        .last_vault
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

    Ok(build_flat_tree(&vault, Path::new(&vault_path)))
}

/// Open the native folder-picker dialog and return the chosen path (or null).
#[tauri::command]
async fn open_vault_dialog(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    app.dialog()
        .file()
        .set_title("Choose your Basalt vault folder")
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

/// Read a markdown file from disk.
#[tauri::command]
fn open_file(path: String) -> Result<String, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::read_to_string(abs).map_err(|e| e.to_string())
}

/// Write content to a markdown file and re-index it in the vault.
#[tauri::command]
fn save_file(path: String, content: String, state: State<AppState>) -> Result<(), String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;
    std::fs::write(&abs, &content).map_err(|e| e.to_string())?;

    let mut vault = state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())?;

    if let Some(path_str) = abs.to_str() {
        vault.add_document(path_str, &content);
    }

    Ok(())
}

/// Return the paths of all notes that link to the given file.
#[tauri::command]
fn get_backlinks(path: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let abs = canonical_md_path(&path).map_err(|e| e.to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

    let Some(doc_id) = vault.arena.get_id(abs.to_str().unwrap_or_default()) else {
        return Ok(Vec::new());
    };
    let Some(backlinks) = vault.graph.get_back_links(doc_id) else {
        return Ok(Vec::new());
    };

    let results = backlinks
        .iter()
        .filter_map(|id| vault.arena.get_string(*id).cloned())
        .collect();

    Ok(results)
}

/// Return note names and paths whose filename starts with `prefix`.
#[tauri::command]
fn autocomplete_links(
    prefix: String,
    state: State<AppState>,
) -> Result<Vec<LinkSuggestion>, String> {
    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

    let out = vault
        .arena
        .all_strings()
        .filter(|p| p.ends_with(".md"))
        .filter_map(|path_str| {
            let name = Path::new(path_str).file_name()?.to_str()?;
            if name.to_lowercase().starts_with(&prefix.to_lowercase()) {
                Some(LinkSuggestion {
                    name: name.to_string(),
                    path: path_str.to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(out)
}

/// Return all tags in the vault that start with `prefix`.
#[tauri::command]
fn autocomplete_tags(prefix: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

    let mut out: Vec<String> = vault
        .graph
        .metadata_cache
        .values()
        .flat_map(|meta| meta.tags.iter().cloned())
        .filter(|tag| tag.to_lowercase().starts_with(&prefix.to_lowercase()))
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    out.sort();
    Ok(out)
}

/// Returns the current application settings map.
#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> std::collections::HashMap<String, serde_json::Value> {
    load_config(&app).settings
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            boot,
            set_vault,
            set_setting,
            get_settings,
            reindex_vault,
            get_vault_tree,
            open_vault_dialog,
            open_file,
            save_file,
            get_backlinks,
            autocomplete_links,
            autocomplete_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
