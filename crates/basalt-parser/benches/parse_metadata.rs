use std::hint::black_box;

use criterion::{criterion_group, criterion_main, Criterion, Throughput};
use basalt_parser::extract_metadata;

const TAGS: &[&str] = &[
    "project", "meeting", "idea", "todo", "reference", "archive", "draft",
];

fn generate_docs(count: usize) -> Vec<String> {
    (0..count)
        .map(|i| {
            let t1 = TAGS[i % TAGS.len()];
            let t2 = TAGS[(i * 3) % TAGS.len()];
            let link1 = format!("note-{:04}", (i + 1) % count);
            let link2 = format!("note-{:04}", (i + 7) % count);
            format!(
                "---\ntitle: Note {i}\ncreated: 2024-01-01\ntags: [{t1}, {t2}]\n---\n\
                 # Note {i}\n\n\
                 This is the content of note {i}. It contains #{t1} and #{t2} tags.\n\
                 See also [[{link1}]] and [[{link2}]] for more information.\n\n\
                 ## References\n\n\
                 - Related to {link1}\n\
                 - See {link2} for context\n\n\
                 ## Tags\n\
                 #{t1} #{t2}\n"
            )
        })
        .collect()
}

fn bench_parse_metadata(c: &mut Criterion) {
    let docs = generate_docs(1000);
    let mut group = c.benchmark_group("parse_metadata");
    group.throughput(Throughput::Elements(docs.len() as u64));
    group.bench_function("seq_1k", |b| {
        b.iter(|| {
            for doc in &docs {
                black_box(extract_metadata(doc));
            }
        })
    });
    group.finish();
}

criterion_group!(benches, bench_parse_metadata);
criterion_main!(benches);
