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
fn vault_with_frontmatter() -> Vault {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/a.md",
        "---\nstatus: todo\npriority: 2\ncomplete: true\n---\n# A\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/b.md",
        "---\nstatus: todo\npriority: 4\ncomplete: false\n---\n# B\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/c.md",
        "---\nstatus: done\npriority: 1\ncomplete: true\n---\n# C\n\nTags: #work\n",
    );
    vault
}

fn row_label(v: &TypedValue) -> &str {
    match v {
        TypedValue::Text { value } => value.as_str(),
        TypedValue::Link { name, .. } => name.as_str(),
        _ => "",
    }
}

fn rows_names(result: &QueryResult) -> Vec<&str> {
    result.rows.iter().map(|r| row_label(&r[0])).collect()
}

    #[test]
    fn group_by_count_rows() {
        let vault = vault_with_frontmatter();
        let result = execute_query(&vault, "TABLE status, count(rows) FROM #work GROUP BY status")
            .unwrap();
        assert_total(&result, 2);
        assert_eq!(result.rows.len(), 2);
        // todo (a, b) -> 2, done (c) -> 1, in either group order.
        let counts: Vec<f64> = result
            .rows
            .iter()
            .map(|r| match &r[1] {
                TypedValue::Number { value } => *value,
                other => panic!("expected number, got {:?}", other),
            })
            .collect();
        assert!(counts.contains(&2.0));
        assert!(counts.contains(&1.0));
    }

    #[test]
    fn group_by_count_field_counts_non_null() {
        // `complete` is absent on d, so it is not counted.
        let mut vault = vault_with_frontmatter();
        vault.add_document("notes/d.md", "---\nstatus: todo\n---\n# D\n\nTags: #work\n");
        let result = execute_query(
            &vault,
            r#"TABLE status, count(rows.complete) FROM #work GROUP BY status"#,
        )
        .unwrap();
        assert_total(&result, 2);
        // todo: a(true), b(false), d(missing) -> 2 non-null; done: c -> 1.
        let counts: Vec<f64> = result
            .rows
            .iter()
            .map(|r| match &r[1] {
                TypedValue::Number { value } => *value,
                other => panic!("expected number, got {:?}", other),
            })
            .collect();
        assert!(counts.contains(&2.0));
        assert!(counts.contains(&1.0));
    }

#[test]
fn group_by_bare_and_rows_prefixed_fields_agree() {
    let vault = vault_with_frontmatter();
    let bare =
        execute_query(&vault, "TABLE status, count(complete) FROM #work GROUP BY status").unwrap();
    let rows_prefixed = execute_query(
        &vault,
        "TABLE status, count(rows.complete) FROM #work GROUP BY status",
    )
    .unwrap();
    assert_eq!(bare.rows[0][1], rows_prefixed.rows[0][1]);
    assert_eq!(bare.rows[1][1], rows_prefixed.rows[1][1]);
}

    #[test]
    fn group_by_sum_avg_min_max() {
        let vault = vault_with_frontmatter();
        let result = execute_query(
            &vault,
            r#"TABLE status, sum(rows.priority) AS "sum", avg(rows.priority) AS "avg", min(rows.priority) AS "min", max(rows.priority) AS "max" FROM #work GROUP BY status"#,
        )
        .unwrap();
        let todo = result
            .rows
            .iter()
            .find(|r| r[0] == TypedValue::Text { value: "todo".into() })
            .unwrap();
        let done = result
            .rows
            .iter()
            .find(|r| r[0] == TypedValue::Text { value: "done".into() })
            .unwrap();
        // todo: priorities 2, 4 -> sum 6, avg 3, min 2, max 4
        assert_eq!(todo[1], TypedValue::Number { value: 6.0 });
        assert_eq!(todo[2], TypedValue::Number { value: 3.0 });
        assert_eq!(todo[3], TypedValue::Number { value: 2.0 });
        assert_eq!(todo[4], TypedValue::Number { value: 4.0 });
        // done: priority 1
        assert_eq!(done[1], TypedValue::Number { value: 1.0 });
        assert_eq!(done[2], TypedValue::Number { value: 1.0 });
    }

#[test]
fn group_by_then_sort_orders_by_group_key() {
    let vault = vault_with_frontmatter();
    let result = execute_query(
        &vault,
        "TABLE status, count(rows) FROM #work GROUP BY status SORT key DESC",
    )
    .unwrap();
    // Alphabetically "todo" > "done", so DESC sorts todo first.
    assert_eq!(result.rows[0][0], TypedValue::Text { value: "todo".into() });
    assert_eq!(result.rows[1][0], TypedValue::Text { value: "done".into() });
}
#[test]
fn commands_execute_in_written_order() {
    let vault = vault_with_docs();
    // LIMIT 2 runs first (leaves alpha, beta), then DESC sort -> beta, alpha.
    let limited_first = execute_query(&vault, "LIST LIMIT 2 SORT file.name DESC").unwrap();
    assert_total(&limited_first, 3);
    assert_eq!(limited_first.rows.len(), 2);
    assert_eq!(rows_names(&limited_first), vec!["beta", "alpha"]);

    // Control: sort first, then limit -> gamma, beta.
    let sorted_first = execute_query(&vault, "LIST SORT file.name DESC LIMIT 2").unwrap();
    assert_eq!(rows_names(&sorted_first), vec!["gamma", "beta"]);
}

#[test]
fn where_bare_checkbox_filters_by_truthiness() {
    let vault = vault_with_frontmatter();
    let result = execute_query(&vault, "TABLE file.name WHERE complete").unwrap();
    assert_total(&result, 2);
    let names = rows_names(&result);
    assert!(names.contains(&"a"));
    assert!(names.contains(&"c"));
}

#[test]
fn aggregate_without_group_by_is_null() {
    let vault = vault_with_frontmatter();
    let result = execute_query(&vault, "TABLE count(rows) FROM #work").unwrap();
    assert_eq!(result.rows[0][0], TypedValue::Null);
}

#[test]
fn group_by_iso_date() {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/a.md",
        "---\ndue: 2024-01-15\n---\n# A\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/b.md",
        "---\ndue: 2024-01-15\n---\n# B\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/c.md",
        "---\ndue: 2024-03-01\n---\n# C\n\nTags: #work\n",
    );
    let result = execute_query(&vault, "TABLE due, count(rows) FROM #work GROUP BY due").unwrap();
    assert_total(&result, 2);
    let counts: Vec<f64> = result
        .rows
        .iter()
        .map(|r| match &r[1] {
            TypedValue::Number { value } => *value,
            other => panic!("expected number, got {:?}", other),
        })
        .collect();
    assert!(counts.contains(&2.0));
    assert!(counts.contains(&1.0));
    // Both columns resolve to date-typed values.
    assert!(result.rows.iter().all(|r| matches!(r[0], TypedValue::Date { .. })));
}

#[test]
fn sort_by_iso_date_ascending() {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/a.md",
        "---\ndue: 2024-03-01\n---\n# A\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/b.md",
        "---\ndue: 2024-01-15\n---\n# B\n\nTags: #work\n",
    );
    let result =
        execute_query(&vault, "TABLE file.name FROM #work SORT due ASC").unwrap();
    assert_eq!(rows_names(&result), vec!["b", "a"]);
}