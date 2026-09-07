use super::*;

fn temp_vault_with_folder() -> (std::path::PathBuf, crate::app_state::AppState) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("basalt-path-rename-test-{n}"));
    let folder = root.join("Project");
    std::fs::create_dir_all(&folder).unwrap();

    let state = AppState::default();
    for (file, content) in [
        ("Project/a.md", "Self: [[Project/a.md]]\n"),
        ("Project/b.md", "I am B.\n"),
        ("c.md", "See [[Project/b]] and [[Bare]]\n"),
        ("other.md", "Unrelated [[NotHere]]\n"),
    ] {
        let p = root.join(file);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, content).unwrap();
        let str = p.to_string_lossy().to_string();
        state.vault.write().unwrap().add_document(&str, content);
    }
    *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
    (root, state)
}

#[test]
fn rename_folder_rewrites_path_links_and_moves_docs() {
    let (root, state) = temp_vault_with_folder();
    let folder_str = root.join("Project").to_string_lossy().to_string();

    let res = rename_path_impl(&folder_str, "Docs", &state).unwrap();

    assert_eq!(res.name, "Docs");
    assert!(root.join("Docs").is_dir(), "folder renamed on disk");
    assert!(!root.join("Project").exists(), "old folder removed");

    // Wikilinks across the vault follow the folder.
    let c = std::fs::read_to_string(root.join("c.md")).unwrap();
    assert!(c.contains("[[Docs/b]]"), "path-form link rewritten");
    assert!(c.contains("[[Bare]]"), "bare links untouched");
    let a = std::fs::read_to_string(root.join("Docs/a.md")).unwrap();
    assert!(
        a.contains("[[Docs/a.md]]"),
        "moved note's self path-link rewritten"
    );
    let other = std::fs::read_to_string(root.join("other.md")).unwrap();
    assert!(other.contains("[[NotHere]]"), "unrelated notes untouched");

    // Report the two moved documents.
    assert_eq!(res.moved.len(), 2, "both notes reported as moved");
    assert!(res
        .moved
        .iter()
        .any(|(o, n)| o.ends_with("Project/a.md") && n.ends_with("Docs/a.md")));
    assert!(res
        .moved
        .iter()
        .any(|(o, n)| o.ends_with("Project/b.md") && n.ends_with("Docs/b.md")));
    assert!(res
        .updated_files
        .contains(&root.join("c.md").to_string_lossy().to_string()));
    assert!(res
        .updated_files
        .contains(&root.join("Docs/a.md").to_string_lossy().to_string()));

    // Vault cache: old paths dropped, new paths present with rewritten links.
    let vault = state.vault.read().unwrap();
    let cached: Vec<String> = vault
        .graph
        .metadata_cache
        .keys()
        .filter_map(|id| vault.arena.get_string(*id).cloned())
        .collect();
    assert!(
        !cached.iter().any(|p| p.contains("/Project/")),
        "old paths dropped"
    );
    let a_id = vault
        .arena
        .get_id(root.join("Docs/a.md").to_string_lossy().as_ref())
        .unwrap();
    assert!(
        vault
            .graph
            .metadata_cache
            .get(&a_id)
            .unwrap()
            .links
            .contains(&"Docs/a.md".to_string()),
        "cached links follow the folder"
    );
}

#[test]
fn rename_attachment_preserves_extension() {
    let root = std::env::temp_dir().join(format!(
        "basalt-attach-rename-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("img.png"), "fake bytes").unwrap();
    let state = AppState::default();
    *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());

    let old = root.join("img.png").to_string_lossy().to_string();
    let res = rename_path_impl(&old, "logo", &state).unwrap();

    assert_eq!(res.name, "logo.png");
    assert!(root.join("logo.png").is_file(), "extension preserved");
    assert!(!root.join("img.png").exists());
    assert!(res.moved.is_empty(), "attachments move no documents");

    // Explicit extension input is respected (any case).
    let res2 = rename_path_impl(
        root.join("logo.png").to_string_lossy().as_ref(),
        "final.PNG",
        &state,
    )
    .unwrap();
    assert_eq!(res2.name, "final.PNG");
    assert!(root.join("final.PNG").exists());
}

#[test]
fn rename_path_rejects_collision_and_same_name() {
    let (root, state) = temp_vault_with_folder();
    let folder_str = root.join("Project").to_string_lossy().to_string();
    // Rename onto a folder that already exists is a collision.
    std::fs::create_dir_all(root.join("taken")).unwrap();
    let err = rename_path_impl(&folder_str, "taken", &state).unwrap_err();
    assert!(err.to_string().contains("already exists"), "got: {err}");

    // Renaming to the same (trimmed) name is a no-op rejection.
    let res = rename_path_impl(&folder_str, "Project", &state);
    assert!(
        res.is_err()
            && res
                .unwrap_err()
                .to_string()
                .contains("already has that name"),
        "same-name rename rejected"
    );
}

#[test]
fn rename_path_rejects_notes_and_invalid_names() {
    let (root, state) = temp_vault_with_folder();
    let b_str = root.join("Project/b.md").to_string_lossy().to_string();
    assert!(
        rename_path_impl(&b_str, "renamedB", &state).is_err(),
        "notes must go through rename_note"
    );
    let folder_str = root.join("Project").to_string_lossy().to_string();
    assert!(rename_path_impl(&folder_str, "a/b", &state).is_err());
    assert!(rename_path_impl(&folder_str, "..", &state).is_err());
    assert!(rename_path_impl(&folder_str, "   ", &state).is_err());
}