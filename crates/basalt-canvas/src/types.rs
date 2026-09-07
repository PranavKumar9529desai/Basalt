//! JSON Canvas data model: document, nodes, edges, and their shared types.

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