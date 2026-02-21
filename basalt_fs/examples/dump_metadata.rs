use std::path::Path;
use std::time::Instant;
use std::fs;
use basalt_fs::indexer::index_directory;

fn main() {
    let vault_path = Path::new("/home/pranav/Documents/obsidian");
    let output_filepath = "/home/pranav/Projects/Basalt/metadata_dump.txt";

    if !vault_path.exists() {
        println!("Vault path does not exist: {:?}", vault_path);
        return;
    }

    println!("Scanning vault at: {:?}", vault_path);
    println!("Indexing with fast metadata extraction...");
    
    let start = Instant::now();
    let vault = index_directory(vault_path);
    let duration = start.elapsed();

    let node_count = vault.arena.len();
    let fwd_links: usize = vault.graph.forward_links.values().map(|s| s.len()).sum();
    let back_links: usize = vault.graph.back_links.values().map(|s| s.len()).sum();

    println!("--- Indexing Complete ---");
    println!("Time taken: {:?}", duration);
    println!("Total indexed items/strings in Arena: {}", node_count);
    println!("Total Forward Links: {}", fwd_links);
    println!("Total Back Links: {}", back_links);

    let mut report = String::new();
    report.push_str("=== VaultMetadata Index Report ===\n");
    report.push_str(&format!("Time taken: {:?}\n", duration));
    report.push_str(&format!("Total indexed items/strings in Arena: {}\n", node_count));
    report.push_str(&format!("Total Forward Links: {}\n", fwd_links));
    report.push_str(&format!("Total Back Links: {}\n", back_links));

    // Optional: Dump some statistics or graph samples
    report.push_str("\n--- Forward Links (First 20 items) ---\n");
    for (i, (key, targets)) in vault.graph.forward_links.iter().take(20).enumerate() {
        let node_name = vault.arena.get_string(*key).map(|s| s.as_str()).unwrap_or("UNKNOWN");
        report.push_str(&format!("{}. [{}] {} links to:\n", i + 1, key, node_name));
        for target in targets {
            let target_name = vault.arena.get_string(*target).map(|s| s.as_str()).unwrap_or("UNKNOWN");
            report.push_str(&format!("   -> [{}] {}\n", target, target_name));
        }
    }

    report.push_str("\n--- String Arena Sample ---\n");
    for id in 0..std::cmp::min(20, vault.arena.len() as u32) {
        if let Some(val) = vault.arena.get_string(id) {
            report.push_str(&format!("{}: {}\n", id, val));
        }
    }

    fs::write(output_filepath, report).expect("Could not write dump file");
    println!("Report written to {}", output_filepath);
}
