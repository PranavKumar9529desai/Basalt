use super::super::ast::*;
use super::super::plan::parse_query;

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
