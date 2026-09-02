use basalt_tables::execute_query;
use basalt_types::{QueryResult, TypedValue};
use basalt_vault::Vault;

fn vault_with_docs() -> Vault {
    let mut vault = Vault::new();
    vault.add_document("notes/alpha.md", "# Alpha\n\nTags: #work\n");
    vault.add_document("notes/beta.md", "# Beta\n\nTags: #personal\n");
    vault.add_document("other/gamma.md", "# Gamma\n\nTags: #work\n");
    vault
}

fn assert_total(result: &QueryResult, expected: usize) {
    assert_eq!(result.total, expected, "total mismatch");
}

#[test]
fn table_query_returns_all_pages_and_columns() {
    let vault = vault_with_docs();
    let result = execute_query(&vault, "TABLE file.name FROM #work").unwrap();
    assert_total(&result, 2);
    assert_eq!(result.rows.len(), 2);
    let names: Vec<&str> = result
        .rows
        .iter()
        .map(|r| match &r[0] {
            TypedValue::Text { value } => value.as_str(),
            _ => "",
        })
        .collect();
    assert!(names.contains(&"alpha"));
    assert!(names.contains(&"gamma"));
}

#[test]
fn list_query_returns_file_links() {
    let vault = vault_with_docs();
    let result = execute_query(&vault, "LIST FROM #work").unwrap();
    assert_total(&result, 2);
    assert_eq!(result.columns[0].name, "File");
    let links: Vec<&TypedValue> = result.rows.iter().map(|r| &r[0]).collect();
    assert!(links.iter().all(|v| matches!(v, TypedValue::Link { .. })));
}

#[test]
fn limit_clause_truncates_rows_but_keeps_total() {
    let vault = vault_with_docs();
    let result = execute_query(&vault, "LIST LIMIT 1").unwrap();
    assert_total(&result, 3);
    assert_eq!(result.rows.len(), 1);
}

#[test]
fn sort_orders_by_field() {
    let vault = vault_with_docs();
    let asc = execute_query(&vault, "TABLE file.name FROM #work SORT file.name ASC")
        .unwrap();
    let names: Vec<&str> = asc
        .rows
        .iter()
        .map(|r| match &r[0] {
            TypedValue::Text { value } => value.as_str(),
            _ => "",
        })
        .collect();
    assert_eq!(names, vec!["alpha", "gamma"]);
}

#[test]
fn where_contains_filters_pages() {
    let vault = vault_with_docs();
    let result = execute_query(
        &vault,
        r#"TABLE file.name WHERE contains(file.name, "alpha")"#,
    )
    .unwrap();
    assert_total(&result, 1);
    assert_eq!(result.rows.len(), 1);
    match &result.rows[0][0] {
        TypedValue::Text { value } => assert_eq!(value, "alpha"),
        other => panic!("expected Text, got {:?}", other),
    }
}
#[test]
fn malformed_query_returns_error() {
    let vault = vault_with_docs();
    assert!(execute_query(&vault, "NOT A VALID QUERY").is_err());
}