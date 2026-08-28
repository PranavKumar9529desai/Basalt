# Graph View — Research Notes

> Sources: Obsidian official docs (`obsidianmd/obsidian-docs`), Obsidian forum
> feature-request threads (like counts = demand signal), Juggl / Graph
> Analysis plugin docs, competitor material. Compiled 2026-08-25.

---

## 1. Obsidian's Graph View — complete feature inventory

From `obsidian-docs/en/Plugins/Graph view.md`:

| Category | Features |
| --- | --- |
| Structure | Global graph + Local graph (depth slider). Nodes = notes, edges = internal links. Node size ∝ inbound link count |
| Interactions | Hover highlights connections; click opens note; right-click context menu |
| Navigation | Scroll zoom, drag pan, arrow keys (`Shift` accelerates) |
| Filters | Search query; show tags / attachments toggles; existing-files-only; hide orphans; excluded-files respected |
| Groups | Manual: search query → assigned color |
| Display | Arrows toggle, text fade threshold, node size, link thickness |
| Forces | Center force, repel force, link force, link distance |
| Animation | Time-lapse: notes appear chronologically by creation time |

**Read:** it is a passive, read-only visualization. The entire third-party
graph-plugin ecosystem exists because of what this list does not contain.

## 2. What users are missing (forum demand signals)

Sorted by evidence strength:

1. **Saved presets for filter/display configs** — thread #8131 (**345 likes**):
   users recreate multi-clause `-path:` queries every session. Related:
   persistent local-graph settings (#11195).
2. **Persistent/manual node positions** — thread #1423 (**266 likes**): save
   layout, explicit edit-mode vs view-mode so arranging doesn't mis-click.
3. **Performance collapse at scale** — #106287: 130k-note vault ⇒ ~10 min
   index, global graph freezes, *local graph freezes at depth 1*, single core
   pinned, GPU unused despite "hardware acceleration". Also idle CPU drain
   8–20% with graph open (#2349) and editor responsiveness loss when the
   panel is open (#4804).
4. **Folder/path filtering is broken or confusing** — at least 7 threads
   (#62930, #10039, #51061, #50823, #13376, #13366, #31489).
5. **Graph does not react to editor activity** ("where am I?") — #3424
   (**131 likes**): highlight/refocus on open file.
6. **No selection or batch actions on nodes** — #108605.
7. Long tail: nested-tag hierarchy display (#11386), configurable node-size
   metric (#4247), trackpad scroll feel (#742).

## 3. Competitors & plugins — what they do differently

| Tool | Their twist | Verdict for Basalt |
| --- | --- | --- |
| **Juggl** (Obsidian plugin, Cytoscape.js) | *Workspace mode*: curate a subgraph, pin positions, save/resume later; expand-on-demand navigation (screen never floods); CSS/YAML styling incl. images in nodes; labeled/typed links; 4 layouts | ✅ Steal workspace mode + expand-on-demand — best UX idea in this space |
| **Graph Analysis** (plugin) | Algorithms as panels: co-citations ("2nd-order backlinks" — shows *why* notes link), similarity, link prediction, community detection | ✅ Auto-community coloring replaces manual query-groups; co-citation panel is genuinely insightful |
| **Gephi / Neo4j Bloom** | ForceAtlas2-class layouts, PageRank/betweenness centrality for sizing & filtering, real community detection | ✅ Centrality as alternative node-size metric; layout quality bar |
| **InfraNodus** | "Structural gaps": surfaces near-disconnected clusters as thinking prompts | ✅ Differentiator candidate; LLM-assist optional later |
| **TheBrain** | Typed parent/jump/child links — curated semantic net vs hairball | ⚠️ Needs frontmatter schema; defer, but reserve an edge `type` field now |
| **Logseq DB version** | Rebuilt on SQLite specifically for graph scale/RTC | ✅ Validates Rust-native graph store direction |
| **Heptabase / Kinio-style canvases** | Spatial canvas > force graph for deliberate arrangement | ⚠️ Canvas territory — out of scope here |
| **Reflect** | Graph as ambient context around daily notes; speed branding | ✅ Local-graph-always-visible philosophy |

**Pattern:** Obsidian ships a picture. Competitors and plugins ship
*instruments*: arrangeable, queryable, savable, computable.

## 4. Implications for Basalt

1. **Scale is the moat.** The documented failure mode (130k notes ⇒ frozen)
   is our benchmark target inverted: AGENTS.md mandates ≥25k fixtures;
   goal = instant open + interactive pan/zoom at 25k, *usable* (never frozen)
   at 130k.
2. **Editor independence is non-negotiable.** Obsidian's graph degrades the
   editor (#4804). Our architecture must make that impossible: physics off
   the UI thread, zero React re-renders per frame (same discipline as the
   CM6 leaf).
3. **Rust owns compute.** Rayon-parallel simulation (Barnes-Hut O(n log n)),
   incremental updates from vault file-event deltas (no full rebuilds),
   background analytics (centrality, communities) in `crates/basalt-graph`.
4. **The top feature requests are cheap wins for us** (presets, pinned
   layouts, auto-communities) — none require heroics, all are visible.
