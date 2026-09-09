use std::cmp::Ordering;
use std::collections::HashSet;

use basalt_parser::query::{CompareOp, Expr, FieldRef, Literal, QueryPlan};
pub use basalt_types::compare_typed;
use basalt_types::TypedValue;

use crate::page_row::PageRow;

/// The evaluation context for a DQL row: a single page (before GROUP BY) or a
/// group of pages (after GROUP BY, where the group key plus its members are
/// in scope).
pub enum EvalCtx<'a> {
    Page(&'a PageRow),
    Group {
        key: &'a TypedValue,
        members: &'a [PageRow],
        /// The field path from the GROUP BY clause (e.g. `["status"]`), when
        /// it was a simple field reference. `None` for computed GROUP BY
        /// expressions where only `key` resolves to the group value.
        group_by_path: Option<&'a [String]>,
    },
}

/// Evaluate a WHERE expression against a row context, returning `true` if it matches.
pub fn eval_expr(expr: &Expr, ctx: &EvalCtx) -> bool {
    match expr {
        Expr::Field(_) => is_truthy(&eval_to_typed(expr, ctx)),
        Expr::Literal(Literal::Bool(b)) => *b,
        Expr::Literal(_) => true,
        Expr::Comparison { left, op, right } => {
            let lv = eval_to_typed(left, ctx);
            let rv = eval_to_typed(right, ctx);
            match op {
                CompareOp::Eq => compare_typed(&lv, &rv) == Ordering::Equal,
                CompareOp::Ne => compare_typed(&lv, &rv) != Ordering::Equal,
                CompareOp::Lt => {
                    if matches!(lv, TypedValue::Null) || matches!(rv, TypedValue::Null) {
                        false
                    } else {
                        compare_typed(&lv, &rv) == Ordering::Less
                    }
                }
                CompareOp::Gt => {
                    if matches!(lv, TypedValue::Null) || matches!(rv, TypedValue::Null) {
                        false
                    } else {
                        compare_typed(&lv, &rv) == Ordering::Greater
                    }
                }
                CompareOp::Le => {
                    if matches!(lv, TypedValue::Null) || matches!(rv, TypedValue::Null) {
                        false
                    } else {
                        compare_typed(&lv, &rv) != Ordering::Greater
                    }
                }
                CompareOp::Ge => {
                    if matches!(lv, TypedValue::Null) || matches!(rv, TypedValue::Null) {
                        false
                    } else {
                        compare_typed(&lv, &rv) != Ordering::Less
                    }
                }
                CompareOp::Contains => eval_contains_values(&lv, &rv),
            }
        }
        Expr::Not(inner) => !eval_expr(inner, ctx),
        Expr::Func { name, args } => {
            if name == "contains" {
                eval_func_contains(args, ctx)
            } else if name == "length" && args.len() == 1 {
                // length(x) is truthy when x is non-empty.
                is_truthy(&eval_to_typed(expr, ctx))
            } else if is_aggregate(name) {
                // A bare aggregate predicate (`WHERE count(rows) > 3` is the
                // comparison form above; this is the lone-`count(rows)` case).
                is_truthy(&eval_to_typed(expr, ctx))
            } else {
                // Unknown function: no match.
                false
            }
        }
    }
}

/// Checks if `needle` is contained in `haystack` (string substring or list membership).
fn eval_contains_values(haystack: &TypedValue, needle: &TypedValue) -> bool {
    match (haystack, needle) {
        (TypedValue::Text { value: hay }, TypedValue::Text { value: needle }) => {
            hay.contains(needle.as_str())
        }
        (TypedValue::List { items }, needle) => items
            .iter()
            .any(|item| compare_typed(item, needle) == Ordering::Equal),
        _ => false,
    }
}

/// Evaluates the `contains(haystack, needle)` function call.
fn eval_func_contains(args: &[Expr], ctx: &EvalCtx) -> bool {
    if args.len() != 2 {
        return false;
    }
    let lv = eval_to_typed(&args[0], ctx);
    let rv = eval_to_typed(&args[1], ctx);
    eval_contains_values(&lv, &rv)
}

/// Evaluates the `length(x)` function call to a TypedValue.
fn eval_func_length(args: &[Expr], ctx: &EvalCtx) -> TypedValue {
    if args.len() != 1 {
        return TypedValue::Null;
    }
    match eval_to_typed(&args[0], ctx) {
        TypedValue::List { items } => TypedValue::Number {
            value: items.len() as f64,
        },
        TypedValue::Text { value } => TypedValue::Number {
            value: value.chars().count() as f64,
        },
        TypedValue::Number { value } => TypedValue::Number { value },
        _ => TypedValue::Null,
    }
}

/// Evaluate an expression to a `TypedValue` (sorting, column output, aggregates).
pub fn eval_to_typed(expr: &Expr, ctx: &EvalCtx) -> TypedValue {
    match expr {
        Expr::Field(f) => field_value(f, ctx),
        Expr::Literal(Literal::Text(s)) => TypedValue::Text { value: s.clone() },
        Expr::Literal(Literal::Number(n)) => TypedValue::Number { value: *n },
        Expr::Literal(Literal::Bool(b)) => TypedValue::Checkbox { value: *b },
        Expr::Literal(Literal::Null) => TypedValue::Null,
        Expr::Comparison { .. } => TypedValue::Checkbox {
            value: eval_expr(expr, ctx),
        },
        Expr::Not(_) => TypedValue::Checkbox {
            value: eval_expr(expr, ctx),
        },
        Expr::Func { name, args } => {
            if matches!(ctx, EvalCtx::Group { .. }) && is_aggregate(name) {
                return eval_aggregate(name, args, ctx);
            }
            if name == "contains" {
                return TypedValue::Checkbox {
                    value: eval_func_contains(args, ctx),
                };
            }
            if name == "length" {
                return eval_func_length(args, ctx);
            }
            // An aggregate outside a GROUP BY context is deferred (Dataview
            // rejects it too); unknown functions are Null.
            TypedValue::Null
        }
    }
}

/// Resolve a field reference against a row context.
pub fn field_value(field: &FieldRef, ctx: &EvalCtx) -> TypedValue {
    match ctx {
        EvalCtx::Page(page) => page_field_value(field, page),
        EvalCtx::Group {
            key, group_by_path, ..
        } => {
            // After GROUP BY only `key` and the original GROUP BY field resolve
            // to a plain value; `rows` / `rows.field` are list-shaped and only
            // meaningful inside aggregate calls.
            if (field.0.len() == 1 && field.0[0] == "key")
                || group_by_path.as_deref() == Some(field.0.as_slice())
            {
                (*key).clone()
            } else {
                TypedValue::Null
            }
        }
    }
}

/// Resolve a field against a single page (the pre-group row shape).
fn page_field_value(field: &FieldRef, page: &PageRow) -> TypedValue {
    if field.0.is_empty() {
        return TypedValue::Null;
    }

    // 1. Strict `file.` namespace: built-in file metadata cannot be shadowed by frontmatter
    if field.0[0] == "file" {
        if field.0.len() == 2 {
            match field.0[1].as_str() {
                "name" => return TypedValue::Text { value: page.name().to_string() },
                "path" => return TypedValue::Text { value: page.path.clone() },
                "folder" => return TypedValue::Text { value: page.folder().to_string() },
                "tags" => return TypedValue::Text { value: page.tags.join(", ") },
                "links" | "outlinks" => return TypedValue::Text { value: page.links.join(", ") },
                _ => return TypedValue::Null,
            }
        }
        return TypedValue::Null;
    }

    // 2. Explicit `frontmatter.` namespace
    if field.0[0] == "frontmatter" {
        if field.0.len() == 2 {
            let key = &field.0[1];
            return page
                .frontmatter
                .iter()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.clone())
                .unwrap_or(TypedValue::Null);
        }
        let key = field.0[1..].join(".");
        return page
            .frontmatter
            .iter()
            .find(|(k, _)| k == &key)
            .map(|(_, v)| v.clone())
            .unwrap_or(TypedValue::Null);
    }

    // 3. User property access: check frontmatter first (so custom properties match)
    if field.0.len() == 1 {
        let key = &field.0[0];
        if let Some((_, v)) = page.frontmatter.iter().find(|(k, _)| k == key) {
            return v.clone();
        }

        // 4. Built-in convenience fallbacks for unprefixed file properties
        match key.as_str() {
            "name" => TypedValue::Text { value: page.name().to_string() },
            "path" => TypedValue::Text { value: page.path.clone() },
            "folder" => TypedValue::Text { value: page.folder().to_string() },
            "tags" => TypedValue::Text { value: page.tags.join(", ") },
            "links" => TypedValue::Text { value: page.links.join(", ") },
            _ => TypedValue::Null,
        }
    } else {
        let key = field.0.join(".");
        if let Some((_, v)) = page.frontmatter.iter().find(|(k, _)| k == &key) {
            return v.clone();
        }
        TypedValue::Null
    }
}

/// Evaluate an aggregate function (`count`, `length`, `sum`, `avg`/`average`,
/// `min`, `max`) over a group's members.
fn eval_aggregate(name: &str, args: &[Expr], ctx: &EvalCtx) -> TypedValue {
    let members = match ctx {
        EvalCtx::Group { members, .. } => members,
        _ => return TypedValue::Null,
    };
    if args.len() != 1 {
        return TypedValue::Null;
    }
    let arg = &args[0];
    // count(rows) / length(rows): the group size.
    if matches!(name, "count" | "length") && is_rows_ref(arg) {
        return TypedValue::Number {
            value: members.len() as f64,
        };
    }
    // The argument's value per member (`rows.X` resolves to `X` per member).
    let values: Vec<TypedValue> = members.iter().map(|m| eval_member_arg(arg, m)).collect();
    match name {
        "count" | "length" => TypedValue::Number {
            value: values
                .iter()
                .filter(|v| !matches!(v, TypedValue::Null))
                .count() as f64,
        },
        "sum" => {
            let nums: Vec<f64> = values.iter().filter_map(numeric).filter(|n| n.is_finite()).collect();
            if nums.is_empty() {
                TypedValue::Null
            } else {
                TypedValue::Number {
                    value: nums.iter().sum(),
                }
            }
        }
        "avg" | "average" => {
            let nums: Vec<f64> = values.iter().filter_map(numeric).filter(|n| n.is_finite()).collect();
            if nums.is_empty() {
                TypedValue::Null
            } else {
                let sum: f64 = nums.iter().sum();
                let avg = sum / nums.len() as f64;
                if avg.is_finite() {
                    TypedValue::Number { value: avg }
                } else {
                    TypedValue::Null
                }
            }
        }
        "min" => extremum(&values, Ordering::Less),
        "max" => extremum(&values, Ordering::Greater),
        _ => TypedValue::Null,
    }
}

/// The min (`want` = Less) or max (`want` = Greater) of the numeric values.
fn extremum(values: &[TypedValue], want: Ordering) -> TypedValue {
    let mut best: Option<f64> = None;
    for v in values {
        if let TypedValue::Number { value } = v {
            if value.is_finite() {
                best = Some(match best {
                    None => *value,
                    Some(b) => {
                        if b.total_cmp(value) == want {
                            b
                        } else {
                            *value
                        }
                    }
                });
            }
        }
    }
    match best {
        Some(v) => TypedValue::Number { value: v },
        None => TypedValue::Null,
    }
}

/// Evaluate an aggregate argument against a single member page, stripping a
/// leading `rows.` prefix so `rows.priority` resolves to `priority`.
fn eval_member_arg(arg: &Expr, member: &PageRow) -> TypedValue {
    match arg {
        Expr::Field(FieldRef(parts)) => {
            if parts.first().map(String::as_str) == Some("rows") {
                page_field_value(&FieldRef(parts[1..].to_vec()), member)
            } else {
                page_field_value(&FieldRef(parts.clone()), member)
            }
        }
        other => eval_to_typed(other, &EvalCtx::Page(member)),
    }
}

fn is_rows_ref(arg: &Expr) -> bool {
    matches!(arg, Expr::Field(FieldRef(parts)) if parts.len() == 1 && parts[0] == "rows")
}

fn numeric(v: &TypedValue) -> Option<f64> {
    match v {
        TypedValue::Number { value } => Some(*value),
        _ => None,
    }
}

fn is_aggregate(name: &str) -> bool {
    matches!(
        name,
        "count" | "length" | "sum" | "avg" | "average" | "min" | "max"
    )
}

fn is_truthy(v: &TypedValue) -> bool {
    match v {
        TypedValue::Null => false,
        TypedValue::Checkbox { value } => *value,
        TypedValue::List { items } => !items.is_empty(),
        _ => true,
    }
}

/// Traverse an expression tree and collect all referenced field paths.
pub fn collect_expr_fields(expr: &Expr, fields: &mut Vec<FieldRef>) {
    match expr {
        Expr::Field(f) => fields.push(f.clone()),
        Expr::Comparison { left, right, .. } => {
            collect_expr_fields(left, fields);
            collect_expr_fields(right, fields);
        }
        Expr::Not(inner) => collect_expr_fields(inner, fields),
        Expr::Func { args, .. } => {
            for arg in args {
                collect_expr_fields(arg, fields);
            }
        }
        Expr::Literal(_) => {}
    }
}

/// Analyze the full QueryPlan to determine the minimal projection needed from the vault:
/// 1. Referenced frontmatter keys (returns None if wildcard/unprojected).
/// 2. Whether note tags are needed (`file.tags` / `tags` in query).
/// 3. Whether note links are needed (`file.links` / `links` / `file.outlinks` in query).
pub fn collect_query_projection(
    plan: &QueryPlan,
) -> (Option<HashSet<String>>, bool, bool) {
    let mut fields: Vec<FieldRef> = Vec::new();

    // Query fields / columns
    for f in &plan.fields {
        collect_expr_fields(&f.expr, &mut fields);
    }

    // Commands (WHERE, SORT, GROUP BY, FLATTEN)
    for cmd in &plan.commands {
        match cmd {
            basalt_parser::query::DataCommand::Where(expr) => collect_expr_fields(expr, &mut fields),
            basalt_parser::query::DataCommand::Sort { field, .. } => fields.push(field.clone()),
            basalt_parser::query::DataCommand::GroupBy { expr, .. } => collect_expr_fields(expr, &mut fields),
            basalt_parser::query::DataCommand::Flatten { expr, .. } => collect_expr_fields(expr, &mut fields),
            basalt_parser::query::DataCommand::Limit(_) => {}
        }
    }

    let mut projected_keys = HashSet::new();
    let mut needs_tags = false;
    let mut needs_links = false;

    for field in fields {
        if field.0.is_empty() {
            continue;
        }
        let first = &field.0[0];
        if first == "file" {
            if field.0.len() == 2 {
                match field.0[1].as_str() {
                    "tags" => needs_tags = true,
                    "links" | "outlinks" => needs_links = true,
                    _ => {}
                }
            }
        } else if first == "frontmatter" {
            if field.0.len() > 1 {
                projected_keys.insert(field.0[1..].join("."));
            }
        } else if first == "rows" {
            if field.0.len() > 1 {
                let sub = &field.0[1];
                if sub == "tags" {
                    needs_tags = true;
                } else if sub == "links" || sub == "outlinks" {
                    needs_links = true;
                } else {
                    projected_keys.insert(field.0[1..].join("."));
                }
            }
        } else {
            match first.as_str() {
                "tags" => needs_tags = true,
                "links" => needs_links = true,
                _ => {}
            }
            projected_keys.insert(field.0.join("."));
        }
    }

    (Some(projected_keys), needs_tags, needs_links)
}
