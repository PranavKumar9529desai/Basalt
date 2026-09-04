use crate::arena::StringArena;
use crate::graph_layout::{ForceGraph, GraphParams, LayoutGraph};
use basalt_types::FileMetadata;

fn synthetic_graph(n: usize, links_per_node: usize) -> crate::graph::NoteGraph {
    let mut arena = StringArena::new();
    let mut graph = crate::graph::NoteGraph::new();
    let mut state: u64 = 0x1234_5678;
    let mut rng = || {
        // xorshift64* — deterministic, no external dep.
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    for i in 0..n {
        let path = format!("note-{:05}.md", i);
        let mut meta = FileMetadata::new();
        meta.links = (0..links_per_node)
            .map(|_| format!("note-{:05}.md", (rng() as usize) % n))
            .collect();
        graph.add_document(&path, meta, &mut arena);
    }
    graph
}

#[test]
fn layout_graph_remaps_dense_and_preserves_edges() {
    let g = synthetic_graph(50, 2);
    let lg = LayoutGraph::from_note_graph(&g);
    assert_eq!(lg.node_count, 50);
    assert!(!lg.edges.is_empty());
    for &(u, v) in &lg.edges {
        assert!(u < 50 && v < 50);
    }
}

#[test]
fn graph_stays_finite_and_bounded() {
    let g = synthetic_graph(500, 3);
    let lg = LayoutGraph::from_note_graph(&g);
    let mut graph = ForceGraph::new(&lg, GraphParams::default());
    for _ in 0..200 {
        graph.step();
    }
    for &p in graph.positions() {
        assert!(p.is_finite(), "position became non-finite: {p}");
        assert!(p.abs() < 1e6, "position diverged: {p}");
    }
}

#[test]
fn graph_settles_over_time() {
    let g = synthetic_graph(300, 3);
    let lg = LayoutGraph::from_note_graph(&g);
    let mut graph = ForceGraph::new(&lg, GraphParams::default());
    for _ in 0..10 {
        graph.step();
    }
    let early = graph.avg_speed();
    for _ in 0..400 {
        graph.step();
    }
    let late = graph.avg_speed();
    assert!(
        late < early,
        "graph did not settle: early={early}, late={late}"
    );
    assert!(late.is_finite());
}

#[test]
fn layout_graph_tags_marked_as_tag_nodes() {
    let mut graph = crate::graph::NoteGraph::new();
    let mut arena = StringArena::new();
    let meta = FileMetadata {
        tags: vec!["area/sub".to_string()],
        ..FileMetadata::new()
    };
    graph.add_document("note.md", meta, &mut arena);

    let lg = LayoutGraph::from_note_graph(&graph);
    // note.md + #area + #area/sub = 3 nodes
    assert_eq!(lg.node_count, 3);
    assert!(lg.node_types.contains(&1), "expected a tag node");
    assert!(lg.node_types.contains(&0), "expected a note node");
}
