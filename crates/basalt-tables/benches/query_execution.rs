use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use basalt_tables::execute_query;
use basalt_vault::Vault;

fn populate_vault(size: usize) -> Vault {
    let mut vault = Vault::new();
    for i in 0..size {
        let path = format!("notes/note-{}.md", i);
        let tags = if i % 3 == 0 { "#work" } else { "#personal" };
        let priority = i % 5;
        let content = format!(
            "---\npriority: {}\n---\n# Note {}\n\nTags: {}\n\nSome content.\n",
            priority, i, tags
        );
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

fn bench_aggregation(c: &mut Criterion) {
    let mut group = c.benchmark_group("aggregation");
    for size in [5_000, 25_000] {
        let vault = populate_vault(size);
        group.bench_with_input(BenchmarkId::new("group_by_count", size), &vault, |b, v| {
            b.iter(|| {
                execute_query(
                    v,
                    "TABLE priority, count(rows) FROM #work GROUP BY priority",
                )
                .unwrap()
            });
        });
        group.bench_with_input(BenchmarkId::new("group_by_sum", size), &vault, |b, v| {
            b.iter(|| {
                execute_query(
                    v,
                    "TABLE priority, sum(rows.priority) FROM #work GROUP BY priority",
                )
                .unwrap()
            });
        });
        group.bench_with_input(
            BenchmarkId::new("flatten_then_group_by", size),
            &vault,
            |b, v| {
                b.iter(|| {
                    execute_query(
                        v,
                        "TABLE p, count(rows) FROM #work FLATTEN priority AS \"p\" GROUP BY p",
                    )
                    .unwrap()
                });
            },
        );
        group.bench_with_input(BenchmarkId::new("where_numeric", size), &vault, |b, v| {
            b.iter(|| {
                execute_query(v, "TABLE file.name FROM #work WHERE priority > 2").unwrap()
            });
        });
    }
    group.finish();
}

criterion_group!(benches, bench_table_query, bench_aggregation);
criterion_main!(benches);
