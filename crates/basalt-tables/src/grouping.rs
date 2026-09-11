use basalt_parser::query::{Expr, FieldRef};
use basalt_types::TypedValue;

use crate::engine::WorkRow;
use crate::expr::{eval_to_typed, EvalCtx};
use crate::page_row::PageRow;

/// Group page rows by the evaluated key expression, preserving first-seen
/// group order. Rows that are already groups pass through unchanged (nested
/// grouping is deferred).
///
/// Groups are indexed by a hashable [`GroupKey`] so this is O(N) rather than a
/// per-row linear scan of existing groups (O(N·G)). Grouping uses strict
/// type-and-value equality, so `Number(3)` and `Text("3")` are *not* the same
/// group — matching Dataview semantics (the old `compare_typed == Equal` test
/// conflated unrelated cross-type values, per ADR-030 §3).
pub(crate) fn group_rows(rows: Vec<WorkRow>, expr: &Expr) -> Vec<WorkRow> {
    // A simple-field GROUP BY lets that field resolve to the group key in the
    // output (Dataview swizzling); computed GROUP BY exposes only `key`.
    let group_by_path: Option<Vec<String>> = match expr {
        Expr::Field(FieldRef(parts)) => Some(parts.clone()),
        _ => None,
    };
    let mut groups: Vec<(GroupKey, TypedValue, Vec<PageRow>)> = Vec::new();
    // Maps a group's identity to its position in `groups` (first-seen order).
    let mut index: std::collections::HashMap<GroupKey, usize> = std::collections::HashMap::new();
    let mut carried: Vec<WorkRow> = Vec::new();
    for row in rows {
        match row {
            WorkRow::Page(page) => {
                let key = eval_to_typed(expr, &EvalCtx::Page(&page));
                let id = GroupKey::from_typed(&key);
                match index.get(&id) {
                    Some(&pos) => groups[pos].2.push(page),
                    None => {
                        let pos = groups.len();
                        groups.push((id.clone(), key, vec![page]));
                        index.insert(id, pos);
                    }
                }
            }
            other => carried.push(other),
        }
    }
    let mut out: Vec<WorkRow> = groups
        .into_iter()
        .map(|(_id, key, members)| WorkRow::Group {
            key,
            members,
            group_by_path: group_by_path.clone(),
        })
        .collect();
    out.extend(carried);
    out
}

/// Hashable identity of a group key value (strict type+value equality).
/// Required because [`TypedValue`] holds an `f64` and is neither `Eq` nor
/// `Hash`; `Number` is canonicalized so `-0.0` and `0.0` group together.
#[derive(Clone, PartialEq, Eq, Hash)]
enum GroupKey {
    Text(String),
    Number(u64),
    Date(String),
    Checkbox(bool),
    Link(String, String),
    List(Vec<GroupKey>),
    Null,
}

impl GroupKey {
    fn from_typed(v: &TypedValue) -> GroupKey {
        match v {
            TypedValue::Text { value } => GroupKey::Text(value.clone()),
            TypedValue::Number { value } => GroupKey::Number(canonical_bits(*value)),
            TypedValue::Date { value } => GroupKey::Date(value.clone()),
            TypedValue::DateTime { value } => GroupKey::Date(value.clone()),
            TypedValue::Checkbox { value } => GroupKey::Checkbox(*value),
            TypedValue::Link { name, path } => GroupKey::Link(name.clone(), path.clone()),
            TypedValue::List { items } => {
                GroupKey::List(items.iter().map(GroupKey::from_typed).collect())
            }
            TypedValue::Null => GroupKey::Null,
        }
    }
}

/// Canonical f64 bits so `-0.0` and `0.0` hash/compare equal. NaNs keep their
/// raw bits (two NaNs never group together), matching `f64`'s `PartialEq`.
fn canonical_bits(value: f64) -> u64 {
    if value == 0.0 {
        0.0f64.to_bits()
    } else {
        value.to_bits()
    }
}
