use super::super::ast::*;
use super::super::plan::parse_query;

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
