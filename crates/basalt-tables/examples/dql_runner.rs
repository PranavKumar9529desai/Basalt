use basalt_tables::execute_query;
use basalt_types::{QueryResult, TypedValue};
use basalt_vault::Vault;

fn populate_vault() -> Vault {
    let mut vault = Vault::new();

    vault.add_document(
        "notes/work/project-alpha.md",
        "---\ntags: [work, projects]\npriority: 3\nstatus: active\n---\n# Project Alpha\n\nCompleted the initial prototype. See [[project-beta]] for follow-up.\n",
    );
    vault.add_document(
        "notes/work/project-beta.md",
        "---\ntags: [work, projects]\npriority: 5\nstatus: active\n---\n# Project Beta\n\nFollow-up to [[project-alpha]]. High priority migration work.\n",
    );
    vault.add_document(
        "notes/personal/journal.md",
        "---\ntags: [personal, journal]\npriority: 1\nstatus: done\n---\n# Weekly Journal\n\nRelaxed week. Read about [[project-alpha]] progress.\n",
    );
    vault.add_document(
        "notes/personal/reading.md",
        "---\ntags: [personal, reading]\npriority: 2\nstatus: active\n---\n# Reading List\n\nBooks to finish before [[project-beta]] ships.\n",
    );
    vault.add_document(
        "archive/old-note.md",
        "---\ntags: [archive]\npriority: 1\nstatus: done\n---\n# Old Note\n\nSuperseded by [[project-alpha]].\n",
    );
    vault.add_document(
        "notes/work/urgent-fix.md",
        "---\ntags: [work, urgent]\npriority: 5\nstatus: active\n---\n# Urgent Fix\n\nCritical bug blocking [[project-beta]] release.\n",
    );

    vault
}

fn print_result(label: &str, dql: &str, result: &QueryResult) {
    let bar = "=".repeat(60);
    println!("\n{}", bar);
    println!("  {}", label);
    println!("  DQL: {}", dql);
    println!("{}", bar);

    let header: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
    println!(
        "  {:<20} {:<20} {:<10}",
        header[0],
        header.get(1).unwrap_or(&""),
        header.get(2).unwrap_or(&"")
    );
    println!(
        "  {:<20} {:<20} {:<10}",
        "-".repeat(20),
        "-".repeat(20),
        "-".repeat(10)
    );

    for row in &result.rows {
        let cells: Vec<String> = row
            .iter()
            .map(|v| match v {
                TypedValue::Text { value } => value.clone(),
                TypedValue::Number { value } => format!("{}", value),
                TypedValue::Checkbox { value } => format!("{}", value),
                TypedValue::Link { name, path } => format!("{} -> {}", name, path),
                TypedValue::Null => "null".to_string(),
                TypedValue::Date { value } => value.clone(),
                TypedValue::List { items } => {
                    let parts: Vec<String> = items.iter().map(|item| match item {
                        TypedValue::Text { value } => value.clone(),
                        TypedValue::Number { value } => format!("{}", value),
                        TypedValue::Checkbox { value } => format!("{}", value),
                        other => format!("{:?}", other),
                    }).collect();
                    parts.join(", ")
                }
            })
            .collect();
        println!(
            "  {:<20} {:<20} {:<10}",
            cells[0],
            cells.get(1).unwrap_or(&String::new()),
            cells.get(2).unwrap_or(&String::new())
        );
    }
    println!("  ({} total, {} shown)", result.total, result.rows.len());
}

fn main() {
    let vault = populate_vault();

    let queries: Vec<(&str, &str)> = vec![
        ("TABLE — all pages", "TABLE file.name"),
        ("LIST — all pages", "LIST"),
        ("TASK — all pages", "TASK"),
        ("FROM #work", "TABLE file.name FROM #work"),
        ("FROM #personal", "TABLE file.name FROM #personal"),
        ("FROM #urgent", "TABLE file.name FROM #urgent"),
        ("FROM notes/work folder", "TABLE file.name FROM \"notes/work\""),
        ("FROM archive folder", "TABLE file.name FROM \"archive\""),
        ("FROM [[project-alpha]]", "TABLE file.name FROM [[project-alpha]]"),
        ("FROM #work AND #urgent", "TABLE file.name FROM #work AND #urgent"),
        ("FROM #work OR #personal", "TABLE file.name FROM #work OR #personal"),
        ("FROM NOT #archive", "TABLE file.name FROM NOT #archive"),
        ("SORT file.name ASC", "TABLE file.name SORT file.name ASC"),
        ("SORT file.name DESC", "TABLE file.name SORT file.name DESC"),
        ("LIMIT 2", "LIST LIMIT 2"),
        ("SORT + LIMIT", "LIST SORT file.name ASC LIMIT 3"),
        ("TABLE with aliases", "TABLE file.name AS \"Title\", file.folder AS \"Folder\""),
        ("FROM #work + SORT + LIMIT", "TABLE file.name FROM #work SORT file.name ASC LIMIT 2"),
        ("FROM #personal + SORT", "LIST FROM #personal SORT file.name DESC"),
        ("COMBINED: FROM + WHERE + SORT + LIMIT", "TABLE file.name FROM #work SORT file.name ASC LIMIT 3"),
        ("GROUP BY status (count per group)", "TABLE status, count(rows) FROM #work GROUP BY status"),
        ("GROUP BY status SORT by key", "TABLE status, count(rows) FROM #work GROUP BY status SORT key ASC"),
        ("FLATTEN priority as p, then GROUP BY", "TABLE p, count(rows) FROM #work FLATTEN priority AS \"p\" GROUP BY p"),
        ("SUM + AVG per status", "TABLE status, sum(rows.priority) AS \"sum\", avg(rows.priority) AS \"avg\" FROM #work GROUP BY status"),
        ("WHERE on numeric field", "TABLE file.name FROM #work WHERE priority > 2"),
    ];

    println!("\nDQL Query Runner — {} queries\n", queries.len());

    let mut passed = 0;
    let mut failed = 0;

    for (label, dql) in &queries {
        match execute_query(&vault, dql) {
            Ok(result) => {
                print_result(label, dql, &result);
                passed += 1;
            }
            Err(e) => {
                println!("\n  ERROR: {} — {}", dql, e);
                failed += 1;
            }
        }
    }

    let bar = "=".repeat(60);
    println!("\n{}", bar);
    println!(
        "  RESULTS: {} passed, {} failed, {} total",
        passed,
        failed,
        queries.len()
    );
    println!("{}\n", bar);
}
