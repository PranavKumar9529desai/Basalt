use basalt_tables::execute_query;
use basalt_vault::Vault;

mod common;
use common::print_result;

// ─── 04 — Edge Cases vault ──────────────────────────────────────────────

fn vault_04() -> Vault {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/num-1.md",
        "---\npriority: 0\nscore: 0\n---\n# Num1\n\nTags: #test\n",
    );
    vault.add_document(
        "notes/num-2.md",
        "---\npriority: 3\nscore: 42\n---\n# Num2\n\nTags: #test\n",
    );
    vault.add_document(
        "notes/num-3.md",
        "---\npriority: 3\nscore: 100\n---\n# Num3\n\nTags: #test\n",
    );
    vault.add_document(
        "notes/str-1.md",
        "---\npriority: \"3\"\n---\n# Str1\n\nTags: #test\n",
    );
    vault.add_document("notes/null-1.md", "---\n---\n# Null1\n\nTags: #test\n");
    vault.add_document("notes/null-2.md", "---\n---\n# Null2\n\nTags: #test\n");
    vault.add_document(
        "notes/single.md",
        "---\npriority: 99\nscore: 50\n---\n# Single\n\nTags: #test\n",
    );
    vault
}

#[test]
fn test_04_aggregate_no_group() {
    let vault = vault_04();
    let r = execute_query(&vault, r#"TABLE count(rows) AS "Should Null" FROM #test"#).unwrap();
    print_result("04 aggregate no group", "", &r);
}

#[test]
fn test_04_null_field_count() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE count(rows.missing) AS "Count" FROM #test GROUP BY file.name"#,
    )
    .unwrap();
    print_result("04 null field count", "", &r);
}

#[test]
fn test_04_null_field_sum() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, sum(rows.missing) AS "Sum" FROM #test GROUP BY file.name"#,
    )
    .unwrap();
    print_result("04 null field sum", "", &r);
}

#[test]
fn test_04_null_field_avg() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, avg(rows.missing) AS "Avg" FROM #test GROUP BY file.name"#,
    )
    .unwrap();
    print_result("04 null field avg", "", &r);
}

#[test]
fn test_04_type_mismatch_group_by() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE priority, count(rows) AS "Count" FROM #test GROUP BY priority"#,
    )
    .unwrap();
    print_result("04 type mismatch", "", &r);
}

#[test]
fn test_04_unknown_aggregate() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE median(rows.priority) AS "Median" FROM #test GROUP BY file.name"#,
    )
    .unwrap();
    print_result("04 unknown aggregate", "", &r);
}

#[test]
fn test_04_group_by_null() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE count(rows) AS "Count" FROM #test GROUP BY missing"#,
    )
    .unwrap();
    print_result("04 group by null", "", &r);
}

#[test]
fn test_04_where_null() {
    let vault = vault_04();
    let r = execute_query(&vault, r#"TABLE file.name FROM #test WHERE missing"#).unwrap();
    print_result("04 where null", "", &r);
}

#[test]
fn test_04_sort_null() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, priority FROM #test SORT priority ASC"#,
    )
    .unwrap();
    print_result("04 sort null", "", &r);
}

#[test]
fn test_04_limit_before_group() {
    let vault = vault_04();
    let r = execute_query(
        &vault,
        r#"TABLE count(rows) AS "Count" FROM #test LIMIT 3 GROUP BY file.name"#,
    )
    .unwrap();
    print_result("04 limit before group", "", &r);
}
