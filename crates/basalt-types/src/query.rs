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

/// Column metadata for a query result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: QueryColumnType,
}

/// The closed set of DQL column types a query result can carry.
///
/// A `String` here would let a typo produce invalid output; an enum makes the
/// set exhaustive (ADR-030 §2.3). Serializes to lowercase snake_case, matching
/// the frontend `query.ts` / `dql-widget.ts` mirrors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueryColumnType {
    Text,
    Number,
    Date,
    Checkbox,
    Link,
    List,
}

impl QueryColumnType {
    /// Infer the column type from a representative cell value.
    pub fn from_typed(value: &TypedValue) -> Self {
        match value {
            TypedValue::Number { .. } => QueryColumnType::Number,
            TypedValue::Checkbox { .. } => QueryColumnType::Checkbox,
            TypedValue::Link { .. } => QueryColumnType::Link,
            TypedValue::Date { .. } | TypedValue::DateTime { .. } => QueryColumnType::Date,
            TypedValue::List { .. } => QueryColumnType::List,
            _ => QueryColumnType::Text,
        }
    }
}

/// Full query result returned to the frontend.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<TypedValue>>,
    pub total: usize,
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
}
