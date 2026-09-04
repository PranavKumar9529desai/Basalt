use serde::{Deserialize, Serialize};

/// A typed value returned by a query cell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TypedValue {
    Text { value: String },
    Number { value: f64 },
    Date { value: String },
    Checkbox { value: bool },
    Link { name: String, path: String },
    List { items: Vec<TypedValue> },
    Null,
}

/// Column metadata for a query result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
}

/// Full query result returned to the frontend.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<TypedValue>>,
    pub total: usize,
}

/// Detect an ISO-8601 date string: `YYYY-MM-DD`, or a datetime starting with
/// that shape (`YYYY-MM-DDTHH:...`). Format-check only (positions 4 and 7 are
/// dashes, the rest digits); calendar validity is not validated, matching the
/// parser's frontmatter convention. Kept local: basalt-types must not depend
/// on basalt-parser.
fn is_iso_date_string(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[0..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..10].iter().all(|c| c.is_ascii_digit())
        && (b.len() == 10 || b[10] == b'T')
}

/// Convert a `serde_yaml_ng::Value` to a `TypedValue`.
pub fn yaml_to_typed(val: &serde_yaml_ng::Value) -> TypedValue {
    match val {
        serde_yaml_ng::Value::Null => TypedValue::Null,
        serde_yaml_ng::Value::Bool(b) => TypedValue::Checkbox { value: *b },
        serde_yaml_ng::Value::Number(n) => TypedValue::Number {
            value: n.as_f64().unwrap_or(0.0),
        },
        serde_yaml_ng::Value::String(s) => {
            if is_iso_date_string(s) {
                TypedValue::Date { value: s.clone() }
            } else {
                TypedValue::Text { value: s.clone() }
            }
        }
        serde_yaml_ng::Value::Sequence(seq) => {
            TypedValue::List {
                items: seq.iter().map(yaml_to_typed).collect(),
            }
        }
        _ => TypedValue::Text { value: format!("{:?}", val) },
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
            TypedValue::Date { value: "2024-01-15".to_string() }
        );
        let datetime = serde_yaml_ng::Value::String("2024-01-15T10:30:00".to_string());
        assert_eq!(
            yaml_to_typed(&datetime),
            TypedValue::Date { value: "2024-01-15T10:30:00".to_string() }
        );
    }

    #[test]
    fn non_iso_strings_stay_text() {
        let plain = serde_yaml_ng::Value::String("Tuesday".to_string());
        assert_eq!(
            yaml_to_typed(&plain),
            TypedValue::Text { value: "Tuesday".to_string() }
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
                    TypedValue::Text { value: "alpha".to_string() },
                    TypedValue::Number { value: 42.0 },
                    TypedValue::Checkbox { value: true },
                ]
            }
        );
    }

    #[test]
    fn empty_sequence_becomes_empty_list() {
        let val = serde_yaml_ng::Value::Sequence(vec![]);
        assert_eq!(
            yaml_to_typed(&val),
            TypedValue::List { items: vec![] }
        );
    }
}
