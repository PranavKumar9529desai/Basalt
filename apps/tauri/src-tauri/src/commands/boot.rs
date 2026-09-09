use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use basalt_vault::build_flat_tree;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;
use crate::cache::{load_or_index_vault, update_last_vault};
use crate::config::load_config;
use crate::error::{AppError, AppResult};
use crate::watcher::{start_search_flusher, start_watcher};
use crate::workspace::load_workspace;

/// Speculative parallel-boot cache (ADR-020 move 1): the setup thread runs
/// the full boot pipeline while the webview loads; the `boot` invoke serves
/// the cached result. The mutex guard is HELD during computation so a boot
/// invoke arriving mid-compute blocks here instead of duplicating the work.
static PREBOOT: OnceLock<Mutex<Option<BootResult>>> = OnceLock::new();

fn preboot_mutex() -> &'static Mutex<Option<BootResult>> {
    PREBOOT.get_or_init(|| Mutex::new(None))
}

/// Runs the boot pipeline off the command path; called from `setup()`.
/// Locks `PREBOOT` for the duration — see above.
pub fn run_preboot(app: AppHandle) {
    let mut guard = match preboot_mutex().lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    let state = app.state::<AppState>();
    let result = perform_boot(&state, &app);
    *guard = Some(result.unwrap_or_else(|e| BootResult {
        vault_path: None,
        note_count: 0,
        status: format!("boot_error:{e}"),
        tree: Vec::new(),
        settings: Default::default(),
        workspace: Default::default(),
        timings: Default::default(),
    }));
}

/// Record a phase duration (µs) into the boot timings map.
fn phase(timings: &mut HashMap<String, u64>, name: &str, start: Instant) {
    timings.insert(name.to_string(), start.elapsed().as_micros() as u64);
}

#[derive(Serialize, Clone)]
pub struct BootResult {
    /// Absolute path of the vault that was loaded, if any.
    pub vault_path: Option<String>,
    /// Number of notes in the vault.
    pub note_count: usize,
    /// One of: "no_vault" | "loaded_cache" | "incremental" | "full_index"
    pub status: String,
    /// Pre-built, pre-sorted flat tree — ready for the sidebar to render.
    /// Empty when `status == "no_vault"`.
    pub tree: Vec<basalt_vault::FlatTreeNode>,
    /// Persisted settings from config.json (Tier 1: global)
    pub settings: std::collections::HashMap<String, serde_json::Value>,
    /// Per-vault workspace state from .basalt/workspace.json (Tier 3: vault-local)
    pub workspace: std::collections::HashMap<String, serde_json::Value>,
    /// Boot phase durations in µs (TTI instrumentation, ADR-017). Frontend
    /// merges these with its own performance marks into the TTI report.
    pub timings: HashMap<String, u64>,
}

#[tauri::command]
pub fn boot(state: State<'_, AppState>, app: AppHandle) -> AppResult<BootResult> {
    // Serve the speculative preboot result when available. If the preboot
    // thread is still computing, this lock BLOCKS until it finishes — never
    // double work. Poison recovery falls through to inline compute.
    {
        let mut guard = match preboot_mutex().lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(pre) = guard.take() {
            return Ok(pre);
        }
        // None: preboot never ran (e.g. thread spawn failed) — fall through.
    }
    perform_boot(state.inner(), &app)
}

/// The full boot pipeline. Shared by the `boot` command and the speculative
/// preboot thread (ADR-020).
fn perform_boot(state: &AppState, app: &AppHandle) -> AppResult<BootResult> {
    let boot_start = Instant::now();
    let mut timings = HashMap::new();
    // How long after process spawn the webview's first invoke arrived —
    // captures webview startup + React mount + router loader dispatch.
    timings.insert(
        "process_to_invoke".into(),
        crate::process_uptime_ms().unwrap_or(0) * 1000,
    );

    let t = Instant::now();
    let config = load_config(app);
    phase(&mut timings, "rust:load_config", t);

    let vault_path = match config.last_vault {
        Some(p) => p,
        None => {
            *state
                .vault_path
                .write()
                .map_err(|_| AppError::LockPoisoned("vault path"))? = None;
            return Ok(BootResult {
                vault_path: None,
                note_count: 0,
                status: "no_vault".into(),
                tree: Vec::new(),
                settings: config.settings,
                workspace: Default::default(),
                timings,
            });
        }
    };

    *state
        .vault_path
        .write()
        .map_err(|_| AppError::LockPoisoned("vault path"))? = Some(vault_path.clone());

    // Ensure the vault directory still exists.
    if !Path::new(&vault_path).is_dir() {
        return Ok(BootResult {
            vault_path: None,
            note_count: 0,
            status: "no_vault".into(),
            tree: Vec::new(),
            settings: config.settings,
            workspace: Default::default(),
            timings,
        });
    }

    let t = Instant::now();
    let (status, note_count, known_mtimes) = load_or_index_vault(&vault_path, state, app)?;
    phase(&mut timings, "rust:vault_load_or_index", t);

    let t = Instant::now();
    start_watcher(state, &vault_path, app)?;
    start_search_flusher(state);
    phase(&mut timings, "rust:watcher_setup", t);

    // Drop the old IndexWriter up front so its tantivy lockfile is released
    // before building the new SearchState.
    if let Ok(mut search_guard) = state.search.write() {
        *search_guard = None;
    }

    // Fast search init (<10ms): open tantivy index + nucleo scorer immediately.
    // Stale or unindexed documents are scheduled for progressive background indexing.
    let t = Instant::now();
    let index_dir = crate::cache::search_index_dir(app, &vault_path);
    let paths: Vec<String> = {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        vault
            .arena
            .all_strings()
            .filter(|p| p.ends_with(".md") || p.ends_with(".canvas"))
            .cloned()
            .collect()
    };

    let search_state = match basalt_search::SearchState::open_fast(&index_dir, paths.clone()) {
        Ok(s) => {
            let stale_paths = s.filter_stale_paths(&paths, &known_mtimes);
            if !stale_paths.is_empty() {
                crate::core::search_indexer::start_background_indexing(state, app, stale_paths);
            }
            Some(s)
        }
        Err(e) => {
            eprintln!("[boot] fast search init failed: {e}");
            None
        }
    };

    if let Ok(mut search_guard) = state.search.write() {
        *search_guard = search_state;
    }
    phase(&mut timings, "rust:search_init_fast", t);

    let t = Instant::now();
    let tree = {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        build_flat_tree(&vault, Path::new(&vault_path))
    };
    phase(&mut timings, "rust:build_flat_tree", t);

    let t = Instant::now();
    let workspace = load_workspace(&vault_path);
    phase(&mut timings, "rust:load_workspace", t);

    phase(&mut timings, "rust:boot_total", boot_start);

    Ok(BootResult {
        vault_path: Some(vault_path),
        note_count,
        status,
        tree,
        settings: config.settings,
        workspace,
        timings,
    })
}

/// Set a vault by path (e.g. after the user picks one via the folder dialog).
/// Always does a full index on first set, saves the path to config, and
/// starts the watcher.
#[tauri::command]
pub fn set_vault(
    path: String,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<BootResult> {
    let root = Path::new(&path)
        .canonicalize()
        .map_err(AppError::InvalidVaultPath)?;

    if !root.is_dir() {
        return Err(AppError::Validation("path is not a directory".to_string()));
    }

    // Any speculative preboot result is now stale — the user switched vaults.
    if let Ok(mut guard) = preboot_mutex().lock() {
        *guard = None;
    }

    let vault_path = root.to_string_lossy().to_string();

    *state
        .vault_path
        .write()
        .map_err(|_| AppError::LockPoisoned("vault path"))? = Some(vault_path.clone());

    let note_count = crate::cache::index_and_persist(&vault_path, &state, &app)?;

    update_last_vault(&app, &vault_path);

    // (Re-)start the watcher.
    start_watcher(&state, &vault_path, &app)?;
    start_search_flusher(&state);

    // Initialise the search index fast (<10ms) and spawn background indexing.
    {
        use crate::cache::search_index_dir;
        use basalt_search::SearchState;

        let index_dir = search_index_dir(&app, &vault_path);

        if let Ok(mut search_guard) = state.search.write() {
            *search_guard = None;
        }

        let paths: Vec<String> = {
            let vault = state
                .vault
                .read()
                .map_err(|_| AppError::LockPoisoned("vault"))?;
            vault
                .arena
                .all_strings()
                .filter(|p| p.ends_with(".md") || p.ends_with(".canvas"))
                .cloned()
                .collect()
        };

        let empty_mtimes = std::collections::HashMap::new();
        let search_state = match SearchState::open_fast(&index_dir, paths.clone()) {
            Ok(s) => {
                let stale_paths = s.filter_stale_paths(&paths, &empty_mtimes);
                if !stale_paths.is_empty() {
                    crate::core::search_indexer::start_background_indexing(&state, &app, stale_paths);
                }
                Some(s)
            }
            Err(e) => {
                eprintln!("[set_vault] search index fast open failed: {e}");
                None
            }
        };

        if let Ok(mut search_guard) = state.search.write() {
            *search_guard = search_state;
        }
    }

    let tree = {
        let vault = state
            .vault
            .read()
            .map_err(|_| AppError::LockPoisoned("vault"))?;
        build_flat_tree(&vault, &root)
    };

    let config = load_config(&app);
    let workspace = crate::workspace::load_workspace(&vault_path);

    let boot_result = BootResult {
        vault_path: Some(vault_path),
        note_count,
        status: "full_index".into(),
        tree,
        settings: config.settings,
        workspace,
        // set_vault is user-initiated, not on the TTI path — no phases yet.
        timings: HashMap::new(),
    };

    // Cache the result in PREBOOT so immediate router.invalidate() resolves in 0ms without re-indexing
    if let Ok(mut guard) = preboot_mutex().lock() {
        *guard = Some(boot_result.clone());
    }

    Ok(boot_result)
}
