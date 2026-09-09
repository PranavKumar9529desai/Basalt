use basalt_parser::query::{CompareOp, Expr, Literal, QueryPlan};
use basalt_types::{QueryColumn, QueryColumnType, QueryResult, TypedValue};

use crate::engine::{DqlError, WorkRow};
use crate::expr::eval_to_typed;
use crate::page_row::PageRow;

/// Table query: render user-specified fields as columns.
pub(crate) fn execute_table_query(
    plan: &QueryPlan,
    rows: &[WorkRow],
    total: usize,
) -> Result<QueryResult, DqlError> {
    let columns = build_columns(plan, rows);
    let data: Vec<Vec<TypedValue>> = rows
        .iter()
        .map(|r| {
            plan.fields
                .iter()
                .map(|f| eval_to_typed(&f.expr, &r.ctx()))
                .collect()
        })
        .collect();
    Ok(QueryResult {
        columns,
        rows: data,
        total,
    })
}

/// List query: single "File" column with a link to each page.
pub(crate) fn execute_list_query(rows: &[WorkRow], total: usize) -> Result<QueryResult, DqlError> {
    let columns = vec![QueryColumn {
        name: "File".to_string(),
        type_: QueryColumnType::Link,
    }];
    let data: Vec<Vec<TypedValue>> = rows
        .iter()
        .map(|r| {
            let p =
                first_page(r).ok_or_else(|| DqlError::Runtime("group must have members".into()))?;
            Ok::<_, DqlError>(link_row(p.name(), &p.path))
        })
        .collect::<Result<_, _>>()?;
    Ok(QueryResult {
        columns,
        rows: data,
        total,
    })
}

/// Task query: file link + task text column.
pub(crate) fn execute_task_query(rows: &[WorkRow], total: usize) -> Result<QueryResult, DqlError> {
    let columns = vec![
        QueryColumn {
            name: "File".to_string(),
            type_: QueryColumnType::Link,
        },
        QueryColumn {
            name: "Task".to_string(),
            type_: QueryColumnType::Text,
        },
    ];
    let data: Vec<Vec<TypedValue>> = rows
        .iter()
        .map(|r| {
            let p =
                first_page(r).ok_or_else(|| DqlError::Runtime("group must have members".into()))?;
            Ok::<_, DqlError>(vec![
                TypedValue::Link {
                    name: p.name().to_string(),
                    path: p.path.clone(),
                },
                TypedValue::Text {
                    value: "(tasks)".to_string(),
                },
            ])
        })
        .collect::<Result<_, _>>()?;
    Ok(QueryResult {
        columns,
        rows: data,
        total,
    })
}

/// Construct a link-typed value for the given name and path.
fn link_row(name: &str, path: &str) -> Vec<TypedValue> {
    vec![TypedValue::Link {
        name: name.to_string(),
        path: path.to_string(),
    }]
}

/// The representative page of a row (first member for a group).
fn first_page(row: &WorkRow) -> Option<&PageRow> {
    match row {
        WorkRow::Page(page) => Some(page),
        WorkRow::Group { members, .. } => members.first(),
    }
}

fn build_columns(plan: &QueryPlan, rows: &[WorkRow]) -> Vec<QueryColumn> {
    if plan.fields.is_empty() {
        // Default: show file link
        return vec![QueryColumn {
            name: "File".to_string(),
            type_: QueryColumnType::Link,
        }];
    }
    plan.fields
        .iter()
        .map(|f| {
            let name = f.alias.clone().unwrap_or_else(|| expr_text(&f.expr));
            // Infer type from first non-null value
            let type_ = rows
                .iter()
                .map(|r| QueryColumnType::from_typed(&eval_to_typed(&f.expr, &r.ctx())))
                .next()
                .unwrap_or(QueryColumnType::Text);
            QueryColumn { name, type_ }
        })
        .collect()
}

/// Render an expression as its column name when no alias is given.
pub(crate) fn expr_text(expr: &Expr) -> String {
    match expr {
        Expr::Field(f) => f.0.join("."),
        Expr::Literal(Literal::Text(s)) => s.clone(),
        Expr::Literal(Literal::Number(n)) => format!("{}", n),
        Expr::Literal(Literal::Bool(b)) => b.to_string(),
        Expr::Literal(Literal::Null) => "null".to_string(),
        Expr::Func { name, args } => {
            let args_s: Vec<String> = args.iter().map(expr_text).collect();
            format!("{}({})", name, args_s.join(", "))
        }
        Expr::Not(inner) => format!("!{}", expr_text(inner)),
        Expr::Comparison { left, op, right } => format!(
            "{} {} {}",
            expr_text(left),
            match op {
                CompareOp::Eq => "=",
                CompareOp::Ne => "!=",
                CompareOp::Lt => "<",
                CompareOp::Gt => ">",
                CompareOp::Le => "<=",
                CompareOp::Ge => ">=",
                CompareOp::Contains => "contains",
            },
            expr_text(right),
        ),
    }
}