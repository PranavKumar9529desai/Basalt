use basalt_tables::execute_query;
use basalt_vault::Vault;

mod common;
use common::print_result;

// ─── 03 — FLATTEN Complex vault ─────────────────────────────────────────

fn vault_03() -> Vault {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/doc-a.md",
        "---\npriority: 5\nlabels: [rust, nom]\nscore: 85\n---\n# Doc A\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/doc-b.md",
        "---\npriority: 3\nlabels: [rust]\nscore: 92\n---\n# Doc B\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/doc-c.md",
        "---\npriority: 7\nlabels: [python, data]\nscore: 78\n---\n# Doc C\n\nTags: #personal\n",
    );
    vault.add_document(
        "notes/doc-d.md",
        "---\npriority: 2\nlabels: []\n---\n# Doc D\n\nTags: #work\n",
    );
    vault
}

#[test]
fn test_03_flatten_alias() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, weight FROM #work FLATTEN priority AS "weight""#,
    )
    .unwrap();
    print_result("03 flatten alias", "", &r);
}

#[test]
fn test_03_flatten_length() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, tag_count FROM #work FLATTEN length(labels) AS "tag_count""#,
    )
    .unwrap();
    print_result("03 flatten length", "", &r);
}

#[test]
fn test_03_flatten_no_alias() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, length(labels) FROM #work FLATTEN length(labels)"#,
    )
    .unwrap();
    print_result("03 flatten no alias", "", &r);
}

#[test]
fn test_03_flatten_comparison() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, high FROM #work FLATTEN (priority > 4) AS "high""#,
    )
    .unwrap();
    print_result("03 flatten comparison", "", &r);
}

#[test]
fn test_03_flatten_where() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name FROM #work FLATTEN length(labels) AS "tag_count" WHERE tag_count > 1"#,
    )
    .unwrap();
    print_result("03 flatten where", "", &r);
}

#[test]
fn test_03_flatten_group_by() {
    let vault = vault_03();
    let r = execute_query(&vault, r#"TABLE tag_count, count(rows) AS "Count" FROM #work FLATTEN length(labels) AS "tag_count" GROUP BY tag_count"#).unwrap();
    print_result("03 flatten group by", "", &r);
}

#[test]
fn test_03_flatten_group_by_aggregates() {
    let vault = vault_03();
    let r = execute_query(&vault, r#"TABLE tag_count, count(rows) AS "Count", sum(rows.score) AS "Sum Score", avg(rows.score) AS "Avg Score", min(rows.score) AS "Min Score", max(rows.score) AS "Max Score" FROM #work FLATTEN length(labels) AS "tag_count" GROUP BY tag_count"#).unwrap();
    print_result("03 flatten group by agg", "", &r);
}

#[test]
fn test_03_list_flatten() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE label FROM #work FLATTEN labels AS "label""#,
    )
    .unwrap();
    print_result("03 list flatten", "", &r);
}

#[test]
fn test_03_list_flatten_group_count() {
    let vault = vault_03();
    let r = execute_query(&vault, r#"TABLE label, count(rows) AS "Notes" FROM #work FLATTEN labels AS "label" GROUP BY label"#).unwrap();
    print_result("03 list flatten group", "", &r);
}

#[test]
fn test_03_list_flatten_group_sum() {
    let vault = vault_03();
    let r = execute_query(&vault, r#"TABLE label, sum(rows.score) AS "Total Score" FROM #work FLATTEN labels AS "label" GROUP BY label"#).unwrap();
    print_result("03 list flatten group sum", "", &r);
}

#[test]
fn test_03_multi_flatten() {
    let vault = vault_03();
    let r = execute_query(&vault, r#"TABLE file.name, tag_count, high FROM #work FLATTEN length(labels) AS "tag_count" FLATTEN (priority > 4) AS "high""#).unwrap();
    print_result("03 multi flatten", "", &r);
}

#[test]
fn test_03_flatten_where_sort() {
    let vault = vault_03();
    let r = execute_query(&vault, r#"TABLE file.name, score, weight FROM #work FLATTEN priority AS "weight" WHERE weight > 3 SORT score DESC"#).unwrap();
    print_result("03 flatten where sort", "", &r);
}

#[test]
fn test_03_empty_list_flatten() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name, label FROM #work FLATTEN labels AS "label" WHERE file.name = "doc-d""#,
    )
    .unwrap();
    print_result("03 empty list flatten", "", &r);
}

#[test]
fn test_03_flatten_contains_where() {
    let vault = vault_03();
    let r = execute_query(
        &vault,
        r#"TABLE file.name FROM #work FLATTEN labels AS "label" WHERE contains(label, "rust")"#,
    )
    .unwrap();
    print_result("03 flatten contains", "", &r);
}
