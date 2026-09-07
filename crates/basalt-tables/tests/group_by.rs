use basalt_tables::execute_query;
use basalt_vault::Vault;

mod common;
use common::print_result;

// ─── 02 — GROUP BY Scenarios vault ──────────────────────────────────────

fn vault_02() -> Vault {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/meeting-2024-01.md",
        "---\nstatus: active\npriority: 5\ndue: 2024-01-15\ncategory: meetings\n---\n# Meeting Jan\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/meeting-2024-03.md",
        "---\nstatus: active\npriority: 3\ndue: 2024-03-01\ncategory: meetings\n---\n# Meeting Mar\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/idea-rust.md",
        "---\nstatus: active\npriority: 7\ndue: 2024-02-10\ncategory: ideas\n---\n# Idea Rust\n\nTags: #personal\n",
    );
    vault.add_document(
        "notes/idea-css.md",
        "---\nstatus: archived\npriority: 2\ndue: 2024-05-20\ncategory: ideas\n---\n# Idea CSS\n\nTags: #personal\n",
    );
    vault.add_document(
        "notes/archive-old.md",
        "---\nstatus: archived\npriority: 1\ndue: 2024-01-05\ncategory: archive\n---\n# Archive Old\n\nTags: #work\n",
    );
    vault
}

#[test]
fn test_02_group_by_text() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE status, count(rows) AS "Count" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("02 group by text", "", &r);
}

#[test]
fn test_02_group_by_date() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE due, count(rows) AS "Count" FROM #work GROUP BY due"#,
    )
    .unwrap();
    print_result("02 group by date", "", &r);
}

#[test]
fn test_02_group_by_alias() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE status AS "Task Status", count(rows) AS "Total" FROM #work GROUP BY status"#,
    )
    .unwrap();
    print_result("02 group by alias", "", &r);
}

#[test]
fn test_02_group_by_sort_key_desc() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE status, count(rows) AS "Count" FROM #work GROUP BY status SORT key DESC"#,
    )
    .unwrap();
    print_result("02 group by sort desc", "", &r);
}

#[test]
fn test_02_group_by_sort_key_asc() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE status, count(rows) AS "Count" FROM #work GROUP BY status SORT key ASC"#,
    )
    .unwrap();
    print_result("02 group by sort asc", "", &r);
}

#[test]
fn test_02_group_by_limit() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE status, count(rows) AS "Count" FROM #work GROUP BY status SORT key DESC LIMIT 1"#,
    )
    .unwrap();
    print_result("02 group by limit", "", &r);
}

#[test]
fn test_02_group_by_computed() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE key, count(rows) AS "Count" FROM #work GROUP BY (length(tags))"#,
    )
    .unwrap();
    print_result("02 group by computed", "", &r);
}

#[test]
fn test_02_group_by_numeric() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE priority, count(rows) AS "Count" FROM #work GROUP BY priority"#,
    )
    .unwrap();
    print_result("02 group by numeric", "", &r);
}

#[test]
fn test_02_group_by_category() {
    let vault = vault_02();
    let r = execute_query(
        &vault,
        r#"TABLE category, count(rows) AS "Count" FROM #work GROUP BY category"#,
    )
    .unwrap();
    print_result("02 group by category", "", &r);
}

#[test]
fn test_02_group_by_sum_sort() {
    let vault = vault_02();
    // SORT by the field name, not the alias
    let r = execute_query(&vault, r#"TABLE category, sum(rows.priority) AS "Total Priority" FROM #work GROUP BY category SORT category DESC"#).unwrap();
    print_result("02 group by sum sort", "", &r);
}
