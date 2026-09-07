use basalt_parser::query::{DataCommand, Expr, QueryType, SortDirection};
use basalt_types::{QueryResult, TypedValue};
use basalt_vault::Vault;

use crate::expr::{compare_typed, eval_expr, eval_to_typed, EvalCtx};
use crate::grouping::group_rows;
use crate::output::{
    execute_list_query, execute_table_query, execute_task_query, expr_text,
};
use crate::page_row::{build_page_rows, matches_source, PageRow};

/// Runtime errors during DQL query execution.
#[derive(Debug, thiserror::Error)]
pub enum DqlError {
    /// Query text failed to parse.
    #[error("parse error: {0}")]
    Parse(#[from] basalt_parser::ParseError),
    /// Runtime error during execution.
    #[error("{0}")]
    Runtime(String),
}

/// A row during query execution: a single page, or a group of pages produced
/// by GROUP BY (a key plus its members).
pub(crate) enum WorkRow {
    Page(PageRow),
    Group {
        key: TypedValue,
        members: Vec<PageRow>,
        group_by_path: Option<Vec<String>>,
    },
}

impl WorkRow {
    pub(crate) fn ctx(&self) -> EvalCtx<'_> {
        match self {
            WorkRow::Page(page) => EvalCtx::Page(page),
            WorkRow::Group {
                key,
                members,
                group_by_path,
            } => EvalCtx::Group {
                key,
                members,
                group_by_path: group_by_path.as_deref(),
            },
        }
    }
}

/// Execute a DQL query against the vault's indexed metadata.
pub fn execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, DqlError> {
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
                            let val = eval_to_typed(expr, &EvalCtx::Page(&p));
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
        QueryType::Table => execute_table_query(&plan, &rows, total),
        QueryType::List => execute_list_query(&rows, total),
        QueryType::Task => execute_task_query(&rows, total),
    }
}
