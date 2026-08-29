use serde::{Deserialize, Serialize};

use crate::Span;

/// The logical type of a frontmatter property value.
///
/// Mirrors Obsidian's six property types (text, list, number, checkbox,
/// date, date & time) plus a link-aware text type so `[[Note]]` values are
/// first-class graph/backlink edges. Backs the typed property registry
/// (ADR-022 rule 5).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PropertyType {
    Text,
    List,
    Number,
    Checkbox,
    Date,
    DateTime,
    Link,
}

/// A frontmatter value, typed. `None` represents an explicit null / empty value.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FrontmatterValue {
    Text(String),
    List(Vec<FrontmatterValue>),
    Number(f64),
    Checkbox(bool),
    /// ISO-8601 date (`YYYY-MM-DD`).
    Date(String),
    /// ISO-8601 date-time.
    DateTime(String),
    /// A wikilink target, e.g. `"Note"` for `[[Note]]`. Always a graph edge.
    Link(String),
    None,
}

impl FrontmatterValue {
    pub fn property_type(&self) -> PropertyType {
        match self {
            FrontmatterValue::Text(_) => PropertyType::Text,
            FrontmatterValue::List(_) => PropertyType::List,
            FrontmatterValue::Number(_) => PropertyType::Number,
            FrontmatterValue::Checkbox(_) => PropertyType::Checkbox,
            FrontmatterValue::Date(_) => PropertyType::Date,
            FrontmatterValue::DateTime(_) => PropertyType::DateTime,
            FrontmatterValue::Link(_) => PropertyType::Link,
            FrontmatterValue::None => PropertyType::Text,
        }
    }
}

/// A single parsed frontmatter property with UTF-16 (`CodeMirror`) spans.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FrontmatterEntry {
    pub key: String,
    pub value: FrontmatterValue,
    /// UTF-16 span of the key text (excludes the trailing `:`).
    pub key_span: Span,
    /// UTF-16 span of the value text (suitable for surgical replacement).
    pub value_span: Span,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FrontmatterDiagnosticKind {
    DuplicateKey,
    MalformedValue,
    TypeMismatch,
}

/// A non-fatal issue found while parsing. The model is still returned so the
/// UI can show the value and offer a fix (ADR-022 rule 3: never block editing).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FrontmatterDiagnostic {
    pub kind: FrontmatterDiagnosticKind,
    pub message: String,
    pub span: Span,
}

/// The structured, typed result of parsing a note's frontmatter.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FrontmatterModel {
    pub entries: Vec<FrontmatterEntry>,
    pub diagnostics: Vec<FrontmatterDiagnostic>,
    /// UTF-16 span of the whole frontmatter block (incl. opening/closing
    /// fences). `null` when there is no frontmatter. Lets the editor gate
    /// reparses to the frontmatter region (ADR-022 rule 3).
    pub block_span: Option<Span>,
}
