# Tag Connections in the Graph — Design Note

**Status:** Agreed design (2026-08-29). Implements the most-liked Obsidian graph
request — forum _"View Structure of Nested Tags on Graph"_ (91 posts / 17.2k
views / 396 likes). Drives the `crates/basalt-graph` changes. Supersedes the
flat-tag behavior where tags were parsed but never wired into the graph.

## Problem

Tags are parsed and indexed (`FileMetadata.tags` via `basalt-parser`), but
`NoteGraph::add_document` only wires `metadata.links` into `forward_links` /
`back_links`. Tags create **no nodes and no edges**, so the graph is
disconnected along the tag axis even though the editor supports `#tags`.

## What the community wants (requirements, evidenced)

1. **Tags as first-class graph nodes**, connected to the notes that carry them
   (default green, colorable). — [forum: tags appear green in graph](https://forum.obsidian.md/t/use-tags-for-coloring-in-graph-view/92842);
   [local-graph-tag-links](https://github.com/Lumyo/obsidian-local-graph-tag-links).
2. **Hierarchical / tree connection of nested tags**: parent→child edges
   `#work → #work/project → #work/project/task`. — [forum FR 11386](https://forum.obsidian.md/t/view-structure-of-nested-tags-on-graph/11386/91);
   [Graph Nested Tags plugin](https://github.com/Herselfta/graph-nested-tags-v3).
3. **Notes link to their EXACT tag only** (not ancestors), to avoid clutter. —
   [forum Post 10](https://forum.obsidian.md/t/view-structure-of-nested-tags-on-graph/11386/91);
   plugin "exact matching".
4. **A "Tag Tree" toggle** + nested-tags / tag-file-expansion sub-toggles in the
   filter panel. — [forum Posts 11–12](https://forum.obsidian.md/t/view-structure-of-nested-tags-on-graph/11386/91);
   plugin UI.
5. **Per-level fold/unfold** of the tag tree. — [forum OP](https://forum.obsidian.md/t/view-structure-of-nested-tags-on-graph/11386/91).
6. **Descendant expansion**: selecting a parent tag shows all notes under it
   (incl. narrower tags). — [forum 62655](https://forum.obsidian.md/t/display-tags-in-graph-view-according-to-hierarchy/62655);
   native Tag Pane behavior.
7. **Local graph must include co-tagged notes** (continue BFS through tag nodes),
   not stop at them. — [local-graph-tag-links](https://github.com/Lumyo/obsidian-local-graph-tag-links).
8. **Tag-frequency filtering + tag coloring** (ADR-021 Phase 4). —
   [ADR-021](docs/adr/021-graph-view-architecture.md).
9. **Hold ≥60fps at ≥25k nodes** (ADR-021 acceptance bar). —
   [forum 106287](https://forum.obsidian.md/t/obsidian-graph-view-doesnt-work-for-a-large-vault/106287/5).

## What to avoid (anti-patterns — Obsidian's failures & rejected ideas)

1. **Flat tag nodes with no hierarchy.** Obsidian natively treats `#a/b/c`
   identically to `#abc` — no parent link, all tags disconnected. → Always build
   the parent→child chain from the tag path.
2. **Clique / sibling-to-sibling edges.** Wiring every pair of sibling subtags
   (and their notes) → O(N²) hairball. The forum explicitly rejected this
   (Post 18). → Only direct-descendant edges.
3. **Notes linking to ancestor tags** (`a/b/c` also wired to `a`, `a/b`). → Note
   → exact tag only; relatedness is transitive via ancestors.
4. **Stopping local-graph BFS at tag nodes.** Obsidian renders tag nodes but
   won't traverse through them, so co-tagged notes vanish. → Continue traversal
   through tag nodes.
5. **CPU-bound Canvas2D / single-thread layout.** Obsidian degrades >25k. → Keep
   model+graph in Rust/WASM/Worker (ADR-021); re-bench with tags at 25k.
6. **Losing node-kind.** Mixing tag edges with link edges without type info
   blocks tag-only filters/coloring. → Carry `node_types` (note vs tag) through
   `LayoutGraph`.

## Decision (model)

- Tag strings map to nodes under a `TAG_PREFIX = "#"` key (collision-safe vs
  file paths, since `#` is not a valid filename char).
- `NoteGraph` gains `tag_nodes: HashSet<NodeId>`.
- `add_document`: for each (deduped) tag, build the root→leaf chain; wire
  note→exact leaf; wire parent→child edges; register all in `tag_nodes`. Prune
  tag nodes left with zero edges.
- `remove_document`: run the same prune.
- `LayoutGraph::from_note_graph` adds `node_types: Vec<u8>` (0 = note, 1 = tag)
  so the renderer can style/filter tags and the future local graph can traverse
  through them.

## Implementation scope

- `crates/basalt-graph/src/graph.rs` — struct field, `TAG_PREFIX`, tag wiring in
  `add_document`, prune in `add_document` / `remove_document`, unit tests
  (`test_tags_create_nodes_and_tree`, `test_tag_tree_pruned_when_unused`,
  `test_shared_tag_connects_notes`).
- `crates/basalt-graph/src/graph_layout.rs` — `node_types` on `LayoutGraph`; populate in
  `from_note_graph`; accept in `new`; test.
- `crates/basalt-graph/benches/graph_step.rs` — `synthetic_graph_tagged` + 25k
  `step_tagged` bench: **13.9 ms/step at ~30k nodes** (25k notes + ~4k tag
  nodes) — within the 16.6 ms / 60fps budget.
- `apps/tauri/src-tauri/src/commands/vault.rs` — `get_graph` now emits tag-tree
  nodes (`is_tag: true`, path with `TAG_PREFIX` stripped) and their edges
  (note→exact-tag + parent→child) in addition to wikilinks; `GraphNodeMeta`
  gains `is_tag`.
- `crates/basalt-wasm/graph-wasm/src/lib.rs` — `LayoutGraph::new` now receives
  `node_types` (currently `vec![0u8; n]` from the get_graph path; the renderer
  styles via `GraphSnapshot.nodes[].is_tag`).

## Follow-ups (not yet done)

- Renderer tag styling (green) + "Tag Tree" toggle + per-level fold/unfold
  (forum OP / Posts 11–12) — ADR-021 Phase 3/4.
- Tag-frequency filter + tag coloring — ADR-021 Phase 4.
- Local graph must continue BFS **through** tag nodes (don't stop at them) —
  forum req #7 / anti-pattern #4.
- Optionally thread real `node_types` into the wasm `LayoutGraph` (from
  `GraphSnapshot.nodes[].is_tag`) if the graph needs per-kind mass/inertia.
