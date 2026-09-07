use super::super::ast::*;
use super::super::plan::parse_query;

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
