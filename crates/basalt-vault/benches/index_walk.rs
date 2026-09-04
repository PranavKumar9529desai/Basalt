use std::hint::black_box;
use std::path::{Path, PathBuf};

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use ignore::WalkBuilder;
use basalt_vault::indexer::index_directory;

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

fn create_vault_fixture(note_count: usize) -> (tempfile::TempDir, Vec<String>) {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let mut paths = Vec::with_capacity(note_count);

    for i in 0..note_count {
        let filename = format!("note-{:04}.md", i);
        let path = dir.path().join(&filename);
        let content = generate_note_content(i, note_count);
        std::fs::write(&path, &content).expect("failed to write fixture file");
        paths.push(path.to_string_lossy().to_string());
    }

    paths.sort();
    (dir, paths)
}

fn count_md_files(path: &Path) -> usize {
    WalkBuilder::new(path)
        .build()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_some_and(|ft| ft.is_file()))
        .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("md"))
        .count()
}

fn bench_index_walk(c: &mut Criterion) {
    let mut group = c.benchmark_group("index_walk");

    if let Ok(vault_path) = std::env::var("BENCH_VAULT_PATH") {
        let path = PathBuf::from(&vault_path);
        let count = count_md_files(&path);
        group.throughput(Throughput::Elements(count as u64));
        group.bench_function(BenchmarkId::new("real_vault", count), |b| {
            b.iter(|| black_box(index_directory(black_box(&path))))
        });
    } else {
        let mut dirs = Vec::new();
        for &size in &[50usize, 500, 5000] {
            let (dir, _paths) = create_vault_fixture(size);
            let path = dir.path().to_path_buf();
            dirs.push(dir);
            group.throughput(Throughput::Elements(size as u64));
            group.bench_with_input(
                BenchmarkId::new("synthetic", size),
                &path,
                |b, p: &PathBuf| b.iter(|| black_box(index_directory(black_box(p.as_path())))),
            );
        }
    }

    group.finish();
}

criterion_group!(benches, bench_index_walk);
criterion_main!(benches);
