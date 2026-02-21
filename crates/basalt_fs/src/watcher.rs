use anyhow::Result;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;

use crate::Vault;

pub struct VaultWatcher {
    watcher: RecommendedWatcher,
    // Store the thread handle so it doesn't drop
    _thread_handle: thread::JoinHandle<()>,
}

impl VaultWatcher {
    /// Starts watching a directory recursively.
    /// When a markdown file changes, it will be read and parsed, updating the Vault.
    pub fn watch<P: AsRef<Path>>(path: P, vault_arc: Arc<RwLock<Vault>>) -> Result<Self> {
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
            // Very simple debouncing: keep track of files modified to process them
            let mut pending_files = HashSet::new();

            loop {
                // Wait for the first event, blocking
                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(event) => {
                        Self::handle_event(event, &mut pending_files);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Process pending files if we have any, since it's been quiet for 100ms
                        if !pending_files.is_empty() {
                            let files_to_process: Vec<PathBuf> = pending_files.drain().collect();
                            Self::process_files(files_to_process, &path_buf, &vault_arc);
                        }
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        // Watcher was dropped, exit the thread
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
        // We care about file modifications, creations, etc.
        // For simplicity, just check if it's a modify or create event.
        match event.kind {
            EventKind::Modify(_) | EventKind::Create(_) => {
                for path in event.paths {
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        pending.insert(path);
                    }
                }
            }
            EventKind::Remove(_) => {
                // Note: Removing documents from the Vault is harder right now,
                // but we should eventually handle it to clear broken links!
                for path in event.paths {
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        pending.insert(path); // Let's just re-process/remove it
                    }
                }
            }
            _ => {}
        }
    }

    fn process_files(files: Vec<PathBuf>, _base_path: &Path, vault_arc: &Arc<RwLock<Vault>>) {
        let mut vault = match vault_arc.write() {
            Ok(v) => v,
            Err(_) => return, // lock poisoned
        };

        for path in files {
            // Get string representation relative to base_path, or just use full path
            // depending on how we store paths in Arena
            let path_str = path.to_string_lossy().to_string();

            if path.exists() {
                // Modified or Created
                if let Ok(content) = std::fs::read_to_string(&path) {
                    vault.add_document(&path_str, &content);
                    println!("Vault Watcher updating file: {}", path_str);
                }
            } else {
                // Removed
                vault.remove_document(&path_str);
                println!("Vault Watcher removing file: {}", path_str);
            }
        }
    }
}
