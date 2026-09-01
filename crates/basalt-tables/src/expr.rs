use basalt_parser::query::{CompareOp, Expr, FieldRef, Literal};
use basalt_types::TypedValue;

use crate::page_row::PageRow;

/// Evaluate a WHERE expression against a page, returning `true` if the page matches.
pub fn eval_expr(expr: &Expr, page: &PageRow) -> bool {
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

/// Evaluate an expression to a `TypedValue` (for sorting, column output, etc.).
pub fn eval_to_typed(expr: &Expr, page: &PageRow) -> TypedValue {
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

/// Resolve a field reference to a `TypedValue` for a given page.
pub fn field_value(field: &FieldRef, page: &PageRow) -> TypedValue {
    let key = field.0.join(".");
    match key.as_str() {
        "file.name" | "name" => TypedValue::Text {
            value: page.name.clone(),
        },
        "file.path" | "path" => TypedValue::Text {
            value: page.path.clone(),
        },
        "file.folder" | "folder" => TypedValue::Text {
            value: page.folder.clone(),
        },
        "file.tags" | "tags" => TypedValue::Text {
            value: page.tags.join(", "),
        },
        "file.links" | "links" => TypedValue::Text {
            value: page.links.join(", "),
        },
        _ => page
            .frontmatter
            .iter()
            .find(|(k, _)| k == &key)
            .map(|(_, v)| v.clone())
            .unwrap_or(TypedValue::Null),
    }
}

/// Compare two `TypedValue`s for ordering (used by SORT).
pub fn compare_typed(a: &TypedValue, b: &TypedValue) -> std::cmp::Ordering {
    match (a, b) {
        (TypedValue::Number { value: a }, TypedValue::Number { value: b }) => {
            a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
        }
        (TypedValue::Text { value: a }, TypedValue::Text { value: b }) => a.cmp(b),
        (TypedValue::Checkbox { value: a }, TypedValue::Checkbox { value: b }) => a.cmp(b),
        (TypedValue::Null, _) => std::cmp::Ordering::Less,
        (_, TypedValue::Null) => std::cmp::Ordering::Greater,
        _ => std::cmp::Ordering::Equal,
    }
}