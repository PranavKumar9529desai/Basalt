use basalt_parser::query::{CompareOp, DataCommand, Expr, FieldRef, Literal, QueryPlan, QueryType, SortDirection};
use basalt_types::{QueryColumn, QueryResult, TypedValue};
use basalt_vault::Vault;

use crate::expr::{compare_typed, eval_expr, eval_to_typed, EvalCtx};
use crate::page_row::{build_page_rows, matches_source, PageRow};

/// A row during query execution: a single page, or a group of pages produced
/// by GROUP BY (a key plus its members).
enum WorkRow {
    Page(PageRow),
    Group {
        key: TypedValue,
        members: Vec<PageRow>,
        group_by_path: Option<Vec<String>>,
    },
}

impl WorkRow {
    fn ctx(&self) -> EvalCtx<'_> {
        match self {
            WorkRow::Page(page) => EvalCtx::Page(page),
            WorkRow::Group { key, members, group_by_path } => EvalCtx::Group {
                key,
                members,
                group_by_path: group_by_path.as_deref(),
            },
        }
    }
}

/// Execute a DQL query against the vault's indexed metadata.
pub fn execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, String> {
    let plan = basalt_parser::parse_query(dql)?;

    let arena = &vault.arena;
    let graph = &vault.graph;

    let mut rows: Vec<WorkRow> = build_page_rows(arena, graph)
        .into_iter()
        .map(WorkRow::Page)
        .collect();

    // FROM filter
    if let Some(ref source) = plan.from {
        rows.retain(|r| match r {
            WorkRow::Page(page) => matches_source(page, source),
            WorkRow::Group { .. } => true,
        });
    }

    // Data commands execute in written order (Dataview semantics): each
    // transforms the current row set, so `LIMIT 5 SORT ...` limits before
    // sorting and a mid-chain GROUP BY is legal.
    let mut total = rows.len();
    let mut seen_limit = false;
    for cmd in &plan.commands {
        match cmd {
            DataCommand::Where(expr) => {
                rows.retain(|r| eval_expr(expr, &r.ctx()));
            }
            DataCommand::Sort { field, direction } => {
                rows.sort_by(|a, b| {
                    let va = eval_to_typed(&Expr::Field(field.clone()), &a.ctx());
                    let vb = eval_to_typed(&Expr::Field(field.clone()), &b.ctx());
                    let cmp = compare_typed(&va, &vb);
                    match direction {
                        SortDirection::Asc => cmp,
                        SortDirection::Desc => cmp.reverse(),
                    }
                });
            }
            DataCommand::GroupBy { expr, .. } => {
                rows = group_rows(rows, expr);
            }
            DataCommand::Flatten { expr, alias } => {
                // FLATTEN: evaluate the expression per page row. When the
                // result is a List, split the row into N rows (one per
                // element) with each element injected under the alias.
                // Scalar results inject as-is (existing behaviour). The alias
                // defaults to `expr_text` when absent.
                let flat_name = alias.clone().unwrap_or_else(|| expr_text(expr));
                let mut new_rows: Vec<WorkRow> = Vec::new();
                for r in rows.drain(..) {
                    match r {
                        WorkRow::Page(p) => {
                            let val = eval_to_typed(&expr, &EvalCtx::Page(&p));
                            match val {
                                TypedValue::List { items } if !items.is_empty() => {
                                    for item in items {
                                        let mut clone = p.clone();
                                        clone.frontmatter.push((flat_name.clone(), item));
                                        new_rows.push(WorkRow::Page(clone));
                                    }
                                }
                                _ => {
                                    let mut page = p;
                                    page.frontmatter.push((flat_name.clone(), val));
                                    new_rows.push(WorkRow::Page(page));
                                }
                            }
                        }
                        other => new_rows.push(other),
                    }
                }
                rows = new_rows;
            }
            DataCommand::Limit(n) => {
                total = rows.len();
                seen_limit = true;
                rows.truncate(*n as usize);
            }
        }
    }
    if !seen_limit {
        total = rows.len();
    }

    // Build columns + rows
    match plan.query_type {
        QueryType::Table => {
            let columns = build_columns(&plan, &rows);
            let data: Vec<Vec<TypedValue>> = rows
                .iter()
                .map(|r| {
                    plan.fields
                        .iter()
                        .map(|f| eval_to_typed(&f.expr, &r.ctx()))
                        .collect()
                })
                .collect();
            Ok(QueryResult { columns, rows: data, total })
        }
        QueryType::List => {
            let columns = vec![QueryColumn {
                name: "File".to_string(),
                type_: "link".to_string(),
            }];
            let data: Vec<Vec<TypedValue>> = rows
                .iter()
                .map(|r| {
                    let p = first_page(r);
                    vec![TypedValue::Link {
                        name: p.name.clone(),
                        path: p.path.clone(),
                    }]
                })
                .collect();
            Ok(QueryResult { columns, rows: data, total })
        }
        QueryType::Task => {
            // TASK query: show file link + task text (simplified MVP)
            let columns = vec![
                QueryColumn {
                    name: "File".to_string(),
                    type_: "link".to_string(),
                },
                QueryColumn {
                    name: "Task".to_string(),
                    type_: "text".to_string(),
                },
            ];
            let data: Vec<Vec<TypedValue>> = rows
                .iter()
                .map(|r| {
                    let p = first_page(r);
                    vec![
                        TypedValue::Link {
                            name: p.name.clone(),
                            path: p.path.clone(),
                        },
                        TypedValue::Text {
                            value: "(tasks)".to_string(),
                        },
                    ]
                })
                .collect();
            Ok(QueryResult { columns, rows: data, total })
        }
    }
}

/// The representative page of a row (first member for a group).
fn first_page(row: &WorkRow) -> &PageRow {
    match row {
        WorkRow::Page(page) => page,
        WorkRow::Group { members, .. } => members.first().expect("group has at least one member"),
    }
}

/// Group page rows by the evaluated key expression, preserving first-seen
/// group order. Rows that are already groups pass through unchanged (nested
/// grouping is deferred).
fn group_rows(rows: Vec<WorkRow>, expr: &Expr) -> Vec<WorkRow> {
    // A simple-field GROUP BY lets that field resolve to the group key in the
    // output (Dataview swizzling); computed GROUP BY exposes only `key`.
    let group_by_path: Option<Vec<String>> = match expr {
        Expr::Field(FieldRef(parts)) => Some(parts.clone()),
        _ => None,
    };
    let mut groups: Vec<(TypedValue, Vec<PageRow>)> = Vec::new();
    let mut carried: Vec<WorkRow> = Vec::new();
    for row in rows {
        match row {
            WorkRow::Page(page) => {
                let key = eval_to_typed(expr, &EvalCtx::Page(&page));
                match groups
                    .iter_mut()
                    .find(|(k, _)| compare_typed(k, &key) == std::cmp::Ordering::Equal)
                {
                    Some((_, members)) => members.push(page),
                    None => groups.push((key, vec![page])),
                }
            }
            other => carried.push(other),
        }
    }
    let mut out: Vec<WorkRow> = groups
        .into_iter()
        .map(|(key, members)| WorkRow::Group {
            key,
            members,
            group_by_path: group_by_path.clone(),
        })
        .collect();
    out.extend(carried);
    out
}

fn build_columns(plan: &QueryPlan, rows: &[WorkRow]) -> Vec<QueryColumn> {
    if plan.fields.is_empty() {
        // Default: show file link
        return vec![QueryColumn {
            name: "File".to_string(),
            type_: "link".to_string(),
        }];
    }
    plan.fields
        .iter()
        .map(|f| {
            let name = f.alias.clone().unwrap_or_else(|| expr_text(&f.expr));
            // Infer type from first non-null value
            let type_ = rows
                .iter()
                .find_map(|r| {
                    let v = eval_to_typed(&f.expr, &r.ctx());
                    Some(match v {
                        TypedValue::Number { .. } => "number",
                        TypedValue::Checkbox { .. } => "checkbox",
                        TypedValue::Link { .. } => "link",
                        TypedValue::Date { .. } => "date",
                        TypedValue::List { .. } => "list",
                        _ => "text",
                    })
                })
                .unwrap_or("text")
                .to_string();
            QueryColumn { name, type_ }
        })
        .collect()
}

/// Render an expression as its column name when no alias is given.
fn expr_text(expr: &Expr) -> String {
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