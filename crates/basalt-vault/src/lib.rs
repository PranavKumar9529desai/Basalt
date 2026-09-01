pub mod asset_index;
pub mod cache;
pub mod indexer;
pub mod path_utils;
pub mod tree;
pub mod utils;
pub mod vault;
pub mod watcher;

pub use asset_index::{AssetAuditReport, AssetInfo, AssetIndex, FileType};
pub use cache::{VaultCache, CACHE_VERSION};
pub use indexer::incremental_reindex;
pub use tree::{build_flat_tree, FlatTreeNode, NodeKind};
pub use vault::Vault;
