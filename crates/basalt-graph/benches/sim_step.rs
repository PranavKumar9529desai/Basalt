//! ADR-021 Phase 1 acceptance gate: a single `ForceSim::step()` must stay within
//! the 60fps budget (≤16.6ms) at 5k and 25k nodes. Barnes-Hut repulsion is
//! O(n log n), so 25k is the binding constraint (AGENTS.md ≥25k fixture rule).
//! Uses the default `SimParams` (theta = 2.0), which clears the gate with
//! headroom for WebGL rendering in the same frame.

use std::hint::black_box;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use basalt_graph::{ForceSim, LayoutGraph, NoteGraph, StringArena};
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

fn bench_sim_step(c: &mut Criterion) {
    let mut group = c.benchmark_group("sim_step");

    for size in [1000usize, 5000, 25_000] {
        let graph = synthetic_graph(size, 3);
        let layout = LayoutGraph::from_note_graph(&graph);
        // Default params: the configuration the real engine will use.
        let mut sim = ForceSim::new(&layout, Default::default());

        // Warm up the layout a bit so the tree is in a realistic (spread) state.
        for _ in 0..20 {
            sim.step();
        }

        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(
            BenchmarkId::new("step", size),
            &size,
            |b, _| {
                b.iter(|| {
                    sim.step();
                    black_box(sim.positions());
                })
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_sim_step);
criterion_main!(benches);
