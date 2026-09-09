//! Wiki-link resolution and backlink context extraction.
//!
//! The graph stores wiki-link targets RAW, exactly as written (`[[B]]`,
//! `[[notes/b.md]]`, `[[Beta]]`), while document nodes are absolute paths.
//! Name/path/alias resolution therefore happens here, on the query side, so a
//! backlink lookup matches every spelling the graph resolver accepts
//! (`basalt_parser::normalize_target`, the same normalized form
//! `NoteRename::matches` uses): lowercased, extension-stripped, equal to the
//! note's stem or ending with `/stem` (a path-form link like
//! `[[folder/Note]]`).

use std::collections::HashSet;
use std::path::Path;

use basalt_parser::{normalize_target, scan_wikilinks};
use basalt_graph::NodeId;
use serde::Serialize;

use crate::vault::Vault;

/// Alias links (`[[Beta]]`) resolve to a note whose frontmatter declares
/// `aliases: [Beta]` — the alias is a raw interned target exactly like a name
/// or path, so it needs no resolver predicate, only inclusion in the probe.
const MENTION_CAP: usize = 100;
/// Excerpt window around the matched link, in bytes (expanded to char
/// boundaries): this much before, this much after.
const EXCERPT_BEFORE: usize = 40;
const EXCERPT_AFTER: usize = 120;

/// One line in a backlinking note containing a link that resolves to the
/// active note.
#[derive(Debug, Clone, Serialize)]
pub struct BacklinkMention {
    /// 1-based line number, matching the editor's line convention.
    pub line: u32,
    /// Trimmed excerpt of the line, ellipsized around the match.
    pub excerpt: String,
}

/// A backlinking note plus the concrete mentions of the active note inside it.
#[derive(Debug, Clone, Serialize)]
pub struct BacklinkContext {
    /// Absolute path of the backlinking note.
    pub path: String,
    /// Display name — last path segment.
    pub name: String,
    /// Lines containing a resolving link. Empty when the note links only via
    /// frontmatter (the frontmatter link shape still counts as a backlink).
    pub mentions: Vec<BacklinkMention>,
}

impl Vault {
    /// Absolute paths of the notes that link to `path`, resolved across every
    /// spelling the graph accepts: the absolute path itself, the bare name /
    /// path form (case- and `.md`-insensitive, per the graph resolver), and
    /// every declared alias of the target. Excludes the target itself.
    ///
    /// Scans interned strings once (O(nodes)) rather than enumerating spellings
    /// — arbitrary casing like `[[ProjecT]]` must resolve, and the interned
    /// set is exactly the set of targets notes actually wrote.
    pub fn backlink_sources(&self, path: &str) -> Vec<String> {
        let Some(stem) = stem_lower(path) else {
            return Vec::new();
        };
        let aliases: Vec<String> = self
            .metadata(path)
            .map(|m| m.aliases.clone())
            .unwrap_or_default();

        let mut ids: HashSet<NodeId> = HashSet::new();
        for (id, s) in self.arena.all_strings().enumerate() {
            let norm = normalize_target(s);
            let href = format!("/{stem}");
            let matches_stem = norm == stem || norm.ends_with(&href);
            let matches_alias = aliases.iter().any(|a| norm == normalize_target(a));
            if !(matches_stem || matches_alias) {
                continue;
            }
            if let Some(back) = self.graph.get_back_links(NodeId::new(id as u32)) {
                ids.extend(back.iter().copied());
            }
        }

        let mut out: Vec<String> = ids
            .into_iter()
            .filter_map(|id| self.arena.get_string(id).cloned())
            .filter(|src| src != path)
            .collect();
        out.sort();
        out
    }

    /// Like [`Vault::backlink_sources`], but with the concrete mention lines
    /// (line number + excerpt) inside each source note. Reads source files
    /// from disk — the graph keeps metadata, not content.
    pub fn backlink_contexts(&self, path: &str) -> Vec<BacklinkContext> {
        let aliases: Vec<String> = self
            .metadata(path)
            .map(|m| m.aliases.clone())
            .unwrap_or_default();

        self.backlink_sources(path)
            .into_iter()
            .filter_map(|src| {
                let content = std::fs::read_to_string(&src).ok()?;
                let mentions = mention_lines(&content, path, &aliases);
                let name = Path::new(&src)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&src)
                    .to_string();
                Some(BacklinkContext {
                    path: src,
                    name,
                    mentions,
                })
            })
            .collect()
    }
}

/// True when a raw wikilink target (as written inside `[[...]]`, before any
/// `|` alias or `#` anchor) resolves to the note at absolute `path`.
fn target_resolves_to(target: &str, path: &str, aliases: &[String]) -> bool {
    let norm = normalize_target(target);
    let Some(stem) = stem_lower(path) else {
        return false;
    };
    norm == stem
        || norm.ends_with(&format!("/{stem}"))
        || aliases.iter().any(|a| norm == normalize_target(a))
}

/// Trimmed excerpt of `line`, ellipsized to `[match-BEFORE, match+AFTER)`.
fn excerpt_around(line: &str, from: usize, to: usize) -> String {
    let lo = prev_char_boundary(line, from.saturating_sub(EXCERPT_BEFORE));
    let hi = next_char_boundary(line, (to + EXCERPT_AFTER).min(line.len()));

    let mut out = String::new();
    if lo > 0 {
        out.push('…');
    }
    out.push_str(&line[lo..hi]);
    if hi < line.len() {
        out.push('…');
    }
    out.trim().to_string()
}

/// Collect the lines of `content` that mention `path`, up to `MENTION_CAP`.
fn mention_lines(content: &str, path: &str, aliases: &[String]) -> Vec<BacklinkMention> {
    // YAML frontmatter is metadata, not prose — a `[[link]]` inside a
    // property still forms a graph edge (backlink_sources), but never
    // surfaces as mention context (mirrors `fm_bounds` delimiters).
    let body_start = body_start_line(content);
    let mut out = Vec::new();
    for (idx, line) in content.lines().enumerate() {
        if idx + 1 < body_start {
            continue;
        }
        let Some((from, to)) = scan_wikilinks(line)
            .into_iter()
            .map(|s| (s.target_from, s.target_to))
            .find(|&(from, to)| target_resolves_to(&line[from..to], path, aliases))
        else {
            continue;
        };
        out.push(BacklinkMention {
            line: (idx + 1) as u32,
            excerpt: excerpt_around(line, from, to),
        });
        if out.len() >= MENTION_CAP {
            break;
        }
    }
    out
}

/// 1-based line number where the markdown body begins. Returns 1 when the
/// document has no leading `---` frontmatter block.
fn body_start_line(content: &str) -> usize {
    let mut lines = content.lines();
    let Some(first) = lines.next() else {
        return 1;
    };
    if first != "---" && first != "---\r" {
        return 1;
    }
    for (n, line) in lines.enumerate() {
        let l = line.trim_end_matches('\r');
        if l == "---" || l == "..." {
            // `n` is 0-based within `lines` (which starts at line 2); the
            // closing delimiter is line n+2, so the body begins at n+3.
            return n + 3;
        }
    }
    1
}
fn prev_char_boundary(s: &str, mut i: usize) -> usize {
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn next_char_boundary(s: &str, mut i: usize) -> usize {
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}
fn stem_lower(path: &str) -> Option<String> {
    basalt_types::stem_lower(path)
}

#[cfg(test)]
mod tests {
    use crate::vault::Vault;
    use std::path::PathBuf;

    /// Write `files` (absolute path → content) under a unique temp dir and
    /// index them into a fresh Vault. Returns (dir, vault).
    fn fixture(files: &[(&str, &str)]) -> (PathBuf, Vault) {
        use std::sync::atomic::{AtomicU64, Ordering};
        static SEQ: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "basalt-backlinks-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut vault = Vault::new();
        for (rel, content) in files {
            let abs = dir.join(rel);
            std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
            std::fs::write(&abs, content).unwrap();
            vault.add_document(abs.to_str().unwrap(), content);
        }
        (dir, vault)
    }

    #[test]
    fn bare_name_link_resolves() {
        let (_dir, vault) = fixture(&[("a.md", "See [[b]] for details"), ("b.md", "hi")]);
        let sources = vault.backlink_sources(_dir.join("b.md").to_str().unwrap());
        assert_eq!(
            sources,
            vec![_dir.join("a.md").to_str().unwrap().to_string()]
        );
    }
    #[test]
    fn casing_and_extension_variants_resolve() {
        let (_dir, vault) = fixture(&[
            ("a.md", "[[B]] and [[b.md]] and [[B.md]]"),
            ("b.md", "hi"),
        ]);
        let path = _dir.join("b.md").to_str().unwrap().to_string();
        let sources = vault.backlink_sources(&path);
        // a.md counted once despite three link spellings.
        assert_eq!(sources.len(), 1);
    }

    #[test]
    fn path_form_link_resolves() {
        let (_dir, vault) = fixture(&[
            ("notes/a.md", "[[notes/b]]"),
            ("deep/notes/b.md", "hi"),
        ]);
        let path = _dir.join("deep/notes/b.md").to_str().unwrap().to_string();
        let sources = vault.backlink_sources(&path);
        assert_eq!(sources, vec![_dir.join("notes/a.md").to_str().unwrap().to_string()]);
    }

    #[test]
    fn alias_link_resolves() {
        let (_dir, vault) = fixture(&[
            ("a.md", "[[Beta]]"),
            ("b.md", "---\naliases:\n  - Beta\n---\nhi"),
        ]);
        let path = _dir.join("b.md").to_str().unwrap().to_string();
        let sources = vault.backlink_sources(&path);
        assert_eq!(sources, vec![_dir.join("a.md").to_str().unwrap().to_string()]);
    }

    #[test]
    fn dangling_and_unrelated_targets_are_ignored() {
        let (_dir, vault) = fixture(&[
            ("a.md", "[[Missing]] [[other]]"),
            ("b.md", "hi"),
            ("other.md", "hi"),
        ]);
        let path = _dir.join("b.md").to_str().unwrap().to_string();
        assert!(vault.backlink_sources(&path).is_empty());
    }

    #[test]
    fn self_links_are_excluded() {
        let (_dir, vault) = fixture(&[("b.md", "Back to [[b]]")]);
        let path = _dir.join("b.md").to_str().unwrap().to_string();
        assert!(vault.backlink_sources(&path).is_empty());
    }

    #[test]
    fn contexts_report_line_numbers_and_excerpts() {
        let (_dir, vault) = fixture(&[
            ("a.md", "# Notes\n\nSee [[b]] and [[b]] again on one line.\nNext line no link."),
            ("b.md", "hi"),
        ]);
        let target = _dir.join("b.md").to_str().unwrap().to_string();
        let contexts = vault.backlink_contexts(&target);
        assert_eq!(contexts.len(), 1);
        let n = contexts[0].name.as_str();
        assert_eq!(n, "a.md");
        assert_eq!(contexts[0].mentions[0].line, 3);
        assert!(contexts[0].mentions[0].excerpt.contains("[[b]]"));
        assert_eq!(contexts[0].mentions.len(), 1, "one line, one mention");
    }

    #[test]
    fn long_line_excerpt_is_ellipsized() {
        let (_dir, vault) = fixture(&[
            ("a.md", &format!("{}[[b]]{}", "x".repeat(80), "y".repeat(200))),
            ("b.md", "hi"),
        ]);
        let target = _dir.join("b.md").to_str().unwrap().to_string();
        let contexts = vault.backlink_contexts(&target);
        let ex = &contexts[0].mentions[0].excerpt;
        assert!(ex.starts_with('…') && ex.ends_with('…'));
        assert!(ex.contains("[[b]]"));
    }

    #[test]
    fn frontmatter_only_link_keeps_entry_without_mentions() {
        let (_dir, vault) = fixture(&[
            ("a.md", "---\nrelated: \"[[b]]\"\n---\nBody."),
            ("b.md", "hi"),
        ]);
        let target = _dir.join("b.md").to_str().unwrap().to_string();
        let sources = vault.backlink_sources(&target);
        assert_eq!(sources.len(), 1, "frontmatter links reach the graph");
        let contexts = vault.backlink_contexts(&target);
        assert_eq!(contexts.len(), 1);
        assert!(contexts[0].mentions.is_empty());
    }
}