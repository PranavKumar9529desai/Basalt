//! Boot-path phase timing harness — measures the exact phases `boot` joins:
//! the vault metadata parse (`index_directory`), `build_flat_tree`, and the
//! fresh tantivy full-text search index build.
//!
//! Usage:
//!   cargo run --release --example measure_boot -- <vault-path>   # release
//!   cargo run          --example measure_boot -- <vault-path>   # debug (dev mode)
//!
//! Run both profiles to compare — the dev app (`bun run dev`) uses the debug
//! build, which is 10–20x slower than release for the non-SIMD vault build.
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

use basalt_search::SearchState;
use basalt_vault::indexer::index_directory;
use basalt_vault::build_flat_tree;

fn main() {
    let vault_path = std::env::args().nth(1).expect("usage: measure_boot <vault-path>");
    let p = Path::new(&vault_path);

    // Phase 1: SIMD vault metadata parse (index_directory)
    let t = Instant::now();
    let vault = index_directory(p);
    let note_count = vault.graph.metadata_cache.len();
    println!("vault parse (index_directory): {} ms  ({note_count} notes)",
        t.elapsed().as_millis());

    // Phase 2: build_flat_tree (what becomes the sidebar tree in the boot response)
    let t = Instant::now();
    let tree = build_flat_tree(&vault, p);
    println!("build_flat_tree: {} ms  ({} nodes)", t.elapsed().as_millis(), tree.len());

    // Phase 3a: fast search init (open_fast: tantivy open + nucleo)
    let index_dir = std::env::temp_dir().join("basalt-measure-search-index");
    let _ = std::fs::remove_dir_all(&index_dir);
    let t = Instant::now();
    let paths: Vec<String> = vault
        .arena
        .all_strings()
        .filter(|p| p.ends_with(".md") || p.ends_with(".canvas"))
        .cloned()
        .collect();
    let fast_search = SearchState::open_fast(&index_dir, paths.clone()).expect("search fast open");
    println!("search open_fast (tantivy + nucleo): {} ms", t.elapsed().as_millis());

    let t = Instant::now();
    let stale = fast_search.filter_stale_paths(&paths, &HashMap::new());
    println!("filter_stale_paths ({} items): {} ms", stale.len(), t.elapsed().as_millis());
}
