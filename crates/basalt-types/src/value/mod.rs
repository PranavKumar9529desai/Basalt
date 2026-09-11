//! The single unified value type used by the DQL engine and the frontmatter
//! engine alike. `FrontmatterValue` is an alias for `TypedValue`.

mod compare;
mod date_utils;
mod yaml;

pub use compare::{compare_typed, type_tier};
pub use date_utils::{parse_date_ts, parse_datetime_ts};
pub use yaml::{yaml_to_typed, yaml_to_typed_pairs};

use serde::{Deserialize, Serialize};

/// A typed value. Internally-tagged with a `type` discriminant, matching the
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
/// validated, matching the parser's frontmatter convention.
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

impl TypedValue {
    /// Canonical total comparison against another `TypedValue`.
    #[inline]
    pub fn compare(&self, other: &Self) -> std::cmp::Ordering {
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
    }
}
