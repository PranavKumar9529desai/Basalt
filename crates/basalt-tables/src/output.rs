use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use basalt_parser::query::{CompareOp, Expr, Literal, QueryPlan};
use basalt_types::{QueryColumn, QueryColumnType, QueryResult, TaskData, TypedValue};
use basalt_vault::Vault;

use crate::engine::{DqlError, WorkRow};
use crate::expr::eval_to_typed;
use crate::page_row::PageRow;
use crate::urgency::calculate_urgency;

// ---------------------------------------------------------------------------
// Task query types (used by line-based task query language and DQL TASK)
// ---------------------------------------------------------------------------

/// A single filter predicate for task queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFilter {
    /// Field to filter on: "status", "due", "priority", "description",
    /// "tags", "path", "recurrence", "scheduled", "start", "happens".
    pub field: String,
    /// Comparison operator: "equals", "not_equals", "before", "after",
    /// "on_or_before", "on_or_after", "includes", "is_empty", "exists".
    pub op: String,
    /// Filter value (string representation; dates as YYYY-MM-DD).
    pub value: String,
}

/// Sort specification for task queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSort {
    /// Field to sort by: "due", "priority", "urgency", "status",
    /// "description", "path", "scheduled", "start", "happens", "created".
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
// DQL TABLE/LIST output (unchanged)
// ---------------------------------------------------------------------------

/// Table query: render user-specified fields as columns.
pub(crate) fn execute_table_query(
    plan: &QueryPlan,
    rows: &[WorkRow],
    total: usize,
) -> Result<QueryResult, DqlError> {
    let columns = build_columns(plan, rows);
    let data: Vec<Vec<TypedValue>> = rows
        .iter()
        .map(|r| {
            plan.fields
                .iter()
                .map(|f| eval_to_typed(&f.expr, &r.ctx()))
                .collect()
        })
        .collect();
    Ok(QueryResult {
        columns,
        rows: data,
        total,
    })
}

/// List query: single "File" column with a link to each page.
pub(crate) fn execute_list_query(rows: &[WorkRow], total: usize) -> Result<QueryResult, DqlError> {
    let columns = vec![QueryColumn {
        name: "File".to_string(),
        type_: QueryColumnType::Link,
    }];
    let data: Vec<Vec<TypedValue>> = rows
        .iter()
        .map(|r| {
            let p =
                first_page(r).ok_or_else(|| DqlError::Runtime("group must have members".into()))?;
            Ok::<_, DqlError>(link_row(p.name(), &p.path))
        })
        .collect::<Result<_, _>>()?;
    Ok(QueryResult {
        columns,
        rows: data,
        total,
    })
}

// ---------------------------------------------------------------------------
// Task query output (ADR-048)
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
            value: format!("{:?}", task.status).to_lowercase(),
        },
        TypedValue::Text {
            value: format!("{:?}", task.priority).to_lowercase(),
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

/// Apply a single filter predicate to a task. `path` is the source file's
/// vault-relative path (needed for path/folder/filename predicates).
fn matches_filter(path: &str, task: &TaskData, filter: &TaskFilter) -> bool {
    match filter.field.as_str() {
        "status" => {
            let target = filter.value.to_lowercase();
            let status_name = format!("{:?}", task.status).to_lowercase();
            match filter.op.as_str() {
                "equals" => status_name == target,
                "not_equals" => status_name != target,
                _ => false,
            }
        }
        "priority" => {
            let target = filter.value.to_lowercase();
            let priority_name = format!("{:?}", task.priority).to_lowercase();
            match filter.op.as_str() {
                "equals" => priority_name == target,
                "not_equals" => priority_name != target,
                "above" => {
                    // "above X" means numeric rank < X's rank
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
            let name = path
                .rsplit('/')
                .next()
                .unwrap_or(path)
                .trim_end_matches(".md");
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
        (Some(d), "before") | (Some(d), "on_or_before") if op == "before" => d < target,
        (Some(d), "on_or_before") => d <= target,
        (Some(d), "after") | (Some(d), "on_or_after") if op == "after" => d > target,
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
/// BOTH directions (Obsidian Tasks semantics): only the date order flips with
/// `reverse`, never the dated-vs-undated precedence.
fn date_field_cmp(
    a: &Option<NaiveDate>,
    b: &Option<NaiveDate>,
    reverse: bool,
) -> std::cmp::Ordering {
    match (a, b) {
        (Some(x), Some(y)) => {
            let c = x.cmp(y);
            if reverse {
                c.reverse()
            } else {
                c
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
        // Default sort: urgency desc, then due asc, then priority asc, then path asc
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

    // Apply sorts in reverse order (last sort = primary key)
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
                "status" => (
                    format!("{:?}", a.1.status).cmp(&format!("{:?}", b.1.status)),
                    false,
                ),
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
                "happens" => (a.1.happens().cmp(&b.1.happens()), false),
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

/// Task query: real task data from vault metadata (ADR-048).
///
/// Iterates all documents in the vault, collects tasks, applies
/// filters/sorts/limits, and returns rich task query results.
pub fn execute_task_query(
    vault: &Vault,
    query: Option<&TaskQuery>,
) -> Result<QueryResult, DqlError> {
    let columns = task_columns();
    let mut tasks = collect_all_tasks(vault);

    // Apply filters
    if let Some(q) = query {
        for filter in &q.filters {
            tasks.retain(|(path, t)| matches_filter(path, t, filter));
        }
    }

    let total = tasks.len();

    // Apply sorts
    if let Some(q) = query {
        sort_tasks(&mut tasks, &q.sorts);
    } else {
        sort_tasks(&mut tasks, &[]);
    }

    // Apply limit
    if let Some(q) = query {
        if let Some(limit) = q.limit {
            tasks.truncate(limit);
        }
    }

    // Build rows
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Construct a link-typed value for the given name and path.
fn link_row(name: &str, path: &str) -> Vec<TypedValue> {
    vec![TypedValue::Link {
        name: name.to_string(),
        path: path.to_string(),
    }]
}

/// The representative page of a row (first member for a group).
fn first_page(row: &WorkRow) -> Option<&PageRow> {
    match row {
        WorkRow::Page(page) => Some(page),
        WorkRow::Group { members, .. } => members.first(),
    }
}

fn build_columns(plan: &QueryPlan, rows: &[WorkRow]) -> Vec<QueryColumn> {
    if plan.fields.is_empty() {
        // Default: show file link
        return vec![QueryColumn {
            name: "File".to_string(),
            type_: QueryColumnType::Link,
        }];
    }
    plan.fields
        .iter()
        .map(|f| {
            let name = f.alias.clone().unwrap_or_else(|| expr_text(&f.expr));
            // Infer type from first non-null value
            let type_ = rows
                .iter()
                .map(|r| QueryColumnType::from_typed(&eval_to_typed(&f.expr, &r.ctx())))
                .next()
                .unwrap_or(QueryColumnType::Text);
            QueryColumn { name, type_ }
        })
        .collect()
}

/// Render an expression as its column name when no alias is given.
pub(crate) fn expr_text(expr: &Expr) -> String {
    match expr {
        Expr::Field(f) => f.0.join("."),
        Expr::Literal(Literal::Text(s)) => s.clone(),
        Expr::Literal(Literal::Number(n)) => format!("{}", n),
        Expr::Literal(Literal::Bool(b)) => b.to_string(),
        Expr::Literal(Literal::Null) => "null".to_string(),
        Expr::Func { name, args } => {
            let args_s: Vec<String> = args.iter().map(expr_text).collect();
            format!("{}({})", name, args_s.join(", "))
        }
        Expr::Not(inner) => format!("!{}", expr_text(inner)),
        Expr::Comparison { left, op, right } => format!(
            "{} {} {}",
            expr_text(left),
            match op {
                CompareOp::Eq => "=",
                CompareOp::Ne => "!=",
                CompareOp::Lt => "<",
                CompareOp::Gt => ">",
                CompareOp::Le => "<=",
                CompareOp::Ge => ">=",
                CompareOp::Contains => "contains",
            },
            expr_text(right),
        ),
    }
}
