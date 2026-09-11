use crate::commands::common::tests::temp_vault;
use super::*;

fn temp_vault_with_self_refs() -> (std::path::PathBuf, crate::app_state::AppState) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("basalt-rename-test-self-{n}"));
    std::fs::create_dir_all(&root).unwrap();

    let state = AppState::default();
    for (file, content) in [
        ("a.md", "See [[b]].\n"),
        ("b.md", "Self: [[b]] and [[b|alias]].\n"),
        ("c.md", "Unrelated.\n"),
    ] {
        let p = root.join(file);
        std::fs::write(&p, content).unwrap();
        let str = p.to_string_lossy().to_string();
        state.vault.write().unwrap().add_document(&str, content);
    }
    *state.vault_path.write().unwrap() = Some(root.to_string_lossy().to_string());
    (root, state)
}
#[test]
fn rename_rewrites_links_in_other_notes_and_graph() {
    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();

    let res = rename_note_impl(&b_str, "renamedB", &state, None).unwrap();

    assert_eq!(res.name, "renamedB");
    assert!(res.path.ends_with("renamedB.md"));
    assert!(root.join("renamedB.md").exists(), "file renamed on disk");
    assert!(!root.join("b.md").exists(), "old file removed");

    let a_str = root.join("a.md").to_string_lossy().to_string();
    let a_content = std::fs::read_to_string(&a_str).unwrap();
    assert!(a_content.contains("[[renamedB]]"), "bare link rewritten");
    assert!(
        a_content.contains("[[renamedB#Heading]]"),
        "anchored link rewritten"
    );
    assert!(
        !a_content.contains("[[b"),
        "no stale old-target links remain"
    );
    assert!(
        res.updated_files.contains(&a_str),
        "a.md reported as updated"
    );

    // Graph: old node gone, new node present with rewritten links.
    let vault = state.vault.read().unwrap();
    let has_old = vault
        .graph
        .metadata_cache
        .keys()
        .filter_map(|id| vault.arena.get_string(*id))
        .any(|p| p == &b_str);
    let has_new = vault
        .graph
        .metadata_cache
        .keys()
        .filter_map(|id| vault.arena.get_string(*id))
        .any(|p| p == &res.path);
    assert!(!has_old, "old path dropped from cache");
    assert!(has_new, "new path indexed in cache");
    let a_id = vault.arena.get_id(&a_str).unwrap();
    let a_meta = vault.graph.metadata_cache.get(&a_id).unwrap();
    assert!(
        a_meta.links.contains(&"renamedB".to_string()),
        "a.md's cached links point at the new stem"
    );
}

#[test]
fn rename_rewrites_self_links_inside_the_note() {
    let (root, state) = temp_vault_with_self_refs();
    let b_str = root.join("b.md").to_string_lossy().to_string();
    let res = rename_note_impl(&b_str, "renamedB", &state, None).unwrap();
    let content = std::fs::read_to_string(root.join("renamedB.md")).unwrap();
    assert!(content.contains("[[renamedB]]"));
    assert!(content.contains("[[renamedB|alias]]"));
    assert!(res.path.ends_with("renamedB.md"));
}

#[test]
fn rename_rejects_collision() {
    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();
    let err = rename_note_impl(&b_str, "c", &state, None)
        .unwrap_err()
        .to_string();
    assert!(err.contains("already exists"));
}

#[test]
fn rename_rejects_same_name() {
    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();
    let err = rename_note_impl(&b_str, "B", &state, None)
        .unwrap_err()
        .to_string();
    assert!(err.contains("already has that name"));
}

#[test]
fn rename_strips_trailing_md_extension() {
    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();
    let res = rename_note_impl(&b_str, "final.md", &state, None).unwrap();
    assert_eq!(res.name, "final");
    assert!(root.join("final.md").exists());
}

#[test]
fn rename_rejects_invalid_names() {
    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();
    assert!(rename_note_impl(&b_str, "   ", &state, None).is_err());
    assert!(rename_note_impl(&b_str, "a/b", &state, None).is_err());
    assert!(rename_note_impl(&b_str, "..", &state, None).is_err());
}

#[test]
fn rename_with_note_moves_attachments_and_rewrites_embeds() {
    use basalt_vault::asset_index::AssetInfo;
    use std::collections::HashMap;

    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();
    let old_abs = root.join("b.md");

    // Create _attachments/b/logo.png (simulating by_note org).
    let attach_dir = root.join("_attachments").join("b");
    std::fs::create_dir_all(&attach_dir).unwrap();
    let png_path = attach_dir.join("logo.png");
    std::fs::write(&png_path, [0x89u8, 0x50, 0x4E, 0x47]).unwrap(); // PNG magic bytes
    let attach_abs = png_path.to_string_lossy().to_string();
    let attach_rel = "_attachments/b/logo.png".to_string();
    let embed_target = "_attachments/b/logo".to_string();

    // Register the asset in the index with embeds_by referencing note B.
    state.vault.write().unwrap().asset_index.upsert(AssetInfo {
        rel_path: attach_rel.clone(),
        abs_path: attach_abs.clone(),
        file_name: "logo.png".into(),
        file_type: basalt_vault::asset_index::FileType::Image,
        mime_type: "image/png".into(),
        size_bytes: 4,
        content_hash: "test123".into(),
        width: None,
        height: None,
        embeds_by: vec![old_abs.to_string_lossy().to_string()],
        linked_by: vec![],
    });

    // Note C references the asset via ![[embed_target]].
    let c_str = root.join("c.md").to_string_lossy().to_string();
    let c_content = format!("Logo: ![[{embed_target}]]\n");
    std::fs::write(&c_str, &c_content).unwrap();
    state
        .vault
        .write()
        .unwrap()
        .add_document(&c_str, &c_content);

    // Simulate by_note settings.
    let mut settings: HashMap<String, serde_json::Value> = HashMap::new();
    settings.insert(
        "attachmentOrganization".into(),
        serde_json::Value::String("by_note".into()),
    );
    settings.insert(
        "renameAttachmentsWithNote".into(),
        serde_json::Value::Bool(true),
    );
    settings.insert(
        "attachmentFolder".into(),
        serde_json::Value::String("_attachments".into()),
    );

    let res = rename_note_impl(&b_str, "renamedB", &state, Some(&settings)).unwrap();

    assert_eq!(res.name, "renamedB");
    assert!(root.join("renamedB.md").exists(), "note renamed");
    assert!(!root.join("b.md").exists(), "old note gone");

    // Asset moved from _attachments/b/ → _attachments/renamedB/.
    let new_attach = root.join("_attachments").join("renamedB").join("logo.png");
    assert!(new_attach.exists(), "asset moved to new note dir");
    assert!(!png_path.exists(), "old asset path gone");

    // Embed in note C rewritten to new path.
    let c_after = std::fs::read_to_string(&c_str).unwrap();
    assert!(
        c_after.contains("_attachments/renamedB/logo"),
        "embed rewritten: {c_after}"
    );
    assert!(
        !c_after.contains("_attachments/b/logo"),
        "old embed removed: {c_after}"
    );
}

#[test]
fn rename_drawing_file_preserves_extension() {
    let (root, state) = temp_vault();
    let draw_path = root.join("architecture.excalidraw.md");
    let scene = "---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n# Excalidraw Data\n## Text Elements\n- Microservice arch\n\n%%\n## Drawing\n```json\n{\"type\":\"excalidraw\",\"version\":2,\"elements\":[]}\n```\n";
    std::fs::write(&draw_path, scene).unwrap();
    state.vault.write().unwrap().add_document(&draw_path.to_string_lossy(), scene);

    let res = rename_note_impl(&draw_path.to_string_lossy(), "system_design", &state, None).unwrap();

    assert_eq!(res.name, "system_design");
    assert!(res.path.ends_with("system_design.excalidraw.md"));
    assert!(root.join("system_design.excalidraw.md").exists(), "file renamed with .excalidraw.md preserved");
    assert!(!root.join("architecture.excalidraw.md").exists(), "old drawing file removed");
}