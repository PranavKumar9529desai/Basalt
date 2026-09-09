use std::cmp::Ordering;

use basalt_tables::expr::compare_typed;
use basalt_tables::{execute_query, DqlError, TypedValue};
use basalt_vault::Vault;

#[test]
fn test_edge_case_1_heterogeneous_sort_tiering() {
    let mut vault = Vault::new();
    // Null
    vault.add_document("notes/n1.md", "---\npriority: null\n---\n# N1\n");
    // Checkbox false
    vault.add_document("notes/n2.md", "---\npriority: false\n---\n# N2\n");
    // Checkbox true
    vault.add_document("notes/n3.md", "---\npriority: true\n---\n# N3\n");
    // Number
    vault.add_document("notes/n4.md", "---\npriority: 10\n---\n# N4\n");
    // Date
    vault.add_document("notes/n5.md", "---\npriority: 2024-01-15\n---\n# N5\n");
    // Text
    vault.add_document("notes/n6.md", "---\npriority: \"alpha\"\n---\n# N6\n");
    // Link
    vault.add_document("notes/n7.md", "---\npriority: \"[[Target]]\"\n---\n# N7\n");
    // List
    vault.add_document("notes/n8.md", "---\npriority: [1, 2]\n---\n# N8\n");

    let r = execute_query(&vault, "TABLE file.name, priority SORT priority ASC").unwrap();
    assert_eq!(r.rows.len(), 8);

    // Verify strict tier order: Null < Checkbox(false) < Checkbox(true) < Number < Date < Text < Link < List
    assert_eq!(r.rows[0][0], TypedValue::Text { value: "n1".into() }); // null
    assert_eq!(r.rows[1][0], TypedValue::Text { value: "n2".into() }); // false
    assert_eq!(r.rows[2][0], TypedValue::Text { value: "n3".into() }); // true
    assert_eq!(r.rows[3][0], TypedValue::Text { value: "n4".into() }); // 10
    assert_eq!(r.rows[4][0], TypedValue::Text { value: "n5".into() }); // 2024-01-15
    assert_eq!(r.rows[5][0], TypedValue::Text { value: "n6".into() }); // "alpha"
    assert_eq!(r.rows[6][0], TypedValue::Text { value: "n7".into() }); // [[Target]]
    assert_eq!(r.rows[7][0], TypedValue::Text { value: "n8".into() }); // [1, 2]

    // Verify mathematical transitivity directly across variants
    let variants = vec![
        TypedValue::Null,
        TypedValue::Checkbox { value: false },
        TypedValue::Checkbox { value: true },
        TypedValue::Number { value: 1.0 },
        TypedValue::Number { value: 2.0 },
        TypedValue::Date { value: "2024-01-01".into() },
        TypedValue::DateTime { value: "2024-01-01T12:00:00".into() },
        TypedValue::Text { value: "apple".into() },
        TypedValue::Text { value: "zebra".into() },
        TypedValue::Link { name: "A".into(), path: "A".into() },
        TypedValue::List { items: vec![TypedValue::Number { value: 1.0 }] },
    ];

    for a in &variants {
        for b in &variants {
            for c in &variants {
                let ab = compare_typed(a, b);
                let bc = compare_typed(b, c);
                let ac = compare_typed(a, c);

                if ab == Ordering::Less && bc == Ordering::Less {
                    assert_eq!(ac, Ordering::Less, "Transitivity violation: a < b and b < c but not a < c");
                }
                if ab == Ordering::Equal && bc == Ordering::Equal {
                    assert_eq!(ac, Ordering::Equal, "Transitivity violation: a == b and b == c but not a == c");
                }
            }
        }
    }
}

#[test]
fn test_edge_case_2_three_valued_logic_nulls() {
    let mut vault = Vault::new();
    vault.add_document("notes/has_rating_5.md", "---\nrating: 5\n---\n# Has 5\n");
    vault.add_document("notes/has_rating_2.md", "---\nrating: 2\n---\n# Has 2\n");
    vault.add_document("notes/no_rating.md", "---\nstatus: active\n---\n# Missing\n");

    // WHERE rating > 3: must NOT include note without rating
    let r1 = execute_query(&vault, "TABLE file.name WHERE rating > 3").unwrap();
    assert_eq!(r1.rows.len(), 1);
    assert_eq!(r1.rows[0][0], TypedValue::Text { value: "has_rating_5".into() });

    // WHERE rating < 3: must NOT include note without rating
    let r2 = execute_query(&vault, "TABLE file.name WHERE rating < 3").unwrap();
    assert_eq!(r2.rows.len(), 1);
    assert_eq!(r2.rows[0][0], TypedValue::Text { value: "has_rating_2".into() });

    // WHERE rating <= 3: must NOT include note without rating
    let r3 = execute_query(&vault, "TABLE file.name WHERE rating <= 3").unwrap();
    assert_eq!(r3.rows.len(), 1);
    assert_eq!(r3.rows[0][0], TypedValue::Text { value: "has_rating_2".into() });

    // WHERE rating = null: must ONLY include note without rating
    let r4 = execute_query(&vault, "TABLE file.name WHERE rating = null").unwrap();
    assert_eq!(r4.rows.len(), 1);
    assert_eq!(r4.rows[0][0], TypedValue::Text { value: "no_rating".into() });

    // WHERE rating != null: must include notes that have a rating
    let r5 = execute_query(&vault, "TABLE file.name WHERE rating != null SORT file.name ASC").unwrap();
    assert_eq!(r5.rows.len(), 2);
    assert_eq!(r5.rows[0][0], TypedValue::Text { value: "has_rating_2".into() });
    assert_eq!(r5.rows[1][0], TypedValue::Text { value: "has_rating_5".into() });
}

#[test]
fn test_edge_case_3_aggregate_division_by_zero_and_empty() {
    let mut vault = Vault::new();
    vault.add_document("notes/a.md", "---\ncategory: cat1\n---\n# A\n");

    // Empty numeric list average over group
    let r = execute_query(&vault, "TABLE category, avg(rows.score) AS \"Avg\" GROUP BY category").unwrap();
    assert_eq!(r.rows.len(), 1);
    // score is missing on note A, so rows.score is empty of numbers, avg returns TypedValue::Null (not NaN)
    assert_eq!(r.rows[0][1], TypedValue::Null);
}

#[test]
fn test_edge_case_4_flatten_row_limit() {
    let mut vault = Vault::new();
    // Build a note with 50,001 elements in a list to exceed the safety ceiling
    let l1: String = (0..50_001).map(|i| i.to_string()).collect::<Vec<_>>().join(", ");
    let content = format!("---\nlist1: [{}]\n---\n# Big\n", l1);
    vault.add_document("notes/big.md", &content);

    let res = execute_query(&vault, "TABLE l1 FLATTEN list1 AS \"l1\"");
    match res {
        Err(DqlError::EvaluationLimitExceeded(msg)) => {
            assert!(msg.contains("50,000"), "Expected 50,000 row ceiling message, got: {}", msg);
        }
        other => panic!("Expected DqlError::EvaluationLimitExceeded, got: {:?}", other),
    }
}

#[test]
fn test_edge_case_5_exact_subtag_matching() {
    let mut vault = Vault::new();
    vault.add_document("notes/w1.md", "# W1\n\nTags: #work\n");
    vault.add_document("notes/w2.md", "# W2\n\nTags: #work/client-a\n");
    vault.add_document("notes/w3.md", "# W3\n\nTags: #homework\n");
    vault.add_document("notes/w4.md", "# W4\n\nTags: #framework\n");
    vault.add_document("notes/w5.md", "# W5\n\nTags: #working\n");

    let r = execute_query(&vault, "TABLE file.name FROM #work SORT file.name ASC").unwrap();
    let names: Vec<String> = r.rows.iter().map(|row| match &row[0] {
        TypedValue::Text { value } => value.clone(),
        _ => String::new(),
    }).collect();

    assert_eq!(names, vec!["w1", "w2"]);
}

#[test]
fn test_edge_case_6_built_in_attribute_shadowing() {
    let mut vault = Vault::new();
    vault.add_document(
        "notes/my-real-file.md",
        "---\nfile: \"malicious_override\"\nname: \"Custom Display Title\"\n---\n# Note Content\n",
    );

    // file.name must NEVER be shadowed by frontmatter `file` or `name`
    let r = execute_query(&vault, "TABLE file.name, name, frontmatter.file").unwrap();
    assert_eq!(r.rows.len(), 1);

    // file.name returns the real file name
    assert_eq!(r.rows[0][0], TypedValue::Text { value: "my-real-file".into() });
    // unprefixed `name` finds user property in frontmatter
    assert_eq!(r.rows[0][1], TypedValue::Text { value: "Custom Display Title".into() });
    // explicit `frontmatter.file` accesses frontmatter property
    assert_eq!(r.rows[0][2], TypedValue::Text { value: "malicious_override".into() });
}

#[test]
fn test_edge_case_7_date_and_datetime_ordering() {
    let mut vault = Vault::new();
    vault.add_document("notes/d1.md", "---\ndate: 2026-10-01\n---\n# D1\n");
    vault.add_document("notes/d2.md", "---\ndate: 2026-09-09\n---\n# D2\n");
    vault.add_document("notes/d3.md", "---\ndate: 2026-01-15\n---\n# D3\n");

    let r = execute_query(&vault, "TABLE file.name, date SORT date ASC").unwrap();
    let names: Vec<String> = r.rows.iter().map(|row| match &row[0] {
        TypedValue::Text { value } => value.clone(),
        _ => String::new(),
    }).collect();

    assert_eq!(names, vec!["d3", "d2", "d1"]);
}

#[test]
fn test_top_k_heap_selection() {
    let mut vault = Vault::new();
    for i in 0..100 {
        let content = format!("---\npriority: {}\n---\n# Note {}\n", i, i);
        vault.add_document(&format!("notes/n{}.md", i), &content);
    }

    // Top-5 highest priority via DESC LIMIT 5
    let r_desc = execute_query(&vault, "TABLE file.name, priority SORT priority DESC LIMIT 5").unwrap();
    assert_eq!(r_desc.total, 100);
    assert_eq!(r_desc.rows.len(), 5);
    assert_eq!(r_desc.rows[0][1], TypedValue::Number { value: 99.0 });
    assert_eq!(r_desc.rows[1][1], TypedValue::Number { value: 98.0 });
    assert_eq!(r_desc.rows[2][1], TypedValue::Number { value: 97.0 });
    assert_eq!(r_desc.rows[3][1], TypedValue::Number { value: 96.0 });
    assert_eq!(r_desc.rows[4][1], TypedValue::Number { value: 95.0 });

    // Top-5 lowest priority via ASC LIMIT 5
    let r_asc = execute_query(&vault, "TABLE file.name, priority SORT priority ASC LIMIT 5").unwrap();
    assert_eq!(r_asc.total, 100);
    assert_eq!(r_asc.rows.len(), 5);
    assert_eq!(r_asc.rows[0][1], TypedValue::Number { value: 0.0 });
    assert_eq!(r_asc.rows[1][1], TypedValue::Number { value: 1.0 });
    assert_eq!(r_asc.rows[2][1], TypedValue::Number { value: 2.0 });
    assert_eq!(r_asc.rows[3][1], TypedValue::Number { value: 3.0 });
    assert_eq!(r_asc.rows[4][1], TypedValue::Number { value: 4.0 });
}
