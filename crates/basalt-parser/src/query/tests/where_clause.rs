use super::super::ast::*;
use super::super::plan::parse_query;

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
