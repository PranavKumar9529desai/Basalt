use super::super::ast::*;
use super::super::plan::parse_query;

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
