use std::hint::black_box;

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

const QUERIES: &[&str] = &[
    "note",
    "project",
    "content meeting",
    "no_such_term_xyz",
    "not",
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

fn populate_index(dir: &std::path::Path, count: usize) -> TantivyIndex {
    let mut index = TantivyIndex::open_or_create(dir).expect("open_or_create");
    for i in 0..count {
        let (path, title, body, tags) = generate_doc(i, count);
        index.update_document(&path, &title, &body, &tags).unwrap();
    }
    index.commit().unwrap();
    index
}

fn bench_search_query(c: &mut Criterion) {
    let mut group = c.benchmark_group("search_query");

    for size in [1000usize, 5000, 25000] {
        let dir = tempfile::tempdir().expect("temp dir");
        let index = populate_index(dir.path(), size);

        group.throughput(Throughput::Elements(QUERIES.len() as u64));
        group.bench_function(BenchmarkId::new("search", size), |b| {
            b.iter(|| {
                for q in QUERIES {
                    black_box(index.search(black_box(q), 10).unwrap());
                }
            })
        });
    }

    group.finish();
}

criterion_group!(benches, bench_search_query);
criterion_main!(benches);
