
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
    let note_idx = |suffix: &str| {
        snap.nodes
            .iter()
            .position(|n| !n.is_tag && n.path.ends_with(suffix))
    };
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
        .as_chunks::<2>()
        .0
        .iter()
        .map(|c| (c[0], c[1]))
        .collect();

    // Notes link to their EXACT tag only (never the ancestor).
    assert!(
        edge_pairs.contains(&(a_idx as u32, topic_idx as u32)),
        "a -> topic"
    );
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
    vault
        .graph
        .add_document(a.to_str().unwrap(), ma, &mut vault.arena);
    let mut mb = FileMetadata::new();
    mb.tags = vec!["x".to_string(), "y".to_string()];
    vault
        .graph
        .add_document(b.to_str().unwrap(), mb, &mut vault.arena);
    // Force a direct link a -> b so we can assert link + shared-tag strength.
    let a_id = vault.arena.get_id(a.to_str().unwrap()).expect("a interned");
    let b_id = vault.arena.get_id(b.to_str().unwrap()).expect("b interned");
    vault
        .graph
        .forward_links
        .entry(a_id)
        .or_default()
        .push(b_id);
    let snap = build_graph_snapshot(&vault, &root).unwrap();
    let note_idx = |suffix: &str| {
        snap.nodes
            .iter()
            .position(|n| !n.is_tag && n.path.ends_with(suffix))
    };
    let a_idx = note_idx("a.md").expect("a.md node present");
    let b_idx = note_idx("b.md").expect("b.md node present");
    let pair_w = snap
        .edges
        .as_chunks::<2>()
        .0
        .iter()
        .map(|c| (c[0], c[1]))
        .zip(&snap.edge_weights)
        .find(|((u, v), _)| {
            (*u == a_idx as u32 && *v == b_idx as u32) || (*u == b_idx as u32 && *v == a_idx as u32)
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
    vault
        .graph
        .add_document(a.to_str().unwrap(), ma, &mut vault.arena);
    let mut mb = FileMetadata::new();
    mb.tags = vec!["q".to_string()];
    vault
        .graph
        .add_document(b.to_str().unwrap(), mb, &mut vault.arena);
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
        snap.nodes[a_idx].cluster, snap.nodes[b_idx].cluster,
        "disconnected notes => distinct clusters"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn test_encode_graph_snapshot_binary() {
    let snap = GraphSnapshot {
        node_count: 2,
        nodes: vec![
            GraphNodeMeta {
                path: "a.md".to_string(),
                tags: vec!["tag1".to_string()],
                is_attachment: false,
                is_tag: false,
                cluster: 1,
            },
            GraphNodeMeta {
                path: "b.md".to_string(),
                tags: vec![],
                is_attachment: false,
                is_tag: false,
                cluster: 1,
            },
        ],
        edges: vec![0, 1],
        edge_weights: vec![1.5],
    };
    let bytes = encode_graph_snapshot_binary(&snap).unwrap();
    assert_eq!(&bytes[0..4], b"BGRP");
    let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    assert_eq!(version, 1);
    let node_count = u32::from_le_bytes(bytes[8..12].try_into().unwrap());
    assert_eq!(node_count, 2);
    let edge_count = u32::from_le_bytes(bytes[12..16].try_into().unwrap());
    assert_eq!(edge_count, 1);
    let json_len = u32::from_le_bytes(bytes[16..20].try_into().unwrap()) as usize;
    let pad = u32::from_le_bytes(bytes[20..24].try_into().unwrap()) as usize;
    assert_eq!((json_len + pad) % 4, 0);

    let edges_offset = 24 + json_len + pad;
    let u0 = u32::from_le_bytes(bytes[edges_offset..edges_offset + 4].try_into().unwrap());
    let v0 = u32::from_le_bytes(
        bytes[edges_offset + 4..edges_offset + 8]
            .try_into()
            .unwrap(),
    );
    assert_eq!((u0, v0), (0, 1));

    let weights_offset = edges_offset + 8;
    let w0 = f32::from_le_bytes(
        bytes[weights_offset..weights_offset + 4]
            .try_into()
            .unwrap(),
    );
    assert_eq!(w0, 1.5);
}
