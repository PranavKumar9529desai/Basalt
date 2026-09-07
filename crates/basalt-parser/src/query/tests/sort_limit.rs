use super::super::ast::*;
use super::super::plan::parse_query;

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
fn parse_list_query() {
    let plan = parse_query("LIST FROM #todo").unwrap();
    assert_eq!(plan.query_type, QueryType::List);
}

#[test]
fn parse_task_query() {
    let plan = parse_query("TASK FROM #project").unwrap();
    assert_eq!(plan.query_type, QueryType::Task);
}
