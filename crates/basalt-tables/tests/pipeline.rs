use basalt_tables::execute_query;
use basalt_vault::Vault;

mod common;
use common::print_result;

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
