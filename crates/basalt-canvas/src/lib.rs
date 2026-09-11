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

mod ser;
mod types;

pub use ser::{parse, serialize, validate, CanvasError};
pub use types::{
    BackgroundStyle, CanvasColor, CanvasDocument, CanvasEdge, CanvasNode, EndShape, FileNode,
    GroupNode, LinkNode, NodeBase, Side, TextNode,
};

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
