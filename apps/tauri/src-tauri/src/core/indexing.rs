use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use basalt_parser::extract_metadata;
use basalt_types::{
    is_canvas_path, is_document_path, mtime_secs, stem_of, FileMetadata,
};
use basalt_vault::{indexer::incremental_reindex, VaultCache};
use ignore::WalkBuilder;
use rayon::prelude::*;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;
use crate::cache::cache_path;

const BATCH_SIZE: usize = 250;
const COMMIT_INTERVAL_DOCS: usize = 2500;
const YIELD_SLEEP_MS: u64 = 5;

#[derive(Serialize, Clone, Debug)]
pub struct IndexingProgressPayload {
    pub total: usize,
    pub indexed: usize,
    pub percentage: f64,
    pub phase: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct IndexingCompletePayload {
    pub total: usize,
    pub duration_ms: u64,
}

/// Start fused single-pass indexing (Mode 2: Cold boot or full reindex).
///
/// Properties (ADR-046 Tier 2):
/// 1. Runs completely on a detached thread; boot returns in <50ms.
/// 2. Parse once, feed both: reads file content and parses metadata once with Rayon,
///    feeding both `state.vault` (NoteGraph) and Tantivy.
/// 3. Progressive mutation: updates `state.vault` batch-by-batch under short write locks.
/// 4. Cooperative yielding: sleeps 5ms between batches so UI/IPC event loops maintain 60 FPS.
/// 5. Generation-counted: cancels cleanly if user switches vaults.
/// 6. Saves `.bincode` cache atomically upon completion.
pub fn start_fused_indexing(
    state: &AppState,
    app: &AppHandle,
    vault_path: String,
    paths: Vec<String>,
) {
    if paths.is_empty() {
        return;
    }

    let generation = state.indexing_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let generation_arc = Arc::clone(&state.indexing_generation);
    let vault_arc = Arc::clone(&state.vault);
    let search_arc = Arc::clone(&state.search);
    let app_handle = app.clone();

    std::thread::Builder::new()
        .name("fused-indexer".to_string())
        .spawn(move || {
            let total = paths.len();
            let start_time = Instant::now();

            let _ = app_handle.emit(
                "vault://indexing-progress",
                IndexingProgressPayload {
                    total,
                    indexed: 0,
                    percentage: 0.0,
                    phase: "indexing".to_string(),
                },
            );

            let mut indexed = 0;
            let mut docs_since_commit = 0;

            for chunk in paths.chunks(BATCH_SIZE) {
                if generation_arc.load(Ordering::Relaxed) != generation {
                    return;
                }

                // Phase 1: Parallel disk read + zero-AST metadata extraction (no locks held)
                let prepared_batch: Vec<(String, Option<FileMetadata>, String, String, String)> =
                    chunk
                        .par_iter()
                        .filter_map(|path| {
                            let title = stem_of(path).unwrap_or(path.as_str()).to_string();

                            if is_canvas_path(Path::new(path)) {
                                Some((path.clone(), None, title, String::new(), String::new()))
                            } else if let Ok(content) = std::fs::read_to_string(path) {
                                let meta = extract_metadata(&content);
                                let tags = if !meta.tags.is_empty() {
                                    meta.tags.join(" ")
                                } else {
                                    content
                                        .split_whitespace()
                                        .filter(|w| w.starts_with('#') && w.len() > 1)
                                        .map(|w| w.trim_start_matches('#'))
                                        .collect::<Vec<_>>()
                                        .join(" ")
                                };
                                Some((path.clone(), Some(meta), title, content, tags))
                            } else {
                                None
                            }
                        })
                        .collect();

                // Phase 2: Progressive write to state.vault (short lock duration)
                if let Ok(mut vault_guard) = vault_arc.write() {
                    for (path, meta, _title, _content, _tags) in &prepared_batch {
                        if let Some(m) = meta {
                            vault_guard.add_document_metadata(path, m.clone());
                        } else {
                            vault_guard.add_document(path, "");
                        }
                    }
                }

                // Phase 3: Update Tantivy search index
                if let Ok(mut search_guard) = search_arc.write() {
                    if let Some(ref mut search) = *search_guard {
                        for (path, _meta, title, content, tags) in &prepared_batch {
                            let _ = search.update_document_tantivy_only(
                                path, title, content, tags,
                            );
                        }
                        docs_since_commit += chunk.len();
                        if docs_since_commit >= COMMIT_INTERVAL_DOCS {
                            let _ = search.commit();
                            docs_since_commit = 0;
                        }
                    }
                }

                indexed += chunk.len();
                let percentage = ((indexed as f64 / total as f64) * 100.0).min(100.0);
                let _ = app_handle.emit(
                    "vault://indexing-progress",
                    IndexingProgressPayload {
                        total,
                        indexed,
                        percentage: (percentage * 10.0).round() / 10.0,
                        phase: "indexing".to_string(),
                    },
                );

                std::thread::sleep(Duration::from_millis(YIELD_SLEEP_MS));
            }

            // Final search commit
            if let Ok(mut search_guard) = search_arc.write() {
                if let Some(ref mut search) = *search_guard {
                    let _ = search.commit();
                }
            }

            // Prune orphan tags and persist the complete .bincode cache
            if generation_arc.load(Ordering::Relaxed) == generation {
                let vault_clone = {
                    if let Ok(mut vault_guard) = vault_arc.write() {
                        vault_guard.graph.prune_orphan_tags();
                        Some(vault_guard.clone())
                    } else {
                        None
                    }
                };

                if let Some(vault) = vault_clone {
                    let cache = VaultCache::build(&vault_path, vault);
                    let cache_file = cache_path(&app_handle, &vault_path);
                    let _ = cache.save(&cache_file);
                }
            }

            let _ = app_handle.emit(
                "vault://indexing-complete",
                IndexingCompletePayload {
                    total,
                    duration_ms: start_time.elapsed().as_millis() as u64,
                },
            );
        })
        .expect("failed to spawn fused indexer thread");
}

/// Asynchronously reconciles disk mtimes against the cached vault in the background.
///
/// Called after a Mode-1 warm boot. Since the cached vault is already loaded in <20ms,
/// this worker checks for any changes that occurred while the app was closed.
/// If no files were modified, it exits in milliseconds with zero disk writes.
pub fn start_background_mtime_sync(
    state: &AppState,
    app: &AppHandle,
    vault_path: String,
    cached_mtimes: HashMap<String, u64>,
) {
    let generation = state.indexing_generation.load(Ordering::Relaxed);
    let generation_arc = Arc::clone(&state.indexing_generation);
    let vault_arc = Arc::clone(&state.vault);
    let search_arc = Arc::clone(&state.search);
    let app_handle = app.clone();

    std::thread::Builder::new()
        .name("mtime-sync".to_string())
        .spawn(move || {
            let vault_root = Path::new(&vault_path);
            if !vault_root.is_dir() {
                return;
            }

            // Fast parallel mtime check using WalkBuilder
            let mut disk_mtimes: HashMap<String, u64> = HashMap::new();
            let mut stale_paths: Vec<String> = Vec::new();
            let walker = WalkBuilder::new(vault_root).build();

            for entry in walker.flatten() {
                if generation_arc.load(Ordering::Relaxed) != generation {
                    return;
                }
                if entry.file_type().is_some_and(|ft| ft.is_file()) {
                    let path = entry.path();
                    if let Some(path_str) = path.to_str() {
                        if is_document_path(path) {
                            let current_mtime = mtime_secs(path).unwrap_or(0);
                            let cached_mtime = cached_mtimes.get(path_str).copied().unwrap_or(0);
                            disk_mtimes.insert(path_str.to_string(), current_mtime);

                            if current_mtime > cached_mtime {
                                stale_paths.push(path_str.to_string());
                            }
                        }
                    }
                }
            }

            let has_deletions = cached_mtimes.keys().any(|k| !disk_mtimes.contains_key(k));

            // If no notes were added, modified, or deleted, we are completely in sync!
            if stale_paths.is_empty() && !has_deletions {
                return;
            }

            // Changes detected: patch vault & search index in background
            if let Ok(mut vault_guard) = vault_arc.write() {
                let _ = incremental_reindex(vault_root, &mut vault_guard, &cached_mtimes);
            }

            // Re-index stale paths in Tantivy
            if !stale_paths.is_empty() {
                if let Ok(mut search_guard) = search_arc.write() {
                    if let Some(ref mut search) = *search_guard {
                        let vault_read = vault_arc.read().ok();
                        for path in &stale_paths {
                            if let Ok(content) = std::fs::read_to_string(path) {
                                let title = stem_of(path).unwrap_or(path.as_str()).to_string();
                                let tags = vault_read
                                    .as_ref()
                                    .and_then(|v| v.metadata(path))
                                    .map(|m| m.tags.join(" "))
                                    .unwrap_or_default();
                                let _ = search.update_document_tantivy_only(path, &title, &content, &tags);
                            }
                        }
                        let _ = search.commit();
                    }
                }
            }

            // Re-save binary cache with fresh mtimes
            if generation_arc.load(Ordering::Relaxed) == generation {
                if let Ok(vault_guard) = vault_arc.read() {
                    let cache = VaultCache::build(&vault_path, vault_guard.clone());
                    let cache_file = cache_path(&app_handle, &vault_path);
                    let _ = cache.save(&cache_file);
                }
            }
        })
        .expect("failed to spawn mtime sync thread");
}
