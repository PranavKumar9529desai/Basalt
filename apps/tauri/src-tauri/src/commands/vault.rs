use std::path::Path;

use basalt_vault::{build_flat_tree, indexer::index_directory, VaultCache};
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::cache::cache_path;

#[derive(Serialize)]
pub struct VaultSummary {
    pub note_count: usize,
}

#[tauri::command]
pub fn reindex_vault(
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<VaultSummary, String> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = index_directory(Path::new(&vault_path));
    let note_count = vault.graph.metadata_cache.len();

    let cache = VaultCache::build(&vault_path, vault);
    let cache_file = cache_path(&app, &vault_path);
    let _ = cache.save(&cache_file);
    *state
        .vault
        .write()
        .map_err(|_| "vault lock poisoned".to_string())? = cache.vault;

    Ok(VaultSummary { note_count })
}

/// Return the current vault's flat tree, freshly built from the in-memory
/// index.  The frontend calls this after any `vault://file-changed` event to
/// keep the sidebar in sync without a full restart.
#[tauri::command]
pub fn get_vault_tree(
    state: State<AppState>,
) -> Result<Vec<basalt_vault::FlatTreeNode>, String> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

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
}

#[derive(Serialize)]
pub struct GraphSnapshot {
    pub node_count: u32,
    /// One entry per node, index = dense id used in `edges`.
    pub nodes: Vec<GraphNodeMeta>,
    /// Flat directed pairs `[src0, dst0, src1, dst1, ...]` by dense id.
    /// Springs are treated as undirected; arrows render the `src -> dst` direction.
    pub edges: Vec<u32>,
}

/// Snapshot of the vault's note-link graph for the force simulation.
///
/// Every file still on disk becomes a node; `.md` notes carry tags from the
/// metadata cache, the rest are marked `is_attachment`. Edges are the
/// `[[wikilinks]]` (forward links) as directed dense-id pairs with self-links
/// dropped. The frontend hands `edges` straight to the wasm `sim_build`, which
/// rebuilds the dense `LayoutGraph` — keeping one-shot graph construction on the
/// Rust side (ADR-021) and the interactive sim in the worker.
#[tauri::command]
pub fn get_graph(state: State<AppState>) -> Result<GraphSnapshot, String> {
    let vault_path = state
        .vault_path
        .read()
        .map_err(|_| "vault path lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "no vault configured".to_string())?;

    let vault = state
        .vault
        .read()
        .map_err(|_| "vault lock poisoned".to_string())?;

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

    let root = Path::new(&vault_path);
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
            .ok_or_else(|| format!("note {p} not interned"))?;
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
            path: rel.clone(),
            tags,
            is_attachment: !p.ends_with(".md"),
        });
        dense.insert(id, i as u32);
    }

    let n = nodes.len() as u32;
    let mut edges: Vec<u32> = Vec::new();
    for (src_id, targets) in &vault.graph.forward_links {
        let Some(&u) = dense.get(src_id) else { continue };
        for t in targets {
            // `t` is the raw wikilink-text NodeId; resolve it to a dense index.
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
                edges.push(u);
                edges.push(v);
            }
        }
    }

    Ok(GraphSnapshot {
        node_count: n,
        nodes,
        edges,
    })
}
