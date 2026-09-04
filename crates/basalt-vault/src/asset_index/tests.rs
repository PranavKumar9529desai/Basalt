use super::*;

fn sample_asset(rel: &str) -> AssetInfo {
    let path = Path::new(rel);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    AssetInfo {
        rel_path: rel.to_string(),
        abs_path: format!("/vault/{rel}"),
        file_name,
        file_type: infer_file_type(rel),
        mime_type: infer_mime_type(rel).to_string(),
        size_bytes: 1024,
        content_hash: "abc123".to_string(),
        width: None,
        height: None,
        embeds_by: Vec::new(),
        linked_by: Vec::new(),
    }
}

#[test]
fn test_infer_file_type() {
    assert_eq!(infer_file_type("photo.png"), FileType::Image);
    assert_eq!(infer_file_type("photo.JPG"), FileType::Image);
    assert_eq!(infer_file_type("video.mp4"), FileType::Video);
    assert_eq!(infer_file_type("song.flac"), FileType::Audio);
    assert_eq!(infer_file_type("report.pdf"), FileType::Document);
    assert_eq!(infer_file_type("archive.zip"), FileType::Other);
}

#[test]
fn test_infer_mime_type() {
    assert_eq!(infer_mime_type("a.png"), "image/png");
    assert_eq!(infer_mime_type("a.webp"), "image/webp");
    assert_eq!(infer_mime_type("a.mp3"), "audio/mpeg");
    assert_eq!(infer_mime_type("a.unknown"), "application/octet-stream");
}

#[test]
fn test_compute_md5_deterministic() {
    let h1 = compute_md5(b"hello world");
    let h2 = compute_md5(b"hello world");
    assert_eq!(h1, h2);
    assert_eq!(h1.len(), 32); // hex-encoded MD5 is 32 chars
}

#[test]
fn test_compute_md5_differs_for_different_content() {
    let h1 = compute_md5(b"hello");
    let h2 = compute_md5(b"world");
    assert_ne!(h1, h2);
}

#[test]
fn test_asset_index_upsert_and_get() {
    let mut idx = AssetIndex::new();
    let a = sample_asset("img/photo.png");
    idx.upsert(a.clone());
    assert_eq!(idx.len(), 1);
    assert_eq!(
        idx.get("/vault/img/photo.png").unwrap().rel_path,
        "img/photo.png"
    );
}

#[test]
fn test_asset_index_remove() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("a.png"));
    assert!(idx.remove("/vault/a.png").is_some());
    assert!(idx.is_empty());
}

#[test]
fn test_register_embeds_by_basename() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("assets/image.png"));

    idx.register_embeds("/vault/note.md", &["image.png".to_string()]);

    let a = idx.get("/vault/assets/image.png").unwrap();
    assert_eq!(a.embeds_by, vec!["/vault/note.md"]);
}

#[test]
fn test_register_links_by_rel_path() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("docs/diagram.pdf"));

    idx.register_links("/vault/note.md", &["docs/diagram.pdf".to_string()]);

    let a = idx.get("/vault/docs/diagram.pdf").unwrap();
    assert_eq!(a.linked_by, vec!["/vault/note.md"]);
}

#[test]
fn test_no_duplicate_references() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("a.png"));

    idx.register_embeds(
        "/vault/note.md",
        &["a.png".to_string(), "a.png".to_string()],
    );

    let a = idx.get("/vault/a.png").unwrap();
    assert_eq!(a.embeds_by.len(), 1);
}

#[test]
fn test_clear_references() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("a.png"));
    idx.register_embeds("/vault/note.md", &["a.png".to_string()]);

    idx.clear_references();
    let a = idx.get("/vault/a.png").unwrap();
    assert!(a.embeds_by.is_empty());
    assert!(a.linked_by.is_empty());
}

#[test]
fn test_remove_note_references() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("a.png"));
    idx.upsert(sample_asset("b.png"));
    idx.register_embeds("/vault/note1.md", &["a.png".to_string()]);
    idx.register_embeds(
        "/vault/note2.md",
        &["a.png".to_string(), "b.png".to_string()],
    );

    idx.remove_note_references("/vault/note1.md");

    let a = idx.get("/vault/a.png").unwrap();
    assert_eq!(a.embeds_by, vec!["/vault/note2.md"]);
    let b = idx.get("/vault/b.png").unwrap();
    assert_eq!(b.embeds_by, vec!["/vault/note2.md"]);
}

#[test]
fn test_rename_note_references() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("a.png"));
    idx.register_embeds("/vault/old.md", &["a.png".to_string()]);

    idx.rename_note_references("/vault/old.md", "/vault/new.md");

    let a = idx.get("/vault/a.png").unwrap();
    assert_eq!(a.embeds_by, vec!["/vault/new.md"]);
}

#[test]
fn test_audit_report() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("orphan.png")); // orphan
    idx.upsert({
        let mut a = sample_asset("dup1.png");
        a.content_hash = "same_hash".into();
        a
    });
    idx.upsert({
        let mut a = sample_asset("dup2.png");
        a.content_hash = "same_hash".into();
        a
    });
    // Not an orphan (has embeds)
    idx.upsert({
        let mut a = sample_asset("linked.png");
        a.embeds_by = vec!["/vault/note.md".into()];
        a
    });

    let report = idx.audit();
    assert_eq!(report.orphan_count, 3); // orphan.png, dup1.png, dup2.png — all have no references
    assert_eq!(report.duplicate_count, 2); // {dup1,dup2} + {orphan,linked} share hashes
}

#[test]
fn test_resolve_case_insensitive() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("Assets/Photo.PNG"));

    assert!(idx.resolve_asset("assets/photo.png").is_some());
    assert!(idx.resolve_asset("Assets/Photo.PNG").is_some());
}
#[test]
fn test_resolve_asset_stem_match() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("_attachments/image.png"));

    // Extension-less target resolves via stem match
    assert!(idx.resolve_asset("image").is_some());
    // With extension resolves via exact file_name (pass 2)
    assert!(idx.resolve_asset("image.png").is_some());
    // Fully-qualified rel_path resolves (pass 1)
    assert!(idx.resolve_asset("_attachments/image.png").is_some());
    // Non-existent name
    assert!(idx.resolve_asset("video.mp4").is_none());
}

#[test]
fn test_resolve_asset_stem_deterministic_tiebreak() {
    let mut idx = AssetIndex::new();
    // Two assets share the stem "image" — shorter rel_path wins.
    idx.upsert(sample_asset("z/image.png"));
    idx.upsert(sample_asset("a/image.png"));

    let resolved = idx.resolve_asset("image").unwrap();
    assert_eq!(resolved.rel_path, "a/image.png");
}

#[test]
fn test_all_sorted_by_rel_path() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("z.png"));
    idx.upsert(sample_asset("a.png"));
    idx.upsert(sample_asset("m.png"));
    let paths: Vec<String> = idx.all().into_iter().map(|a| a.rel_path).collect();
    assert_eq!(
        paths,
        vec![
            "a.png".to_string(),
            "m.png".to_string(),
            "z.png".to_string()
        ]
    );
}

#[test]
fn test_resolve_asset_stem_prefers_file_name_when_possible() {
    let mut idx = AssetIndex::new();
    idx.upsert(sample_asset("_attachments/photo.png"));
    idx.upsert(sample_asset("_attachments/other/photo.jpg"));

    // Pass 2 (exact file_name) fires before pass 3 (stem) — file_name
    // "photo.png" == target "photo.png" matches the first asset directly.
    let resolved = idx.resolve_asset("photo.png").unwrap();
    assert_eq!(resolved.rel_path, "_attachments/photo.png");
}
