use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;

use crate::utils::mtime_secs;
use crate::vault::Vault;

/// Magic 4-byte header identifying a Basalt binary cache.
pub const CACHE_MAGIC: &[u8; 4] = b"BSLT";

/// Current cache format version. Bump this whenever the serialized layout
/// changes in a breaking way so old caches are automatically discarded.
pub const CACHE_VERSION: u32 = 2;

#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("failed to create cache directory: {0}")]
    CreateDir(std::io::Error),
    #[error("failed to serialize vault cache: {0}")]
    Serialize(bincode::Error),
    #[error("failed to write cache file: {0}")]
    WriteFile(std::io::Error),
    #[error("failed to rename temp cache file: {0}")]
    Rename(std::io::Error),
}

#[derive(Serialize, Deserialize)]
pub struct VaultCache {
    /// Format version — used to detect stale / incompatible caches.
    pub version: u32,

    /// Absolute path of the vault this cache belongs to.
    pub vault_path: String,

    /// Last-modified time (seconds since UNIX epoch) for every indexed file.
    /// Used to decide which files need re-parsing on the next startup.
    pub file_mtimes: HashMap<String, u64>,

    /// The full serialized vault (arena + graph + asset index).
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
            .filter(|p| !p.starts_with('#') && (p.ends_with(".md") || p.ends_with(".canvas")))
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

    /// Serialize and atomically write the binary cache to `cache_path`.
    pub fn save(&self, cache_path: &Path) -> Result<(), CacheError> {
        if let Some(parent) = cache_path.parent() {
            std::fs::create_dir_all(parent).map_err(CacheError::CreateDir)?;
        }
        let tmp_path = format!("{}.tmp", cache_path.display());
        let tmp_path = Path::new(&tmp_path);
        {
            let file = std::fs::File::create(tmp_path).map_err(CacheError::WriteFile)?;
            let mut writer = std::io::BufWriter::new(file);
            writer.write_all(CACHE_MAGIC).map_err(CacheError::WriteFile)?;
            writer
                .write_all(&CACHE_VERSION.to_le_bytes())
                .map_err(CacheError::WriteFile)?;
            bincode::serialize_into(&mut writer, self).map_err(CacheError::Serialize)?;
            writer.flush().map_err(CacheError::WriteFile)?;
            let file = writer
                .into_inner()
                .map_err(|e| CacheError::WriteFile(e.into_error()))?;
            file.sync_all().map_err(CacheError::WriteFile)?;
        }
        std::fs::rename(tmp_path, cache_path).map_err(CacheError::Rename)?;
        Ok(())
    }

    /// Load and deserialize a binary cache from `cache_path`.
    /// Returns `None` if the file is missing, unreadable, or has an invalid
    /// magic header or version number (so the caller falls back to a full index).
    pub fn load(cache_path: &Path) -> Option<Self> {
        let file = std::fs::File::open(cache_path).ok()?;
        let mut reader = std::io::BufReader::new(file);
        let mut magic = [0u8; 4];
        reader.read_exact(&mut magic).ok()?;
        if &magic != CACHE_MAGIC {
            return None;
        }
        let mut version_bytes = [0u8; 4];
        reader.read_exact(&mut version_bytes).ok()?;
        let version = u32::from_le_bytes(version_bytes);
        if version != CACHE_VERSION {
            return None;
        }
        let cache: VaultCache = bincode::deserialize_from(&mut reader).ok()?;
        if cache.version != CACHE_VERSION {
            return None;
        }
        Some(cache)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_file(prefix: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        std::env::temp_dir().join(format!("{}_{}_{}.bincode", prefix, pid, nanos))
    }

    #[test]
    fn test_cache_roundtrip() {
        let mut vault = Vault::new();
        vault.add_document("a.md", "---\ntitle: Doc A\ntags: [rust, perf]\n---\nLink [[b.md]]");
        vault.add_document("b.md", "Back [[a.md]]");

        let cache = VaultCache {
            version: CACHE_VERSION,
            vault_path: "/test/vault".to_string(),
            file_mtimes: HashMap::new(),
            vault,
        };

        let temp_file = unique_temp_file("basalt_test_cache");
        cache.save(&temp_file).expect("save binary cache");

        let restored = VaultCache::load(&temp_file).expect("deserialize binary cache");

        let id_a = restored.vault.arena.get_id("a.md");
        let id_b = restored.vault.arena.get_id("b.md");
        assert!(id_a.is_some());
        assert!(id_b.is_some());

        let fwd_a = restored.vault.graph.get_forward_links(id_a.unwrap());
        assert!(fwd_a.is_some());
        assert!(fwd_a.unwrap().contains(&id_b.unwrap()));

        let meta_a = restored.vault.metadata("a.md").expect("meta_a");
        // ADR-041 sorts + dedups tags in extract_metadata (sorted tag order is
        // the parser contract, not document order).
        assert_eq!(meta_a.tags, vec!["perf", "rust"]);
        assert!(meta_a.frontmatter.is_some());

        let _ = std::fs::remove_file(temp_file);
    }

    #[test]
    fn test_cache_rejects_corrupted_magic() {
        let temp_file = unique_temp_file("basalt_test_magic");
        std::fs::write(&temp_file, b"NOTB\x02\x00\x00\x00corrupted data").unwrap();
        assert!(VaultCache::load(&temp_file).is_none());
        let _ = std::fs::remove_file(temp_file);
    }

    #[test]
    fn test_cache_rejects_version_mismatch() {
        let temp_file = unique_temp_file("basalt_test_version");
        std::fs::write(&temp_file, b"BSLT\x01\x00\x00\x00old format data").unwrap();
        assert!(VaultCache::load(&temp_file).is_none());
        let _ = std::fs::remove_file(temp_file);
    }
}
