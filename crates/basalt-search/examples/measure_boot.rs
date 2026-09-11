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
use std::path::Path;
use std::time::Instant;

use basalt_search::SearchState;
use basalt_vault::fast_scan_flat_tree;
use basalt_vault::indexer::index_directory;
use basalt_vault::VaultCache;

fn main() {
    let vault_path = std::env::args()
        .nth(1)
        .expect("usage: measure_boot <vault-path>");
    let p = Path::new(&vault_path);

    println!("============================================================");
    println!("  Two-Tier Boot Benchmark for: {vault_path}");
    println!("============================================================");

    // ── TIER 1: COLD BOOT SYNCHRONOUS PATH ──
    println!("\n[Tier 1: Cold Boot - Synchronous Path]");
    let t = Instant::now();
    let flat_tree = fast_scan_flat_tree(p);
    let tree_time = t.elapsed();
    println!(
        "  1. fast_scan_flat_tree:   {:>6.2} ms  ({} entries)",
        tree_time.as_secs_f64() * 1000.0,
        flat_tree.len()
    );

    let paths: Vec<String> = flat_tree
        .iter()
        .filter(|n| n.kind == basalt_vault::NodeKind::File)
        .map(|n| n.path.clone())
        .collect();

    let index_dir = std::env::temp_dir().join("basalt-measure-search-index");
    let _ = std::fs::remove_dir_all(&index_dir);
    let t = Instant::now();
    let _fast_search = SearchState::open_fast(&index_dir, paths.clone()).expect("search fast open");
    let search_time = t.elapsed();
    println!(
        "  2. search open_fast:      {:>6.2} ms  ({} note paths)",
        search_time.as_secs_f64() * 1000.0,
        paths.len()
    );

    let cold_tier1_total = tree_time + search_time;
    println!(
        "  -> Tier 1 Cold Boot Total:{:>6.2} ms  (Window paints immediately!)",
        cold_tier1_total.as_secs_f64() * 1000.0
    );

    // ── TIER 2: BACKGROUND PROGRESSIVE INGESTION ──
    println!("\n[Tier 2: Background Progressive Ingestion (Parallel Rayon)]");
    let t = Instant::now();
    let vault = index_directory(p);
    let index_time = t.elapsed();
    let note_count = vault.graph.metadata_cache.len();
    let throughput = (note_count as f64) / index_time.as_secs_f64();
    println!(
        "  Full vault parse (Rayon): {:>6.2} ms  ({note_count} notes, {:.0} notes/sec)",
        index_time.as_secs_f64() * 1000.0,
        throughput
    );

    // ── TIER 1: WARM BOOT (CACHE HIT) ──
    println!("\n[Tier 1: Warm Boot - Cache Hit]");
    let cache_file = std::env::temp_dir().join("basalt-measure-vault.bincode");
    let cache = VaultCache::build(&vault_path, vault);
    cache.save(&cache_file).expect("save binary cache");

    let t = Instant::now();
    let loaded_cache = VaultCache::load(&cache_file).expect("load binary cache");
    let cache_load_time = t.elapsed();
    println!(
        "  1. VaultCache::load:      {:>6.2} ms  ({} notes in cache)",
        cache_load_time.as_secs_f64() * 1000.0,
        loaded_cache.vault.note_count()
    );

    let t = Instant::now();
    let _ = fast_scan_flat_tree(p);
    let tree_time_warm = t.elapsed();
    println!(
        "  2. fast_scan_flat_tree:   {:>6.2} ms",
        tree_time_warm.as_secs_f64() * 1000.0
    );

    let t = Instant::now();
    let _ = SearchState::open_fast(&index_dir, paths.clone()).expect("search fast open");
    let search_time_warm = t.elapsed();
    println!(
        "  3. search open_fast:      {:>6.2} ms",
        search_time_warm.as_secs_f64() * 1000.0
    );

    let warm_tier1_total = cache_load_time + tree_time_warm + search_time_warm;
    println!(
        "  -> Tier 1 Warm Boot Total:{:>6.2} ms  (Instant boot!)",
        warm_tier1_total.as_secs_f64() * 1000.0
    );

    let _ = std::fs::remove_file(cache_file);
    let _ = std::fs::remove_dir_all(&index_dir);
}
