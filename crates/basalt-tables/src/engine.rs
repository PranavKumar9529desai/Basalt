use basalt_parser::query::{DataCommand, QueryPlan, QueryType, SortDirection};
use basalt_types::{QueryColumn, QueryResult, TypedValue};
use basalt_vault::Vault;

use crate::expr::{compare_typed, field_value, eval_expr};
use crate::page_row::{build_page_rows, matches_source};

/// Execute a DQL query against the vault's indexed metadata.
pub fn execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, String> {
    let plan = basalt_parser::parse_query(dql)?;

    let arena = &vault.arena;
    let graph = &vault.graph;

    let mut pages = build_page_rows(arena, graph);

    // FROM filter
    if let Some(ref source) = plan.from {
        pages.retain(|p| matches_source(p, source));
    }

    // WHERE filter
    for cmd in &plan.commands {
        if let DataCommand::Where(ref expr) = cmd {
            pages.retain(|p| eval_expr(expr, p));
        }
    }

    // SORT
    for cmd in &plan.commands {
        if let DataCommand::Sort { field, direction } = cmd {
            pages.sort_by(|a, b| {
                let va = field_value(field, a);
                let vb = field_value(field, b);
                let cmp = compare_typed(&va, &vb);
                match direction {
                    SortDirection::Asc => cmp,
                    SortDirection::Desc => cmp.reverse(),
                }
            });
        }
    }

    // LIMIT
    let mut limit: Option<usize> = None;
    for cmd in &plan.commands {
        if let DataCommand::Limit(n) = cmd {
            limit = Some(*n as usize);
        }
    }
    let total = pages.len();
    if let Some(lim) = limit {
        pages.truncate(lim);
    }

    // Build columns + rows
    match plan.query_type {
        QueryType::Table => {
            let columns = build_columns(&plan, &pages);
            let rows: Vec<Vec<TypedValue>> = pages
                .iter()
                .map(|p| {
                    plan.fields
                        .iter()
                        .map(|f| field_value(&f.field, p))
                        .collect()
                })
                .collect();
            Ok(QueryResult { columns, rows, total })
        }
        QueryType::List => {
            let columns = vec![QueryColumn {
                name: "File".to_string(),
                type_: "link".to_string(),
            }];
            let rows: Vec<Vec<TypedValue>> = pages
                .iter()
                .map(|p| {
                    vec![TypedValue::Link {
                        name: p.name.clone(),
                        path: p.path.clone(),
                    }]
                })
                .collect();
            Ok(QueryResult { columns, rows, total })
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
            let rows: Vec<Vec<TypedValue>> = pages
                .iter()
                .map(|p| {
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
            Ok(QueryResult { columns, rows, total })
        }
    }
}

fn build_columns(plan: &QueryPlan, pages: &[crate::page_row::PageRow]) -> Vec<QueryColumn> {
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
            let name = f.alias.clone().unwrap_or_else(|| f.field.0.join("."));
            // Infer type from first non-null value
            let type_ = pages
                .iter()
                .find_map(|p| {
                    let v = field_value(&f.field, p);
                    Some(match v {
                        TypedValue::Number { .. } => "number",
                        TypedValue::Checkbox { .. } => "checkbox",
                        TypedValue::Link { .. } => "link",
                        TypedValue::Date { .. } => "date",
                        _ => "text",
                    })
                })
                .unwrap_or("text")
                .to_string();
            QueryColumn { name, type_ }
        })
        .collect()
}