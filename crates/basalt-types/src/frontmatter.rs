use serde::{Deserialize, Serialize};

use crate::{Span, TypedValue};

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

/// A frontmatter property value — the same unified `TypedValue` used by the
/// DQL engine (ADR-030 Phase 2). `TypedValue::Null` represents an explicit
/// null / empty value.
pub type FrontmatterValue = TypedValue;

impl FrontmatterValue {
    /// The logical `PropertyType` of a value. `Null` (an explicit empty / null
    /// value) has no type.
    pub fn property_type(&self) -> Option<PropertyType> {
        match self {
            TypedValue::Text { .. } => Some(PropertyType::Text),
            TypedValue::List { .. } => Some(PropertyType::List),
            TypedValue::Number { .. } => Some(PropertyType::Number),
            TypedValue::Checkbox { .. } => Some(PropertyType::Checkbox),
            TypedValue::Date { .. } => Some(PropertyType::Date),
            TypedValue::DateTime { .. } => Some(PropertyType::DateTime),
            TypedValue::Link { .. } => Some(PropertyType::Link),
            TypedValue::Null => None,
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
