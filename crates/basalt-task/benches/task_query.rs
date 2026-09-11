//! Task query performance benchmarks (ADR-048 §14.2 targets).
//!
//! Gates (at 25k note vaults, release profile):
//!   - full task query < 50 ms   (ADR-048 §14.2)
//!   - urgency sort < 10 ms      (ADR-048 §14.2)
//!
//! Run with: `cargo bench -p basalt-task`.

use basalt_task::{execute_task_query, TaskFilter, TaskQuery, TaskSort};
use basalt_vault::Vault;
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::hint::black_box;

/// Build a vault with `notes` notes, each containing exactly one task line.
/// Status/priority/due rotate so filters stay selective; emoji signifiers
/// are the wire-real syntax (`⏫`, `📅 YYYY-MM-DD`). The fixture build cost
/// (metadata extraction) is outside the timed closure.
fn populate_vault(notes: usize) -> Vault {
    let mut vault = Vault::new();
    for i in 0..notes {
        let path = format!("notes/note-{:04}.md", i);
        // Rotate status across the six Basalt states (ADR-048 signifiers).
        let status = match i % 6 {
            0 => "[ ]",
            1 => "[x]",
            2 => "[X]",
            3 => "[/]",
            4 => "[?]",
            _ => "[-]",
        };
        // Priority: high/medium/low/none. 3/4 of tasks carry a signifier, so
        // `priority != none` stays selective.
        let priority = match i % 4 {
            0 => " ⏫",
            1 => " 🔼",
            2 => " 🔽",
            _ => "",
        };
        // Due date on every 4th task (spread across early 2024).
        let due = if i % 4 == 0 {
            format!(" 📅 2024-01-{:02}", (i % 27) + 1)
        } else {
            String::new()
        };
        let content = format!("# Note {}\n\n- {} Review quarterly report {}", i, status, i);
        let content = format!("{}{}{}\n", content, priority, due);
        vault.add_document(&path, &content);
    }
    vault
}

/// Undone tasks only — the most common task-panel filter.
fn status_not_done() -> TaskQuery {
    TaskQuery {
        filters: vec![TaskFilter {
            field: "status".into(),
            op: "not_done".into(),
            value: String::new(),
        }],
        sorts: vec![],
        groups: vec![],
        limit: None,
    }
}

/// Realistic panel query: undone tasks due before mid-2024, urgency-sorted,
/// top-20 limited (the switcher/task-panel shape).
fn panel_query() -> TaskQuery {
    TaskQuery {
        filters: vec![
            TaskFilter {
                field: "status".into(),
                op: "not_done".into(),
                value: String::new(),
            },
            TaskFilter {
                field: "due".into(),
                op: "before".into(),
                value: "2024-06-01".into(),
            },
        ],
        sorts: vec![TaskSort {
            field: "urgency".into(),
            reverse: true,
        }],
        groups: vec![],
        limit: Some(20),
    }
}

/// Urgency-only sort of the FULL result set (no filters, no limit) — the
/// worst-case envelope: collects all tasks and O(N log N) sorts them.
/// The panel shape (filtered + top-K) is `panel_query` above.
/// NOTE: this does NOT isolate the per-task urgency math (ADR-048's
/// "urgency calc 25k < 10 ms" refers to that math alone, which is a small
/// fraction of collect+sort); it bounds the whole unsorted-dump path.
fn urgency_query() -> TaskQuery {
    TaskQuery {
        filters: vec![],
        sorts: vec![TaskSort {
            field: "urgency".into(),
            reverse: true,
        }],
        groups: vec![],
        limit: None,
    }
}

fn bench_task_query(c: &mut Criterion) {
    let mut group = c.benchmark_group("task_query");
    for size in [1_000usize, 5_000, 25_000] {
        let vault = populate_vault(size);

        // Full scan — baseline collection cost with zero filters.
        group.bench_with_input(BenchmarkId::new("collect_all", size), &vault, |b, v| {
            b.iter(|| execute_task_query(black_box(v), None).unwrap());
        });

        // Selective filter: 5/6 of tasks survive; fused push-down (68d70b4)
        // clones only survivors.
        group.bench_with_input(BenchmarkId::new("status_filter", size), &vault, |b, v| {
            b.iter(|| execute_task_query(black_box(v), Some(&status_not_done())).unwrap());
        });

        // End-to-end panel query: filters + urgency sort + top-20 limit.
        group.bench_with_input(BenchmarkId::new("panel_query", size), &vault, |b, v| {
            b.iter(|| execute_task_query(black_box(v), Some(&panel_query())).unwrap());
        });
    }
    group.finish();
}

fn bench_urgency_calc(c: &mut Criterion) {
    let mut group = c.benchmark_group("urgency_sort_dump");
    for size in [5_000usize, 25_000] {
        let vault = populate_vault(size);
        group.bench_with_input(BenchmarkId::new("urgency_sort", size), &vault, |b, v| {
            b.iter(|| execute_task_query(black_box(v), Some(&urgency_query())).unwrap());
        });
    }
    group.finish();
}

criterion_group!(benches, bench_task_query, bench_urgency_calc);
criterion_main!(benches);
