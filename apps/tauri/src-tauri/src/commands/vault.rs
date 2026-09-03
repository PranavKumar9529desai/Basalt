use std::path::Path;

use basalt_vault::{build_flat_tree, indexer::index_directory, Vault, VaultCache};
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::cache_path;
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct VaultSummary {
    pub note_count: usize,
}

#[tauri::command]
pub fn reindex_vault(
    state: State<AppState>,
    app: tauri::AppHandle,
) -> AppResult<VaultSummary> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault = index_directory(Path::new(&vault_path));
    let note_count = vault.note_count();

    let cache = VaultCache::build(&vault_path, vault);
    let cache_file = cache_path(&app, &vault_path);
    let _ = cache.save(&cache_file);
    *state
        .vault
        .write()
        .map_err(|_| AppError::LockPoisoned("vault"))? = cache.vault;

    Ok(VaultSummary { note_count })
}

/// Return the current vault's flat tree, freshly built from the in-memory
/// index.  The frontend calls this after any `vault://file-changed` event to
/// keep the sidebar in sync without a full restart.
#[tauri::command]
pub fn get_vault_tree(
    state: State<AppState>,
) -> AppResult<Vec<basalt_vault::FlatTreeNode>> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;

    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;

    Ok(build_flat_tree(&vault, Path::new(&vault_path)))
}

/// Open the native folder-picker dialog and return the chosen path (or null).
#[tauri::command]
pub async fn open_vault_dialog(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    app.dialog()
        .file()
        .set_title("Choose your Basalt vault folder")
        .blocking_pick_folder()
        .map(|p| p.to_string())
}
use basalt_graph::NodeId;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct GraphNodeMeta {
    /// Vault-relative path — the node's stable id on the frontend.
    pub path: String,
    /// Frontmatter/in-body tags, used for filters and color groups.
    pub tags: Vec<String>,
    /// True for non-`.md` files (images, PDFs, …) shown/toggled as attachments.
    pub is_attachment: bool,
    /// True for tag-tree nodes (e.g. `project/alpha`); styled/filtered
    /// separately from notes. See docs/tag-graph-connections.md.
    pub is_tag: bool,
    /// Connected-component id (union-find over the snapshot graph); lets the
    /// frontend auto-color clusters without re-deriving topology on the client.
    pub cluster: u32,
}

#[derive(Serialize)]
pub struct GraphSnapshot {
    pub node_count: u32,
    /// One entry per node, index = dense id used in `edges`.
    pub nodes: Vec<GraphNodeMeta>,
    /// Flat directed pairs `[src0, dst0, src1, dst1, ...]` by dense id.
    /// Springs are treated as undirected; arrows render the `src -> dst` direction.
    pub edges: Vec<u32>,
    pub edge_weights: Vec<f32>,
}

/// Snapshot of the vault's note-link graph for the force simulation.
///
/// Every file still on disk becomes a node; `.md` notes carry tags from the
/// metadata cache, the rest are marked `is_attachment`. Tag-tree nodes
/// (`#project/alpha` -> `project/alpha`) are also emitted so co-tagged notes
/// connect through shared hubs. Edges are the `[[wikilinks]]` plus the tag
/// tree (note->exact-tag and parent->child), as directed dense-id pairs with
/// self-links dropped. The frontend hands `edges` straight to the wasm
/// `graph_build`, which rebuilds the dense `LayoutGraph` — keeping one-shot graph
/// construction on the Rust side (ADR-021) and the interactive graph in the worker.
/// Build the graph snapshot (nodes + dense edges) from an in-memory `Vault`.
///
/// Pure with respect to Tauri state so it can be unit-tested directly; the
/// `get_graph` command is a thin wrapper over this. Tag-tree semantics live in
/// `docs/tag-graph-connections.md` (notes link to exact tags; nested tags
/// parent->child).

/// Union-find root lookup with path compression.
fn cc_find(parent: &mut [u32], mut x: u32) -> u32 {
    while parent[x as usize] != x {
        parent[x as usize] = parent[parent[x as usize] as usize];
        x = parent[x as usize];
    }
    x
}
pub(crate) fn build_graph_snapshot(
    vault: &Vault,
    vault_path: &Path,
) -> AppResult<GraphSnapshot> {
    // Every file still on disk is a node. `.md` notes carry tags from the
    // metadata cache; everything else is an "attachment".
    let mut paths: Vec<String> = vault
        .graph
        .metadata_cache
        .keys()
        .filter_map(|id| vault.arena.get_string(*id).cloned())
        .filter(|p| Path::new(p).exists())
        .collect();
    paths.sort();

    let root = vault_path;
    // dense: document NodeId -> dense index. resolver: normalized wikilink text
    // -> dense index, because `metadata.links` stores the raw wikilink target
    // (see `extract_metadata`), which is never the actual `.md` document path.
    let mut dense: HashMap<NodeId, u32> = HashMap::with_capacity(paths.len());
    let mut nodes: Vec<GraphNodeMeta> = Vec::with_capacity(paths.len());
    let mut resolver: HashMap<String, u32> = HashMap::with_capacity(paths.len() * 2);
    for (i, p) in paths.iter().enumerate() {
        let id = vault
            .arena
            .get_id(p)
            .ok_or_else(|| AppError::Other(format!("note {p} not interned")))?;
        let rel = Path::new(p)
            .strip_prefix(root)
            .ok()
            .and_then(|s| s.to_str())
            .map(|s| s.trim_start_matches('/').to_string())
            .unwrap_or_else(|| p.clone());
        // Register normalized forms so `[[Note]]` (basename) and `[[Folder/Note]]`
        // (path) wikilinks both resolve to this note.
        resolver.insert(rel.to_lowercase(), i as u32);
        let rel_noext = rel.trim_end_matches(".md").to_lowercase();
        resolver.insert(rel_noext, i as u32);
        if let Some(base) = Path::new(&rel).file_stem().and_then(|s| s.to_str()) {
            resolver.insert(base.to_lowercase(), i as u32);
        }
        let tags = vault
            .graph
            .metadata_cache
            .get(&id)
            .map(|m| m.tags.clone())
            .unwrap_or_default();
        nodes.push(GraphNodeMeta {
            path: p.clone(),
            tags,
            is_attachment: !p.ends_with(".md"),
            is_tag: false,
            cluster: 0,
        });
        dense.insert(id, i as u32);
    }

    // Tag-tree nodes become graph nodes too, so co-tagged notes connect through
    // shared tag hubs (and the hierarchy renders as a tree). See
    // docs/tag-graph-connections.md.
    for tag_id in &vault.graph.tag_nodes {
        if let Some(tag_str) = vault.arena.get_string(*tag_id) {
            let idx = nodes.len() as u32;
            dense.insert(*tag_id, idx);
            nodes.push(GraphNodeMeta {
                path: tag_str.trim_start_matches('#').to_string(),
                tags: vec![],
                is_attachment: false,
                is_tag: true,
                cluster: 0,
            });
        }
    }

    let mut pair_counts: HashMap<u64, u32> = HashMap::new();
    for (src_id, targets) in &vault.graph.forward_links {
        let Some(&u) = dense.get(src_id) else { continue };
        for t in targets {
            // `t` is the raw wikilink-text NodeId or a tag node; resolve it to a
            // dense index.
            let v = if let Some(&idx) = dense.get(t) {
                Some(idx)
            } else if let Some(raw) = vault.arena.get_string(*t) {
                let lc = raw.to_lowercase();
                resolver
                    .get(&lc)
                    .copied()
                    .or_else(|| resolver.get(&raw.trim_end_matches(".md").to_lowercase()).copied())
                    .or_else(|| {
                        Path::new(raw.as_str())
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .and_then(|b| resolver.get(&b.to_lowercase()).copied())
                    })
            } else {
                None
            };
            if let Some(v) = v {
                if u == v {
                    continue;
                }
                let key = (u as u64) << 32 | (v as u64);
                *pair_counts.entry(key).or_insert(0) += 1;
            }
        }
    }

    // Connection strength between two endpoints = number of resolved links
    // between them plus the count of tags they share. Co-tagged notes therefore
    // read as stronger edges even when they only meet through a shared tag hub.
    let shared_tags = |a: usize, b: usize| -> u32 {
        if a >= nodes.len() || b >= nodes.len() {
            return 0;
        }
        let (ta, tb) = (&nodes[a].tags, &nodes[b].tags);
        if ta.is_empty() || tb.is_empty() {
            return 0;
        }
        let mut sa: Vec<&String> = ta.iter().collect();
        let mut sb: Vec<&String> = tb.iter().collect();
        sa.sort();
        sb.sort();
        let (mut i, mut j) = (0usize, 0usize);
        let mut c = 0u32;
        while i < sa.len() && j < sb.len() {
            if sa[i] == sb[j] {
                c += 1;
                i += 1;
                j += 1;
            } else if sa[i] < sb[j] {
                i += 1;
            } else {
                j += 1;
            }
        }
        c
    };

    // Deterministic order: sort deduped pairs by (src, dst).
    let mut pairs: Vec<(u32, u32)> = pair_counts
        .keys()
        .map(|k| (((*k >> 32) as u32), (*k & 0xffff_ffff) as u32))
        .collect();
    pairs.sort();
    let mut edges: Vec<u32> = Vec::with_capacity(pairs.len() * 2);
    let mut edge_weights: Vec<f32> = Vec::with_capacity(pairs.len());
    for (u, v) in pairs {
        edges.push(u);
        edges.push(v);
        let links = pair_counts[&(((u as u64) << 32 | (v as u64)))];
        let w = links + shared_tags(u as usize, v as usize);
        edge_weights.push(w as f32);
    }
    // Connected-component id per node so the frontend can auto-color clusters.
    let mut parent: Vec<u32> = (0..nodes.len() as u32).collect();
    for e in (0..edges.len()).step_by(2) {
        let a = edges[e];
        let b = edges[e + 1];
        let ra = cc_find(&mut parent, a);
        let rb = cc_find(&mut parent, b);
        if ra != rb {
            parent[ra as usize] = rb;
        }
    }
    let mut root_to_id: HashMap<u32, u32> = HashMap::new();
    let mut next_id = 0u32;
    for i in 0..nodes.len() as u32 {
        let r = cc_find(&mut parent, i);
        let id = *root_to_id.entry(r).or_insert_with(|| {
            let id = next_id;
            next_id += 1;
            id
        });
        nodes[i as usize].cluster = id;
    }

    Ok(GraphSnapshot {
        node_count: nodes.len() as u32,
        nodes,
        edges,
        edge_weights,
    })
}

#[tauri::command]
pub fn get_graph(state: State<AppState>) -> AppResult<GraphSnapshot> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| AppError::LockPoisoned("vault path"))?
        .clone()
        .ok_or(AppError::NoVault)?;
    let vault = state
        .vault
        .read()
        .map_err(|_| AppError::LockPoisoned("vault"))?;
    build_graph_snapshot(&vault, Path::new(&vault_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    use basalt_types::FileMetadata;

    fn unique_temp_dir() -> PathBuf {
        use std::time::{SystemTime, UNIX_EPOCH};
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("basalt-graph-test-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn build_graph_snapshot_connects_cotagged_notes_through_tags() {
        let root = unique_temp_dir();
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&a, "# A\n").unwrap();
        fs::write(&b, "# B\n").unwrap();

        let mut vault = Vault::new();
        let mut ma = FileMetadata::new();
        ma.tags = vec!["topic".to_string(), "project/alpha".to_string()];
        vault
            .graph
            .add_document(a.to_str().unwrap(), ma, &mut vault.arena);
        let mut mb = FileMetadata::new();
        mb.tags = vec!["topic".to_string()];
        vault
            .graph
            .add_document(b.to_str().unwrap(), mb, &mut vault.arena);

        let snap = build_graph_snapshot(&vault, &root).unwrap();

        // Note nodes keep the absolute on-disk path; tag nodes use the bare tag
        // string. Locate each by what's stable about it.
        let note_idx =
            |suffix: &str| snap.nodes.iter().position(|n| !n.is_tag && n.path.ends_with(suffix));
        let a_idx = note_idx("a.md").expect("a.md node present");
        let b_idx = note_idx("b.md").expect("b.md node present");
        let tag_idx = |p: &str| snap.nodes.iter().position(|n| n.is_tag && n.path == p);
        let topic_idx = tag_idx("topic").expect("topic tag node present");
        let project_idx = tag_idx("project").expect("project tag node present");
        let proj_alpha_idx = tag_idx("project/alpha").expect("project/alpha tag node present");

        // Tag nodes are flagged so the renderer can style/filter them.
        assert!(snap.nodes[topic_idx].is_tag);
        assert!(snap.nodes[project_idx].is_tag);
        assert!(snap.nodes[proj_alpha_idx].is_tag);
        assert!(!snap.nodes[a_idx].is_tag);

        let edge_pairs: Vec<(u32, u32)> = snap
            .edges
            .chunks_exact(2)
            .map(|c| (c[0], c[1]))
            .collect();

        // Notes link to their EXACT tag only (never the ancestor).
        assert!(edge_pairs.contains(&(a_idx as u32, topic_idx as u32)), "a -> topic");
        assert!(
            edge_pairs.contains(&(a_idx as u32, proj_alpha_idx as u32)),
            "a -> project/alpha (exact leaf)"
        );
        assert!(
            !edge_pairs.contains(&(a_idx as u32, project_idx as u32)),
            "a must NOT link to ancestor tag `project`"
        );

        // Co-tagged notes share the `topic` hub -> they are connected.
        assert!(
            edge_pairs.contains(&(b_idx as u32, topic_idx as u32)),
            "b -> topic (shared hub)"
        );

        // Nested tags form a parent -> child tree edge.
        assert!(
            edge_pairs.contains(&(project_idx as u32, proj_alpha_idx as u32)),
            "project -> project/alpha"
        );

        // node_count matches the emitted node vector.
        assert_eq!(snap.node_count as usize, snap.nodes.len());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn build_graph_snapshot_weights_shared_tags_and_links() {
        let root = unique_temp_dir();
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&a, "# A\n").unwrap();
        fs::write(&b, "# B\n").unwrap();
        let mut vault = Vault::new();
        let mut ma = FileMetadata::new();
        ma.tags = vec!["x".to_string(), "y".to_string()];
        vault.graph.add_document(a.to_str().unwrap(), ma, &mut vault.arena);
        let mut mb = FileMetadata::new();
        mb.tags = vec!["x".to_string(), "y".to_string()];
        vault.graph.add_document(b.to_str().unwrap(), mb, &mut vault.arena);
        // Force a direct link a -> b so we can assert link + shared-tag strength.
        let a_id = vault.arena.get_id(a.to_str().unwrap()).expect("a interned");
        let b_id = vault.arena.get_id(b.to_str().unwrap()).expect("b interned");
        vault.graph.forward_links.insert(a_id, std::collections::HashSet::from([b_id]));
        let snap = build_graph_snapshot(&vault, &root).unwrap();
        let note_idx =
            |suffix: &str| snap.nodes.iter().position(|n| !n.is_tag && n.path.ends_with(suffix));
        let a_idx = note_idx("a.md").expect("a.md node present");
        let b_idx = note_idx("b.md").expect("b.md node present");
        let pair_w = snap
            .edges
            .chunks_exact(2)
            .map(|c| (c[0], c[1]))
            .zip(&snap.edge_weights)
            .find(|((u, v), _)| {
                (*u == a_idx as u32 && *v == b_idx as u32)
                    || (*u == b_idx as u32 && *v == a_idx as u32)
            });
        let w = pair_w.map(|(_, wt)| *wt).unwrap_or(0.0);
        // One direct link + two shared tags = 3.
        assert_eq!(w, 3.0, "a<->b weight = links + shared tags");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn build_graph_snapshot_cluster_ids_separate_disconnected_notes() {
        let root = unique_temp_dir();
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&a, "# A\n").unwrap();
        fs::write(&b, "# B\n").unwrap();
        let mut vault = Vault::new();
        let mut ma = FileMetadata::new();
        ma.tags = vec!["p".to_string()];
        vault.graph.add_document(a.to_str().unwrap(), ma, &mut vault.arena);
        let mut mb = FileMetadata::new();
        mb.tags = vec!["q".to_string()];
        vault.graph.add_document(b.to_str().unwrap(), mb, &mut vault.arena);
        let snap = build_graph_snapshot(&vault, &root).unwrap();
        let a_idx = snap
            .nodes
            .iter()
            .position(|n| !n.is_tag && n.path.ends_with("a.md"))
            .unwrap();
        let b_idx = snap
            .nodes
            .iter()
            .position(|n| !n.is_tag && n.path.ends_with("b.md"))
            .unwrap();
        // No link and no shared tag => distinct connected components.
        assert_ne!(
            snap.nodes[a_idx].cluster,
            snap.nodes[b_idx].cluster,
            "disconnected notes => distinct clusters"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
