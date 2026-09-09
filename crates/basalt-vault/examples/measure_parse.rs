//! Parser / vault-build phase timing harness — breaks down the cost of opening
//! a vault: disk I/O, frontmatter/metadata extraction, and the full
//! `index_directory` build (arena + graph + link resolution + asset index).
//!
//! Usage:
//!   cargo run --release --example measure_parse -- <vault-path>   # release
//!   cargo run          --example measure_parse -- <vault-path>   # debug (dev mode)
//!
//! Run both profiles to compare — the dev app (`bun run dev`) uses the debug
//! build, where `index_directory` can be ~18x slower than release.
use std::hint::black_box;
use std::path::Path;
use std::time::Instant;

use basalt_parser::{extract_metadata, parse_frontmatter};
use basalt_vault::indexer::index_directory;
use ignore::WalkBuilder;

fn read_all(vault: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for e in WalkBuilder::new(vault).build().flatten() {
        if e.file_type().is_some_and(|f| f.is_file())
            && e.path().extension().and_then(|x| x.to_str()) == Some("md")
        {
            if let Ok(c) = std::fs::read_to_string(e.path()) {
                out.push((e.path().to_string_lossy().into_owned(), c));
            }
        }
    }
    out
}

fn main() {
    let vault_path = std::env::args().nth(1).expect("usage: measure_parse <vault-path>");
    let p = Path::new(&vault_path);

    // Disk I/O baseline
    let t = Instant::now();
    let docs = read_all(p);
    let read_ms = t.elapsed().as_millis();
    let bytes: usize = docs.iter().map(|(_, c)| c.len()).sum();
    println!("disk read {} files to string: {read_ms} ms  ({bytes} bytes / {:.1} MB)",
        docs.len(), bytes as f64 / (1024.0 * 1024.0));

    // extract_metadata: title/links/tags/metadata scan
    let t = Instant::now();
    for (_, c) in &docs {
        black_box(extract_metadata(c));
    }
    println!("extract_metadata over {} docs: {} ms", docs.len(), t.elapsed().as_millis());

    // parse_frontmatter: structured frontmatter parse
    let t = Instant::now();
    for (_, c) in &docs {
        black_box(parse_frontmatter(c));
    }
    println!("parse_frontmatter over {} docs: {} ms", docs.len(), t.elapsed().as_millis());

    // Full vault index for reference
    let t = Instant::now();
    let vault = index_directory(p);
    println!("index_directory (full vault parse): {} ms  ({} notes)",
        t.elapsed().as_millis(), vault.graph.metadata_cache.len());
}
