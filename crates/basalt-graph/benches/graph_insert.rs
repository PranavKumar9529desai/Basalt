use std::hint::black_box;

use basalt_graph::{NoteGraph, StringArena};
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

fn bench_graph_insert(c: &mut Criterion) {
    let mut group = c.benchmark_group("graph_insert");

    for size in [1000usize, 5000] {
        let mut arena = StringArena::new();
        let mut graph = NoteGraph::new();
        let docs: Vec<_> = (0..size)
            .map(|i| {
                let path = format!("note-{:04}.md", i);
                let meta = make_metadata(i, size);
                (path, meta)
            })
            .collect();

        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(BenchmarkId::new("insert", size), &docs, |b, docs| {
            b.iter(|| {
                let mut g = NoteGraph::new();
                let mut a = StringArena::new();
                for (path, meta) in docs {
                    g.add_document(black_box(path), black_box(meta.clone()), &mut a);
                }
                black_box((g, a));
            })
        });

        // Pre-populate for query benchmarks that share setup
        for (path, meta) in &docs {
            graph.add_document(path, meta.clone(), &mut arena);
        }
    }

    group.finish();
}

criterion_group!(benches, bench_graph_insert);
criterion_main!(benches);
