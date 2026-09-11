use super::*;

fn rename() -> NoteRename {
    NoteRename::new("Note", "RenamedNote")
}

#[test]
fn rewrites_bare_target() {
    let out = rewrite_wikilinks("See [[Note]] here.", &rename());
    assert_eq!(out, "See [[RenamedNote]] here.");
}

#[test]
fn preserves_alias() {
    let out = rewrite_wikilinks("[[Note|My Alias]]", &rename());
    assert_eq!(out, "[[RenamedNote|My Alias]]");
}

#[test]
fn preserves_anchor() {
    let out = rewrite_wikilinks("[[Note#Section]]", &rename());
    assert_eq!(out, "[[RenamedNote#Section]]");
}

#[test]
fn preserves_alias_and_anchor() {
    let out = rewrite_wikilinks("[[Note#Section|Alias]]", &rename());
    assert_eq!(out, "[[RenamedNote#Section|Alias]]");
}

#[test]
fn rewrites_path_form_keeping_prefix() {
    let out = rewrite_wikilinks("[[folder/sub/Note]]", &rename());
    assert_eq!(out, "[[folder/sub/RenamedNote]]");
}

#[test]
fn strips_md_extension() {
    let out = rewrite_wikilinks("[[Note.md]]", &rename());
    assert_eq!(out, "[[RenamedNote]]");
    let out = rewrite_wikilinks("[[folder/Note.md]]", &rename());
    assert_eq!(out, "[[folder/RenamedNote]]");
}

#[test]
fn matches_case_insensitively() {
    let out = rewrite_wikilinks("[[note]] [[NOTE]] [[Folder/NOTE]]", &rename());
    assert_eq!(
        out,
        "[[RenamedNote]] [[RenamedNote]] [[Folder/RenamedNote]]"
    );
}

#[test]
fn leaves_unrelated_links_alone() {
    let text = "[[Other]] [[Note2]] [[Noted]] Some [[Note|alias]] prose";
    let out = rewrite_wikilinks(text, &rename());
    assert_eq!(
        out,
        "[[Other]] [[Note2]] [[Noted]] Some [[RenamedNote|alias]] prose"
    );
}

#[test]
fn rewrites_multiple_occurrences() {
    let out = rewrite_wikilinks("[[Note]] and [[Note#X]] and [[Other]]", &rename());
    assert_eq!(out, "[[RenamedNote]] and [[RenamedNote#X]] and [[Other]]");
}

#[test]
fn rewrites_wikilinks_in_frontmatter_strings() {
    let text = "---\ntags:\n  - \"[[Note]]\"\n---\nBody";
    let out = rewrite_wikilinks(text, &rename());
    assert_eq!(out, "---\ntags:\n  - \"[[RenamedNote]]\"\n---\nBody");
}

#[test]
fn trims_trailing_space_in_target() {
    let out = rewrite_wikilinks("[[Note |alias]]", &rename());
    assert_eq!(out, "[[RenamedNote |alias]]");
}

#[test]
fn no_match_returns_original() {
    let text = "Nothing links here at all.";
    let out = rewrite_wikilinks(text, &rename());
    assert_eq!(out, text);
}

#[test]
fn matches_excludes_similar_but_different_stems() {
    let r = NoteRename::new("war", "peace");
    assert!(r.matches("war"));
    assert!(r.matches("folder/war"));
    assert!(!r.matches("warfare"));
    assert!(!r.matches("prequel/warfare"));
    assert!(!r.matches("sword"));
}

// -- PathRename (folder renames) ---------------------------------------

fn path_rename() -> PathRename {
    PathRename::new("Folder/Sub", "Folder/Docs")
}

#[test]
fn rewrites_folder_path_prefix() {
    let out = rewrite_wikilinks_path("See [[Folder/Sub/Note]] here.", &path_rename());
    assert_eq!(out, "See [[Folder/Docs/Note]] here.");
}

#[test]
fn rewrites_leading_folder_segment() {
    let out = rewrite_wikilinks_path("[[Folder/Sub/Note]]", &PathRename::new("Folder", "Docs"));
    assert_eq!(out, "[[Docs/Sub/Note]]");
}

#[test]
fn path_rename_preserves_alias_and_anchor() {
    let r = path_rename();
    assert_eq!(
        rewrite_wikilinks_path("[[Folder/Sub/Note|Alias]]", &r),
        "[[Folder/Docs/Note|Alias]]"
    );
    assert_eq!(
        rewrite_wikilinks_path("[[Folder/Sub/Note#Section]]", &r),
        "[[Folder/Docs/Note#Section]]"
    );
}

#[test]
fn rewrites_explicit_extension() {
    let out = rewrite_wikilinks_path("[[Folder/Sub/Note.md]]", &path_rename());
    assert_eq!(out, "[[Folder/Docs/Note.md]]");
}

#[test]
fn path_rename_matches_case_insensitively() {
    let out = rewrite_wikilinks_path("[[folder/sub/note]] [[FOLDER/SUB/Note.]]", &path_rename());
    assert_eq!(out, "[[Folder/Docs/note]] [[Folder/Docs/Note.]]");
}

#[test]
fn leaves_bare_and_unrelated_links_alone() {
    let r = path_rename();
    let text = "[[Note]] [[Sub/Note]] [[Other/Sub/Note]] [[Folder/Sub/Note]]";
    let out = rewrite_wikilinks_path(text, &r);
    assert_eq!(
        out,
        "[[Note]] [[Sub/Note]] [[Other/Sub/Note]] [[Folder/Docs/Note]]"
    );
}

#[test]
fn leaves_near_but_not_subpath_links_alone() {
    let r = PathRename::new("Folder", "Docs");
    assert_eq!(
        rewrite_wikilinks_path("[[Folders/Note]] [[Folder/Note]]", &r),
        "[[Folders/Note]] [[Docs/Note]]"
    );
}

#[test]
fn path_rename_matches() {
    let r = path_rename();
    assert!(r.matches("Folder/Sub/Note"));
    assert!(r.matches("folder/sub/note.md"));
    assert!(
        !r.matches("Sub/Note"),
        "missing parent segment keeps other folders safe"
    );
    assert!(
        !r.matches("Folder/Sub"),
        "folder alone is not a link target"
    );
    assert!(!r.matches("Folder/Sub2/Note"), "segment boundary respected");
    assert!(!r.matches("Other/Sub/Note"));
    assert!(!r.matches("Note"));
}

#[test]
fn trims_leading_slashes() {
    let r = PathRename::new("/Folder/", "Docs/");
    let out = rewrite_wikilinks_path("[[Folder/Note]]", &r);
    assert_eq!(out, "[[Docs/Note]]");
}

#[test]
fn rewrites_multiple_occurrences_including_frontmatter() {
    let text = "[[Folder/Sub/A]] and ---\ntags: [[Folder/Sub/B]]\n---";
    let out = rewrite_wikilinks_path(text, &path_rename());
    assert_eq!(
        out,
        "[[Folder/Docs/A]] and ---\ntags: [[Folder/Docs/B]]\n---"
    );
}
// -- Embed rewriting (![[...]]) -----------------------------------------

#[test]
fn rewrites_embeds_like_links() {
    // Embeds are just [[...]] with a ! prefix — the scanner picks them up.
    let out = rewrite_wikilinks("See ![[Note]] here.", &rename());
    assert_eq!(out, "See ![[RenamedNote]] here.");
}

#[test]
fn embed_preserves_alias_and_anchor() {
    let out = rewrite_wikilinks("![[Note#Section|Caption]]", &rename());
    assert_eq!(out, "![[RenamedNote#Section|Caption]]");
}

#[test]
fn embed_path_form_rewrite() {
    let out = rewrite_wikilinks("![[folder/sub/Note]]", &rename());
    assert_eq!(out, "![[folder/sub/RenamedNote]]");
}

#[test]
fn path_rename_rewrites_embeds() {
    let out = rewrite_wikilinks_path("![[Folder/Sub/image.png]]", &path_rename());
    assert_eq!(out, "![[Folder/Docs/image.png]]");
}

#[test]
fn embed_of_non_md_file_not_renamed_on_note_rename() {
    // Renaming note "Note" should NOT rewrite ![[image.png]]
    // because image.png != note stem
    let out = rewrite_wikilinks("![[image.png]] [[Note]]", &rename());
    assert_eq!(out, "![[image.png]] [[RenamedNote]]");
}

#[test]
fn path_rename_no_match_returns_original() {
    let text = "Nothing points into the folder.";
    assert_eq!(rewrite_wikilinks_path(text, &path_rename()), text);
}
