# Obsidian Parity — Roadmap for Next Paralormal Round

> **Date:** 2026-08-07
> **Status:** Approved
> **Audience:** Orchestrator + parallel agents (see `PLAN.md` worktree workflow)
> **Place in sequence:** Run AFTER the editor-interaction tracks (`2026-08-07-editor-editing-interactions.md`) merge, because tracks 1–4 touch `packages/editor/`/`editor.css` that the interaction tracks also modify.

## Current state (verified 2026-08-07)

Already done: three-layer architecture, tabs, per-pane editor, theming, command palette, file tree, note creation, search (⌘F + ⌘O, tantivy+nucleo), markdown **syntax** (tables, callouts, lists, highlights, strikethrough, tags, frontmatter, task-list click-toggle), and editor **interactions** (table nav, list continuation, folding — in the 3 worktrees currently running).

Rust backend already has a `NoteGraph` (`crates/basalt-graph/src/graph.rs`) with `add_document`/`remove_document`/`get_forward_links`/`get_back_links`/`get_metadata`, and a `get_backlinks` Tauri command. Backlinks UI (`RightSidebar.tsx`, `BacklinksSidebar.tsx`) is uncommitted WIP in the main tree.

**Not present anywhere:** math/KaTeX, mermaid/diagrams, embeds `![[…]]`, image rendering, graph *view* UI, inline-title rename. No `katex`/`mermaid`/`d3` deps yet.

## Everything below assumed for every track

- Follow the **Three-Layer** rule: stateless/presentational → `packages/ui/`; state/hooks/IPC → `apps/tauri/src/features/`; wiring → `apps/tauri/src/app-shell/`.
- Colors: **`--sat-*` tokens only** (ADR-002). Layout/spacing via Tailwind only.
- Heavy compute → **Rust** (`crates/`); long lists virtualized (`@tanstack/react-virtual`); lazy-load panels via `React.lazy`+`Suspense`; batch `invoke()` calls.
- No cross-feature imports (`CONVENTIONS.md §2.2`). Shell wires features.
- Verify each track: `bun run lint` from repo root, `cd apps/tauri && bunx tsc --noEmit`.
- Commit convention: `feat(scope): …` (biome scope).

---

## Tracks (independent unless noted)

| # | Branch | Feature | Risk | Depends |
|---|---|---|---|---|
| 1 | `feat/md-math` | KaTeX inline `$…$` + block `$$…$$` | Med | editor-interactions merged |
| 2 | `feat/editor-images` | Image embed `![[…]]` / `![[…|alt]]` render +  file-picker insert | Med | editor-interactions merged |
| 3 | `feat/editor-embeds` | Note embed `![[…]]` (inline + block) + resolve+backlink | Med | editor-interactions merged |
| 4 | `feat/graph-view` | Local graph view (canvas, force layout, click-node) | High | graph-backend |
| 5 | `feat/graph-backend` | Extend `NoteGraph` + IPC for full-graph payload | Low | — (foundation for 4) |
| 6 | `feat/inline-title` | Editor inline title rename | Low | editor-interactions merged |
| 7 | `feat/mermaid` | Mermaid/plantuml code-block render | Low | editor-interactions merged |

### Dependency note
Tracks 1–3, 6, 7 all touch `packages/editor/src/` (extensions + `input`/`preview`), same files the interaction tracks touch. **Do not branch these until the interaction tracks merge to `main`.** Tracks 4–5 stay in the frontend (canvas) + Rust backend and can branch immediately.

---

## Track 5 — Graph backend (`feat/graph-backend`) — foundation, run first

Create a full-graph IPC command that returns nodes + edges for the graph view, and enrich `get_backlinks` to return link *metadata* (line number + surrounding snippet per the existing spark/backlink UI).

- `crates/basalt-graph/src/graph.rs` — add `all_documents()`, `edges()` iterators; ensure forward-links are exposed for the outgoing-edge panel.
- `apps/tauri/src-tauri/src/commands/vault.rs` (or new `graph.rs`) — `get_graph` → `{ nodes: [{id,name,path,tags}], links: [{source,target}] }`.
- `apps/tauri/src/features/graph/types.ts` — shared `GraphData`/`GraphNode`/`GraphLink` (types-only export allowed cross-feature).
- Verify with `cd apps/tauri/src-tauri && cargo check`.

---

## Track 4 — Graph view (`feat/graph-view`) — high risk, run right after track 5 merges

Force-directed node/edge canvas that opens as a **workspace panel** (NOT a route — ADR-004).

- Use a dependency: `react-force-graph` (3d-ready) or `d3-force` + canvas. Prefer a canvas so it stays fast at 5k notes; virtualize/lazy-load.
- `features/graph/GraphView.tsx` (+ `useGraph.ts`, `store.ts`, `types.ts`) — fetch `get_graph`, render, click node → open note, hover → highlight neighbors, search/filter box, tag color by `tags`.
- Open via an activity-bar button + command palette entry (`AppCommands.tsx`), right panel like the backlinks panel.
- Interaction with current callouts/canvas: keep it a fresh panel; no overlap with editor tracks since it lives in `features/graph/` + `app-shell/`.
- Colors `--sat-graph-node-color`, `--sat-graph-edge-color`, `--sat-graph-bg`.

---

## Track 1 — KaTeX math (`feat/mathlete`)

Obsidian renders `$…$`/`$$…$$`. Add dependency `katex` (`+h`).

- Grammar: extend Lezer markdown with an inline `Math`/`MathMark` node for `$…$` and a `MathBlock` for `$$…$$` (mirror the `==highlight==` pattern in `syntax/highlight.ts`).
- Decoration: `MathBlock` → block `Decoration.replace` widget rendering `katex.renderToString`. Inline `$…$` → `Decoration.mark` with the raw `$` wraps and inline math widget on non-active lines (reuse the active-line "show raw" idiom from `live-preview.ts`).
- Render only when NOT on the active line (keep editability); display raw `$…$` when cursor is inside.
- `packages/editor/src/syntax/math-grammar.ts`, `.../input/mathkey.ts`, `.../preview/math.ts`; CSS uses `--sat-math-bg`.
- KaTeX CSS must be bundled (`katex/dist/katex.min.css`) once, not per-render.

---

## Track 2 — Images (`feat/editor-images`)

- Grammar/WikiLink extension already parses `![[…]]` for imagem? **This is pending — check `syntax/wiki-links.ts`.** It currently handles `[[…]]`; `![[…]]` is a lead-in/embed.
- Path resolution: resolve embed path against the vault; if ends in `.png|jpg|jpeg|gif|svg` → image. Add `resolve_embed` Tauri command (or reuse a virtual asset handler) returning the asset path.
- Render: `Decoration.replace` widget with an `<img>` on non-active lines; cursor block shows raw link. Add a file/embedode bar.
- Image insert: context-menu + slash command inserts `![[filename]]` (reuse existing autocomplete `onFetchLinks`).
- Attach `Deeds`.
- All in `features/editor/`(preview) + `app-shell` no routes.

---

## Track 3 — Note embeds (`feat/editor-embeds`)

Inline `![[note]]` preview of another note's frontmatter + intro.

- Reuse `get_backlinks`→ no; add `get_note_snippet` IPC (`path` → first N lines). Optionally compute on render.
- `Decoration.replace` widget on non-active lines renders a bordered embed box (title + first lines + open button). Click opens note via existing `handleOpenLink`.
- Track 3 and 2 both touch `packages/editor/src/input/...`+`editor.ts` — they must merge sequentially (resolve `editor.ts` conflict) or be combined into one agent. Prefer **combine into one branch** `feat/embeds-images` to avoid double `editor.ts` merge.

---

## Track 6 — Inline title (`feat/inline-title`)

Obsidian-editable title at document top (not a separate header).

- Frontmatter `title:` field → editable inline heading; on save, sync to the tab title (already have `setTabTitle`).
- `features/editor/InlineTitle.tsx` + a mechanism in `useEditor` to write frontmatter. Keep decoding lights.

---

## Track 7 — Diagrams (`feat/mermaid`)

Mermaid/code-block preview: when a fenced code block has lang `mermaid`, replace its dome with the rendered SVG; double-click returns to source. Similar for `plantuml`.

- Add `mermaid` dep. Render into the block widget in `live-preview.ts` (like `code-blocks.ts` headers) — but ONLY when the cursor is outside the block.
- Lazy/throttle render; mermaid is heavy.

---

## Suggested sequencing (orchestrator)

1. **Now:** launch `feat/graph-backend` (independent of editor work).
2. **After interaction tracks merge to `main`:** launch `feat/mathlete`, `feat/embeds-images` (combined 2+3), `feat/inline-title`, `feat/mermaid` in parallel.
3. **After `graph-backend` merges:** launch `feat/graph-view`.
4. Merge order: `graph-backend` → `graph-view`; interaction tracks → the 5 editor tracks; resolve `editor.ts`/`editor.css` conflicts at merge.

## Backlog (future)

- Tables row/column resize + cell merge (editing-widget-heavy)
- Drag-to-embed from file tree
- Tagged graph coloring / filters
- Backlink context-quote panel (side/outgoing/incoming)
- Command paletter: insert math/table/mermaid snippets
- PDF attachment `![[file.pdf]]` embedding

## Success criteria (this round)

- [ ] Graph view opens as a panel, renders nodes+edges from `get_graph`, click opens note
- [ ] `$x^2$` and `$$...$$` render via KaTeX with proper active-line editing
- [ ] `![[image.png]]` and `![[note]]` render inline in the editor; clicking opens the target
- [ ] Top `title:` frontmatter is editable and renames the tab
- [ ] Mermaid + PlantUML code blocks render to a diagram on non-active lines
- [ ] `bun run lint && (cd apps/tauri && bunx tsc --noEmit)` pass across all merged tracks
- [ ] All colors use `--sat-*` tokens; heavy work in Rust; panels lazy-loaded