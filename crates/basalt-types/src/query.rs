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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<TypedValue>>,
    pub total: usize,
}

impl Default for QueryResult {
    fn default() -> Self {
        Self {
            columns: vec![],
            rows: vec![],
            total: 0,
        }
    }
}
/// Convert a `serde_yaml_ng::Value` to a `TypedValue`.
pub fn yaml_to_typed(val: &serde_yaml_ng::Value) -> TypedValue {
    match val {
        serde_yaml_ng::Value::Null => TypedValue::Null,
        serde_yaml_ng::Value::Bool(b) => TypedValue::Checkbox { value: *b },
        serde_yaml_ng::Value::Number(n) => TypedValue::Number {
            value: n.as_f64().unwrap_or(0.0),
        },
        serde_yaml_ng::Value::String(s) => TypedValue::Text { value: s.clone() },
        serde_yaml_ng::Value::Sequence(seq) => match seq.first() {
            Some(serde_yaml_ng::Value::String(s)) => TypedValue::Text { value: s.clone() },
            Some(v) => yaml_to_typed(v),
            None => TypedValue::Null,
        },
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
