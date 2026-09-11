//! JSON Canvas v1.0 parsing, serialization, and semantic validation.

use super::types::{CanvasDocument, CanvasNode};

/// Errors produced while reading or writing a `.canvas` document.
#[derive(Debug, thiserror::Error)]
pub enum CanvasError {
    #[error("invalid canvas JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("canvas node id {0} is not unique")]
    DuplicateNodeId(String),
    #[error("canvas edge id {0} is not unique")]
    DuplicateEdgeId(String),
    #[error("edge {0} references unknown node {1}")]
    UnknownNode(String, String),
    #[error("file node subpath {0} must start with '#'")]
    BadSubpath(String),
    #[error("node id {0}: group nodes must not nest; groups cannot be referenced by groups")]
    NestedGroup(String),
    #[error("canvas document exceeds {max} bytes (found {found})")]
    TooLarge { max: usize, found: usize },
}

/// Parse a `.canvas` file's JSON text into a document.
///
/// Errors are typed — callers distinguish malformed JSON from semantic
/// violations (duplicate ids, dangling edge references, invalid subpath).
pub fn parse(json: &str) -> Result<CanvasDocument, CanvasError> {
    let doc: CanvasDocument = serde_json::from_str(json)?;
    validate(&doc)?;
    Ok(doc)
}

/// Serialize a document to `.canvas` JSON text.
///
/// Output is compact JSON (no pretty-printing) matching Obsidian's own
/// serializer, so byte-level diffs against an Obsidian-written file are
/// minimal.
pub fn serialize(doc: &CanvasDocument) -> Result<String, CanvasError> {
    validate(doc)?;
    Ok(serde_json::to_string(doc)?)
}

/// Semantic validation beyond serde's structural checks.
pub fn validate(doc: &CanvasDocument) -> Result<(), CanvasError> {
    let mut node_ids = std::collections::HashSet::with_capacity(doc.nodes.len());
    for node in &doc.nodes {
        let id = node.id();
        if !node_ids.insert(id) {
            return Err(CanvasError::DuplicateNodeId(id.to_string()));
        }
        if let CanvasNode::File(file) = node {
            if let Some(sub) = &file.subpath {
                if !sub.starts_with('#') {
                    return Err(CanvasError::BadSubpath(sub.clone()));
                }
            }
        }
    }

    let mut edge_ids = std::collections::HashSet::with_capacity(doc.edges.len());
    for edge in &doc.edges {
        if !edge_ids.insert(&edge.id) {
            return Err(CanvasError::DuplicateEdgeId(edge.id.clone()));
        }
        for target in [&edge.from_node, &edge.to_node] {
            if !node_ids.contains(target.as_str()) {
                return Err(CanvasError::UnknownNode(edge.id.clone(), target.clone()));
            }
        }
    }
    Ok(())
}
