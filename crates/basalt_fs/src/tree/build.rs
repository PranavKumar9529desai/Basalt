use std::collections::BTreeMap;
use std::path::Path;

use crate::Vault;

use super::types::{FlatTreeNode, NodeKind};

/// A node in the temporary tree we build before flattening.
/// `BTreeMap` for children gives us alphabetical ordering for free.
struct DirEntry {
    name: String,
    /// Absolute path on disk.
    abs_path: String,
    /// Path relative to the vault root (no leading slash).
    rel_path: String,
    is_file: bool,
    children: BTreeMap<String, DirEntry>,
}

impl DirEntry {
    fn new_folder(
        name: impl Into<String>,
        abs_path: impl Into<String>,
        rel_path: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            abs_path: abs_path.into(),
            rel_path: rel_path.into(),
            is_file: false,
            children: BTreeMap::new(),
        }
    }

    fn new_file(
        name: impl Into<String>,
        abs_path: impl Into<String>,
        rel_path: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            abs_path: abs_path.into(),
            rel_path: rel_path.into(),
            is_file: true,
            children: BTreeMap::new(),
        }
    }
}

/// Walk every `.md` path stored in `vault.arena`, build a sorted directory
/// tree in memory, then emit a pre-order DFS flat array.
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

    let mut root = DirEntry::new_folder(root_name, root_abs.as_ref(), "");

    // ── Insert every indexed .md path into the internal tree ──────────────
    // Collect first so we can sort for deterministic output even if the arena
    // iteration order changes between runs.
    let mut paths: Vec<&String> = vault
        .arena
        .all_strings()
        .filter(|p| p.ends_with(".md"))
        .collect();
    paths.sort_unstable();

    for abs_path in paths {
        // Derive the vault-relative path.
        let rel = abs_path
            .strip_prefix(&root_prefix)
            .unwrap_or(abs_path)
            .trim_start_matches('/');

        if rel.is_empty() {
            continue;
        }

        let parts: Vec<&str> = rel.split('/').collect();
        insert_path(&mut root, &parts, abs_path, &root_prefix);
    }

    // ── Also include on-disk directories (so empty folders are visible) ───
    if vault_root.is_dir() {
        insert_disk_dirs(&mut root, vault_root, &root_prefix);
    }

    // ── Flatten into a pre-order DFS array ────────────────────────────────
    let mut out = Vec::new();
    flatten_children(&root, 0, &mut out);
    out
}

/// Recursively insert `parts` (the segments of a relative path) under `node`.
fn insert_path(node: &mut DirEntry, parts: &[&str], abs_path: &str, root_prefix: &str) {
    if parts.is_empty() {
        return;
    }

    let name = parts[0];
    let is_last = parts.len() == 1;

    // Build the rel_path for this child.
    let child_rel = if node.rel_path.is_empty() {
        name.to_string()
    } else {
        format!("{}/{}", node.rel_path, name)
    };

    if is_last {
        // File leaf — use the canonical abs_path from the arena.
        node.children
            .entry(name.to_string())
            .or_insert_with(|| DirEntry::new_file(name, abs_path, &child_rel));
    } else {
        // Intermediate directory — construct its abs_path from the root prefix.
        let child_abs = format!("{}{}", root_prefix, child_rel);
        let entry = node
            .children
            .entry(name.to_string())
            .or_insert_with(|| DirEntry::new_folder(name, &child_abs, &child_rel));
        insert_path(entry, &parts[1..], abs_path, root_prefix);
    }
}

/// Walk on-disk subdirectories of `disk_path` and merge any that are missing
/// from `node` into the tree. This ensures empty folders show up. Skips hidden
/// directories (names starting with `.`) so `.basalt`, `.git`, etc. stay hidden.
fn insert_disk_dirs(node: &mut DirEntry, disk_path: &Path, root_prefix: &str) {
    let Ok(entries) = std::fs::read_dir(disk_path) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Skip hidden directories
        if name_str.starts_with('.') {
            continue;
        }

        let child_rel = if node.rel_path.is_empty() {
            name_str.to_string()
        } else {
            format!("{}/{}", node.rel_path, name_str)
        };

        let child_abs = format!("{}{}", root_prefix, child_rel);

        let child = node
            .children
            .entry(name_str.to_string())
            .or_insert_with(|| DirEntry::new_folder(&*name_str, &child_abs, &child_rel));

        // Recurse into subdirectories
        insert_disk_dirs(child, &entry.path(), root_prefix);
    }
}

/// Emit the children of `node` into `out` using pre-order DFS.
/// Folders are emitted before files at every level; within each group the
/// ordering is already alphabetical thanks to `BTreeMap`.
fn flatten_children(node: &DirEntry, depth: u32, out: &mut Vec<FlatTreeNode>) {
    // Split children into folders and files while preserving BTreeMap order.
    let (folders, files): (Vec<&DirEntry>, Vec<&DirEntry>) =
        node.children.values().partition(|c| !c.is_file);

    // ── Folders first ──────────────────────────────────────────────────────
    for folder in folders {
        out.push(FlatTreeNode {
            name: folder.name.clone(),
            path: folder.abs_path.clone(),
            rel_path: folder.rel_path.clone(),
            kind: NodeKind::Folder,
            depth,
            child_count: folder.children.len() as u32,
        });
        // Recurse into the folder's own children at depth + 1.
        flatten_children(folder, depth + 1, out);
    }

    // ── Files after ────────────────────────────────────────────────────────
    for file in files {
        out.push(FlatTreeNode {
            name: file.name.clone(),
            path: file.abs_path.clone(),
            rel_path: file.rel_path.clone(),
            kind: NodeKind::File,
            depth,
            child_count: 0,
        });
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Vault;

    fn make_vault(paths: &[&str]) -> Vault {
        let mut vault = Vault::new();
        for p in paths {
            vault.add_document(p, "");
        }
        vault
    }

    #[test]
    fn folders_come_before_files_at_root() {
        let vault = make_vault(&["/vault/readme.md", "/vault/docs/intro.md"]);
        let tree = build_flat_tree(&vault, Path::new("/vault"));

        assert_eq!(tree[0].name, "docs");
        assert_eq!(tree[0].kind, NodeKind::Folder);
        assert_eq!(tree[1].name, "intro.md");
        assert_eq!(tree[1].depth, 1);
        assert_eq!(tree[2].name, "readme.md");
        assert_eq!(tree[2].kind, NodeKind::File);
    }

    #[test]
    fn depth_is_correct() {
        let vault = make_vault(&["/vault/a/b/c.md"]);
        let tree = build_flat_tree(&vault, Path::new("/vault"));

        let a = tree.iter().find(|n| n.name == "a").unwrap();
        let b = tree.iter().find(|n| n.name == "b").unwrap();
        let c = tree.iter().find(|n| n.name == "c.md").unwrap();

        assert_eq!(a.depth, 0);
        assert_eq!(b.depth, 1);
        assert_eq!(c.depth, 2);
    }

    #[test]
    fn child_count_is_correct() {
        let vault = make_vault(&[
            "/vault/docs/a.md",
            "/vault/docs/b.md",
            "/vault/docs/sub/c.md",
        ]);
        let tree = build_flat_tree(&vault, Path::new("/vault"));

        let docs = tree.iter().find(|n| n.name == "docs").unwrap();
        // children of docs: "sub" (folder) + "a.md" + "b.md" = 3
        assert_eq!(docs.child_count, 3);
    }

    #[test]
    fn rel_path_has_no_leading_slash() {
        let vault = make_vault(&["/vault/docs/intro.md"]);
        let tree = build_flat_tree(&vault, Path::new("/vault"));

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
        let vault = make_vault(&[
            "/vault/zebra.md",
            "/vault/alpha.md",
            "/vault/mango/x.md",
            "/vault/apple/y.md",
        ]);
        let tree = build_flat_tree(&vault, Path::new("/vault"));

        // Folders first: apple, mango (alpha order)
        assert_eq!(tree[0].name, "apple");
        assert_eq!(tree[2].name, "mango");
        // Files after: alpha, zebra (alpha order)
        assert_eq!(tree[4].name, "alpha.md");
        assert_eq!(tree[5].name, "zebra.md");
    }
}
