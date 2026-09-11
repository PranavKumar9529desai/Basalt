//! Canonical cross-type comparison for `TypedValue`.

use std::cmp::Ordering;

use super::{parse_date_ts, parse_datetime_ts, TypedValue};

/// Canonical discriminant tier for cross-type comparison.
///
/// Null (0) < Checkbox (1) < Number (2) < Date (3) < DateTime (4) < Text (5) < Link (6) < List (7).
pub fn type_tier(v: &TypedValue) -> u8 {
    match v {
        TypedValue::Null => 0,
        TypedValue::Checkbox { .. } => 1,
        TypedValue::Number { .. } => 2,
        TypedValue::Date { .. } => 3,
        TypedValue::DateTime { .. } => 4,
        TypedValue::Text { .. } => 5,
        TypedValue::Link { .. } => 6,
        TypedValue::List { .. } => 7,
    }
}

/// Compare two `TypedValue`s with canonical total ordering across all types.
pub fn compare_typed(a: &TypedValue, b: &TypedValue) -> Ordering {
    let tier_a = type_tier(a);
    let tier_b = type_tier(b);
    if tier_a != tier_b {
        // Cross-type temporal interoperability: Date vs DateTime
        if (tier_a == 3 && tier_b == 4) || (tier_a == 4 && tier_b == 3) {
            let ts_a = match a {
                TypedValue::Date { value } => parse_date_ts(value),
                TypedValue::DateTime { value } => parse_datetime_ts(value),
                _ => None,
            };
            let ts_b = match b {
                TypedValue::Date { value } => parse_date_ts(value),
                TypedValue::DateTime { value } => parse_datetime_ts(value),
                _ => None,
            };
            if let (Some(ts_a), Some(ts_b)) = (ts_a, ts_b) {
                return ts_a.cmp(&ts_b);
            }
        }
        return tier_a.cmp(&tier_b);
    }

    match (a, b) {
        (TypedValue::Null, TypedValue::Null) => Ordering::Equal,
        (TypedValue::Checkbox { value: a }, TypedValue::Checkbox { value: b }) => a.cmp(b),
        (TypedValue::Number { value: a }, TypedValue::Number { value: b }) => a.total_cmp(b),
        (TypedValue::Date { value: a }, TypedValue::Date { value: b }) => {
            if let (Some(ts_a), Some(ts_b)) = (parse_date_ts(a), parse_date_ts(b)) {
                ts_a.cmp(&ts_b)
            } else {
                a.cmp(b)
            }
        }
        (TypedValue::DateTime { value: a }, TypedValue::DateTime { value: b }) => {
            if let (Some(ts_a), Some(ts_b)) = (parse_datetime_ts(a), parse_datetime_ts(b)) {
                ts_a.cmp(&ts_b)
            } else {
                a.cmp(b)
            }
        }
        (TypedValue::Text { value: a }, TypedValue::Text { value: b }) => a.cmp(b),
        (TypedValue::Link { name: na, path: pa }, TypedValue::Link { name: nb, path: pb }) => {
            pa.cmp(pb).then_with(|| na.cmp(nb))
        }
        (TypedValue::List { items: a }, TypedValue::List { items: b }) => {
            let min_len = a.len().min(b.len());
            for i in 0..min_len {
                let cmp = compare_typed(&a[i], &b[i]);
                if cmp != Ordering::Equal {
                    return cmp;
                }
            }
            a.len().cmp(&b.len())
        }
        _ => Ordering::Equal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_typed_total_ordering() {
        assert_eq!(
            compare_typed(&TypedValue::Null, &TypedValue::Checkbox { value: false }),
            Ordering::Less
        );
        assert_eq!(
            compare_typed(
                &TypedValue::Checkbox { value: true },
                &TypedValue::Number { value: 0.0 }
            ),
            Ordering::Less
        );
        assert_eq!(
            compare_typed(
                &TypedValue::Number { value: 10.0 },
                &TypedValue::Number { value: 2.0 }
            ),
            Ordering::Greater
        );
        assert_eq!(
            compare_typed(
                &TypedValue::Date {
                    value: "2024-01-01".into()
                },
                &TypedValue::DateTime {
                    value: "2024-01-01T12:00:00Z".into()
                }
            ),
            Ordering::Less
        );
        assert_eq!(
            compare_typed(
                &TypedValue::Text { value: "a".into() },
                &TypedValue::Text { value: "b".into() }
            ),
            Ordering::Less
        );
    }
}
