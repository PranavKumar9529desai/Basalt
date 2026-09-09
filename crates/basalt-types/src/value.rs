use serde::{Deserialize, Serialize};

/// A typed value. The single unified value type used by the DQL engine and the
/// frontmatter engine alike (ADR-030 Phase 2) — `FrontmatterValue` is an alias
/// for this. Internally-tagged with a `type` discriminant, matching the
/// frontend `query.ts` / `dql-widget.ts` mirrors.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TypedValue {
    Text {
        value: String,
    },
    Number {
        value: f64,
    },
    Date {
        value: String,
    },
    /// ISO-8601 date-time (`YYYY-MM-DDTHH:mm:…`). Only frontmatter emits this;
    /// DQL collapses datetime strings to `Date`.
    #[serde(rename = "datetime")]
    DateTime {
        value: String,
    },
    Checkbox {
        value: bool,
    },
    Link {
        name: String,
        path: String,
    },
    List {
        items: Vec<TypedValue>,
    },
    Null,
}

/// Detect an ISO-8601 date string: exactly `YYYY-MM-DD`. Format-check only
/// (positions 4 and 7 are dashes, the rest digits); calendar validity is not
/// validated, matching the parser's frontmatter convention. Kept local:
/// basalt-types must not depend on basalt-parser.
fn is_iso_date_string(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[0..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..10].iter().all(|c| c.is_ascii_digit())
}

/// Detect an ISO-8601 date-time string: `YYYY-MM-DDTHH:mm:…` (position 10 is
/// `T`). Date vs datetime is distinct for frontmatter but folded to `Date` in
/// DQL.
fn is_iso_datetime_string(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 11 && b[10] == b'T' && is_iso_date_string(&s[..10])
}

/// Extract the first `[[Target]]` target from a string (ignoring alias/`#`).
/// The link's `path` is its `name` — frontmatter wikilinks carry only a target.
fn first_wikilink_target(s: &str) -> Option<String> {
    let open = s.find("[[")?;
    let rest = &s[open + 2..];
    let close = rest.find("]]")?;
    let inner = &rest[..close];
    let target = inner.split(['|', '#']).next().unwrap_or("").trim();
    if target.is_empty() {
        None
    } else {
        Some(target.to_string())
    }
}

/// Convert a `serde_yaml_ng::Value` to a `TypedValue`. The single YAML
/// converter shared by the frontmatter engine and DQL (ADR-030 Phase 2):
/// booleans/numbers/null/lists map directly; quoted strings are classified as
/// a wikilink (`[[Target]]` → `Link`), an ISO date-time (`DateTime`), an ISO
/// date (`Date`), or plain `Text`.
pub fn yaml_to_typed(val: &serde_yaml_ng::Value) -> TypedValue {
    match val {
        serde_yaml_ng::Value::Null => TypedValue::Null,
        serde_yaml_ng::Value::Bool(b) => TypedValue::Checkbox { value: *b },
        serde_yaml_ng::Value::Number(n) => TypedValue::Number {
            value: n.as_f64().unwrap_or(0.0),
        },
        serde_yaml_ng::Value::String(s) => {
            if let Some(target) = first_wikilink_target(s) {
                TypedValue::Link {
                    name: target.clone(),
                    path: target,
                }
            } else if is_iso_datetime_string(s) {
                TypedValue::DateTime { value: s.clone() }
            } else if is_iso_date_string(s) {
                TypedValue::Date { value: s.clone() }
            } else {
                TypedValue::Text { value: s.clone() }
            }
        }
        serde_yaml_ng::Value::Sequence(seq) => TypedValue::List {
            items: seq.iter().map(yaml_to_typed).collect(),
        },
        serde_yaml_ng::Value::Mapping(_) | serde_yaml_ng::Value::Tagged(_) => TypedValue::Text {
            value: serde_yaml_ng::to_string(val).unwrap_or_default(),
        },
    }
}

/// Convert a YAML mapping to `(key, TypedValue)` pairs.
pub fn yaml_to_typed_pairs(val: &serde_yaml_ng::Value) -> Vec<(String, TypedValue)> {
    match val {
        serde_yaml_ng::Value::Mapping(map) => map
            .iter()
            .filter_map(|(k, v)| {
                let key = k.as_str()?.to_string();
                let typed = yaml_to_typed(v);
                Some((key, typed))
            })
            .collect(),
        _ => vec![],
    }
}

use chrono::{DateTime, NaiveDate};
use std::cmp::Ordering;

/// Canonical discriminant tier for cross-type comparison.
/// ADR-045 canonical ordering: Null (0) < Checkbox (1) < Number (2) < Date (3) < DateTime (4) < Text (5) < Link (6) < List (7).
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

pub fn parse_date_ts(s: &str) -> Option<i64> {
    let nd = NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    Some(nd.and_hms_opt(0, 0, 0)?.and_utc().timestamp())
}

pub fn parse_datetime_ts(s: &str) -> Option<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        Some(dt.timestamp())
    } else if let Ok(nd) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        Some(nd.and_hms_opt(0, 0, 0)?.and_utc().timestamp())
    } else {
        None
    }
}

/// Compare two `TypedValue`s with canonical total ordering across all types (ADR-045).
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

impl TypedValue {
    /// Canonical total comparison against another `TypedValue`.
    #[inline]
    pub fn compare(&self, other: &Self) -> Ordering {
        compare_typed(self, other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_date_and_datetime_strings_become_typed_dates() {
        let date = serde_yaml_ng::Value::String("2024-01-15".to_string());
        assert_eq!(
            yaml_to_typed(&date),
            TypedValue::Date {
                value: "2024-01-15".to_string()
            }
        );
        let datetime = serde_yaml_ng::Value::String("2024-01-15T10:30:00".to_string());
        assert_eq!(
            yaml_to_typed(&datetime),
            TypedValue::DateTime {
                value: "2024-01-15T10:30:00".to_string()
            }
        );
    }

    #[test]
    fn wikilink_strings_become_links() {
        let link = serde_yaml_ng::Value::String("[[Other Note]]".to_string());
        assert_eq!(
            yaml_to_typed(&link),
            TypedValue::Link {
                name: "Other Note".to_string(),
                path: "Other Note".to_string(),
            }
        );
    }

    #[test]
    fn link_ignores_alias_and_heading() {
        let with_alias = serde_yaml_ng::Value::String("[[Note|alias]]".to_string());
        assert_eq!(
            yaml_to_typed(&with_alias),
            TypedValue::Link {
                name: "Note".to_string(),
                path: "Note".to_string(),
            }
        );
        let with_heading = serde_yaml_ng::Value::String("[[Note#Section]]".to_string());
        assert!(matches!(
            yaml_to_typed(&with_heading),
            TypedValue::Link { .. }
        ));
    }

    #[test]
    fn non_iso_strings_stay_text() {
        let plain = serde_yaml_ng::Value::String("Tuesday".to_string());
        assert_eq!(
            yaml_to_typed(&plain),
            TypedValue::Text {
                value: "Tuesday".to_string()
            }
        );
        // Short/malformed shapes are not dates.
        let short = serde_yaml_ng::Value::String("2024-1-5".to_string());
        assert!(matches!(yaml_to_typed(&short), TypedValue::Text { .. }));
    }

    #[test]
    fn sequence_becomes_list() {
        let val = serde_yaml_ng::Value::Sequence(vec![
            serde_yaml_ng::Value::String("alpha".to_string()),
            serde_yaml_ng::Value::Number(42.into()),
            serde_yaml_ng::Value::Bool(true),
        ]);
        assert_eq!(
            yaml_to_typed(&val),
            TypedValue::List {
                items: vec![
                    TypedValue::Text {
                        value: "alpha".to_string()
                    },
                    TypedValue::Number { value: 42.0 },
                    TypedValue::Checkbox { value: true },
                ]
            }
        );
    }

    #[test]
    fn empty_sequence_becomes_empty_list() {
        let val = serde_yaml_ng::Value::Sequence(vec![]);
        assert_eq!(yaml_to_typed(&val), TypedValue::List { items: vec![] });
    }

    #[test]
    fn serializes_internally_tagged_like_the_frontend_query_types() {
        // These shapes must match `features/editor/types/query.ts` exactly.
        let cases: Vec<(TypedValue, &str)> = vec![
            (
                TypedValue::Text {
                    value: "hi".to_string(),
                },
                r#"{"type":"text","value":"hi"}"#,
            ),
            (
                TypedValue::Number { value: 3.0 },
                r#"{"type":"number","value":3.0}"#,
            ),
            (
                TypedValue::DateTime {
                    value: "2024-01-15T10:00:00".to_string(),
                },
                r#"{"type":"datetime","value":"2024-01-15T10:00:00"}"#,
            ),
            (
                TypedValue::Link {
                    name: "Note".to_string(),
                    path: "Note".to_string(),
                },
                r#"{"type":"link","name":"Note","path":"Note"}"#,
            ),
            (TypedValue::Null, r#"{"type":"null"}"#),
        ];
        for (value, expected) in cases {
            let actual = serde_json::to_string(&value).unwrap();
            assert_eq!(actual, expected, "mismatch for {value:?}");
        }
    }

    #[test]
    fn helper_date_and_link_boundary_cases() {
        assert!(is_iso_date_string("2026-12-31"));
        assert!(!is_iso_date_string("2026-1-31"));
        assert!(!is_iso_date_string("2026-12-3"));
        assert!(!is_iso_date_string("2026/12/31"));
        assert!(!is_iso_date_string(""));

        assert!(is_iso_datetime_string("2026-12-31T23:59:59"));
        assert!(is_iso_datetime_string("2026-12-31T23:59:59Z"));
        assert!(!is_iso_datetime_string("2026-12-31 23:59:59"));
        assert!(!is_iso_datetime_string("short"));

        assert_eq!(
            first_wikilink_target("[[Target]]"),
            Some("Target".to_string())
        );
        assert_eq!(
            first_wikilink_target("text [[Target|Alias]] more"),
            Some("Target".to_string())
        );
        assert_eq!(first_wikilink_target("[[]]"), None);
        assert_eq!(first_wikilink_target("[[   ]]"), None);
        assert_eq!(first_wikilink_target("no link here"), None);
    }

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
