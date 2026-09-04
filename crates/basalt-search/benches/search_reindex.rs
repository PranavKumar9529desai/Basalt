use std::hint::black_box;
use std::sync::atomic::{AtomicU64, Ordering};

use basalt_search::tantivy::index::TantivyIndex;
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

const TAGS: &[&str] = &[
    "project",
    "meeting",
    "idea",
    "todo",
    "reference",
    "archive",
    "draft",
];

fn generate_doc(index: usize, total: usize) -> (String, String, String, String) {
    let t1 = TAGS[index % TAGS.len()];
    let t2 = TAGS[(index * 3) % TAGS.len()];
    let path = format!("/vault/note-{:04}.md", index);
    let title = format!("Note {index}");
    let body = format!(
        "This is the content of note {index}. It contains #{t1} and #{t2} tags.\n\
         See also [[note-{:04}]] and [[note-{:04}]] for more information.",
        (index + 1) % total,
        (index + 7) % total
    );
    let tags = format!("{t1} {t2}");
    (path, title, body, tags)
}

fn bench_search_reindex(c: &mut Criterion) {
    let mut group = c.benchmark_group("search_reindex");

    for size in [1000usize, 5000] {
        let docs: Vec<_> = (0..size).map(|i| generate_doc(i, size)).collect();
        let base_dir = tempfile::tempdir().expect("temp dir");

        static RUN: AtomicU64 = AtomicU64::new(0);

        group.throughput(Throughput::Elements(size as u64));
        group.bench_function(BenchmarkId::new("reindex", size), |b| {
            b.iter_batched(
                || {
                    let run_id = RUN.fetch_add(1, Ordering::Relaxed);
                    let dir = base_dir.path().join(format!("run_{run_id}"));
                    std::fs::create_dir_all(&dir).unwrap();
                    let mut index = TantivyIndex::open_or_create(&dir).expect("open_or_create");
                    for (path, title, body, tags) in &docs {
                        index.update_document(path, title, body, tags).unwrap();
                    }
                    index.commit().unwrap();
                    (dir, index)
                },
                |(dir, mut index)| {
                    for (path, title, body, tags) in &docs {
                        index
                            .update_document(
                                black_box(path),
                                black_box(title),
                                black_box(body),
                                black_box(tags),
                            )
                            .unwrap();
                    }
                    index.commit().unwrap();
                    let _ = std::fs::remove_dir_all(&dir);
                    black_box(());
                },
                criterion::BatchSize::SmallInput,
            )
        });
    }

    group.finish();
}

criterion_group!(benches, bench_search_reindex);
criterion_main!(benches);
