use std::hint::black_box;

use basalt_graph::{NodeId, NoteGraph, StringArena};
use basalt_types::FileMetadata;
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

fn make_metadata(index: usize, total: usize) -> FileMetadata {
    let mut meta = FileMetadata::new();
    meta.links = vec![
        format!("note-{:04}.md", (index + 1) % total),
        format!("note-{:04}.md", (index + 7) % total),
    ];
    meta.tags = vec!["project".into(), "benchmark".into()];
    meta
}

fn populate(size: usize) -> (NoteGraph, StringArena, Vec<NodeId>) {
    let mut arena = StringArena::new();
    let mut graph = NoteGraph::new();
    let mut ids = Vec::with_capacity(size);

    for i in 0..size {
        let path = format!("note-{:04}.md", i);
        let meta = make_metadata(i, size);
        let id = arena.get_or_insert(&path);
        graph.add_document(&path, meta, &mut arena);
        ids.push(id);
    }

    (graph, arena, ids)
}

fn bench_graph_query(c: &mut Criterion) {
    let mut group = c.benchmark_group("graph_query");

    for size in [1000usize, 5000] {
        let (graph, _arena, ids) = populate(size);

        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(BenchmarkId::new("backlinks", size), &ids, |b, ids| {
            b.iter(|| {
                for id in ids {
                    black_box(graph.get_back_links(*id));
                }
            })
        });

        group.bench_with_input(BenchmarkId::new("forward_links", size), &ids, |b, ids| {
            b.iter(|| {
                for id in ids {
                    black_box(graph.get_forward_links(*id));
                }
            })
        });

        group.bench_with_input(BenchmarkId::new("metadata", size), &ids, |b, ids| {
            b.iter(|| {
                for id in ids {
                    black_box(graph.get_metadata(*id));
                }
            })
        });
    }

    group.finish();
}

criterion_group!(benches, bench_graph_query);
criterion_main!(benches);
