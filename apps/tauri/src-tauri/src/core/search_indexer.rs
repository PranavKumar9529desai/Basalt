use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use rayon::prelude::*;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::app_state::AppState;

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

/// Spawns a background thread to batch-index stale or unindexed documents into Tantivy.
///
/// Key design properties:
/// 1. Completely detached from boot/command paths — startup returns in <100ms.
/// 2. Fine-grained locking: `vault.read()` is acquired for microseconds only to pull tags,
///    and `search.write()` is acquired only per small batch.
/// 3. Lock-yielding: sleeps 5ms between batches so concurrent commands and UI queries
///    never experience lock starvation.
/// 4. Cancel-safe: increments `indexing_generation` so any prior active indexing loop
///    stops cleanly when switching vaults.
/// 5. Live UX feedback: emits `vault://indexing-progress` and `vault://indexing-complete`
///    events to power the Obsidian-parity non-blocking toast.
pub fn start_background_indexing(state: &AppState, app: &AppHandle, stale_paths: Vec<String>) {
    if stale_paths.is_empty() {
        return;
    }

    let generation = state.indexing_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let generation_arc = Arc::clone(&state.indexing_generation);
    let vault_arc = Arc::clone(&state.vault);
    let search_arc = Arc::clone(&state.search);
    let app_handle = app.clone();

    std::thread::Builder::new()
        .name("search-indexer".to_string())
        .spawn(move || {
            let total = stale_paths.len();
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

            for chunk in stale_paths.chunks(BATCH_SIZE) {
                // If a new indexing run was triggered (e.g. vault switched), abort immediately.
                if generation_arc.load(Ordering::Relaxed) != generation {
                    return;
                }

                // 1. Brief read lock (<0.1ms) to snapshot tags from vault metadata if available
                let tags_map: HashMap<String, String> = {
                    if let Ok(vault) = vault_arc.read() {
                        chunk
                            .iter()
                            .filter_map(|p| {
                                vault.metadata(p).map(|m| (p.clone(), m.tags.join(" ")))
                            })
                            .collect()
                    } else {
                        HashMap::new()
                    }
                };

                // 2. Parallel disk reading & parsing with Rayon (no locks held)
                let prepared_docs: Vec<(String, String, String, String)> = chunk
                    .par_iter()
                    .filter_map(|path| {
                        let title = Path::new(path)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or(path.as_str())
                            .to_string();

                        if path.ends_with(".canvas") {
                            Some((path.clone(), title, String::new(), String::new()))
                        } else if let Ok(content) = std::fs::read_to_string(path) {
                            let tags = tags_map.get(path).cloned().unwrap_or_else(|| {
                                content
                                    .split_whitespace()
                                    .filter(|w| w.starts_with('#') && w.len() > 1)
                                    .map(|w| w.trim_start_matches('#'))
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            });
                            Some((path.clone(), title, content, tags))
                        } else {
                            None
                        }
                    })
                    .collect();

                // 3. Brief search write lock to feed tantivy writer
                if let Ok(mut search_guard) = search_arc.write() {
                    if let Some(ref mut search) = *search_guard {
                        for (path, title, content, tags) in prepared_docs {
                            let _ = search.update_document_tantivy_only(
                                &path, &title, &content, &tags,
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

                // Yield to allow concurrent UI and command threads full CPU/lock access
                std::thread::sleep(Duration::from_millis(YIELD_SLEEP_MS));
            }

            // Final commit to ensure all remaining documents are searchable
            if let Ok(mut search_guard) = search_arc.write() {
                if let Some(ref mut search) = *search_guard {
                    let _ = search.commit();
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
        .expect("failed to spawn search indexer thread");
}
