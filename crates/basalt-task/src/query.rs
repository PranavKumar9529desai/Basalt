//! Task query execution over vault metadata (ADR-048 §4, roadmap §3).
//!
//! Migrated from `basalt-tables/src/output.rs` + `urgency.rs` with bug
//! fixes applied in the same move (roadmap §2.2):
//!
//! - **Status matching by enum name.** `TaskStatus::name()` returns the
//!   serde `snake_case` wire names (`in_progress`, `on_hold`, `non_task`),
//!   fixing the old `Debug`-derived `"inprogress"`/`"onhold"` that never
//!   matched filters or the Status column.
//! - **`not done` excludes cancelled.** The parser now emits dedicated
//!   `done` / `not_done` ops backed by `TaskData::is_done()` /
//!   `is_todo()` instead of a `not_equals done` name comparison.
//! - **`sort by happens` keeps undated tasks last** in both directions
//!   (`date_field_cmp`), consistent with the other date sorts.
//!
//! `basalt-tables` re-exports these types and the entry point so the DQL
//! `TASK` branch and the `get_tasks` IPC wire shape are untouched.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use basalt_types::{QueryColumn, QueryColumnType, QueryResult, TaskData, TypedValue};
use basalt_vault::Vault;

use crate::urgency::calculate_urgency;

/// Errors produced while executing a task query.
#[derive(Debug, thiserror::Error)]
pub enum TaskQueryError {
    /// Runtime error during execution.
    #[error("{0}")]
    Runtime(String),
}

/// A single filter predicate for task queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFilter {
    /// Field to filter on: "status", "due", "priority", "description",
    /// "tags", "path", "folder", "filename", "recurrence", "depends_on",
    /// "scheduled", "start", "created", "happens".
    pub field: String,
    /// Comparison operator: "equals", "not_equals", "above", "below",
    /// "before", "after", "on_or_before", "on_or_after", "includes",
    /// "is_empty", "exists", plus the status semantics "done"/"not_done".
    pub op: String,
    /// Filter value (string representation; dates as YYYY-MM-DD).
    pub value: String,
}

/// Sort specification for task queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSort {
    /// Field to sort by: "due", "priority", "urgency", "status",
    /// "description", "path", "scheduled", "start", "happens", "created",
    /// "line".
    pub field: String,
    /// Sort direction.
    pub reverse: bool,
}

/// Complete task query specification.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskQuery {
    /// AND-combined filter predicates.
    pub filters: Vec<TaskFilter>,
    /// Sort specifications (applied in order).
    pub sorts: Vec<TaskSort>,
    /// Group-by fields (produce section headings).
    pub groups: Vec<String>,
    /// Maximum number of tasks to return.
    pub limit: Option<usize>,
}

// ---------------------------------------------------------------------------
// Output columns
// ---------------------------------------------------------------------------

/// Columns for task query results.
fn task_columns() -> Vec<QueryColumn> {
    vec![
        QueryColumn {
            name: "File".to_string(),
            type_: QueryColumnType::Link,
        },
        QueryColumn {
            name: "Description".to_string(),
            type_: QueryColumnType::Text,
        },
        QueryColumn {
            name: "Status".to_string(),
            type_: QueryColumnType::Text,
        },
        QueryColumn {
            name: "Priority".to_string(),
            type_: QueryColumnType::Text,
        },
        QueryColumn {
            name: "Due".to_string(),
            type_: QueryColumnType::Date,
        },
        QueryColumn {
            name: "Scheduled".to_string(),
            type_: QueryColumnType::Date,
        },
        QueryColumn {
            name: "Tags".to_string(),
            type_: QueryColumnType::List,
        },
        QueryColumn {
            name: "Urgency".to_string(),
            type_: QueryColumnType::Number,
        },
        QueryColumn {
            name: "Path".to_string(),
            type_: QueryColumnType::Text,
        },
        QueryColumn {
            name: "Line".to_string(),
            type_: QueryColumnType::Number,
        },
    ]
}

/// Serialize a `TaskData` into a row of `TypedValue`s.
fn task_to_row(task: &TaskData, path: &str) -> Vec<TypedValue> {
    let today = chrono::Local::now().date_naive();
    vec![
        TypedValue::Link {
            name: path
                .rsplit('/')
                .next()
                .unwrap_or(path)
                .trim_end_matches(".md")
                .to_string(),
            path: path.to_string(),
        },
        TypedValue::Text {
            value: task.description.clone(),
        },
        TypedValue::Text {
            value: task.status.name().to_string(),
        },
        TypedValue::Text {
            value: task.priority.name().to_string(),
        },
        task.due
            .map(|d| TypedValue::Date {
                value: d.to_string(),
            })
            .unwrap_or(TypedValue::Null),
        task.scheduled
            .map(|d| TypedValue::Date {
                value: d.to_string(),
            })
            .unwrap_or(TypedValue::Null),
        TypedValue::List {
            items: task
                .tags
                .iter()
                .map(|t| TypedValue::Text { value: t.clone() })
                .collect(),
        },
        TypedValue::Number {
            value: calculate_urgency(task, today) as f64,
        },
        TypedValue::Text {
            value: path.to_string(),
        },
        TypedValue::Number {
            value: task.line as f64,
        },
    ]
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/// Apply a single filter predicate to a task. `path` is the source file's
/// vault-relative path (needed for path/folder/filename predicates).
fn matches_filter(path: &str, task: &TaskData, filter: &TaskFilter) -> bool {
    match filter.field.as_str() {
        "status" => match filter.op.as_str() {
            // Parser-emitted semantics — exclude done AND cancelled.
            "done" => task.is_done(),
            "not_done" => task.is_todo(),
            // Name comparison, normalized ("in progress" → "in_progress").
            _ => {
                let target = normalize_status_name(&filter.value);
                match filter.op.as_str() {
                    "equals" => task.status.name() == target,
                    "not_equals" => task.status.name() != target,
                    _ => false,
                }
            }
        },
        "priority" => {
            let target = filter.value.to_lowercase();
            let priority_name = task.priority.name();
            match filter.op.as_str() {
                "equals" => priority_name == target,
                "not_equals" => priority_name != target,
                "above" => {
                    // "above X" means numeric rank < X's rank.
                    let target_rank = priority_rank_from_name(&target);
                    task.priority.numeric() < target_rank
                }
                "below" => {
                    let target_rank = priority_rank_from_name(&target);
                    task.priority.numeric() > target_rank
                }
                _ => false,
            }
        }
        "due" => compare_date_field(task.due, &filter.op, &filter.value),
        "scheduled" => compare_date_field(task.scheduled, &filter.op, &filter.value),
        "start" => compare_date_field(task.start, &filter.op, &filter.value),
        "created" => compare_date_field(task.created, &filter.op, &filter.value),
        "happens" => compare_date_field(task.happens(), &filter.op, &filter.value),
        "description" => match filter.op.as_str() {
            "includes" => task
                .description
                .to_lowercase()
                .contains(&filter.value.to_lowercase()),
            "equals" => task.description.to_lowercase() == filter.value.to_lowercase(),
            _ => false,
        },
        "tags" => {
            let tag = filter.value.trim_start_matches('#');
            match filter.op.as_str() {
                "includes" => task.tags.iter().any(|t| {
                    let t_clean = t.trim_start_matches('#');
                    t_clean == tag
                        || (t_clean.starts_with(tag) && t_clean[tag.len()..].starts_with('/'))
                }),
                _ => false,
            }
        }
        "path" => match filter.op.as_str() {
            "includes" => path.to_lowercase().contains(&filter.value.to_lowercase()),
            "equals" => path.eq_ignore_ascii_case(&filter.value),
            _ => false,
        },
        "folder" => {
            let folder = path.rfind('/').map(|i| &path[..i]).unwrap_or("");
            match filter.op.as_str() {
                "includes" => folder.to_lowercase().contains(&filter.value.to_lowercase()),
                "equals" => folder.eq_ignore_ascii_case(&filter.value),
                _ => false,
            }
        }
        "filename" => {
            let name = path.rsplit('/').next().unwrap_or(path).trim_end_matches(".md");
            match filter.op.as_str() {
                "includes" => name.to_lowercase().contains(&filter.value.to_lowercase()),
                "equals" => name.eq_ignore_ascii_case(&filter.value),
                _ => false,
            }
        }
        "depends_on" => match filter.op.as_str() {
            "exists" => !task.depends_on.is_empty(),
            "is_empty" => task.depends_on.is_empty(),
            _ => false,
        },
        "recurrence" => match filter.op.as_str() {
            "exists" => task.recurrence.is_some(),
            "is_empty" => task.recurrence.is_none(),
            "includes" => task
                .recurrence
                .as_ref()
                .map(|r| r.to_lowercase().contains(&filter.value.to_lowercase()))
                .unwrap_or(false),
            _ => false,
        },
        _ => false,
    }
}

/// Normalize a status filter value: "in progress" / "on hold" → the
/// `snake_case` wire spelling.
fn normalize_status_name(value: &str) -> &str {
    match value.trim().to_lowercase().replace(' ', "_").as_str() {
        "in_progress" => "in_progress",
        "on_hold" => "on_hold",
        // Keep the borrow simple: the common cases are the ones that need
        // mapping; everything else is already snake_case or lowercase.
        _ => value.trim(),
    }
}

/// Compare an optional date field against a filter value.
fn compare_date_field(field: Option<NaiveDate>, op: &str, value: &str) -> bool {
    let target = match NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return false,
    };
    match (field, op) {
        (None, "is_empty") => true,
        (None, _) => false,
        (Some(d), "equals") | (Some(d), "on") => d == target,
        (Some(d), "not_equals") => d != target,
        (Some(d), "before") => d < target,
        (Some(d), "on_or_before") => d <= target,
        (Some(d), "after") => d > target,
        (Some(d), "on_or_after") => d >= target,
        (Some(_), "exists") => true,
        _ => false,
    }
}

/// Map priority name to numeric rank for "above"/"below" comparisons.
fn priority_rank_from_name(name: &str) -> u8 {
    match name {
        "highest" => 0,
        "high" => 1,
        "medium" => 2,
        "none" => 3,
        "low" => 4,
        "lowest" => 5,
        _ => 3,
    }
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/// Compare optional dates: `None` sorts after any `Some` (undated tasks
/// trail dated ones in ascending sorts — Obsidian Tasks semantics).
fn opt_date_cmp(a: &Option<NaiveDate>, b: &Option<NaiveDate>) -> std::cmp::Ordering {
    match (a, b) {
        (Some(x), Some(y)) => x.cmp(y),
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

/// Compare optional dates for a sorted field, keeping undated tasks last in
/// BOTH directions (Obsidian Tasks semantics): only the date order flips
/// with `reverse`, never the dated-vs-undated precedence.
fn date_field_cmp(
    a: &Option<NaiveDate>,
    b: &Option<NaiveDate>,
    reverse: bool,
) -> std::cmp::Ordering {
    match (a, b) {
        (Some(x), Some(y)) => {
            if reverse {
                x.cmp(y).reverse()
            } else {
                x.cmp(y)
            }
        }
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

/// Precomputed, copy-cheap sort keys for one task row (ADR-045 §2.2
/// Schwartzian transform). Built once per task — comparators never
/// recompute urgency, `happens()` or date math during O(N log N) sorting.
#[derive(Clone, Copy)]
struct TaskSortKey<'a> {
    path: &'a str,
    description: &'a str,
    status_name: &'static str,
    line: u32,
    urgency: i32,
    due: Option<NaiveDate>,
    scheduled: Option<NaiveDate>,
    start: Option<NaiveDate>,
    created: Option<NaiveDate>,
    happens: Option<NaiveDate>,
    priority: u8,
}

impl<'a> TaskSortKey<'a> {
    fn build(path: &'a str, task: &'a TaskData, today: NaiveDate) -> Self {
        Self {
            path,
            description: &task.description,
            status_name: task.status.name(),
            line: task.line,
            urgency: calculate_urgency(task, today),
            due: task.due,
            scheduled: task.scheduled,
            start: task.start,
            created: task.created,
            happens: task.happens(),
            priority: task.priority.numeric(),
        }
    }
}

/// Compare one sort field against precomputed keys. Returns the comparison
/// and whether the direction was already baked in (`true` for date fields,
/// which keep undated tasks last in BOTH directions — the generic
/// `reverse` must not flip that precedence).
fn field_cmp(
    a: &TaskSortKey<'_>,
    b: &TaskSortKey<'_>,
    field: &str,
    reverse: bool,
) -> (std::cmp::Ordering, bool) {
    match field {
        "due" => (date_field_cmp(&a.due, &b.due, reverse), true),
        "scheduled" => (date_field_cmp(&a.scheduled, &b.scheduled, reverse), true),
        "start" => (date_field_cmp(&a.start, &b.start, reverse), true),
        "created" => (date_field_cmp(&a.created, &b.created, reverse), true),
        "happens" => (date_field_cmp(&a.happens, &b.happens, reverse), true),
        "urgency" => (a.urgency.cmp(&b.urgency), false),
        "priority" => (a.priority.cmp(&b.priority), false),
        "status" => (a.status_name.cmp(b.status_name), false),
        "description" => (a.description.cmp(b.description), false),
        "path" => (a.path.cmp(b.path), false),
        "line" => (a.line.cmp(&b.line), false),
        _ => (std::cmp::Ordering::Equal, false),
    }
}

/// Compare two key buffers by the full sort spec list (applied in reverse
/// order — the last `sort by` line is the primary key, matching the previous
/// stable sequential sorts). A final `(path, line)` tie-break keeps output
/// deterministic even though `collect_tasks` iterates a HashMap and its
/// input order is not stable across runs.
fn compare_keys(
    a: &TaskSortKey<'_>,
    b: &TaskSortKey<'_>,
    sorts: &[TaskSort],
) -> std::cmp::Ordering {
    if sorts.is_empty() {
        // Default sort: urgency desc, due asc, priority asc, path asc, line asc.
        return b
            .urgency
            .cmp(&a.urgency)
            .then_with(|| opt_date_cmp(&a.due, &b.due))
            .then_with(|| a.priority.cmp(&b.priority))
            .then_with(|| a.path.cmp(b.path))
            .then_with(|| a.line.cmp(&b.line));
    }
    for sort in sorts.iter().rev() {
        let (mut cmp, handled) = field_cmp(a, b, &sort.field, sort.reverse);
        if !handled && sort.reverse {
            cmp = cmp.reverse();
        }
        if cmp != std::cmp::Ordering::Equal {
            return cmp;
        }
    }
    a.path.cmp(b.path).then_with(|| a.line.cmp(&b.line))
}

/// Build the contiguous sort-key buffer (O(N), once per query).
fn build_sort_keys(tasks: &[(String, TaskData)], today: NaiveDate) -> Vec<TaskSortKey<'_>> {
    tasks
        .iter()
        .map(|(path, t)| TaskSortKey::build(path, t, today))
        .collect()
}

/// Apply an index permutation to a slice in place via cycle-following:
/// `order[k]` = source index that belongs at position k. O(N) swaps, one
/// scratch index vector.
fn apply_permutation(tasks: &mut [(String, TaskData)], order: &[usize]) {
    let n = order.len();
    if n < 2 {
        return;
    }
    // inv[old_index] = target position in the sorted layout. order is a
    // permutation, so inv is well-defined.
    let mut inv = vec![0usize; n];
    for (target, &src) in order.iter().enumerate() {
        inv[src] = target;
    }
    for i in 0..n {
        while inv[i] != i {
            let j = inv[i];
            tasks.swap(i, j);
            inv.swap(i, j);
        }
    }
}

/// Sort a task list according to `TaskSort` specifications.
///
/// ADR-045 §2.2 Schwartzian transform: sort fields are pre-evaluated once
/// per task into [`TaskSortKey`]s, then an index permutation is sorted with
/// cheap precomputed-key comparisons — the previous comparator ran
/// `calculate_urgency`, `happens()` and date math on every comparison
/// (O(N log N) recomputations).
///
/// When `limit` is `Some(k)` with `k < n`, applies **top-K selection**
/// (ADR-045 §2.2): `select_nth_unstable_by` partitions in O(N), then only
/// the selected prefix is sorted — O(N + k log k) instead of O(N log N).
/// The partition comparator is a strict total order (see [`compare_keys`]
/// path/line tie-break), which `select_nth_unstable_by` requires.
fn sort_tasks(tasks: &mut Vec<(String, TaskData)>, sorts: &[TaskSort], limit: Option<usize>) {
    let today = chrono::Local::now().date_naive();
    let n = tasks.len();
    let k = limit.map(|k| k.min(n));

    if k == Some(0) {
        tasks.clear();
        return;
    }

    // Phase 1 — pre-evaluate keys (borrowing from the still-stable `tasks`
    // buffer) and order an index permutation with precomputed comparisons.
    let permutation = {
        let keys = build_sort_keys(tasks, today);
        let mut order: Vec<usize> = (0..n).collect();
        let cmp = |&a: &usize, &b: &usize| compare_keys(&keys[a], &keys[b], sorts);
        match k {
            // Top-K: O(N) partial partition, then sort only the winner prefix.
            Some(k) if k < n => {
                order.select_nth_unstable_by(k - 1, cmp);
                order[..k].sort_by(cmp);
            }
            _ => order.sort_by(cmp),
        }
        order
    };
    // Phase 2 — apply the permutation (`order` is a full, valid permutation
    // in both branches: the k winners land in positions 0..k). `keys` is out
    // of scope, so its borrows of `tasks` have ended and elements may move.
    apply_permutation(tasks, &permutation);
    if let Some(k) = k {
        tasks.truncate(k);
    }
}

/// Collect all tasks from the vault, with their source file paths.
///
/// The **only** phase of query execution that reads the vault — callers in
/// the IPC layer scope the vault lock to exactly this call, then drop the
/// lock before running [`execute_collected_tasks`] (ADR-046: queries must
/// not hold `AppState` locks or block the WebView main thread).
pub fn collect_tasks(vault: &Vault) -> Vec<(String, TaskData)> {
    let mut tasks = Vec::new();
    for (node_id, meta) in &vault.graph.metadata_cache {
        let path = vault
            .arena
            .get_string(*node_id)
            .map(|s| s.as_str())
            .unwrap_or("");
        for task in &meta.tasks {
            tasks.push((path.to_string(), task.clone()));
        }
    }
    tasks
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/// Task query: real task data from vault metadata (ADR-048).
///
/// Iterates all documents in the vault, collects tasks, applies
/// filters/sorts/limits, and returns rich task query results.
pub fn execute_task_query(
    vault: &Vault,
    query: Option<&TaskQuery>,
) -> Result<QueryResult, TaskQueryError> {
    execute_collected_tasks(collect_tasks(vault), query)
}

/// Run the full filter → sort → limit → row pipeline against
/// already-collected tasks. Does **not** touch the vault — safe to execute
/// outside any lock (the IPC layer collects under a brief read lock, drops
/// it, then calls this off-thread).
pub fn execute_collected_tasks(
    tasks: Vec<(String, TaskData)>,
    query: Option<&TaskQuery>,
) -> Result<QueryResult, TaskQueryError> {
    let columns = task_columns();
    let mut tasks = tasks;

    // Apply filters.
    if let Some(q) = query {
        for filter in &q.filters {
            tasks.retain(|(path, t)| matches_filter(path, t, filter));
        }
    }

    let total = tasks.len();

    // Sort (+ top-K limit selection in a single pass). `total` stays
    // pre-limit so the "X of Y tasks" footer shows the full match count.
    if let Some(q) = query {
        sort_tasks(&mut tasks, &q.sorts, q.limit);
    } else {
        sort_tasks(&mut tasks, &[], None);
    }

    // Build rows.
    let rows: Vec<Vec<TypedValue>> = tasks
        .iter()
        .map(|(path, task)| task_to_row(task, path))
        .collect();

    Ok(QueryResult {
        columns,
        rows,
        total,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use basalt_types::{TaskPriority, TaskStatus};

    fn task(status: TaskStatus, priority: TaskPriority) -> TaskData {
        TaskData {
            line: 1,
            description: "test task".to_string(),
            status,
            priority,
            created: None,
            scheduled: None,
            start: None,
            due: None,
            done: None,
            cancelled: None,
            recurrence: None,
            recurrence_when_done: false,
            tags: vec![],
            id: None,
            depends_on: vec![],
            on_completion: None,
            span_start: 0,
            span_end: 20,
        }
    }

    #[test]
    fn status_matches_use_snake_case_wire_names() {
        // The old Debug-derived matching made these never match.
        let in_progress = task(TaskStatus::InProgress, TaskPriority::None);
        let on_hold = task(TaskStatus::OnHold, TaskPriority::None);

        let f = |op: &str, value: &str| TaskFilter {
            field: "status".into(),
            op: op.into(),
            value: value.into(),
        };
        assert!(matches_filter("n.md", &in_progress, &f("equals", "in_progress")));
        assert!(matches_filter("n.md", &in_progress, &f("equals", "in progress")));
        assert!(matches_filter("n.md", &on_hold, &f("equals", "on_hold")));
        assert!(matches_filter("n.md", &on_hold, &f("equals", "on hold")));
        assert!(!matches_filter("n.md", &in_progress, &f("equals", "on_hold")));
    }

    #[test]
    fn not_done_excludes_cancelled_and_done() {
        let done = task(TaskStatus::Done, TaskPriority::None);
        let cancelled = task(TaskStatus::Cancelled, TaskPriority::None);
        let todo = task(TaskStatus::Todo, TaskPriority::None);
        let in_progress = task(TaskStatus::InProgress, TaskPriority::None);

        let not_done = TaskFilter {
            field: "status".into(),
            op: "not_done".into(),
            value: String::new(),
        };
        let done_filter = TaskFilter {
            field: "status".into(),
            op: "done".into(),
            value: String::new(),
        };
        assert!(matches_filter("n.md", &todo, &not_done));
        assert!(matches_filter("n.md", &in_progress, &not_done));
        assert!(!matches_filter("n.md", &done, &not_done));
        assert!(!matches_filter("n.md", &cancelled, &not_done));
        assert!(matches_filter("n.md", &done, &done_filter));
        assert!(matches_filter("n.md", &cancelled, &done_filter));
    }

    #[test]
    fn priority_above_below_compare_numeric_rank() {
        let high = task(TaskStatus::Todo, TaskPriority::High);
        let low = task(TaskStatus::Todo, TaskPriority::Low);
        let f = |op: &str, value: &str| TaskFilter {
            field: "priority".into(),
            op: op.into(),
            value: value.into(),
        };
        assert!(matches_filter("n.md", &high, &f("above", "medium")));
        assert!(!matches_filter("n.md", &low, &f("above", "medium")));
        assert!(matches_filter("n.md", &low, &f("below", "medium")));
        assert!(matches_filter("n.md", &high, &f("equals", "high")));
    }

    #[test]
    fn happens_sort_keeps_undated_last_in_both_directions() {
        let mut dated = task(TaskStatus::Todo, TaskPriority::None);
        dated.due = NaiveDate::from_ymd_opt(2024, 1, 7);
        let undated = task(TaskStatus::Todo, TaskPriority::None);

        let mut tasks = vec![
            ("undated.md".to_string(), undated),
            ("dated.md".to_string(), dated),
        ];
        let sort = |reverse: bool| vec![TaskSort {
            field: "happens".into(),
            reverse,
        }];
        sort_tasks(&mut tasks, &sort(false), None);
        assert_eq!(tasks[0].0, "dated.md");
        assert_eq!(tasks[1].0, "undated.md");
        sort_tasks(&mut tasks, &sort(true), None);
        assert_eq!(tasks[0].0, "dated.md");
        assert_eq!(tasks[1].0, "undated.md");
    }

    #[test]
    fn status_sort_uses_wire_names() {
        let mut tasks = vec![
            ("on_hold.md".to_string(), task(TaskStatus::OnHold, TaskPriority::None)),
            ("todo.md".to_string(), task(TaskStatus::Todo, TaskPriority::None)),
            ("in_progress.md".to_string(), task(TaskStatus::InProgress, TaskPriority::None)),
        ];
        sort_tasks(
            &mut tasks,
            &[TaskSort {
                field: "status".into(),
                reverse: false,
            }],
            None,
        );
        let names: Vec<&str> = tasks.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(names, vec!["in_progress.md", "on_hold.md", "todo.md"]);
    }

    #[test]
    fn top_k_matches_full_sort_then_truncate() {
        // Build 8 tasks with distinct urgency (highest priority + overdue = high urgency,
        // lowest priority + no date = low urgency). sort_tasks with limit=3 must return
        // the same top 3 as a full sort followed by truncate(3).
        let today = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let overdue = NaiveDate::from_ymd_opt(2024, 1, 10).unwrap();
        let soon = NaiveDate::from_ymd_opt(2024, 1, 18).unwrap();

        let mut tasks = vec![
            ("c.md".to_string(), task(TaskStatus::Todo, TaskPriority::Low)),
            ("a.md".to_string(), task(TaskStatus::Todo, TaskPriority::Highest)),
            ("f.md".to_string(), task(TaskStatus::Done, TaskPriority::None)),
            ("d.md".to_string(), task(TaskStatus::Todo, TaskPriority::Medium)),
            ("b.md".to_string(), task(TaskStatus::Todo, TaskPriority::High)),
            ("g.md".to_string(), task(TaskStatus::Todo, TaskPriority::Lowest)),
            ("e.md".to_string(), task(TaskStatus::Todo, TaskPriority::None)),
            ("h.md".to_string(), task(TaskStatus::Todo, TaskPriority::None)),
        ];
        // Assign dates that create a spread of urgency scores.
        tasks[0].1.due = Some(overdue);
        tasks[1].1.due = Some(overdue);
        tasks[2].1.due = Some(overdue);
        tasks[4].1.due = Some(soon);

        // Full sort + truncate(3) for reference.
        let mut expected = tasks.clone();
        sort_tasks(&mut expected, &[], None);
        expected.truncate(3);
        let expected_paths: Vec<&str> = expected.iter().map(|(p, _)| p.as_str()).collect();

        // Top-K selection.
        sort_tasks(&mut tasks, &[], Some(3));
        let topk_paths: Vec<&str> = tasks.iter().map(|(p, _)| p.as_str()).collect();

        assert_eq!(topk_paths, expected_paths, "top-k must match full sort + truncate");
    }

    #[test]
    fn tags_filter_matches_with_or_without_hash() {
        let mut t = task(TaskStatus::Todo, TaskPriority::None);
        t.tags = vec!["work".to_string(), "project/alpha".to_string()];
        let f = |value: &str| TaskFilter {
            field: "tags".into(),
            op: "includes".into(),
            value: value.into(),
        };
        assert!(matches_filter("n.md", &t, &f("work")));
        assert!(matches_filter("n.md", &t, &f("#work")));
        assert!(matches_filter("n.md", &t, &f("project"))); // nested
        assert!(!matches_filter("n.md", &t, &f("urgent")));
    }
}