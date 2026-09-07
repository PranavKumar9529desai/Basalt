use basalt_tables::execute_query;
use basalt_vault::Vault;

mod common;
use common::print_result;

// ─── 01 — Aggregation Functions vault ───────────────────────────────────

fn vault_01() -> Vault {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/project-alpha.md",
        "---\nstatus: active\npriority: 5\nrating: 4.5\ncomplete: true\n---\n# Alpha\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/project-beta.md",
        "---\nstatus: active\npriority: 3\nrating: 3.0\ncomplete: false\n---\n# Beta\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/project-gamma.md",
        "---\nstatus: archived\npriority: 8\nrating: 4.0\ncomplete: true\n---\n# Gamma\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/project-delta.md",
        "---\nstatus: active\n---\n# Delta\n\nTags: #work\n",
    );
    vault
}

#[test]
fn test_01_count_rows() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, count(rows) AS "Count" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 count(rows)", "", &r);
}

#[test]
fn test_01_count_field() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, count(rows.priority) AS "Non-null" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 count(field)", "", &r);
}

#[test]
fn test_01_count_bare_vs_rows() {
    let vault = vault_01();
    let r = execute_query(&vault, r#"TABLE status, count(rows.complete) AS "with_rows", count(complete) AS "bare" FROM #work GROUP BY status"#).unwrap();
    print_result("01 count bare vs rows", "", &r);
}

#[test]
fn test_01_length_rows() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, length(rows) AS "Len" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 length(rows)", "", &r);
}

#[test]
fn test_01_length_field() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, length(rows.rating) AS "Rated" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 length(field)", "", &r);
}

#[test]
fn test_01_sum() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, sum(rows.priority) AS "Sum" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 sum", "", &r);
}

#[test]
fn test_01_avg() {
    let vault = vault_01();
    let r = execute_query(&vault, r#"TABLE status, avg(rows.rating) AS "Avg", average(rows.rating) AS "Avg2" FROM #work GROUP BY status"#).unwrap();
    print_result("01 avg", "", &r);
}

#[test]
fn test_01_min() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, min(rows.priority) AS "Min" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 min", "", &r);
}

#[test]
fn test_01_max() {
    let vault = vault_01();
    let r = execute_query(
        &vault,
        r#"TABLE status, max(rows.priority) AS "Max" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("01 max", "", &r);
}

#[test]
fn test_01_all_aggregates() {
    let vault = vault_01();
    let r = execute_query(&vault, r#"TABLE status, count(rows) AS "Total", count(rows.priority) AS "Have Priority", sum(rows.priority) AS "Sum", avg(rows.priority) AS "Avg", min(rows.priority) AS "Min", max(rows.priority) AS "Max" FROM #work GROUP BY status"#).unwrap();
    print_result("01 all aggregates", "", &r);
}

#[test]
fn test_01_aggregate_without_group_by() {
    let vault = vault_01();
    let r = execute_query(&vault, r#"TABLE count(rows) AS "Should Null" FROM #work"#).unwrap();
    print_result("01 aggregate no group by", "", &r);
}
