# basalt-graph — Note Graph & Force Layout

The note-link graph domain. Represent the wiki-link/tag graph (`NoteGraph`),
intern strings (`StringArena`), fuzzy-match command search, and a Barnes-Hut
force-directed physics simulation (`ForceGraph` / `LayoutGraph`) that remaps
the sparse graph to flat `f32` position arrays for zero-copy rendering.

Depends on `basalt-types`. Pure native logic (no wasm on its own) — it is
compiled to wasm when consumed through the `graph-wasm` bridge. Backs the
≥25k-node perf gate (ADR-021).

## Modules

| Module          | Provides                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `arena`         | `StringArena`, `NodeId` — string interner                                   |
| `graph`         | `NoteGraph` — forward/backlinks + tag tree; auto-prunes orphan tags         |
| `fuzzy`         | `fuzzy_match(query, text)`, `search_commands(...)`, `SearchResult`          |
| `graph_layout`  | `ForceGraph`, `LayoutGraph`, `GraphParams` — Barnes-Hut physics             |

## Public API

- **`NoteGraph`** — `add_document` / `remove_document` / `get_forward_links` /
  `get_back_links` / `get_metadata`. The canonical backlinks source.
- **`StringArena`** — interns strings to `NodeId`s, reducing graph memory.
- **`fuzzy_match` / `search_commands`** — fuzzy scoring used by the command
  palette / quick switcher.
- **`LayoutGraph`** — static graph structure (`from_note_graph`), with
  `node_count` / `edges` / `positions` accessors.
- **`ForceGraph`** — the mutable simulation: `step()`, `positions()`,
  `set_position`, `alpha()` / `reheat()`. Exposes flat `f32` `[x0,y0,...]`
  positions for zero-copy transfer to WebGL/wasm.

## Documentation

- ADR-021: [Graph View Architecture](../../docs/adr/021-graph-view-architecture.md)
- [Graph view notes](../../docs/graph-view/) (proposal, research)
