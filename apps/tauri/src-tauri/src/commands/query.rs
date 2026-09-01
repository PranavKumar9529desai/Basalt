use basalt_parser::parse_query;
use basalt_parser::query::{CompareOp, DataCommand, Expr, Literal, QueryPlan, QueryType, SortDirection, SourceFilter};
use basalt_types::{QueryColumn, QueryResult, TypedValue, yaml_to_typed_pairs};
use tauri::State;

use crate::AppState;

/// Execute a DQL query against the vault's indexed metadata.
#[tauri::command]
pub fn run_query(dql: String, _path: String, state: State<'_, AppState>) -> Result<QueryResult, String> {
    let plan = parse_query(&dql)?;

    let vault = state.vault.read().map_err(|e| format!("Lock error: {}", e))?;

    // Build page list from the vault's metadata cache
    let arena = &vault.arena;
    let graph = &vault.graph;

    let mut pages: Vec<PageRow> = Vec::new();
    for (node_id, meta) in &graph.metadata_cache {
        let path = arena.get_string(*node_id).cloned().unwrap_or_default();
        let name = path
            .rsplit('/')
            .next()
            .unwrap_or(&path)
            .trim_end_matches(".md")
            .to_string();
        let folder = path
            .rfind('/')
            .map(|i| path[..i].to_string())
            .unwrap_or_default();

        let frontmatter_vals: Vec<(String, TypedValue)> = meta
            .frontmatter
            .as_ref()
            .map(|fm| yaml_to_typed_pairs(fm))
            .unwrap_or_default();

        pages.push(PageRow {
            path,
            name,
            folder,
            tags: meta.tags.clone(),
            links: meta.links.clone(),
            frontmatter: frontmatter_vals,
        });
    }

    // FROM filter
    if let Some(ref source) = plan.from {
        pages.retain(|p| matches_source(p, source, &graph));
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
                QueryColumn { name: "File".to_string(), type_: "link".to_string() },
                QueryColumn { name: "Task".to_string(), type_: "text".to_string() },
            ];
            let rows: Vec<Vec<TypedValue>> = pages
                .iter()
                .map(|p| {
                    vec![
                        TypedValue::Link { name: p.name.clone(), path: p.path.clone() },
                        TypedValue::Text { value: "(tasks)".to_string() },
                    ]
                })
                .collect();
            Ok(QueryResult { columns, rows, total })
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

struct PageRow {
    path: String,
    name: String,
    folder: String,
    tags: Vec<String>,
    links: Vec<String>,
    frontmatter: Vec<(String, TypedValue)>,
}

fn matches_source(page: &PageRow, source: &SourceFilter, graph: &basalt_graph::NoteGraph) -> bool {
    match source {
        SourceFilter::Tag(tag) => page.tags.iter().any(|t| t == tag || t.ends_with(&format!("/{}", tag))),
        SourceFilter::Folder(folder) => page.folder == *folder || page.folder.starts_with(&format!("{}/", folder)),
        SourceFilter::Link(target) => page.links.iter().any(|l| l == target),
        SourceFilter::And(a, b) => matches_source(page, a, graph) && matches_source(page, b, graph),
        SourceFilter::Or(a, b) => matches_source(page, a, graph) || matches_source(page, b, graph),
        SourceFilter::Not(a) => !matches_source(page, a, graph),
    }
}

fn eval_expr(expr: &Expr, page: &PageRow) -> bool {
    match expr {
        Expr::Field(_) => true,
        Expr::Literal(Literal::Bool(true)) => true,
        Expr::Literal(_) => true,
        Expr::Comparison { left, op, right } => {
            let lv = eval_to_typed(left, page);
            let rv = eval_to_typed(right, page);
            match op {
                CompareOp::Eq => compare_typed(&lv, &rv) == std::cmp::Ordering::Equal,
                CompareOp::Ne => compare_typed(&lv, &rv) != std::cmp::Ordering::Equal,
                CompareOp::Lt => compare_typed(&lv, &rv) == std::cmp::Ordering::Less,
                CompareOp::Gt => compare_typed(&lv, &rv) == std::cmp::Ordering::Greater,
                CompareOp::Le => compare_typed(&lv, &rv) != std::cmp::Ordering::Greater,
                CompareOp::Ge => compare_typed(&lv, &rv) != std::cmp::Ordering::Less,
                CompareOp::Contains => match (&lv, &rv) {
                    (TypedValue::Text { value: hay }, TypedValue::Text { value: needle }) => {
                        hay.contains(needle.as_str())
                    }
                    _ => false,
                },
            }
        }
        Expr::Not(inner) => !eval_expr(inner, page),
        Expr::Func { name, args } => {
            // Simplified: contains() function
            if name == "contains" && args.len() == 2 {
                let lv = eval_to_typed(&args[0], page);
                let rv = eval_to_typed(&args[1], page);
                match (&lv, &rv) {
                    (TypedValue::Text { value: hay }, TypedValue::Text { value: needle }) => {
                        hay.contains(needle.as_str())
                    }
                    _ => false,
                }
            } else {
                true
            }
        }
    }
}

fn eval_to_typed(expr: &Expr, page: &PageRow) -> TypedValue {
    match expr {
        Expr::Field(f) => field_value(f, page),
        Expr::Literal(Literal::Text(s)) => TypedValue::Text { value: s.clone() },
        Expr::Literal(Literal::Number(n)) => TypedValue::Number { value: *n },
        Expr::Literal(Literal::Bool(b)) => TypedValue::Checkbox { value: *b },
        Expr::Literal(Literal::Null) => TypedValue::Null,
        Expr::Comparison { .. } => {
            let result = eval_expr(expr, page);
            TypedValue::Checkbox { value: result }
        }
        Expr::Not(_inner) => {
            let result = eval_expr(expr, page);
            TypedValue::Checkbox { value: result }
        }
        Expr::Func { .. } => {
            let result = eval_expr(expr, page);
            TypedValue::Checkbox { value: result }
        }
    }
}

fn field_value(field: &basalt_parser::query::FieldRef, page: &PageRow) -> TypedValue {
    let key = field.0.join(".");
    match key.as_str() {
        "file.name" | "name" => TypedValue::Text { value: page.name.clone() },
        "file.path" | "path" => TypedValue::Text { value: page.path.clone() },
        "file.folder" | "folder" => TypedValue::Text { value: page.folder.clone() },
        "file.tags" | "tags" => TypedValue::Text {
            value: page.tags.join(", "),
        },
        "file.links" | "links" => TypedValue::Text {
            value: page.links.join(", "),
        },
        _ => {
            // Look up in frontmatter
            page.frontmatter
                .iter()
                .find(|(k, _)| k == &key)
                .map(|(_, v)| v.clone())
                .unwrap_or(TypedValue::Null)
        }
    }
}

fn compare_typed(a: &TypedValue, b: &TypedValue) -> std::cmp::Ordering {
    match (a, b) {
        (TypedValue::Number { value: a }, TypedValue::Number { value: b }) => a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal),
        (TypedValue::Text { value: a }, TypedValue::Text { value: b }) => a.cmp(b),
        (TypedValue::Checkbox { value: a }, TypedValue::Checkbox { value: b }) => a.cmp(b),
        (TypedValue::Null, _) => std::cmp::Ordering::Less,
        (_, TypedValue::Null) => std::cmp::Ordering::Greater,
        _ => std::cmp::Ordering::Equal,
    }
}

fn build_columns(plan: &QueryPlan, pages: &[PageRow]) -> Vec<QueryColumn> {
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
