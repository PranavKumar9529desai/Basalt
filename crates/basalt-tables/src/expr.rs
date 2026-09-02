use std::cmp::Ordering;

use basalt_parser::query::{CompareOp, Expr, FieldRef, Literal};
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
                CompareOp::Lt => compare_typed(&lv, &rv) == Ordering::Less,
                CompareOp::Gt => compare_typed(&lv, &rv) == Ordering::Greater,
                CompareOp::Le => compare_typed(&lv, &rv) != Ordering::Greater,
                CompareOp::Ge => compare_typed(&lv, &rv) != Ordering::Less,
                CompareOp::Contains => match (&lv, &rv) {
                    (TypedValue::Text { value: hay }, TypedValue::Text { value: needle }) => {
                        hay.contains(needle.as_str())
                    }
                    _ => false,
                },
            }
        }
        Expr::Not(inner) => !eval_expr(inner, ctx),
        Expr::Func { name, args } => {
            if name == "contains" && args.len() == 2 {
                let lv = eval_to_typed(&args[0], ctx);
                let rv = eval_to_typed(&args[1], ctx);
                match (&lv, &rv) {
                    (TypedValue::Text { value: hay }, TypedValue::Text { value: needle }) => {
                        hay.contains(needle.as_str())
                    }
                    (TypedValue::List { items }, needle) => {
                        items.iter().any(|item| compare_typed(item, needle) == Ordering::Equal)
                    }
                    _ => false,
                }
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

/// Evaluate an expression to a `TypedValue` (sorting, column output, aggregates).
pub fn eval_to_typed(expr: &Expr, ctx: &EvalCtx) -> TypedValue {
    match expr {
        Expr::Field(f) => field_value(f, ctx),
        Expr::Literal(Literal::Text(s)) => TypedValue::Text { value: s.clone() },
        Expr::Literal(Literal::Number(n)) => TypedValue::Number { value: *n },
        Expr::Literal(Literal::Bool(b)) => TypedValue::Checkbox { value: *b },
        Expr::Literal(Literal::Null) => TypedValue::Null,
        Expr::Comparison { .. } => TypedValue::Checkbox { value: eval_expr(expr, ctx) },
        Expr::Not(_) => TypedValue::Checkbox { value: eval_expr(expr, ctx) },
        Expr::Func { name, args } => {
            if matches!(ctx, EvalCtx::Group { .. }) && is_aggregate(name) {
                return eval_aggregate(name, args, ctx);
            }
            if name == "contains" && args.len() == 2 {
                let lv = eval_to_typed(&args[0], ctx);
                let rv = eval_to_typed(&args[1], ctx);
                return TypedValue::Checkbox {
                    value: match (&lv, &rv) {
                        (TypedValue::Text { value: hay }, TypedValue::Text { value: needle }) => {
                            hay.contains(needle.as_str())
                        }
                        (TypedValue::List { items }, needle) => {
                            items.iter().any(|item| compare_typed(item, needle) == Ordering::Equal)
                        }
                        _ => false,
                    },
                };
            }
            if name == "length" && args.len() == 1 {
                return match eval_to_typed(&args[0], ctx) {
                    TypedValue::List { items } => TypedValue::Number { value: items.len() as f64 },
                    TypedValue::Text { value } => TypedValue::Number { value: value.chars().count() as f64 },
                    TypedValue::Number { value } => TypedValue::Number { value },
                    _ => TypedValue::Null,
                };
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
        EvalCtx::Group { key, group_by_path, .. } => {
            // After GROUP BY only `key` and the original GROUP BY field resolve
            // to a plain value; `rows` / `rows.field` are list-shaped and only
            // meaningful inside aggregate calls.
            if field.0.len() == 1 && field.0[0] == "key" {
                (*key).clone()
            } else if group_by_path.as_deref() == Some(field.0.as_slice()) {
                (*key).clone()
            } else {
                TypedValue::Null
            }
        }
    }
}

/// Resolve a field against a single page (the pre-group row shape).
fn page_field_value(field: &FieldRef, page: &PageRow) -> TypedValue {
    let key = field.0.join(".");
    match key.as_str() {
        "file.name" | "name" => TypedValue::Text { value: page.name.clone() },
        "file.path" | "path" => TypedValue::Text { value: page.path.clone() },
        "file.folder" | "folder" => TypedValue::Text { value: page.folder.clone() },
        "file.tags" | "tags" => TypedValue::Text { value: page.tags.join(", ") },
        "file.links" | "links" => TypedValue::Text { value: page.links.join(", ") },
        _ => page
            .frontmatter
            .iter()
            .find(|(k, _)| k == &key)
            .map(|(_, v)| v.clone())
            .unwrap_or(TypedValue::Null),
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
        return TypedValue::Number { value: members.len() as f64 };
    }
    // The argument's value per member (`rows.X` resolves to `X` per member).
    let values: Vec<TypedValue> = members
        .iter()
        .map(|m| eval_member_arg(arg, m))
        .collect();
    match name {
        "count" | "length" => TypedValue::Number {
            value: values.iter().filter(|v| !matches!(v, TypedValue::Null)).count() as f64,
        },
        "sum" => TypedValue::Number {
            value: values.iter().filter_map(numeric).sum(),
        },
        "avg" | "average" => {
            let nums: Vec<f64> = values.iter().filter_map(numeric).collect();
            if nums.is_empty() {
                TypedValue::Null
            } else {
                TypedValue::Number {
                    value: nums.iter().sum::<f64>() / nums.len() as f64,
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
            best = Some(match best {
                None => *value,
                Some(b) => {
                    if b.partial_cmp(value).unwrap_or(Ordering::Equal) == want {
                        b
                    } else {
                        *value
                    }
                }
            });
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

/// Compare two `TypedValue`s for ordering (used by SORT).
pub fn compare_typed(a: &TypedValue, b: &TypedValue) -> std::cmp::Ordering {
    match (a, b) {
        (TypedValue::Number { value: a }, TypedValue::Number { value: b }) => {
            a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
        }
        (TypedValue::Text { value: a }, TypedValue::Text { value: b }) => a.cmp(b),
        // ISO-8601 dates compare lexicographically.
        (TypedValue::Date { value: a }, TypedValue::Date { value: b }) => a.cmp(b),
        (TypedValue::Checkbox { value: a }, TypedValue::Checkbox { value: b }) => a.cmp(b),
        (TypedValue::Null, _) => std::cmp::Ordering::Less,
        (_, TypedValue::Null) => std::cmp::Ordering::Greater,
        _ => std::cmp::Ordering::Equal,
    }
}