# Graph View — Initial Proposal (pre-implementation)

> Status: DRAFT for discussion. No code until the architecture fork below is
> decided and an ADR exists. Conventions: ADR-018 (registry-driven), ADR-020
> (desktop-tier performance), AGENTS.md benchmark rule (≥25k fixtures).

## Working name

**NoteGraph** — registered as a _view_ (`registerView()` in
`app-shell/viewRegistrations.ts`): side-dock panels, never a route (ADR-004).
A future fullscreen/global-graph tab would be a _leaf_ registration.

---

## Proposed phases

### Phase A — "Parity, but instant" (MVP)

- Global graph view + local graph view (depth slider) as dock views.
- Pan / zoom / hover-highlight / click-to-open / right-click context menu.
- Node size by degree; edge = internal link.
- Filters: search query, path globs (**done properly** — Obsidian's most
  fragmented UX area), orphans toggle, existing-files-only.
- Layout computed in Rust (Barnes-Hut, Rayon-parallel), incremental on vault
  file-event deltas — never a full rebuild per change.
- WebGL rendering (PixiJS) in the webview.

**Gate:** p95 frame <16ms at 25k nodes; graph open-to-interactive <300ms at
25k notes; zero main-thread contention with a typing editor (measured with
the ADR-017 harness).

### Phase B — "Beat them where they're asking" (the top forum requests)

1. **Named graph presets** — filters + forces + colors + layout persisted,
   switchable from a dropdown (#8131, 345 likes).
2. **Pinned node positions & manual layouts**, per preset; edit/view mode
   distinction (#1423, 266 likes).
3. **Auto-communities** — label-propagation clustering in Rust colors groups
   automatically; manual query-groups remain as override (#see Graph Analysis
   community detection).
4. **Editor ↔ graph reactive sync** — active note always highlighted;
   optional auto-focus/follow (#3424, 131 likes).
5. **Multi-select** (lasso/shift-click) → batch: open all, tag, close.

### Phase C — "Dwarf them"

- **Co-citation panel**: "notes cited together with this one" — the why-not-
  just-what layer (Graph Analysis flagship).
- **Similarity / link prediction** suggestions.
- **Centrality sizing**: PageRank/betweenness as node-size metric options.
- **Structural-gap hints**: clusters that never connect surfaced as prompts
  (InfraNodus-style; LLM-assist optional and off by default).
- **Typed edges**: reserve `type` field now (TheBrain direction); schema via
  frontmatter later.

---

## The architecture fork — DECISION REQUIRED BEFORE CODE

Where does the force simulation run?

| Option                      | Mechanism                                                                                                                                  | Pros                                                                                             | Cons                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **(a)**                     | Physics in Rust, positions streamed to webview via Tauri `Channel` (ADR-020 moves 4+6)                                                     | One engine everywhere (future mobile/server); heaviest compute native                            | 25k nodes × 60fps position streams ≈ megabytes/sec of IPC — saturation risk |
| **(b)**                     | Same Rust physics crate compiled to **WASM, running in a web worker** in-webview                                                           | Zero per-frame IPC; UI thread untouched; deterministic                                           | Duplicate runtime paths (native + wasm builds of one crate)                 |
| **(c)** **← proposed lean** | **Hybrid**: WASM worker for interactive simulation; Rust for expensive one-shot analytics (centrality, communities) on graph-change events | Best of both; analytics shared with basalt-graph's existing role; IPC only for rare bulk updates | Two integration surfaces to maintain                                        |

Proposal: author the simulation once as a workspace crate (e.g.
`crates/basalt-layout` or inside `basalt-graph`) compiled to both `wasm32`
(worker) and native (analytics/benchmarks). Renderer reads a shared
`Float32Array` position buffer via transferable/SAB — no per-frame React.

## Rendering baseline

- **WebGL2 via PixiJS** as the floor (compatibility), WebGPU as an optional
  fast path behind feature detection. No SVG/DOM nodes beyond ~500 visible
  labels; labels LOD-fade like Obsidian's text-fade threshold.

## Data model (initial)

- Nodes: note id (path-keyed today — same caveat as tabs pre-fix; use vault
  arena ids from `basalt-vault`, not raw paths), degree, community id,
  centroid cache.
- Edges: source, target, `type` (reserved: "link" today; typed links later),
  first-seen order (for time-lapse).
- Tags-as-nodes and attachments are display projections, not core graph
  members — matches Obsidian's toggles without polluting analytics.
- Incremental diffing driven by the vault watcher contract:
  `vault://file-changed` ⇒ external-only events already guaranteed by the
  write choke point (Rust).

## Open questions

1. Confirm phase-A scope (is anything above missing / anything trimmable?).
2. Architecture fork: a / b / c?
3. WebGL2 floor acceptable, or do we require WebGPU from day one?
4. Node identity: vault arena ids vs canonical path — decide with the
   rename/move lesson from tabs in mind (ids must survive moves).
5. Preset storage location: settings store vs per-workspace file.

## Benchmark plan (per AGENTS.md)

- Fixtures: 5k **and** 25k mandatory, plus a 130k stress fixture mirroring
  the documented Obsidian failure case.
- Metrics: index/build time, incremental-update latency (single file change),
  open-to-interactive, simulation tick cost, render p95 frame time, idle CPU.
- Criterion benches in Rust (`cargo bench -p basalt-graph`); frontend frame
  metrics via the existing dev-report mechanism.
