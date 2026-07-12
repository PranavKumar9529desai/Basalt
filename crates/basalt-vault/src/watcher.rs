use anyhow::Result;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;

use crate::Vault;

pub struct VaultWatcher {
    #[allow(dead_code)]
    watcher: RecommendedWatcher,
    // Store the thread handle so it doesn't drop
    _thread_handle: thread::JoinHandle<()>,
}

impl VaultWatcher {
    /// Starts watching a directory recursively.
    /// When a markdown file changes, it will be read and parsed, updating the Vault.
    /// `on_change` is called with the absolute path of every file that was added,
    /// modified, or removed — after the vault has already been updated.
    pub fn watch<P, F>(path: P, vault_arc: Arc<RwLock<Vault>>, on_change: F) -> Result<Self>
    where
        P: AsRef<Path>,
        F: Fn(PathBuf, bool) + Send + 'static,
    {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = notify::RecommendedWatcher::new(
            move |res| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )?;

        let path_buf = path.as_ref().to_path_buf();
        watcher.watch(path.as_ref(), RecursiveMode::Recursive)?;

        let thread_handle = thread::spawn(move || {
            // Very simple debouncing: collect modified paths and process them
            // once 100ms of silence has passed.
            let mut pending_files = HashSet::new();

            loop {
                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(event) => {
                        Self::handle_event(event, &mut pending_files);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // 100ms of silence — flush pending files
                        if !pending_files.is_empty() {
                            let files_to_process: Vec<PathBuf> = pending_files.drain().collect();
                            Self::process_files(
                                files_to_process,
                                &path_buf,
                                &vault_arc,
                                &on_change,
                            );
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        // Watcher was dropped — exit cleanly
                        break;
                    }
                }
            }
        });

        Ok(Self {
            watcher,
            _thread_handle: thread_handle,
        })
    }

    fn handle_event(event: Event, pending: &mut HashSet<PathBuf>) {
        match event.kind {
            EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) => {
                for path in event.paths {
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        pending.insert(path);
                    }
                }
            }
            _ => {}
        }
    }

    fn process_files<F>(
        files: Vec<PathBuf>,
        _base_path: &Path,
        vault_arc: &Arc<RwLock<Vault>>,
        on_change: &F,
    ) where
        F: Fn(PathBuf, bool) + Send + 'static,
    {
        let mut vault = match vault_arc.write() {
            Ok(v) => v,
            Err(_) => return, // lock poisoned — bail out
        };

        for path in files {
            let path_str = path.to_string_lossy().to_string();
            let was_indexed = vault.arena.get_id(&path_str).is_some();

            if path.exists() {
                // Modified or created
                if let Ok(content) = std::fs::read_to_string(&path) {
                    vault.add_document(&path_str, &content);
                }
            } else {
                // Removed
                vault.remove_document(&path_str);
            }

            // Content-only modification of an existing file doesn't change tree structure.
            // New files (not previously indexed) and deletions always need a tree refresh.
            let needs_refresh = !was_indexed || !path.exists();
            on_change(path, needs_refresh);
        }
    }
}
