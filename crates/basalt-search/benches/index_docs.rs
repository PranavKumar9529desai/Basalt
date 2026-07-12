use std::hint::black_box;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use basalt_search::tantivy::index::TantivyIndex;

const TAGS: &[&str] = &[
    "project", "meeting", "idea", "todo", "reference", "archive", "draft",
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

fn bench_index_docs(c: &mut Criterion) {
    let mut group = c.benchmark_group("index_docs");

    for size in [1000usize, 5000] {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut index =
            TantivyIndex::open_or_create(dir.path()).expect("open_or_create");
        let docs: Vec<_> = (0..size).map(|i| generate_doc(i, size)).collect();

        group.throughput(Throughput::Elements(size as u64));
        group.bench_function(BenchmarkId::new("index", size), |b| {
            b.iter(|| {
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
            })
        });
    }

    group.finish();
}

criterion_group!(benches, bench_index_docs);
criterion_main!(benches);
