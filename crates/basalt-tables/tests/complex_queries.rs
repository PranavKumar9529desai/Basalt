use basalt_tables::execute_query;
use basalt_types::{QueryResult, TypedValue};
use basalt_vault::Vault;

fn row_str(v: &TypedValue) -> String {
    match v {
        TypedValue::Text { value } => value.clone(),
        TypedValue::Number { value } => format!("{:?}", value),
        TypedValue::Checkbox { value } => format!("{}", value),
        TypedValue::Link { name, .. } => name.clone(),
        TypedValue::Null => "null".into(),
        TypedValue::Date { value } => value.clone(),
        TypedValue::DateTime { value } => value.clone(),
        TypedValue::List { items } => {
            let parts: Vec<String> = items.iter().map(row_str).collect();
            format!("[{}]", parts.join(", "))
        }
    }
}

fn print_result(label: &str, dql: &str, result: &QueryResult) {
    let cols: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
    println!("  Q: {}", dql);
    println!("  cols: {:?}", cols);
    for row in &result.rows {
        let cells: Vec<String> = row.iter().map(row_str).collect();
        println!("  row: {:?}", cells);
    }
    println!("  total={}, shown={}", result.total, result.rows.len());
    println!();
}

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

// ─── 05 — Full Pipeline vault ───────────────────────────────────────────

fn vault_05() -> Vault {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/inbox/readme.md",
        "---\n---\n# Readme\n\nTags: #inbox\n",
    );
    vault.add_document(
        "notes/inbox/ideas.md",
        "---\nstatus: draft\npriority: 3\ndue: 2024-02-01\ntags_list: [rust, parser]\n---\n# Ideas\n\nTags: #inbox\n",
    );
    vault.add_document(
        "notes/work/project-alpha.md",
        "---\nstatus: active\npriority: 5\ndue: 2024-01-15\ntags_list: [rust, ui]\n---\n# Alpha\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/work/project-beta.md",
        "---\nstatus: active\npriority: 8\ndue: 2024-01-20\ntags_list: [rust, testing]\n---\n# Beta\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/work/project-gamma.md",
        "---\nstatus: done\npriority: 2\ndue: 2023-12-01\ntags_list: [python]\n---\n# Gamma\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/work/project-delta.md",
        "---\nstatus: active\npriority: 4\ndue: 2024-03-10\ntags_list: [rust]\n---\n# Delta\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/work/project-epsilon.md",
        "---\nstatus: done\npriority: 6\ndue: 2024-02-28\ntags_list: [rust, ui, testing]\n---\n# Epsilon\n\nTags: #work\n",
    );
    vault.add_document(
        "notes/personal/journal-2024.md",
        "---\nstatus: active\npriority: 1\ndue: 2024-01-01\n---\n# Journal\n\nTags: #personal\n",
    );
    vault.add_document(
        "notes/personal/reading-list.md",
        "---\nstatus: draft\npriority: 3\ndue: 2024-04-15\ntags_list: [books]\n---\n# Reading\n\nTags: #personal\n",
    );
    vault
}

#[test]
fn test_05_notes_per_tag() {
    let vault = vault_05();
    let r = execute_query(
        &vault,
        r#"TABLE count(rows) AS "Notes" GROUP BY file.tags SORT key DESC"#,
    )
    .unwrap();
    print_result("05 notes per tag", "", &r);
}

#[test]
fn test_05_active_work() {
    let vault = vault_05();
    // Single WHERE comparison only (no AND)
    let r = execute_query(
        &vault,
        r#"TABLE file.name, priority FROM #work WHERE status = "active" SORT priority DESC"#,
    )
    .unwrap();
    print_result("05 active work", "", &r);
}

#[test]
fn test_05_status_breakdown() {
    let vault = vault_05();
    // min(rows.due) returns null for dates — known limitation
    let r = execute_query(&vault, r#"TABLE status, count(rows) AS "Count", avg(rows.priority) AS "Avg Priority" FROM #work GROUP BY status"#).unwrap();
    print_result("05 status breakdown", "", &r);
}

#[test]
fn test_05_top_priority_status() {
    let vault = vault_05();
    // Sort by key, not alias
    let r = execute_query(&vault, r#"TABLE status, sum(rows.priority) AS "Total" FROM #work GROUP BY status SORT key DESC LIMIT 1"#).unwrap();
    print_result("05 top priority", "", &r);
}

#[test]
fn test_05_tag_frequency() {
    let vault = vault_05();
    // Sort by key, not alias
    let r = execute_query(&vault, r#"TABLE tag, count(rows) AS "Notes" FROM #work FLATTEN tags_list AS "tag" GROUP BY tag SORT key DESC"#).unwrap();
    print_result("05 tag frequency", "", &r);
}

#[test]
fn test_05_multi_tag_notes() {
    let vault = vault_05();
    let r = execute_query(&vault, r#"TABLE file.name, tag_count FROM #work FLATTEN length(tags_list) AS "tag_count" WHERE tag_count > 1 SORT tag_count DESC"#).unwrap();
    print_result("05 multi tag", "", &r);
}

#[test]
fn test_05_full_pipeline() {
    let vault = vault_05();
    // Sort by key
    let r = execute_query(&vault, r#"TABLE tag, count(rows) AS "Count", avg(rows.priority) AS "Avg Priority" FROM #work WHERE status = "active" FLATTEN tags_list AS "tag" GROUP BY tag SORT key DESC"#).unwrap();
    print_result("05 full pipeline", "", &r);
}

#[test]
fn test_05_notes_per_folder() {
    let vault = vault_05();
    // Sort by key
    let r = execute_query(&vault, r#"TABLE folder, count(rows) AS "Total", avg(rows.priority) AS "Avg Priority" FROM #work GROUP BY folder SORT key DESC"#).unwrap();
    print_result("05 per folder", "", &r);
}

#[test]
fn test_05_group_where_count() {
    let vault = vault_05();
    let r = execute_query(&vault, r#"TABLE tag, count(rows) AS "Count" FROM #work FLATTEN tags_list AS "tag" GROUP BY tag WHERE count(rows) > 1"#).unwrap();
    print_result("05 group where count", "", &r);
}

#[test]
fn test_05_cross_tag_summary() {
    let vault = vault_05();
    // Sort by key
    let r = execute_query(&vault, r#"TABLE tag, count(rows) AS "Count", sum(rows.priority) AS "Total Priority", avg(rows.priority) AS "Avg Priority", min(rows.priority) AS "Min Priority", max(rows.priority) AS "Max Priority" FROM #work FLATTEN tags_list AS "tag" GROUP BY tag SORT key DESC"#).unwrap();
    print_result("05 cross tag", "", &r);
}

#[test]
fn test_05_top3_tags() {
    let vault = vault_05();
    // Sort by key
    let r = execute_query(&vault, r#"TABLE tag, count(rows) AS "Count" FROM #work FLATTEN tags_list AS "tag" GROUP BY tag SORT key DESC LIMIT 3"#).unwrap();
    print_result("05 top3 tags", "", &r);
}
