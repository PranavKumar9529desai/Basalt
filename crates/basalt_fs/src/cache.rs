use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::utils::mtime_secs;
use crate::vault::Vault;

/// Current cache format version. Bump this whenever the serialized layout
/// changes in a breaking way so old caches are automatically discarded.
pub const CACHE_VERSION: u32 = 1;

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

#[cfg(test)]
mod tests {
    use super::*;

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
