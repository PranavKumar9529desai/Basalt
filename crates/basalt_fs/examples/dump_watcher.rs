use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use basalt_fs::indexer::index_directory;
use basalt_fs::watcher::VaultWatcher;

fn main() {
    let test_dir = PathBuf::from("/tmp/basalt_watcher_test");

    // Clean up from previous runs
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).unwrap();

    let file_path = test_dir.join("note1.md");
    fs::write(&file_path, "Initial content with [[Link A]]").unwrap();

    println!("1. Initialized vault at {:?}", test_dir);

    // 1. Run initial indexer
    let vault = index_directory(&test_dir);
    println!(
        "2. Vault indexed. Forward Links: {}",
        vault.graph.forward_links.len()
    );

    let vault_arc = Arc::new(RwLock::new(vault));

    // 2. Start watcher
    println!("3. Starting watcher...");
    let _watcher =
        VaultWatcher::watch(&test_dir, Arc::clone(&vault_arc)).expect("Failed to start watcher");

    // Give watcher time to boot up
    std::thread::sleep(Duration::from_millis(100));

    // 3. Modify the file on disk
    println!("4. Modifying note1.md on disk...");
    fs::write(
        &file_path,
        "Modified content with [[Link B]] and [[Link C]]",
    )
    .unwrap();

    // 4. Wait for the debounce and watcher processing (500ms debounce + 100ms lag)
    std::thread::sleep(Duration::from_millis(1500));

    // 5. Check if the vault updated autonomously
    let vault_lock = vault_arc.read().unwrap();
    println!("5. Watcher test complete.");

    // Print out the new links to prove it updated
    println!("--- Updated Graph Links ---");
    for (source_id, targets) in &vault_lock.graph.forward_links {
        let source_name = vault_lock.arena.get_string(*source_id).unwrap();
        println!("{} links to:", source_name);
        for target_id in targets {
            let target_name = vault_lock.arena.get_string(*target_id).unwrap();
            println!("  -> {}", target_name);
        }
    }
}
