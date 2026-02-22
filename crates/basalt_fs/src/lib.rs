use anyhow::{Context, Result};
use basalt_core::arena::StringArena;
use basalt_core::graph::NoteGraph;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

pub mod indexer;
pub mod tree;
pub mod watcher;

pub use tree::{build_flat_tree, FlatTreeNode, NodeKind};

pub trait FileSystem {
    fn read(&self, path: &str) -> Result<Vec<u8>>;
    fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    fn list(&self, path: &str) -> Result<Vec<String>>;
}

use basalt_core::extract_metadata;

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Vault {
    pub arena: StringArena,
    pub graph: NoteGraph,
}

impl Vault {
    pub fn new() -> Self {
        Self {
            arena: StringArena::new(),
            graph: NoteGraph::new(),
        }
    }

    pub fn add_document(&mut self, path: &str, content: &str) {
        let meta = extract_metadata(content);
        self.graph.add_document(path, meta, &mut self.arena);
    }

    pub fn remove_document(&mut self, path: &str) {
        self.graph.remove_document(path, &mut self.arena);
    }
}

// ---------------------------------------------------------------------------
// VaultCache — persisted to disk so startup can skip full re-indexing
// ---------------------------------------------------------------------------

/// Current cache format version. Bump this whenever the serialized layout
/// changes in a breaking way so old caches are automatically discarded.
const CACHE_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
pub struct VaultCache {
    /// Format version — used to detect stale / incompatible caches.
    pub version: u32,

    /// Absolute path of the vault this cache belongs to.
    pub vault_path: String,

    /// Last-modified time (seconds since UNIX epoch) for every indexed file.
    /// Used to decide which files need re-parsing on the next startup.
    pub file_mtimes: HashMap<String, u64>,

    /// The full serialized vault (arena + graph).
    pub vault: Vault,
}

impl VaultCache {
    /// Build a fresh cache snapshot from a live vault.
    /// `vault_path` is the root directory that was indexed.
    pub fn build(vault_path: &str, vault: Vault) -> Self {
        // Collect current mtimes for every .md file in the arena.
        let file_mtimes = vault
            .arena
            .all_strings()
            .filter(|p| p.ends_with(".md"))
            .filter_map(|p| {
                let mtime = mtime_secs(Path::new(p))?;
                Some((p.clone(), mtime))
            })
            .collect();

        VaultCache {
            version: CACHE_VERSION,
            vault_path: vault_path.to_string(),
            file_mtimes,
            vault,
        }
    }

    /// Serialize and write the cache to `cache_path`.
    pub fn save(&self, cache_path: &Path) -> Result<()> {
        if let Some(parent) = cache_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating cache directory {}", parent.display()))?;
        }
        let json = serde_json::to_string(self).context("serialising vault cache")?;
        std::fs::write(cache_path, json)
            .with_context(|| format!("writing cache to {}", cache_path.display()))?;
        Ok(())
    }

    /// Load and deserialize a cache from `cache_path`.
    /// Returns `None` if the file is missing, unreadable, or has a
    /// different version number (so the caller falls back to a full index).
    pub fn load(cache_path: &Path) -> Option<Self> {
        let json = std::fs::read_to_string(cache_path).ok()?;
        let cache: VaultCache = serde_json::from_str(&json).ok()?;
        if cache.version != CACHE_VERSION {
            return None;
        }
        Some(cache)
    }
}

// ---------------------------------------------------------------------------
// Incremental re-index
// ---------------------------------------------------------------------------

/// Walk `vault_path`, re-parsing only files whose mtime is newer than the
/// recorded value in `cached_mtimes`.  Also removes documents that no longer
/// exist on disk.  Returns the updated mtime map.
#[cfg(not(target_arch = "wasm32"))]
pub fn incremental_reindex(
    vault_path: &Path,
    vault: &mut Vault,
    cached_mtimes: &HashMap<String, u64>,
) -> HashMap<String, u64> {
    use ignore::WalkBuilder;

    let mut new_mtimes: HashMap<String, u64> = HashMap::new();

    let walker = WalkBuilder::new(vault_path).build();
    for entry in walker.flatten() {
        if !entry.file_type().map_or(false, |ft| ft.is_file()) {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let path_str = match path.to_str() {
            Some(s) => s.to_string(),
            None => continue,
        };

        let current_mtime = mtime_secs(path).unwrap_or(0);
        new_mtimes.insert(path_str.clone(), current_mtime);

        let cached_mtime = cached_mtimes.get(&path_str).copied().unwrap_or(0);
        if current_mtime > cached_mtime {
            // New or modified — re-parse.
            if let Ok(content) = std::fs::read_to_string(path) {
                vault.add_document(&path_str, &content);
            }
        }
        // If mtime is unchanged the cached graph data is already correct.
    }

    // Remove documents that have been deleted since the cache was written.
    for cached_path in cached_mtimes.keys() {
        if !new_mtimes.contains_key(cached_path) {
            vault.remove_document(cached_path);
        }
    }

    new_mtimes
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns the modification time of `path` in seconds since UNIX epoch.
pub fn mtime_secs(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_push_api() {
        let mut vault = Vault::new();

        vault.add_document("a.md", "This is a link to [[b.md]]");
        vault.add_document("b.md", "Links: [[a.md]], [[c.md]]");

        let id_a = vault.arena.get_id("a.md").expect("a.md should be in arena");
        let id_b = vault.arena.get_id("b.md").expect("b.md should be in arena");
        let id_c = vault.arena.get_id("c.md").expect("c.md should be in arena");

        let fwd_a = vault
            .graph
            .get_forward_links(id_a)
            .expect("a.md should have forward links");
        assert!(fwd_a.contains(&id_b), "a.md should link to b.md");

        let back_b = vault
            .graph
            .get_back_links(id_b)
            .expect("b.md should have back links");
        assert!(
            back_b.contains(&id_a),
            "b.md should have backlink from a.md"
        );

        let fwd_b = vault
            .graph
            .get_forward_links(id_b)
            .expect("b.md should have forward links");
        assert!(fwd_b.contains(&id_a), "b.md should link to a.md");
        assert!(fwd_b.contains(&id_c), "b.md should link to c.md");
    }

    #[test]
    fn test_cache_roundtrip() {
        let mut vault = Vault::new();
        vault.add_document("a.md", "Link [[b.md]]");
        vault.add_document("b.md", "Back [[a.md]]");

        let cache = VaultCache {
            version: CACHE_VERSION,
            vault_path: "/test/vault".to_string(),
            file_mtimes: HashMap::new(),
            vault,
        };

        let json = serde_json::to_string(&cache).expect("serialize");
        let restored: VaultCache = serde_json::from_str(&json).expect("deserialize");

        let id_a = restored.vault.arena.get_id("a.md");
        let id_b = restored.vault.arena.get_id("b.md");
        assert!(id_a.is_some());
        assert!(id_b.is_some());

        let fwd_a = restored.vault.graph.get_forward_links(id_a.unwrap());
        assert!(fwd_a.is_some());
        assert!(fwd_a.unwrap().contains(&id_b.unwrap()));
    }
}
