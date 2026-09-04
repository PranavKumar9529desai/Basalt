use std::hint::black_box;

use basalt_graph::StringArena;
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

fn bench_arena_growth(c: &mut Criterion) {
    let mut group = c.benchmark_group("arena_growth");

    for size in [1000usize, 5000, 10_000] {
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(BenchmarkId::new("insert", size), &size, |b, &s| {
            b.iter(|| {
                let mut arena = StringArena::new();
                for i in 0..s {
                    let key = format!("note-{:04}.md", i);
                    black_box(arena.get_or_insert(black_box(&key)));
                }
                black_box(arena.len());
            })
        });

        group.bench_with_input(BenchmarkId::new("lookup_hit", size), &size, |b, &s| {
            let mut arena = StringArena::new();
            let keys: Vec<String> = (0..s).map(|i| format!("note-{:04}.md", i)).collect();
            for key in &keys {
                arena.get_or_insert(key);
            }
            b.iter(|| {
                for key in &keys {
                    black_box(arena.get_id(black_box(key)));
                }
            })
        });

        group.bench_with_input(BenchmarkId::new("lookup_miss", size), &size, |b, &s| {
            let mut arena = StringArena::new();
            let keys: Vec<String> = (0..s).map(|i| format!("note-{:04}.md", i)).collect();
            for key in &keys {
                arena.get_or_insert(key);
            }
            b.iter(|| {
                for i in 0..s {
                    let missing = format!("missing-{:04}.md", i);
                    black_box(arena.get_id(black_box(&missing)));
                }
            })
        });
    }

    group.finish();
}

criterion_group!(benches, bench_arena_growth);
criterion_main!(benches);
