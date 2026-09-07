use super::super::ast::*;
use super::super::plan::parse_query;

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
