//! Graph snapshot construction for the force simulation.

use std::collections::HashMap;
use std::path::Path;

use basalt_graph::NodeId;
use basalt_vault::Vault;
use serde::Serialize;

use super::cc::cc_clusters;
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
pub struct GraphNodeMeta {
    /// Vault-relative path — the node's stable id on the frontend.
    pub path: String,
    /// Frontmatter/in-body tags, used for filters and color groups.
    pub tags: Vec<String>,
    /// True for non-`.md` files (images, PDFs, …) shown/toggled as attachments.
    pub is_attachment: bool,
    /// True for tag-tree nodes (e.g. `project/alpha`); styled/filtered
    /// separately from notes.
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

/// Build the graph snapshot (nodes + dense edges) from an in-memory `Vault`.
///
/// Pure with respect to Tauri state so it can be unit-tested directly; the
/// `get_graph` command is a thin wrapper over this. Tag-tree semantics:
/// notes link to their exact tags; nested tags chain parent->child.
pub(crate) fn build_graph_snapshot(vault: &Vault, vault_path: &Path) -> AppResult<GraphSnapshot> {
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
    // shared tag hubs (and the hierarchy renders as a tree).
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
        let Some(&u) = dense.get(src_id) else {
            continue;
        };
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
                    .or_else(|| {
                        resolver
                            .get(&raw.trim_end_matches(".md").to_lowercase())
                            .copied()
                    })
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
        let links = pair_counts[&((u as u64) << 32 | (v as u64))];
        let w = links + shared_tags(u as usize, v as usize);
        edge_weights.push(w as f32);
    }
    // Connected-component id per node so the frontend can auto-color clusters.
    let clusters = cc_clusters(nodes.len(), &edges);
    for (i, node) in nodes.iter_mut().enumerate() {
        node.cluster = clusters[i];
    }

    Ok(GraphSnapshot {
        node_count: nodes.len() as u32,
        nodes,
        edges,
        edge_weights,
    })
}

/// Serialize a `GraphSnapshot` to compact binary IPC bytes (ADR-044).
///
/// Layout:
/// - `0..4`: `b"BGRP"` magic
/// - `4..8`: version (1u32)
/// - `8..12`: node_count (u32)
/// - `12..16`: edge_count (u32, number of pairs)
/// - `16..20`: json_meta_len (u32)
/// - `20..24`: pad_bytes (u32) - pad to keep edges 4-byte aligned
/// - `24..24+json_meta_len`: JSON bytes of `nodes`
/// - `pad_bytes`: zero padding bytes
/// - `edges`: raw u32 bytes (length = edge_count * 2 * 4)
/// - `edge_weights`: raw f32 bytes (length = edge_count * 4)
pub fn encode_graph_snapshot_binary(snap: &GraphSnapshot) -> AppResult<Vec<u8>> {
    let json_bytes = serde_json::to_vec(&snap.nodes)
        .map_err(|e| AppError::Other(format!("failed to serialize graph node metadata: {e}")))?;
    let edge_count = (snap.edges.len() / 2) as u32;
    let pad_bytes = ((4 - (json_bytes.len() % 4)) % 4) as u32;
    let total_size = 24
        + json_bytes.len()
        + pad_bytes as usize
        + snap.edges.len() * 4
        + snap.edge_weights.len() * 4;
    let mut out = Vec::with_capacity(total_size);
    out.extend_from_slice(b"BGRP");
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(&snap.node_count.to_le_bytes());
    out.extend_from_slice(&edge_count.to_le_bytes());
    out.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&pad_bytes.to_le_bytes());
    out.extend_from_slice(&json_bytes);
    out.extend(std::iter::repeat_n(0u8, pad_bytes as usize));
    for &e in &snap.edges {
        out.extend_from_slice(&e.to_le_bytes());
    }
    for &w in &snap.edge_weights {
        out.extend_from_slice(&w.to_le_bytes());
    }
    Ok(out)
}


#[cfg(test)]
mod tests;
