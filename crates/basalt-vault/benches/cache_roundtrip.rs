use std::hint::black_box;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use basalt_vault::{Vault, VaultCache};

const TAGS: &[&str] = &[
    "project", "meeting", "idea", "todo", "reference", "archive", "draft",
];

fn generate_note_content(index: usize, total: usize) -> String {
    let t1 = TAGS[index % TAGS.len()];
    let t2 = TAGS[(index * 3) % TAGS.len()];
    let link1 = format!("note-{:04}", (index + 1) % total);
    let link2 = format!("note-{:04}", (index + 7) % total);

    format!(
        "---\ntitle: Note {index}\ncreated: 2024-01-01\ntags: [{t1}, {t2}]\n---\n\
         # Note {index}\n\n\
         This is the content of note {index}. It contains #{t1} and #{t2} tags.\n\
         See also [[{link1}]] and [[{link2}]] for more information.\n\n\
         ## References\n\n\
         - Related to {link1}\n\
         - See {link2} for context\n\n\
         ## Tags\n\
         #{t1} #{t2}\n"
    )
}

fn bench_cache_roundtrip(c: &mut Criterion) {
    let mut group = c.benchmark_group("cache_roundtrip");

    for &size in &[1000usize, 5000] {
        let mut vault = Vault::new();
        for i in 0..size {
            let content = generate_note_content(i, size);
            vault.add_document(&format!("/vault/note-{:04}.md", i), &content);
        }

        let cache = VaultCache::build("/vault", vault);
        let dir = tempfile::tempdir().expect("temp dir");
        let cache_path = dir.path().join("cache.json");

        group.throughput(Throughput::Elements(size as u64));

        group.bench_function(BenchmarkId::new("save", size), |b| {
            b.iter(|| cache.save(black_box(&cache_path)).unwrap())
        });

        cache.save(&cache_path).unwrap();
        group.bench_function(BenchmarkId::new("load", size), |b| {
            b.iter(|| black_box(VaultCache::load(black_box(&cache_path))))
        });
    }

    group.finish();
}

criterion_group!(benches, bench_cache_roundtrip);
criterion_main!(benches);
