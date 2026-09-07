use super::super::ast::*;
use super::super::plan::parse_query;

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
