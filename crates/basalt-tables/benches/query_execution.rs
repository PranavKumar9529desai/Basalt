use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use basalt_tables::execute_query;
use basalt_vault::Vault;

fn populate_vault(size: usize) -> Vault {
    let mut vault = Vault::new();
    for i in 0..size {
        let path = format!("notes/note-{}.md", i);
        let tags = if i % 3 == 0 { "#work" } else { "#personal" };
        let content = format!("# Note {}\n\nTags: {}\n\nSome content with tags and links.\n", i, tags);
        vault.add_document(&path, &content);
    }
    vault
}

fn bench_table_query(c: &mut Criterion) {
    let mut group = c.benchmark_group("query_execution");
    for size in [1_000, 5_000, 25_000] {
        let vault = populate_vault(size);
        group.bench_with_input(BenchmarkId::new("table_from_tag", size), &vault, |b, v| {
            b.iter(|| execute_query(v, "TABLE file.name FROM #work").unwrap());
        });
        group.bench_with_input(BenchmarkId::new("list_sort_limit", size), &vault, |b, v| {
            b.iter(|| execute_query(v, "LIST SORT file.name ASC LIMIT 50").unwrap());
        });
    }
    group.finish();
}

criterion_group!(benches, bench_table_query);
criterion_main!(benches);