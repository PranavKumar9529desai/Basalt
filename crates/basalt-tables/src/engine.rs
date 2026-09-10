use std::cmp::Ordering;
use std::collections::BinaryHeap;

use basalt_parser::query::{DataCommand, QueryType, SortDirection};
use basalt_types::{QueryResult, TypedValue};
use basalt_vault::Vault;

use crate::expr::{
    collect_query_projection, compare_typed, eval_expr, eval_to_typed, field_value, EvalCtx,
};
use crate::grouping::group_rows;
use crate::output::{
    execute_list_query, execute_table_query, execute_task_query, expr_text,
};
use crate::page_row::{build_page_rows_projected, PageRow};


/// Runtime errors during DQL query execution.
#[derive(Debug, thiserror::Error)]
pub enum DqlError {
    /// Query text failed to parse.
    #[error("{0}")]
    Parse(#[from] basalt_parser::ParseError),
    /// Working-row evaluation limit exceeded (safety ceiling).
    #[error("evaluation limit exceeded: {0}")]
    EvaluationLimitExceeded(String),
    /// Runtime error during execution.
    #[error("{0}")]
    Runtime(String),
}

/// Maximum working rows generated during query pipeline expansion (e.g. FLATTEN).
const MAX_EXPANDED_ROWS: usize = 50_000;

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

/// Helper node for bounded Heap in Top-K selection.
struct HeapNode<const DESC: bool> {
    key: TypedValue,
    row: WorkRow,
}

impl<const DESC: bool> PartialEq for HeapNode<DESC> {
    fn eq(&self, other: &Self) -> bool {
        compare_typed(&self.key, &other.key) == Ordering::Equal
    }
}

impl<const DESC: bool> Eq for HeapNode<DESC> {}

impl<const DESC: bool> PartialOrd for HeapNode<DESC> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<const DESC: bool> Ord for HeapNode<DESC> {
    fn cmp(&self, other: &Self) -> Ordering {
        if DESC {
            compare_typed(&other.key, &self.key)
        } else {
            compare_typed(&self.key, &other.key)
        }
    }
}

type AscHeapNode = HeapNode<false>;
type DescHeapNode = HeapNode<true>;

/// Execute a DQL query against the vault's indexed metadata.
pub fn execute_query(vault: &Vault, dql: &str) -> Result<QueryResult, DqlError> {
    let plan = basalt_parser::parse_query(dql)?;

    let arena = &vault.arena;
    let graph = &vault.graph;

    // 1. Column projection analysis & predicate push-down
    let (projected_keys, needs_tags, needs_links) = collect_query_projection(&plan);
    let mut rows: Vec<WorkRow> = build_page_rows_projected(
        arena,
        graph,
        plan.from.as_ref(),
        projected_keys.as_ref(),
        needs_tags,
        needs_links,
    )
    .into_iter()
    .map(WorkRow::Page)
    .collect();

    // Data commands execute in written order (Dataview semantics): each
    // transforms the current row set, so `LIMIT 5 SORT ...` limits before
    // sorting and a mid-chain GROUP BY is legal.
    let mut total = rows.len();
    let mut seen_limit = false;
    let mut cmd_idx = 0;

    while cmd_idx < plan.commands.len() {
        match &plan.commands[cmd_idx] {
            DataCommand::Where(expr) => {
                rows.retain(|r| eval_expr(expr, &r.ctx()));
                cmd_idx += 1;
            }
            DataCommand::Sort { field, direction } => {
                // Check if immediately followed by LIMIT k (Top-K Heap Selection optimization)
                let next_limit = if cmd_idx + 1 < plan.commands.len() {
                    match plan.commands[cmd_idx + 1] {
                        DataCommand::Limit(k) => Some(k as usize),
                        _ => None,
                    }
                } else {
                    None
                };

                if let Some(k) = next_limit {
                    total = rows.len();
                    seen_limit = true;

                    if k == 0 {
                        rows.clear();
                    } else if rows.len() > k {
                        // Top-K Selection: O(N log k) streaming heap selection
                        rows = match direction {
                            SortDirection::Asc => {
                                let mut heap: BinaryHeap<AscHeapNode> = BinaryHeap::with_capacity(k + 1);
                                for row in rows {
                                    let key = field_value(field, &row.ctx());
                                    if heap.len() < k {
                                        heap.push(AscHeapNode { key, row });
                                    } else if let Some(top) = heap.peek() {
                                        if compare_typed(&key, &top.key) == Ordering::Less {
                                            heap.pop();
                                            heap.push(AscHeapNode { key, row });
                                        }
                                    }
                                }
                                let mut nodes: Vec<AscHeapNode> = heap.into_vec();
                                nodes.sort_by(|a, b| compare_typed(&a.key, &b.key));
                                nodes.into_iter().map(|n| n.row).collect()
                            }
                            SortDirection::Desc => {
                                let mut heap: BinaryHeap<DescHeapNode> = BinaryHeap::with_capacity(k + 1);
                                for row in rows {
                                    let key = field_value(field, &row.ctx());
                                    if heap.len() < k {
                                        heap.push(DescHeapNode { key, row });
                                    } else if let Some(top) = heap.peek() {
                                        if compare_typed(&key, &top.key) == Ordering::Greater {
                                            heap.pop();
                                            heap.push(DescHeapNode { key, row });
                                        }
                                    }
                                }
                                let mut nodes: Vec<DescHeapNode> = heap.into_vec();
                                nodes.sort_by(|a, b| compare_typed(&b.key, &a.key));
                                nodes.into_iter().map(|n| n.row).collect()
                            }
                        };
                    } else {
                        // rows.len() <= k: just sort all rows with Schwartzian Transform
                        let mut sort_keys: Vec<(TypedValue, usize)> = rows
                            .iter()
                            .enumerate()
                            .map(|(idx, row)| (field_value(field, &row.ctx()), idx))
                            .collect();

                        sort_keys.sort_by(|(ka, _), (kb, _)| {
                            let cmp = compare_typed(ka, kb);
                            match direction {
                                SortDirection::Asc => cmp,
                                SortDirection::Desc => cmp.reverse(),
                            }
                        });

                        let mut row_slots: Vec<Option<WorkRow>> = rows.into_iter().map(Some).collect();
                        rows = sort_keys
                            .into_iter()
                            .filter_map(|(_, idx)| row_slots[idx].take())
                            .collect();
                    }

                    // Handled both Sort and Limit together
                    cmd_idx += 2;
                } else {
                    // Schwartzian Transform: pre-evaluate sort key once per row
                    let mut sort_keys: Vec<(TypedValue, usize)> = rows
                        .iter()
                        .enumerate()
                        .map(|(idx, row)| (field_value(field, &row.ctx()), idx))
                        .collect();

                    sort_keys.sort_by(|(ka, _), (kb, _)| {
                        let cmp = compare_typed(ka, kb);
                        match direction {
                            SortDirection::Asc => cmp,
                            SortDirection::Desc => cmp.reverse(),
                        }
                    });

                    let mut row_slots: Vec<Option<WorkRow>> = rows.into_iter().map(Some).collect();
                    rows = sort_keys
                        .into_iter()
                        .filter_map(|(_, idx)| row_slots[idx].take())
                        .collect();

                    cmd_idx += 1;
                }
            }
            DataCommand::GroupBy { expr, .. } => {
                rows = group_rows(rows, expr);
                cmd_idx += 1;
            }
            DataCommand::Flatten { expr, alias } => {
                // FLATTEN: evaluate the expression per page row. When the
                // result is a List, split the row into N rows (one per
                // element) with each element injected under the alias.
                // Scalar results inject as-is.
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
                                        if new_rows.len() > MAX_EXPANDED_ROWS {
                                            return Err(DqlError::EvaluationLimitExceeded(format!(
                                                "flatten expanded working set beyond {} rows limit",
                                                MAX_EXPANDED_ROWS
                                            )));
                                        }
                                    }
                                }
                                _ => {
                                    let mut page = p;
                                    page.frontmatter.push((flat_name.clone(), val));
                                    new_rows.push(WorkRow::Page(page));
                                    if new_rows.len() > MAX_EXPANDED_ROWS {
                                        return Err(DqlError::EvaluationLimitExceeded(format!(
                                            "flatten expanded working set beyond {} rows limit",
                                            MAX_EXPANDED_ROWS
                                        )));
                                    }
                                }
                            }
                        }
                        other => {
                            new_rows.push(other);
                            if new_rows.len() > MAX_EXPANDED_ROWS {
                                return Err(DqlError::EvaluationLimitExceeded(format!(
                                    "working set beyond {} rows limit",
                                    MAX_EXPANDED_ROWS
                                )));
                            }
                        }
                    }
                }
                rows = new_rows;
                cmd_idx += 1;
            }
            DataCommand::Limit(n) => {
                total = rows.len();
                seen_limit = true;
                rows.truncate(*n as usize);
                cmd_idx += 1;
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
        QueryType::Task => execute_task_query(vault, None),
    }
}
