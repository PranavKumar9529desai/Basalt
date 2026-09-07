use serde::{Deserialize, Serialize};

use crate::value::TypedValue;

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
