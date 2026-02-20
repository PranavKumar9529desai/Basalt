# Phase 1.5: Core Engine Optimization Plan

This plan addresses the performance bottlenecks and logic flaws in the initial MVP parser and graph engine.

## 1. Fast Inline Text Parser (No Regex)
**The Problem:** Running regex on the entire document upfront captures links inside codeblocks and causes excessive heap allocations.
**The Solution:**
- Eliminate the `regex` crate dependency entirely.
- Build a zero-allocation state machine that parses `[[Wikilinks]]` and `#tags` **only** when `pulldown-cmark` yields `Event::Text`.
- **Logic:** Iterate over the `&str` yielded by `Event::Text`. When `[[` is encountered, split the node into a `Text` node (before), a `WikiLink` node (during), and a `Text` node (after). Do the same for `tags`.

## 2. True Inline AST for UI Rendering
**The Problem:** The current AST bundles all inline text into raw `Text` chunks. If a paragraph has a link, the frontend has no idea where it belongs within that paragraph.
**The Solution:**
- Update `MarkdownNode` to represent proper inline nesting.
- For example, `MarkdownNode::Paragraph(Vec<MarkdownNode>)` will instead contain exactly ordered children like:
  `[Text("Go to "), WikiLink("Home"), Text(" for more.")]`
- This makes rendering an AST on the frontend (React/Solid) effortless and explicit, requiring zero client-side text parsing.

## 3. High-Performance ID-Based Note Graph
**The Problem:** The current graph uses `HashMap<String, HashSet<String>>`. 10,000 files with 10 links each means 100,000 individual `String` allocations, leading to heavy memory fragmentation and slow hash lookups.
**The Solution:**
- Implement String Interning. Introduce a global or graph-level `StringCache` (or use a crate like `lasso` / `string_cache` or a simple custom ID generator like `IndexMap`).
- Assign a `NodeId` (`u32` or `usize`) to every unique path and tag.
- The `NoteGraph` will become: `HashMap<NodeId, HashSet<NodeId>>`.
- **Result:** Graph traversals (e.g., getting backlinks) go from comparing dynamic heap-allocated strings to comparing contiguous 32-bit integers in the CPU cache.

## Execution Steps

### Step 1: Graph Refactor
- Create `arena.rs` or `cache.rs` to map `String <-> NodeId`.
- Refactor `NoteGraph` and `NoteGraph::new()` to hold IDs.

### Step 2: Inline Parser Refactor
- Remove global `regex` runs.
- Create an internal token scanner function `parse_inline_text(text: &str) -> Vec<MarkdownNode>`.
- Hook this scanner into `Event::Text` in the main parser loop.

### Step 3: Validation
- Update `core_tests.rs` to ensure tags inside code blocks are ignored.
- Update `dump_ast.rs` example to demonstrate that links are perfectly ordered inside paragraphs.
