use super::ast::*;
use super::parse::parse_query;

#[test]
fn parse_simple_table() {
    let plan = parse_query("TABLE").unwrap();
    assert_eq!(plan.query_type, QueryType::Table);
    assert!(plan.fields.is_empty());
    assert!(plan.from.is_none());
}

#[test]
fn parse_table_with_fields() {
    let plan = parse_query("TABLE file.name, rating").unwrap();
    assert_eq!(plan.fields.len(), 2);
    assert_eq!(
        plan.fields[0].expr,
        Expr::Field(FieldRef(vec!["file".into(), "name".into()]))
    );
    assert_eq!(
        plan.fields[1].expr,
        Expr::Field(FieldRef(vec!["rating".into()]))
    );
}

#[test]
fn parse_table_with_alias() {
    let plan = parse_query(r#"TABLE file.name AS "Name", rating AS "Score""#).unwrap();
    assert_eq!(plan.fields[0].alias, Some("Name".to_string()));
    assert_eq!(plan.fields[1].alias, Some("Score".to_string()));
}

#[test]
fn parse_from_tag() {
    let plan = parse_query("LIST FROM #project").unwrap();
    assert_eq!(plan.from, Some(SourceFilter::Tag("project".to_string())));
}

#[test]
fn parse_from_folder() {
    let plan = parse_query(r#"TABLE FROM "notes""#).unwrap();
    assert_eq!(plan.from, Some(SourceFilter::Folder("notes".to_string())));
}

#[test]
fn parse_from_link() {
    let plan = parse_query("LIST FROM [[MyNote]]").unwrap();
    assert_eq!(plan.from, Some(SourceFilter::Link("MyNote".to_string())));
}

#[test]
fn parse_where_clause() {
    let plan = parse_query("TABLE FROM #tag WHERE rating > 7").unwrap();
    assert_eq!(plan.commands.len(), 1);
    match &plan.commands[0] {
        DataCommand::Where(Expr::Comparison { op, .. }) => {
            assert_eq!(*op, CompareOp::Gt);
        }
        _ => panic!("Expected comparison"),
    }
}

#[test]
fn parse_sort() {
    let plan = parse_query("TABLE SORT file.name DESC").unwrap();
    assert_eq!(plan.commands.len(), 1);
    match &plan.commands[0] {
        DataCommand::Sort { field, direction } => {
            assert_eq!(field.0, vec!["file", "name"]);
            assert_eq!(*direction, SortDirection::Desc);
        }
        _ => panic!("Expected sort"),
    }
}

#[test]
fn parse_limit() {
    let plan = parse_query("LIST LIMIT 10").unwrap();
    assert_eq!(plan.commands.len(), 1);
    assert_eq!(plan.commands[0], DataCommand::Limit(10));
}

#[test]
fn parse_full_query() {
    let plan = parse_query(
        "TABLE file.name AS \"Title\", rating\nFROM #books\nWHERE rating > 5\nSORT rating DESC\nLIMIT 20",
    ).unwrap();
    assert_eq!(plan.query_type, QueryType::Table);
    assert_eq!(plan.fields.len(), 2);
    assert_eq!(plan.from, Some(SourceFilter::Tag("books".to_string())));
    assert_eq!(plan.commands.len(), 3);
}

#[test]
fn parse_list_query() {
    let plan = parse_query("LIST FROM #todo").unwrap();
    assert_eq!(plan.query_type, QueryType::List);
}

#[test]
fn parse_task_query() {
    let plan = parse_query("TASK FROM #project").unwrap();
    assert_eq!(plan.query_type, QueryType::Task);
}

#[test]
fn parse_bad_syntax() {
    assert!(parse_query("BANANA").is_err());
}

#[test]
fn parse_from_and() {
    let plan = parse_query("LIST FROM #work AND #urgent").unwrap();
    match plan.from.unwrap() {
        SourceFilter::And(a, b) => {
            assert_eq!(*a, SourceFilter::Tag("work".to_string()));
            assert_eq!(*b, SourceFilter::Tag("urgent".to_string()));
        }
        other => panic!("Expected And, got {:?}", other),
    }
}

#[test]
fn parse_from_or() {
    let plan = parse_query("LIST FROM #work OR #personal").unwrap();
    match plan.from.unwrap() {
        SourceFilter::Or(a, b) => {
            assert_eq!(*a, SourceFilter::Tag("work".to_string()));
            assert_eq!(*b, SourceFilter::Tag("personal".to_string()));
        }
        other => panic!("Expected Or, got {:?}", other),
    }
}

#[test]
fn parse_from_not() {
    let plan = parse_query("LIST FROM NOT #archive").unwrap();
    match plan.from.unwrap() {
        SourceFilter::Not(inner) => {
            assert_eq!(*inner, SourceFilter::Tag("archive".to_string()));
        }
        other => panic!("Expected Not, got {:?}", other),
    }
}

#[test]
fn parse_from_parenthesized() {
    let plan = parse_query("LIST FROM (#work OR #personal) AND NOT #archive").unwrap();
    match plan.from.unwrap() {
        SourceFilter::And(left, right) => {
            assert!(matches!(*left, SourceFilter::Or(..)));
            assert!(matches!(*right, SourceFilter::Not(..)));
        }
        other => panic!("Expected And, got {:?}", other),
    }
}

#[test]
fn parse_from_precedence_not_binds_tighter() {
    // NOT #a OR #b  should be  (NOT #a) OR #b
    let plan = parse_query("LIST FROM NOT #a OR #b").unwrap();
    match plan.from.unwrap() {
        SourceFilter::Or(left, right) => {
            assert!(matches!(*left, SourceFilter::Not(..)));
            assert_eq!(*right, SourceFilter::Tag("b".to_string()));
        }
        other => panic!("Expected Or, got {:?}", other),
    }
}

#[test]
fn parse_from_and_with_folder() {
    let plan = parse_query(r#"TABLE FROM #work AND "notes""#).unwrap();
    match plan.from.unwrap() {
        SourceFilter::And(a, b) => {
            assert_eq!(*a, SourceFilter::Tag("work".to_string()));
            assert_eq!(*b, SourceFilter::Folder("notes".to_string()));
        }
        other => panic!("Expected And, got {:?}", other),
    }
}
#[test]
fn parse_where_function_call() {
    let plan = parse_query(r#"TABLE file.name WHERE contains(file.name, "beta")"#).unwrap();
    assert_eq!(plan.commands.len(), 1);
    match &plan.commands[0] {
        DataCommand::Where(Expr::Func { name, args }) => {
            assert_eq!(name, "contains");
            assert_eq!(args.len(), 2);
            assert_eq!(
                args[0],
                Expr::Field(FieldRef(vec!["file".into(), "name".into()]))
            );
            assert_eq!(args[1], Expr::Literal(Literal::Text("beta".into())));
        }
        other => panic!("Expected Func, got {:?}", other),
    }
}

#[test]
fn parse_function_in_comparison() {
    let plan = parse_query("TABLE file.name WHERE length(tags) > 2").unwrap();
    match &plan.commands[0] {
        DataCommand::Where(Expr::Comparison { left, op, right }) => {
            assert_eq!(*op, CompareOp::Gt);
            assert!(matches!(left.as_ref(), Expr::Func { name, .. } if name == "length"));
            assert_eq!(right.as_ref(), &Expr::Literal(Literal::Number(2.0)));
        }
        other => panic!("Expected comparison, got {:?}", other),
    }
}

#[test]
fn parse_nested_function_calls() {
    let plan = parse_query("TABLE file.name WHERE sum(length(rows.tags)) > 0").unwrap();
    match &plan.commands[0] {
        DataCommand::Where(Expr::Comparison { left, .. }) => {
            if let Expr::Func { name, args } = left.as_ref() {
                assert_eq!(name, "sum");
                assert_eq!(args.len(), 1);
                if let Expr::Func {
                    name: inner_name,
                    args: inner_args,
                } = &args[0]
                {
                    assert_eq!(inner_name, "length");
                    assert_eq!(
                        inner_args[0],
                        Expr::Field(FieldRef(vec!["rows".into(), "tags".into()]))
                    );
                } else {
                    panic!("expected nested func");
                }
            } else {
                panic!("expected func");
            }
        }
        other => panic!("Expected comparison, got {:?}", other),
    }
}

#[test]
fn parse_keyword_function_name() {
    // `contains` is a DQL keyword but must parse as a function call.
    let plan = parse_query(r#"TABLE file.name WHERE contains(file.name, "x")"#).unwrap();
    assert!(
        matches!(&plan.commands[0], DataCommand::Where(Expr::Func { name, .. }) if name == "contains"),
        "contains should parse as a function call"
    );
}

#[test]
fn parse_paren_expr_grouping() {
    let plan = parse_query("TABLE file.name WHERE (rating > 5)").unwrap();
    match &plan.commands[0] {
        DataCommand::Where(Expr::Comparison { op, left, right }) => {
            assert_eq!(*op, CompareOp::Gt);
            assert_eq!(left.as_ref(), &Expr::Field(FieldRef(vec!["rating".into()])));
            assert_eq!(right.as_ref(), &Expr::Literal(Literal::Number(5.0)));
        }
        other => panic!("Expected comparison, got {:?}", other),
    }
}

#[test]
fn parse_table_with_expr_field() {
    let plan = parse_query(r#"TABLE status, count(task.complete) AS "Done" FROM #work"#).unwrap();
    assert_eq!(plan.fields.len(), 2);
    assert_eq!(
        plan.fields[0].expr,
        Expr::Field(FieldRef(vec!["status".into()]))
    );
    assert_eq!(plan.fields[0].alias, None);
    assert_eq!(
        plan.fields[1].expr,
        Expr::Func {
            name: "count".into(),
            args: vec![Expr::Field(FieldRef(vec![
                "task".into(),
                "complete".into()
            ]))]
        }
    );
    assert_eq!(plan.fields[1].alias, Some("Done".to_string()));
}

#[test]
fn parse_group_by_field() {
    let plan = parse_query("TABLE status, count(rows) FROM #work GROUP BY status").unwrap();
    assert_eq!(plan.commands.len(), 1);
    match &plan.commands[0] {
        DataCommand::GroupBy { expr, alias } => {
            assert_eq!(expr, &Expr::Field(FieldRef(vec!["status".into()])));
            assert_eq!(alias, &None);
        }
        other => panic!("expected GroupBy, got {:?}", other),
    }
}

#[test]
fn parse_group_by_computed_alias() {
    let plan =
        parse_query(r#"TABLE file.name, count(rows) FROM #work GROUP BY (length(tags)) AS "Size""#)
            .unwrap();
    match &plan.commands[0] {
        DataCommand::GroupBy { expr, alias } => {
            assert_eq!(
                expr,
                &Expr::Func {
                    name: "length".into(),
                    args: vec![Expr::Field(FieldRef(vec!["tags".into()]))]
                }
            );
            assert_eq!(alias, &Some("Size".to_string()));
        }
        other => panic!("expected GroupBy, got {:?}", other),
    }
}

#[test]
fn parse_flatten_alias() {
    let plan =
        parse_query(r#"TABLE file.name, tag_count FROM #work FLATTEN length(tags) AS "tag_count""#)
            .unwrap();
    assert_eq!(plan.commands.len(), 1);
    match &plan.commands[0] {
        DataCommand::Flatten { expr, alias } => {
            assert_eq!(
                expr,
                &Expr::Func {
                    name: "length".into(),
                    args: vec![Expr::Field(FieldRef(vec!["tags".into()]))]
                }
            );
            assert_eq!(alias, &Some("tag_count".to_string()));
        }
        other => panic!("expected Flatten, got {:?}", other),
    }
}

#[test]
fn parse_flatten_without_alias() {
    let plan = parse_query("TABLE file.name FROM #work FLATTEN file.tags").unwrap();
    match &plan.commands[0] {
        DataCommand::Flatten { expr, alias } => {
            assert_eq!(
                expr,
                &Expr::Field(FieldRef(vec!["file".into(), "tags".into()]))
            );
            assert_eq!(alias, &None);
        }
        other => panic!("expected Flatten, got {:?}", other),
    }
}

#[test]
fn parse_full_aggregation_query() {
    let plan = parse_query(
        r#"TABLE status, count(task.complete) AS "Done"
FROM #work
WHERE task.complete
GROUP BY status
SORT status DESC
FLATTEN length(tags) AS "Tags"
LIMIT 10"#,
    )
    .unwrap();
    assert_eq!(plan.fields.len(), 2);
    assert_eq!(plan.commands.len(), 5);
}

#[test]
fn parse_groupby_preserves_command_order() {
    let plan =
        parse_query("LIST FROM #work WHERE rating > 5 GROUP BY status SORT rating DESC LIMIT 3")
            .unwrap();
    assert_eq!(plan.commands.len(), 4);
    assert!(matches!(&plan.commands[1], DataCommand::GroupBy { .. }));
    assert!(matches!(&plan.commands[2], DataCommand::Sort { .. }));
}

#[test]
fn parse_group_by_without_expr_errors() {
    assert!(parse_query("LIST GROUP BY").is_err());
    assert!(parse_query("LIST GROUP BY AS \"x\"").is_err());
}

#[test]
fn parse_group_by_multi_key_rejected() {
    // GROUP BY takes a single expression; a comma is trailing text.
    assert!(parse_query("LIST GROUP BY a, b").is_err());
}
