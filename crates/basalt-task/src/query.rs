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

/// Sort a task list according to `TaskSort` specifications.
fn sort_tasks(tasks: &mut [(String, TaskData)], sorts: &[TaskSort]) {
    if sorts.is_empty() {
        // Default sort: urgency desc, then due asc, then priority asc, then path asc.
        let today = chrono::Local::now().date_naive();
        tasks.sort_by(|a, b| {
            let urg_a = calculate_urgency(&a.1, today);
            let urg_b = calculate_urgency(&b.1, today);
            urg_b
                .cmp(&urg_a)
                .then_with(|| opt_date_cmp(&a.1.due, &b.1.due))
                .then_with(|| a.1.priority.numeric().cmp(&b.1.priority.numeric()))
                .then_with(|| a.0.cmp(&b.0))
        });
        return;
    }

    // Apply sorts in reverse order (last sort = primary key).
    for sort in sorts.iter().rev() {
        let today = chrono::Local::now().date_naive();
        tasks.sort_by(|a, b| {
            // Each arm computes its FINAL ordering. Date fields are already
            // direction-aware (`date_field_cmp` keeps undated last in both
            // directions), so they report `reversed: true` and the generic
            // reverse below is skipped for them.
            let (cmp, reversed) = match sort.field.as_str() {
                "urgency" => (
                    calculate_urgency(&a.1, today).cmp(&calculate_urgency(&b.1, today)),
                    false,
                ),
                "due" => (date_field_cmp(&a.1.due, &b.1.due, sort.reverse), true),
                "priority" => (a.1.priority.numeric().cmp(&b.1.priority.numeric()), false),
                "status" => (a.1.status.name().cmp(b.1.status.name()), false),
                "description" => (a.1.description.cmp(&b.1.description), false),
                "path" => (a.0.cmp(&b.0), false),
                "scheduled" => (
                    date_field_cmp(&a.1.scheduled, &b.1.scheduled, sort.reverse),
                    true,
                ),
                "start" => (date_field_cmp(&a.1.start, &b.1.start, sort.reverse), true),
                "created" => (
                    date_field_cmp(&a.1.created, &b.1.created, sort.reverse),
                    true,
                ),
                "happens" => (
                    date_field_cmp(&a.1.happens(), &b.1.happens(), sort.reverse),
                    true,
                ),
                "line" => (a.1.line.cmp(&b.1.line), false),
                _ => (std::cmp::Ordering::Equal, false),
            };
            if !reversed && sort.reverse {
                cmp.reverse()
            } else {
                cmp
            }
        });
    }
}

/// Collect all tasks from the vault, with their source file paths.
fn collect_all_tasks(vault: &Vault) -> Vec<(String, TaskData)> {
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
    let columns = task_columns();
    let mut tasks = collect_all_tasks(vault);

    // Apply filters.
    if let Some(q) = query {
        for filter in &q.filters {
            tasks.retain(|(path, t)| matches_filter(path, t, filter));
        }
    }

    let total = tasks.len();

    // Apply sorts.
    if let Some(q) = query {
        sort_tasks(&mut tasks, &q.sorts);
    } else {
        sort_tasks(&mut tasks, &[]);
    }

    // Apply limit.
    if let Some(q) = query {
        if let Some(limit) = q.limit {
            tasks.truncate(limit);
        }
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
        sort_tasks(&mut tasks, &sort(false));
        assert_eq!(tasks[0].0, "dated.md");
        assert_eq!(tasks[1].0, "undated.md");
        sort_tasks(&mut tasks, &sort(true));
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
        );
        let names: Vec<&str> = tasks.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(names, vec!["in_progress.md", "on_hold.md", "todo.md"]);
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