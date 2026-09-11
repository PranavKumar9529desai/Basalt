//! Shared test support for the command modules.

use crate::app_state::AppState;

/// Build an isolated temp vault: a fresh `AppState` plus three notes
/// (`a.md`, `b.md`, `c.md`) with wikilink content, `vault_path` set to the
/// root. Callers create and index assets on top as needed.
pub fn temp_vault() -> (std::path::PathBuf, AppState) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("basalt-rename-test-{n}"));
    std::fs::create_dir_all(&root).unwrap();

    let a = root.join("a.md");
    let b = root.join("b.md");
    let c = root.join("c.md");
    std::fs::write(&a, "See [[b]] and [[b#Heading]].\n").unwrap();
    std::fs::write(&b, "I am B.\n").unwrap();
    std::fs::write(&c, "Unrelated.\n").unwrap();

    let state = AppState::default();
    for p in [&a, &b, &c] {
        let str = p.to_string_lossy().to_string();
        let content = std::fs::read_to_string(p).unwrap();
        state.vault.write().unwrap().add_document(&str, &content);
    }
    *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
    (root, state)
}
