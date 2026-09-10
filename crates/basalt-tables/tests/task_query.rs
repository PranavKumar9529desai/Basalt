//! Integration tests for the task query engine (ADR-048).

use basalt_tables::{execute_query, execute_task_query, TaskFilter, TaskQuery, TaskSort};
use basalt_types::{QueryResult, TypedValue};
use basalt_vault::Vault;

/// Build a vault whose due dates are anchored to *today* so urgency scores
/// are deterministic regardless of when the suite runs.
fn vault_with_tasks(today: chrono::NaiveDate) -> Vault {
    let tomorrow = today + chrono::Duration::days(1);
    let due_today = today.format("%Y-%m-%d").to_string();
    let due_tomorrow = tomorrow.format("%Y-%m-%d").to_string();

    let mut vault = Vault::new();
    vault.add_document(
        "notes/alpha.md",
        &format!(
            "# Alpha\n\n- [ ] Buy groceries 🔼 📅 {due_today}\n- [x] Ship report 🔺\n- [ ] Water plants 🔽\n"
        ),
    );
    vault.add_document(
        "notes/beta.md",
        &format!(
            "# Beta\n\n- [ ] Call dentist 📅 {due_tomorrow}\n- [ ] Plan trip ⏫ 🔁 every week\n"
        ),
    );
    vault
}

fn assert_total(result: &QueryResult, expected: usize) {
    assert_eq!(
        result.total, expected,
        "total mismatch; rows: {:?}",
        result.rows
    );
}

fn first_row_path(row: &[TypedValue]) -> String {
    match &row[0] {
        TypedValue::Link { path, .. } => path.clone(),
        _ => String::new(),
    }
}

fn first_row_desc(row: &[TypedValue]) -> String {
    match &row[1] {
        TypedValue::Text { value } => value.clone(),
        _ => String::new(),
    }
}

fn first_row_status(row: &[TypedValue]) -> String {
    match &row[2] {
        TypedValue::Text { value } => value.clone(),
        _ => String::new(),
    }
}

fn today() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
}

#[test]
fn task_query_returns_all_tasks_across_documents() {
    let vault = vault_with_tasks(today());
    let result = execute_task_query(&vault, None).unwrap();
    assert_total(&result, 5);
    // Columns: File, Description, Status, Priority, Due, Scheduled, Tags, Urgency, Path, Line
    assert_eq!(result.columns.len(), 10);
    let paths: Vec<String> = result.rows.iter().map(|r| first_row_path(r)).collect();
    assert_eq!(
        paths
            .iter()
            .filter(|p| p.as_str() == "notes/alpha.md")
            .count(),
        3
    );
    assert_eq!(
        paths
            .iter()
            .filter(|p| p.as_str() == "notes/beta.md")
            .count(),
        2
    );
}

#[test]
fn task_query_default_sort_is_urgency_desc() {
    let vault = vault_with_tasks(today());
    let result = execute_task_query(&vault, None).unwrap();
    // "Buy groceries" 🔼 + due today → urgency 30, the highest in the set
    assert_eq!(first_row_desc(&result.rows[0]), "Buy groceries");
}

#[test]
fn task_query_filters_by_status() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![TaskFilter {
            field: "status".into(),
            op: "equals".into(),
            value: "done".into(),
        }],
        sorts: vec![],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_total(&result, 1);
    assert_eq!(first_row_status(&result.rows[0]), "done");
    assert_eq!(first_row_desc(&result.rows[0]), "Ship report");
}

#[test]
fn task_query_filters_by_description_contains() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![TaskFilter {
            field: "description".into(),
            op: "includes".into(),
            value: "plant".into(),
        }],
        sorts: vec![],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_total(&result, 1);
    assert_eq!(first_row_desc(&result.rows[0]), "Water plants");
}

#[test]
fn task_query_filters_by_priority() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![TaskFilter {
            field: "priority".into(),
            op: "equals".into(),
            value: "highest".into(),
        }],
        sorts: vec![],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_total(&result, 1);
    assert_eq!(first_row_desc(&result.rows[0]), "Ship report");
}

#[test]
fn task_query_filters_by_due_date_before() {
    let vault = vault_with_tasks(today());
    let tomorrow = (today() + chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let query = TaskQuery {
        filters: vec![TaskFilter {
            field: "due".into(),
            op: "before".into(),
            value: tomorrow,
        }],
        sorts: vec![],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    // Only "Buy groceries" has due < tomorrow
    assert_total(&result, 1);
    assert_eq!(first_row_desc(&result.rows[0]), "Buy groceries");
}

#[test]
fn task_query_filters_by_recurrence_exists() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![TaskFilter {
            field: "recurrence".into(),
            op: "exists".into(),
            value: String::new(),
        }],
        sorts: vec![],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_total(&result, 1);
    assert_eq!(first_row_desc(&result.rows[0]), "Plan trip");
}

#[test]
fn task_query_sorts_by_due_date_ascending() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![],
        sorts: vec![TaskSort {
            field: "due".into(),
            reverse: false,
        }],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_eq!(first_row_desc(&result.rows[0]), "Buy groceries"); // due today
    assert_eq!(first_row_desc(&result.rows[1]), "Call dentist"); // due tomorrow
}

#[test]
fn task_query_sorts_by_due_date_descending() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![],
        sorts: vec![TaskSort {
            field: "due".into(),
            reverse: true,
        }],
        groups: vec![],
        limit: None,
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_eq!(first_row_desc(&result.rows[0]), "Call dentist");
}

#[test]
fn task_query_applies_limit() {
    let vault = vault_with_tasks(today());
    let query = TaskQuery {
        filters: vec![],
        sorts: vec![],
        groups: vec![],
        limit: Some(2),
    };
    let result = execute_task_query(&vault, Some(&query)).unwrap();
    assert_eq!(result.rows.len(), 2);
    assert_total(&result, 5); // total counts before limit
}

#[test]
fn task_query_no_tasks_returns_empty() {
    let mut vault = Vault::new();
    vault.add_document("notes/empty.md", "# Empty\n\nNo tasks here.\n");
    let result = execute_task_query(&vault, None).unwrap();
    assert_total(&result, 0);
    assert!(result.rows.is_empty());
}

#[test]
fn dql_task_query_dispatches_to_task_engine() {
    let vault = vault_with_tasks(today());
    let result = execute_query(&vault, "TASK FROM \"/\"").unwrap();
    assert_total(&result, 5);
    assert_eq!(result.columns.len(), 10);
}