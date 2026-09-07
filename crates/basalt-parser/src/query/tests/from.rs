use super::super::ast::*;
use super::super::plan::parse_query;

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
