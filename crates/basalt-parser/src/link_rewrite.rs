//! Surgical `[[wikilink]]`-only rewriting for note renames.
//!
//! A note rename must keep every other note that references it working. This
//! module rewrites the *target* portion of `[[...]]` links while preserving
//! aliases, anchors, and surrounding text — it never touches prose or the
//! YAML structure itself, so a rewrite is safe to diff and write back.
//!
//! A single linear token scan, mirroring the extractor's zero-AST philosophy
//! (`metadata::extract_metadata`): measure the raw text, splice replacements
//! from the end so byte offsets stay valid.

/// The old/new basenames (stems, no extension) of a renamed note.
///
/// Matching follows the graph resolver's normalized forms (`commands/vault.rs`):
/// a link target matches if its lowercased, extension-stripped form equals the
/// old stem, or ends with `/old-stem` (a path-form link like `[[folder/Note]]`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRename {
    pub old_stem: String,
    pub new_stem: String,
}

/// Old/new vault-relative folder path prefixes for a folder rename.
///
/// A folder rename must keep every `[[folder/Note]]`-style link pointing at
/// the moved notes. `PathRename` rewrites the *path portion* of such links
/// while leaving the file segment, aliases, anchors, and bare-name links
/// (`[[Note]]` still resolve after the move — they're name-based) untouched.
///
/// Prefixes are vault-relative with no leading or trailing slash, e.g. old
/// `"Folder/Sub"` → new `"Folder/Docs"`. Matching is case-insensitive per
/// path segment and only fires when the target actually begins with the old
/// folder path and has at least one more segment (a file) after it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathRename {
    pub old_prefix: String,
    pub new_prefix: String,
}

impl PathRename {
    /// Build from vault-relative prefixes, tolerating sloppy callers
    /// (leading/trailing slashes are stripped).
    pub fn new(old_prefix: &str, new_prefix: &str) -> Self {
        Self {
            old_prefix: old_prefix.trim_matches('/').to_string(),
            new_prefix: new_prefix.trim_matches('/').to_string(),
        }
    }

    /// Byte range `[start, end)` of the old-folder path within `raw` — the
    /// span that must be replaced — when the target begins with the folder
    /// prefix (case-insensitively) plus at least one more segment. Leading
    /// whitespace is preserved before `start`.
    fn prefix_range(&self, raw: &str) -> Option<(usize, usize)> {
        let start = raw.len() - raw.trim_start().len();
        if start == raw.len() {
            return None;
        }
        let core = &raw[start..];
        let old_segs: Vec<&str> = self
            .old_prefix
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();
        if old_segs.is_empty() {
            return None;
        }
        let raw_segs: Vec<&str> = core.split('/').collect();
        // A folder path alone is not a realistic link target — there must be
        // a file segment after the renamed folder.
        if raw_segs.len() <= old_segs.len() {
            return None;
        }
        for (i, seg) in old_segs.iter().enumerate() {
            if i >= raw_segs.len() || !raw_segs[i].eq_ignore_ascii_case(seg) {
                return None;
            }
        }
        let mut end = 0usize;
        for (i, seg) in raw_segs.iter().enumerate() {
            end += seg.len();
            if i + 1 < raw_segs.len() {
                end += 1;
            }
            if i + 1 == old_segs.len() {
                break;
            }
        }
        Some((start, start + end))
    }

    /// True when `raw` is a wikilink target that points inside the renamed
    /// folder (its leading path matches `old_prefix`).
    pub fn matches(&self, raw: &str) -> bool {
        self.prefix_range(raw).is_some()
    }

    /// Rewrite the folder path of a matching target, preserving leading
    /// whitespace, the file segment, and everything after it. Returns the
    /// input unchanged when nothing matches.
    pub fn rewrite(&self, raw: &str) -> Option<String> {
        let (start, end) = self.prefix_range(raw)?;
        let mut out = String::with_capacity(raw.len() + self.new_prefix.len() + 1);
        out.push_str(&raw[..start]);
        out.push_str(&self.new_prefix);
        out.push('/');
        out.push_str(&raw[end..]);
        Some(out)
    }
}

impl NoteRename {
    pub fn new(old_stem: &str, new_stem: &str) -> Self {
        Self {
            old_stem: old_stem.to_string(),
            new_stem: new_stem.to_string(),
        }
    }

    /// True when a raw wikilink target resolves to the note being renamed.
    pub fn matches(&self, target: &str) -> bool {
        let norm = normalize_target(target);
        let old = self.old_stem.to_lowercase();
        norm == old || norm.ends_with(&format!("/{old}"))
    }
}

/// Normalize a raw wikilink target the way the graph resolver does: strip
/// surrounding whitespace, lowercase, drop a trailing `.md` extension.
fn normalize_target(target: &str) -> String {
    let trimmed = target.trim();
    let lower = trimmed.to_lowercase();
    let stem = lower.strip_suffix(".md").unwrap_or(&lower);
    stem.trim_end().to_string()
}

struct WikilinkSpec {
    /// Byte offsets of the *target* portion inside `[[...]]` (before any
    /// `|` alias or `#` anchor), including the path prefix and trailing
    /// whitespace trimmed at the tail.
    target_from: usize,
    target_to: usize,
}

/// Scan `text` for every `[[...]]` occurrence and return the byte range of
/// each one's target (content before the first `|` or `#`, tail-trimmed).
fn scan_wikilinks(text: &str) -> Vec<WikilinkSpec> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            let content_from = i + 2;
            let mut j = content_from;
            while j + 1 < bytes.len() && !(bytes[j] == b']' && bytes[j + 1] == b']') {
                j += 1;
            }
            if j + 1 < bytes.len() {
                let content = &text[content_from..j];
                // Target ends at the first `|` (alias) or `#` (anchor).
                let mut t = content.len();
                for (k, ch) in content.char_indices() {
                    if ch == '|' || ch == '#' {
                        t = k;
                        break;
                    }
                }
                // Trim trailing whitespace off the target range.
                let mut t_to = t;
                while t_to > 0 {
                    let c = content.as_bytes()[t_to - 1];
                    if c == b' ' || c == b'\t' {
                        t_to -= 1;
                    } else {
                        break;
                    }
                }
                out.push(WikilinkSpec {
                    target_from: content_from,
                    target_to: content_from + t_to,
                });
                i = j + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Rewrite every wikilink in `text` whose target resolves to the renamed note.
///
/// Only the target portion is replaced; path prefixes are kept (`[[a/Note]]`
/// → `[[a/NewName]]`), and aliases/anchors are untouched. Returns the input
/// unchanged when nothing matches.
pub fn rewrite_wikilinks(text: &str, rename: &NoteRename) -> String {
    let specs = scan_wikilinks(text);
    let mut out = String::with_capacity(text.len() + 16);
    let mut cursor = 0;
    for spec in &specs {
        let target = &text[spec.target_from..spec.target_to];
        if !rename.matches(target) {
            continue;
        }
        // Copy everything up to the replacement point untouched.
        out.push_str(&text[cursor..spec.target_from]);
        match target.rfind('/') {
            Some(idx) => {
                // Preserve the folder prefix: `folder/Note` → `folder/NewName`.
                out.push_str(&target[..=idx]);
                out.push_str(&rename.new_stem);
            }
            None => out.push_str(&rename.new_stem),
        }
        cursor = spec.target_to;
    }
    out.push_str(&text[cursor..]);
    out
}

/// Rewrite every wikilink in `text` whose leading path points inside a
/// renamed folder. The folder path portion is replaced (`[[Folder/Sub/Note]]`
/// → `[[Folder/Docs/Note]]`); the file segment, aliases, and anchors are
/// untouched, and bare-name links are ignored (they stay valid after a move).
/// Returns the input unchanged when nothing matches.
pub fn rewrite_wikilinks_path(text: &str, rename: &PathRename) -> String {
    let specs = scan_wikilinks(text);
    let mut out = String::with_capacity(text.len() + 32);
    let mut cursor = 0;
    for spec in &specs {
        let target = &text[spec.target_from..spec.target_to];
        let Some(replaced) = rename.rewrite(target) else {
            continue;
        };
        out.push_str(&text[cursor..spec.target_from]);
        out.push_str(&replaced);
        cursor = spec.target_to;
    }
    out.push_str(&text[cursor..]);
    out
}

#[cfg(test)]
mod tests {
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
        assert_eq!(out, "[[RenamedNote]] [[RenamedNote]] [[Folder/RenamedNote]]");
    }

    #[test]
    fn leaves_unrelated_links_alone() {
        let text = "[[Other]] [[Note2]] [[Noted]] Some [[Note|alias]] prose";
        let out = rewrite_wikilinks(text, &rename());
        assert_eq!(out, "[[Other]] [[Note2]] [[Noted]] Some [[RenamedNote|alias]] prose");
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
        assert_eq!(out, "[[Note]] [[Sub/Note]] [[Other/Sub/Note]] [[Folder/Docs/Note]]");
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
        assert!(!r.matches("Sub/Note"), "missing parent segment keeps other folders safe");
        assert!(!r.matches("Folder/Sub"), "folder alone is not a link target");
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

    #[test]
    fn path_rename_no_match_returns_original() {
        let text = "Nothing points into the folder.";
        assert_eq!(rewrite_wikilinks_path(text, &path_rename()), text);
    }
}