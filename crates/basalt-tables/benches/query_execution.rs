use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use basalt_tables::execute_query;
use basalt_vault::Vault;

fn populate_vault(size: usize) -> Vault {
    let mut vault = Vault::new();
    for i in 0..size {
        let path = format!("notes/note-{}.md", i);
        let tags = if i % 3 == 0 { "#work" } else { "#personal" };
        let priority = i % 5;
        let label_count = (i % 3) + 1;
        let labels_yaml: String = (0..label_count)
            .map(|l| format!("l{}", l))
            .collect::<Vec<_>>()
            .join(", ");
        let content = format!(
            "---\npriority: {}\nlabels: [{}]\n---\n# Note {}\n\nTags: {}\n\nSome content.\n",
            priority, labels_yaml, i, tags
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
        group.bench_with_input(
            BenchmarkId::new("flatten_list_group_by", size),
            &vault,
            |b, v| {
                b.iter(|| {
                    execute_query(
                        v,
                        "TABLE label, count(rows) FROM #work FLATTEN labels AS \"label\" GROUP BY label",
                    )
                    .unwrap()
                });
            },
        );
        group.bench_with_input(
            BenchmarkId::new("where_contains_list", size),
            &vault,
            |b, v| {
                b.iter(|| {
                    execute_query(
                        v,
                        "TABLE file.name FROM #work WHERE contains(labels, \"l0\")",
                    )
                    .unwrap()
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_table_query, bench_aggregation);
criterion_main!(benches);
