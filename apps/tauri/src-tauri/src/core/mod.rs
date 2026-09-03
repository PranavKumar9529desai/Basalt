//! Shared application infrastructure for the Tauri backend.
//!
//! Groups the pieces of global backend state and services that the `commands`
//! layer depends on, keeping them out of the crate root:
//! - [`app_state`]: the `AppState` managed by Tauri and injected into commands
//! - [`cache`]: vault cache (de)serialization and indexing
//! - [`config`]: persisted `config.json` settings
//! - [`watcher`]: filesystem watcher + search-index flusher
//! - [`workspace`]: per-vault `.basalt/workspace.json`

pub mod app_state;
pub mod cache;
pub mod config;
pub mod watcher;
pub mod workspace;
