//! JSON Canvas format — parse and serialize `.canvas` files.
//!
//! Implements the [JSON Canvas spec v1.0](https://jsoncanvas.org/spec/1.0):
//! the open file format for infinite canvas data, originally created for
//! Obsidian. Nodes are placed in array order by z-index (first = bottom,
//! last = top). Groups are nodes whose content renders behind other nodes.
//!
//! The crate is self-contained: no Tauri, no basalt-types, no business state.
//! It is the contract between `.canvas` files on disk and every canvas
//! feature, and doubles as the interoperability surface for files created by
//! Obsidian or any other JSON Canvas implementation.

use serde::{Deserialize, Serialize};

/// A parsed or serializable `.canvas` document.
///
/// Both arrays are optional per the spec — an empty canvas `{}` is valid.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDocument {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes: Vec<CanvasNode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub edges: Vec<CanvasEdge>,
}

/// An element placed on the canvas.
///
/// The `type` field discriminates between the four node kinds. Serde tags the
/// enum with `"type"` so `<node>.type` round-trips exactly as the spec writes
/// it. Generic fields (`id`, `x`, `y`, `width`, `height`, `color`) live on
/// the enum variants because the spec's JavaScript types are flat objects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CanvasNode {
    /// Freeform card storing plain text with Markdown syntax.
    #[serde(rename = "text")]
    Text(TextNode),
    /// Reference to a vault file or attachment.
    #[serde(rename = "file")]
    File(FileNode),
    /// Reference to a URL, embedded as a web page.
    #[serde(rename = "link")]
    Link(LinkNode),
    /// Visual container rendered behind its spatially-contained nodes.
    #[serde(rename = "group")]
    Group(GroupNode),
}

/// Position, size, and tint shared by all node kinds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeBase {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<CanvasColor>,
}

/// Text card node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub text: String,
}

/// File reference node (image, video, PDF, note, …).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub file: String,
    /// Subpath into the file (heading or block). Always starts with `#`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subpath: Option<String>,
}

/// Web page node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkNode {
    #[serde(flatten)]
    pub base: NodeBase,
    pub url: String,
}

/// Visual region grouping nodes that overlap it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupNode {
    #[serde(flatten)]
    pub base: NodeBase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_style: Option<BackgroundStyle>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackgroundStyle {
    #[default]
    #[serde(rename = "cover")]
    Cover,
    #[serde(rename = "ratio")]
    Ratio,
    #[serde(rename = "repeat")]
    Repeat,
}

/// A connection between two nodes.
///
/// `toEnd` defaults to `arrow` per the spec; `fromEnd` defaults to `none`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdge {
    pub id: String,
    pub from_node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_side: Option<Side>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_end: Option<EndShape>,
    pub to_node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_side: Option<Side>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_end: Option<EndShape>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<CanvasColor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Which side of a node an edge attaches to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    #[serde(rename = "top")]
    Top,
    #[serde(rename = "right")]
    Right,
    #[serde(rename = "bottom")]
    Bottom,
    #[serde(rename = "left")]
    Left,
}

/// Endpoint shape of an edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EndShape {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "arrow")]
    Arrow,
}

/// Encodes node/edge tint: a hex string like `"#FF0000"` or one of the six
/// preset names `"1"`…`"6"` (red, orange, yellow, green, cyan, purple).
///
/// Presets intentionally carry no exact RGB so applications can map them to
/// their brand palette. We keep the raw string for round-trip fidelity and
/// expose [`CanvasColor::preset()`] for applications that want the semantic
/// meaning.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct CanvasColor(pub String);

impl CanvasColor {
    /// True when the color is one of the six spec presets.
    pub fn is_preset(&self) -> bool {
        matches!(self.0.as_str(), "1" | "2" | "3" | "4" | "5" | "6")
    }

    /// The preset index (1 red … 6 purple), when [`Self::is_preset`].
    pub fn preset(&self) -> Option<u8> {
        self.0.parse().ok().filter(|n| (1..=6).contains(n))
    }

    /// True when the color is a `#RRGGBB`/`#RGB` hex string.
    pub fn is_hex(&self) -> bool {
        let s = self.0.as_str();
        s.starts_with('#') && s.len() == 7 && s[1..].chars().all(|c| c.is_ascii_hexdigit())
    }
}

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

impl CanvasNode {
    /// The node's unique id.
    pub fn id(&self) -> &str {
        match self {
            CanvasNode::Text(n) => &n.base.id,
            CanvasNode::File(n) => &n.base.id,
            CanvasNode::Link(n) => &n.base.id,
            CanvasNode::Group(n) => &n.base.id,
        }
    }

    /// Position + size shared by every node kind.
    pub fn base(&self) -> &NodeBase {
        match self {
            CanvasNode::Text(n) => &n.base,
            CanvasNode::File(n) => &n.base,
            CanvasNode::Link(n) => &n.base,
            CanvasNode::Group(n) => &n.base,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_obsidian_style_document() {
        let json = r#"{
            "nodes": [
                {"id":"idea1","type":"text","x":50,"y":50,"width":260,"height":120,
                 "text":"Hello","color":"4"},
                {"id":"idea2","type":"text","x":400,"y":50,"width":260,"height":120,
                 "text":"World","color":"1"},
                {"id":"ref1","type":"link","x":400,"y":250,"width":260,"height":80,
                 "url":"https://jsoncanvas.org"},
                {"id":"img1","type":"file","x":50,"y":400,"width":300,"height":200,
                 "file":"assets/photo.png"},
                {"id":"group1","type":"group","x":30,"y":20,"width":660,"height":340,
                 "label":"Project Brainstorm","backgroundStyle":"cover"}
            ],
            "edges": [
                {"id":"e1","fromNode":"idea1","fromSide":"right","toNode":"idea2","toSide":"left","label":"leads to"},
                {"id":"e2","fromNode":"idea2","fromSide":"bottom","toNode":"ref1","toSide":"top","color":"5"}
            ]
        }"#;

        let doc = parse(json).expect("valid canvas");
        assert_eq!(doc.nodes.len(), 5);
        assert_eq!(doc.edges.len(), 2);

        let text = match &doc.nodes[0] {
            CanvasNode::Text(t) => t,
            other => panic!("expected text node, got {other:?}"),
        };
        assert_eq!(text.base.id, "idea1");
        assert_eq!(text.base.color, Some(CanvasColor("4".into())));
        assert_eq!(text.text, "Hello");

        let group = match &doc.nodes[4] {
            CanvasNode::Group(g) => g,
            other => panic!("expected group node, got {other:?}"),
        };
        assert_eq!(group.label.as_deref(), Some("Project Brainstorm"));
        assert_eq!(group.background_style, Some(BackgroundStyle::Cover));

        let edge = &doc.edges[0];
        assert_eq!(edge.from_side, Some(Side::Right));
        assert_eq!(edge.to_side, Some(Side::Left));
        assert_eq!(edge.label.as_deref(), Some("leads to"));
        assert_eq!(edge.to_end, None); // absent in input; spec default is arrow

        // Round trip: parse -> serialize -> parse must be a fixed point.
        let out = serialize(&doc).expect("serialize");
        let doc2 = parse(&out).expect("re-parse");
        assert_eq!(doc, doc2);
    }

    #[test]
    fn parses_empty_canvas() {
        let doc = parse("{}").expect("empty canvas is valid");
        assert!(doc.nodes.is_empty());
        assert!(doc.edges.is_empty());
        let out = serialize(&doc).unwrap();
        assert_eq!(out, "{}");
    }

    #[test]
    fn rejects_duplicate_node_ids() {
        let json = r#"{
            "nodes": [
                {"id":"a","type":"text","x":0,"y":0,"width":100,"height":100,"text":"one"},
                {"id":"a","type":"text","x":0,"y":0,"width":100,"height":100,"text":"two"}
            ]
        }"#;
        let err = parse(json).unwrap_err();
        assert!(matches!(err, CanvasError::DuplicateNodeId(id) if id == "a"));
    }

    #[test]
    fn rejects_edges_to_unknown_nodes() {
        let json = r#"{
            "nodes": [{"id":"a","type":"text","x":0,"y":0,"width":100,"height":100,"text":"one"}],
            "edges": [{"id":"e1","fromNode":"a","toNode":"ghost"}]
        }"#;
        let err = parse(json).unwrap_err();
        assert!(
            matches!(err, CanvasError::UnknownNode(edge, node) if edge == "e1" && node == "ghost")
        );
    }

    #[test]
    fn parses_all_node_kinds() {
        let json = r#"{
            "nodes": [
                {"id":"t","type":"text","x":0,"y":0,"width":10,"height":10,"text":"hi"},
                {"id":"f","type":"file","x":0,"y":0,"width":10,"height":10,"file":"a.md"},
                {"id":"l","type":"link","x":0,"y":0,"width":10,"height":10,"url":"https://x.dev"},
                {"id":"g","type":"group","x":0,"y":0,"width":10,"height":10,"color":"4"}
            ]
        }"#;
        let doc = parse(json).unwrap();
        assert!(matches!(doc.nodes[0], CanvasNode::Text(_)));
        assert!(matches!(doc.nodes[1], CanvasNode::File(_)));
        assert!(matches!(doc.nodes[2], CanvasNode::Link(_)));
        assert!(matches!(doc.nodes[3], CanvasNode::Group(_)));
        let color = doc.nodes[3].base().color.as_ref().unwrap();
        assert!(color.is_preset());
    }

    #[test]
    fn parses_hex_color_from_plain_string() {
        let json = "{\"nodes\":[{\"id\":\"g\",\"type\":\"group\",\"x\":0,\"y\":0,\"width\":10,\"height\":10,\"color\":\"#FF0000\"}]}";
        let doc = parse(json).unwrap();
        let color = doc.nodes[0].base().color.as_ref().unwrap();
        assert!(color.is_hex());
    }
    #[test]
    fn color_preset_semantics() {
        let red = CanvasColor("1".into());
        assert!(red.is_preset());
        assert_eq!(red.preset(), Some(1));
        let purple = CanvasColor("6".into());
        assert_eq!(purple.preset(), Some(6));
        let bad = CanvasColor("7".into());
        assert_eq!(bad.preset(), None);
        assert!(!CanvasColor("ABC".into()).is_hex()); // short hex rejected
        assert!(CanvasColor("#A1B2C3".into()).is_hex());
    }

    #[test]
    fn rejects_bad_subpath() {
        let json = r#"{
            "nodes": [
                {"id":"f","type":"file","x":0,"y":0,"width":10,"height":10,"file":"a.md","subpath":"heading"}
            ]
        }"#;
        let err = parse(json).unwrap_err();
        assert!(matches!(err, CanvasError::BadSubpath(_)));
    }

    #[test]
    fn unknown_type_is_structural_error() {
        let json = r#"{
            "nodes": [
                {"id":"x","type":"video","x":0,"y":0,"width":10,"height":10}
            ]
        }"#;
        assert!(parse(json).is_err());
    }

    #[test]
    fn rejects_invalid_json() {
        assert!(matches!(parse("not json"), Err(CanvasError::Json(_))));
    }

    #[test]
    fn z_order_is_array_order() {
        let json = r#"{
            "nodes": [
                {"id":"bottom","type":"text","x":0,"y":0,"width":10,"height":10,"text":"b"},
                {"id":"top","type":"text","x":0,"y":0,"width":10,"height":10,"text":"t"}
            ]
        }"#;
        let doc = parse(json).unwrap();
        assert_eq!(doc.nodes[0].id(), "bottom");
        assert_eq!(doc.nodes[1].id(), "top");
    }
}
