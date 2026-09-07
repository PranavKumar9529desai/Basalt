use super::super::ast::*;
use super::super::plan::parse_query;

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
fn parse_group_by_without_expr_errors() {
    assert!(parse_query("LIST GROUP BY").is_err());
    assert!(parse_query("LIST GROUP BY AS \"x\"").is_err());
}

#[test]
fn parse_group_by_multi_key_rejected() {
    // GROUP BY takes a single expression; a comma is trailing text.
    assert!(parse_query("LIST GROUP BY a, b").is_err());
}
