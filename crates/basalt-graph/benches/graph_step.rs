//! ADR-021 Phase 1 acceptance gate: a single `ForceGraph::step()` must stay within
//! the 60fps budget (≤16.6ms) at 5k and 25k nodes. Barnes-Hut repulsion is
//! O(n log n), so 25k is the binding constraint (AGENTS.md ≥25k fixture rule).
//! Uses the default `GraphParams` (theta = 2.0), which clears the gate with
//! headroom for WebGL rendering in the same frame.

use std::hint::black_box;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use basalt_graph::{ForceGraph, LayoutGraph, NoteGraph, StringArena};
use basalt_types::FileMetadata;

/// Build a synthetic `NoteGraph` with `n` notes, each linking to
/// `links_per_node` random others, so the dense layout has ~n·links edges.
fn synthetic_graph(n: usize, links_per_node: usize) -> NoteGraph {
    let mut arena = StringArena::new();
    let mut graph = NoteGraph::new();
    let mut state: u64 = 0x1234_5678 ^ n as u64;
    let mut rng = || {
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

/// Like `synthetic_graph`, but also assigns each note `tags_per_node` tags drawn
/// from a bounded nested-tag namespace, so the graph contains the tag tree
/// (parent->child edges + note->leaf edges). Exercises the ADR-021 tag path at
/// scale; the node count then exceeds `n` by the number of distinct tag nodes.
fn synthetic_graph_tagged(n: usize, links_per_node: usize, tags_per_node: usize) -> NoteGraph {
    let mut arena = StringArena::new();
    let mut graph = NoteGraph::new();
    let mut state: u64 = 0x9e37_9b97 ^ n as u64;
    let mut rng = || {
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
        meta.tags = (0..tags_per_node)
            .map(|_| {
                let a = (rng() as usize) % 64;
                let b = (rng() as usize) % 64;
                format!("area{a}/sub{b}")
            })
            .collect();
        graph.add_document(&path, meta, &mut arena);
    }
    graph
}

fn bench_graph_step(c: &mut Criterion) {
    let mut group = c.benchmark_group("graph_step");

    for size in [1000usize, 5000, 25_000] {
        let graph = synthetic_graph(size, 3);
        let layout = LayoutGraph::from_note_graph(&graph);
        let mut graph = ForceGraph::new(&layout, Default::default());
        for _ in 0..20 {
            graph.step();
        }
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(
            BenchmarkId::new("step", size),
            &size,
            |b, _| {
                b.iter(|| {
                    graph.step();
                    black_box(graph.positions());
                })
            },
        );
    }

    // Tagged variant: ensures the tag tree (parent->child + note->leaf edges)
    // does not break the 25k budget. The node count here exceeds `size` by the
    // distinct tag nodes created.
    for size in [5000usize, 25_000] {
        let graph = synthetic_graph_tagged(size, 3, 4);
        let layout = LayoutGraph::from_note_graph(&graph);
        let mut graph = ForceGraph::new(&layout, Default::default());
        for _ in 0..20 {
            graph.step();
        }
        let node_count = layout.node_count;
        group.throughput(Throughput::Elements(node_count as u64));
        group.bench_with_input(
            BenchmarkId::new("step_tagged", size),
            &size,
            |b, _| {
                b.iter(|| {
                    graph.step();
                    black_box(graph.positions());
                })
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_graph_step);
criterion_main!(benches);
