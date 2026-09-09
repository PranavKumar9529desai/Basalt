use std::collections::BTreeMap;
use std::path::Path;

use ignore::WalkBuilder;

use crate::Vault;

use super::types::{FlatTreeNode, NodeKind};

/// A node in the temporary tree we build before flattening.
/// `BTreeMap` for children gives us alphabetical ordering for free.
struct DirEntry {
    name: String,
    is_file: bool,
    children: BTreeMap<String, DirEntry>,
}

impl DirEntry {
    fn new_folder(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            is_file: false,
            children: BTreeMap::new(),
        }
    }
}

/// Walk every active document path from `metadata_cache`, build a sorted
/// directory tree in memory, then emit a pre-order DFS flat array.
///
/// Sorting rules (applied at every level):
///   1. Folders come before files.
///   2. Within each group, entries are sorted case-insensitively (A-Z).
///
/// The returned `Vec` is ready for the frontend to render directly — the only
/// state the frontend needs to maintain is a `Set<rel_path>` of open folders.
pub fn build_flat_tree(vault: &Vault, vault_root: &Path) -> Vec<FlatTreeNode> {
    let root_abs = vault_root.to_string_lossy();
    // Normalise: strip any trailing slash so prefix-stripping is consistent.
    let root_prefix = format!("{}/", root_abs.trim_end_matches('/'));

    let root_name = vault_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let mut root = DirEntry::new_folder(root_name);

    // Source of truth for "real files" is metadata_cache, not the arena, which
    // may hold unresolved link targets or historical interned paths.
    let mut paths: Vec<String> = vault
        .graph
        .metadata_cache
        .keys()
        .filter_map(|id| vault.arena.get_string(*id).cloned())
        .filter(|p| (p.ends_with(".md") || p.ends_with(".canvas")) && Path::new(p).exists())
        .collect();
    paths.sort_unstable();

    for abs_path in &paths {
        let rel = abs_path
            .strip_prefix(&root_prefix)
            .unwrap_or(abs_path)
            .trim_start_matches('/');

        if rel.is_empty() {
            continue;
        }

        let parts: Vec<&str> = rel.split('/').collect();
        insert_path(&mut root, &parts);
    }

    // Include on-disk directories too, so empty folders are visible.
    if vault_root.is_dir() {
        insert_disk_dirs(&mut root, vault_root);
    }

    let mut out = Vec::new();
    flatten_children(&root, "", &root_prefix, 0, &mut out);
    out
}

/// Maximum directory nesting depth for the filesystem walk. Guards against
/// pathological nesting / symlink recursion (symlinks are never followed).
const MAX_SCAN_DEPTH: usize = 64;

/// Walk the vault on disk and emit the flat tree directly — no `Vault` and no
/// graph state required (ADR-046 Tier 1 / `get_vault_tree`).
///
/// Semantics mirror `build_flat_tree` so the tree is identical whether it is
/// sourced from the index or from the filesystem:
///   - `.md` and `.canvas` files become file nodes;
///   - every on-disk directory (including empty ones) becomes a folder node;
///   - hidden entries (`.git`, `.obsidian`, `.basalt`, …) and `node_modules`
///     are skipped — the same file set `index_directory` ingests;
///   - symlinks are not followed (`follow_links: false`) and depth is capped
///     at `MAX_SCAN_DEPTH` (ADR-046 edge-case table);
///   - folders before files, alphabetical within each group.
///
/// Cost is a single `getdents64`-backed walk; no file contents are read.
pub fn fast_scan_flat_tree(vault_root: &Path) -> Vec<FlatTreeNode> {
    let root_abs = vault_root.to_string_lossy();
    // Normalise: strip any trailing slash so prefix-stripping is consistent.
    let root_prefix = format!("{}/", root_abs.trim_end_matches('/'));

    let root_name = vault_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let mut root = DirEntry::new_folder(root_name);

    let walker = WalkBuilder::new(vault_root)
        .follow_links(false)
        .max_depth(Some(MAX_SCAN_DEPTH))
        .filter_entry(|entry| {
            // Keep the ignore crate's own hidden/gitignore filters; add
            // node_modules explicitly (not covered by .gitignore in non-git vaults).
            if entry.depth() == 0 {
                return true;
            }
            !(entry.file_name().to_string_lossy() == "node_modules"
                && entry.file_type().is_some_and(|t| t.is_dir()))
        })
        .build();

    for entry in walker.flatten() {
        if entry.depth() == 0 {
            continue; // the vault root itself
        }
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(vault_root) else {
            continue;
        };
        let rel_str = rel.to_string_lossy();
        if rel_str.is_empty() {
            continue;
        }
        let Some(ft) = entry.file_type() else { continue };
        if ft.is_file() && is_tree_file(path) {
            let parts: Vec<&str> = rel_str.split('/').collect();
            insert_path(&mut root, &parts);
        }
    }

    // Merge on-disk directories that no file-path insert created (empty or
    // asset-only folders stay visible, matching build_flat_tree).
    if vault_root.is_dir() {
        insert_disk_dirs(&mut root, vault_root);
    }

    let mut out = Vec::new();
    flatten_children(&root, "", &root_prefix, 0, &mut out);
    out
}

/// True for the two document kinds the tree shows (and `index_directory`
/// ingests): Markdown notes and JSON Canvas files.
#[inline]
fn is_tree_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md" | "canvas")
    )
}

/// Recursively insert `parts` (the segments of a relative path) under `node`.
fn insert_path(node: &mut DirEntry, parts: &[&str]) {
    if parts.is_empty() {
        return;
    }

    let name = parts[0];
    let is_last = parts.len() == 1;

    let entry = node
        .children
        .entry(name.to_string())
        .or_insert_with(|| DirEntry {
            name: name.to_string(),
            is_file: is_last,
            children: BTreeMap::new(),
        });

    if !is_last {
        insert_path(entry, &parts[1..]);
    }
}

/// Walk on-disk subdirectories of `disk_path` and merge any that are missing
/// from `node` into the tree. This ensures empty folders show up. Skips hidden
/// directories (names starting with `.`) and `node_modules` so `.basalt`,
/// `.git`, dependency trees, etc. stay hidden.
fn insert_disk_dirs(node: &mut DirEntry, disk_path: &Path) {
    let Ok(entries) = std::fs::read_dir(disk_path) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() {
            continue;
        }

        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        if name_str.starts_with('.') || name_str == "node_modules" {
            continue;
        }

        let child = node
            .children
            .entry(name_str.to_string())
            .or_insert_with(|| DirEntry {
                name: name_str.to_string(),
                is_file: false,
                children: BTreeMap::new(),
            });

        insert_disk_dirs(child, &entry.path());
    }
}

/// Emit the children of `node` into `out` using pre-order DFS.
/// Folders are emitted before files at every level; within each group the
/// ordering is already alphabetical thanks to `BTreeMap`.
fn flatten_children(
    node: &DirEntry,
    parent_rel: &str,
    root_prefix: &str,
    depth: u32,
    out: &mut Vec<FlatTreeNode>,
) {
    let (folders, files): (Vec<&DirEntry>, Vec<&DirEntry>) =
        node.children.values().partition(|c| !c.is_file);

    for folder in folders {
        let rel_path = if parent_rel.is_empty() {
            folder.name.clone()
        } else {
            format!("{}/{}", parent_rel, folder.name)
        };
        let abs_path = format!("{}{}", root_prefix, rel_path);

        out.push(FlatTreeNode {
            name: folder.name.clone(),
            path: abs_path,
            rel_path: rel_path.clone(),
            kind: NodeKind::Folder,
            depth,
            child_count: folder.children.len() as u32,
        });
        flatten_children(folder, &rel_path, root_prefix, depth + 1, out);
    }

    for file in files {
        let rel_path = if parent_rel.is_empty() {
            file.name.clone()
        } else {
            format!("{}/{}", parent_rel, file.name)
        };
        let abs_path = format!("{}{}", root_prefix, rel_path);

        out.push(FlatTreeNode {
            name: file.name.clone(),
            path: abs_path,
            rel_path,
            kind: NodeKind::File,
            depth,
            child_count: 0,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Vault;
    use std::fs;
    use tempfile::TempDir;

    /// Create files at the given relative paths inside a TempDir, returning the
    /// dir (must stay alive for the duration of the test) and a populated Vault.
    fn make_vault(rel_paths: &[&str]) -> (TempDir, Vault) {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let mut vault = Vault::new();
        for rel in rel_paths {
            let abs = root.join(rel);
            if let Some(parent) = abs.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&abs, "").unwrap();
            vault.add_document(abs.to_str().unwrap(), "");
        }
        (dir, vault)
    }

    #[test]
    fn folders_come_before_files_at_root() {
        let (dir, vault) = make_vault(&["readme.md", "docs/intro.md"]);
        let tree = build_flat_tree(&vault, dir.path());

        assert_eq!(tree[0].name, "docs");
        assert_eq!(tree[0].kind, NodeKind::Folder);
        assert_eq!(tree[1].name, "intro.md");
        assert_eq!(tree[1].depth, 1);
        assert_eq!(tree[2].name, "readme.md");
        assert_eq!(tree[2].kind, NodeKind::File);
    }

    #[test]
    fn depth_is_correct() {
        let (dir, vault) = make_vault(&["a/b/c.md"]);
        let tree = build_flat_tree(&vault, dir.path());

        let a = tree.iter().find(|n| n.name == "a").unwrap();
        let b = tree.iter().find(|n| n.name == "b").unwrap();
        let c = tree.iter().find(|n| n.name == "c.md").unwrap();

        assert_eq!(a.depth, 0);
        assert_eq!(b.depth, 1);
        assert_eq!(c.depth, 2);
    }

    #[test]
    fn child_count_is_correct() {
        let (dir, vault) = make_vault(&["docs/a.md", "docs/b.md", "docs/sub/c.md"]);
        let tree = build_flat_tree(&vault, dir.path());

        let docs = tree.iter().find(|n| n.name == "docs").unwrap();
        // children of docs: "sub" (folder) + "a.md" + "b.md" = 3
        assert_eq!(docs.child_count, 3);
    }

    #[test]
    fn rel_path_has_no_leading_slash() {
        let (dir, vault) = make_vault(&["docs/intro.md"]);
        let tree = build_flat_tree(&vault, dir.path());

        for node in &tree {
            assert!(
                !node.rel_path.starts_with('/'),
                "rel_path should not start with '/': {}",
                node.rel_path
            );
        }
    }

    #[test]
    fn alphabetical_within_group() {
        let (dir, vault) = make_vault(&["zebra.md", "alpha.md", "mango/x.md", "apple/y.md"]);
        let tree = build_flat_tree(&vault, dir.path());
        // Folders first: apple, mango (alpha order)
        assert_eq!(tree[0].name, "apple");
        assert_eq!(tree[2].name, "mango");
        // Files after: alpha, zebra (alpha order)
        assert_eq!(tree[4].name, "alpha.md");
        assert_eq!(tree[5].name, "zebra.md");
    }

    #[test]
    fn fast_scan_matches_vault_tree() {
        let (dir, vault) = make_vault(&[
            "docs/intro.md",
            "docs/sub/c.md",
            "readme.md",
            "zebra.md",
            "alpha.md",
            "mango/x.md",
            "apple/y.md",
            "notes/board.canvas",
        ]);
        // Asset-only folder (no notes) and an empty folder: both must stay visible.
        fs::create_dir_all(dir.path().join("assets")).unwrap();
        fs::write(dir.path().join("assets/logo.png"), b"png").unwrap();
        fs::create_dir_all(dir.path().join("empty_folder")).unwrap();

        let via_vault = build_flat_tree(&vault, dir.path());
        let via_disk = fast_scan_flat_tree(dir.path());

        assert_eq!(via_vault, via_disk, "fast scan must emit the same tree as the vault index");
    }

    #[test]
    fn fast_scan_skips_hidden_and_deps_dirs() {
        let (dir, _vault) = make_vault(&["visible.md"]);
        fs::create_dir_all(dir.path().join(".basalt")).unwrap();
        fs::write(dir.path().join(".basalt/workspace.json"), "{}").unwrap();
        fs::create_dir_all(dir.path().join("node_modules/pkg")).unwrap();
        fs::write(dir.path().join("node_modules/pkg/index.js"), "x").unwrap();

        let tree = fast_scan_flat_tree(dir.path());
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["visible.md"]);
    }

    #[test]
    fn fast_scan_empty_vault_matches() {
        let (dir, vault) = make_vault(&[]);
        assert_eq!(
            build_flat_tree(&vault, dir.path()),
            fast_scan_flat_tree(dir.path())
        );
    }
}
