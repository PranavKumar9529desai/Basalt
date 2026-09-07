use crate::commands::common::tests::temp_vault;
use super::*;

#[test]
fn reorganize_flat_to_by_note_moves_assets_and_rewrites_embeds() {
    use basalt_vault::asset_index::AssetInfo;
    use std::collections::HashMap;

    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();

    // Asset lives flat alongside the note root: _attachments/logo.png
    let attach_dir = root.join("_attachments");
    std::fs::create_dir_all(&attach_dir).unwrap();
    let png_path = attach_dir.join("logo.png");
    std::fs::write(&png_path, [0x89u8, 0x50, 0x4E, 0x47]).unwrap(); // PNG magic
    let abs = png_path.to_string_lossy().to_string();
    let rel = "_attachments/logo.png".to_string();
    let old_target = "_attachments/logo".to_string();

    state.vault.write().unwrap().asset_index.upsert(AssetInfo {
        rel_path: rel.clone(),
        abs_path: abs.clone(),
        file_name: "logo.png".into(),
        file_type: basalt_vault::asset_index::FileType::Image,
        mime_type: "image/png".into(),
        size_bytes: 4,
        content_hash: "hash123".into(),
        width: None,
        height: None,
        embeds_by: vec![b_str.clone()],
        linked_by: vec![],
    });

    // Note A embeds the asset via ![[...]].
    let a_str = root.join("a.md").to_string_lossy().to_string();
    let a_content = format!("Logo: ![[{old_target}]]\n");
    std::fs::write(&a_str, &a_content).unwrap();
    state
        .vault
        .write()
        .unwrap()
        .add_document(&a_str, &a_content);

    // Settings: organization=by_note, naming={original_name}
    let mut settings: HashMap<String, serde_json::Value> = HashMap::new();
    settings.insert(
        "attachmentOrganization".into(),
        serde_json::Value::String("by_note".into()),
    );
    settings.insert(
        "attachmentNaming".into(),
        serde_json::Value::String("{original_name}".into()),
    );
    settings.insert(
        "attachmentFolder".into(),
        serde_json::Value::String("_attachments".into()),
    );

    let res = reorganize_assets_impl(&state, &settings).unwrap();

    assert_eq!(res.files_moved, 1, "one asset moved");

    // Asset should now live under _attachments/a/ (note A embeds it via
    // ![[...]] and "a" sorts first alphabetically in note_from_embeds).
    let new_path = root.join("_attachments").join("a").join("logo.png");
    assert!(
        new_path.exists(),
        "asset moved to by_note dir: {}",
        new_path.display()
    );
    assert!(!png_path.exists(), "old flat asset gone");

    // Embed in note A rewritten.
    let a_after = std::fs::read_to_string(&a_str).unwrap();
    assert!(
        a_after.contains("_attachments/a/logo"),
        "embed rewritten: {a_after}"
    );
    assert!(
        !a_after.contains("_attachments/logo"),
        "old flat target gone: {a_after}"
    );
}

/// Reorganize with no-op settings: already-organized asset stays put.
#[test]
fn reorganize_noop_when_already_correct() {
    use basalt_vault::asset_index::AssetInfo;
    use std::collections::HashMap;

    let (root, state) = temp_vault();

    let attach_dir = root.join("_attachments");
    std::fs::create_dir_all(&attach_dir).unwrap();
    let png_path = attach_dir.join("logo.png");
    std::fs::write(&png_path, [0x89u8]).unwrap();
    let abs = png_path.to_string_lossy().to_string();

    state.vault.write().unwrap().asset_index.upsert(AssetInfo {
        rel_path: "_attachments/logo.png".into(),
        abs_path: abs.clone(),
        file_name: "logo.png".into(),
        file_type: basalt_vault::asset_index::FileType::Image,
        mime_type: "image/png".into(),
        size_bytes: 1,
        content_hash: "".into(),
        width: None,
        height: None,
        embeds_by: vec![],
        linked_by: vec![],
    });

    let settings: HashMap<String, serde_json::Value> = HashMap::new(); // all defaults (flat/original_name)
    let res = reorganize_assets_impl(&state, &settings).unwrap();
    assert_eq!(res.files_moved, 0, "no files should move");
    assert!(png_path.exists(), "asset unchanged");
}

#[test]
fn rewrite_asset_embeds_boundary() {
    let content = concat!(
        "A ![[_attachments/foo.png]] and ![[_attachments/foobar.png]] and\n",
        "![[_attachments/foo/bar.png]] and [[_attachments/foo.png|alias]] and\n",
        "![[_attachments/foo.png#anchor]]",
    );
    let out = rewrite_asset_embeds(content, "_attachments/foo", "_attachments/images/foo");
    assert!(
        out.contains("![[_attachments/images/foo.png]]"),
        "exact embed rewritten"
    );
    assert!(
        out.contains("![[_attachments/foobar.png]]"),
        "sibling prefix must not be rewritten: {out}"
    );
    assert!(
        out.contains("![[_attachments/foo/bar.png]]"),
        "nested target must not be rewritten: {out}"
    );
    assert!(
        out.contains("[[_attachments/images/foo.png|alias]]"),
        "plain link + alias preserved: {out}"
    );
    assert!(
        out.contains("![[_attachments/images/foo.png#anchor]]"),
        "anchor preserved: {out}"
    );
}

/// `{note_name}-{n}` naming must match save_attachment's scheme: base is
/// the note stem, `-N` is a collision counter, not the original stem.
#[test]
fn reorganize_note_name_counter_parity() {
    use basalt_vault::asset_index::AssetInfo;
    use std::collections::HashMap;

    let (root, state) = temp_vault();
    let b_str = root.join("b.md").to_string_lossy().to_string();

    let attach_dir = root.join("_attachments");
    std::fs::create_dir_all(&attach_dir).unwrap();
    for name in ["logo.png", "logo2.png"] {
        let abs = attach_dir.join(name).to_string_lossy().to_string();
        std::fs::write(attach_dir.join(name), [0x89u8]).unwrap();
        state.vault.write().unwrap().asset_index.upsert(AssetInfo {
            rel_path: format!("_attachments/{name}"),
            abs_path: abs,
            file_name: name.into(),
            file_type: basalt_vault::asset_index::FileType::Image,
            mime_type: "image/png".into(),
            size_bytes: 1,
            content_hash: "hash123".into(),
            width: None,
            height: None,
            embeds_by: vec![b_str.clone()],
            linked_by: vec![],
        });
    }

    let mut settings: HashMap<String, serde_json::Value> = HashMap::new();
    settings.insert(
        "attachmentOrganization".into(),
        serde_json::Value::String("by_note".into()),
    );
    settings.insert(
        "attachmentNaming".into(),
        serde_json::Value::String("{note_name}-{n}".into()),
    );
    settings.insert(
        "attachmentFolder".into(),
        serde_json::Value::String("_attachments".into()),
    );

    let res = reorganize_assets_impl(&state, &settings).unwrap();
    assert_eq!(res.files_moved, 2, "both assets filed under the note");

    assert!(root.join("_attachments").join("b").join("b.png").exists());
    assert!(root.join("_attachments").join("b").join("b-1.png").exists());
    assert!(!root.join("_attachments").join("logo.png").exists());
    assert!(!root.join("_attachments").join("logo2.png").exists());
}