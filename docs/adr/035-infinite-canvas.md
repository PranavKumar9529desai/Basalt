# ADR-035: Infinite Canvas — Spatial Note Layout

**Status:** Accepted
**Date:** 2026-09-05
**Extends:** ADR-018 (registry-driven workbench), ADR-020 (desktop-tier performance), ADR-029 (single renderer), ADR-032 (split pane layout tree), ADR-034 (embed rendering)

## Context

Obsidian Canvas (core plugin, Dec 2022) is an infinite 2D spatial surface for laying out notes, text cards, and media — plus connections and groups. It is the most popular visual-thinking feature in knowledge-management apps. The file format (`.canvas`) is open (JSON Canvas, MIT, [jsoncanvas.org](https://jsoncanvas.org/)), so real Obsidian vault files can be imported directly.

**Obsidian's architectural problem is the rendering pipeline, not the feature design.** Obsidian Canvas renders every node as a **DOM element** inside Chromium. This creates hard, architecture-level ceilings:

| Failure | Evidence |
| ------- | -------- |
| Crashes at ~3,000 nodes | Community stress test; community "Crystal Canvas" plugin had to bypass DOM entirely |
| Zoom re-rasterizes every image at source resolution | One real board (104 images): 372 MB → **~1.2 GB decoded RGBA re-rasterized every zoom step** (LOD plugin author measurement) |
| Pan/zoom choppy on populated boards | Forum reports: "irritating" on Windows 10 good-spec; "similar issues on M2 Max 32 GB" |
| Media embed remount every frame at low zoom | Node `updateBreakpoint` unmounts then immediately remounts media embeds on every animation frame — fixed by community patch |
| CSS `backface-visibility: hidden` wrecking layout | Profiling showed it dramatically slows layout recalc; patched out by community |

**Competitors solve this correctly:**

| Tool | Renderer | Viewport culling | Zoom LOD | Collaboration |
| ---- | -------- | ---------------- | -------- | ------------- |
| Excalidraw | Two `<canvas>` layers, GPU rasterization | Yes | Per-element draw | Yes |
| Miro / FigJam | Canvas 2D / WebGL | Yes | Yes | Yes |
| Apple Freeform | Metal (GPU) | Yes | Yes | Yes |
| Obsidian Canvas | DOM elements | No | No (unfixed since launch) | No |

Basalt already has a **WebGL2 renderer** proven at ≥60fps on ≥25k nodes (`packages/graph/src/renderer.ts`). Graph renders circular points and instanced edge quads; Canvas renders rectangles with embedded content. Same GPU architecture, different geometry. This means the expensive part — a WebGL2 pipeline that doesn't degrade at scale — is already built and tested.

**What Canvas needs on top of graph:**

| Graph has | Canvas needs |
| --------- | ------------ |
| Point nodes (`gl.POINTS`) | Rectangular nodes with width/height |
| Instanced edge quads (uniform width) | Labeled edges with arrow direction |
| Uniform color per node | Group background rectangles (colored regions) |
| — | Viewport culling via spatial index (only upload visible nodes) |
| — | Zoom-aware LOD for note previews and media |
| — | Content compositing: live, editable note embeds inside rectangles |
| — | Rectangle hit-testing, not point distance |

## Decision

### Feature scope

Core Canvas plugin — Obsidian parity for:

- **Node types:** `text` (freeform card), `file` (vault note, live-edited), `link` (web page embed)
- **Edges:** directional connections with label text
- **Groups:** visual regions with label and color
- **Nesting:** canvas-in-note, note-in-canvas
- **Turn into file:** promote a text card to a vault note
- **JSON Canvas format** (`.canvas`): full read/write — Obsidian files open in Basalt

Excluded (other session): freehand drawing tools.

### Architecture: three layers

```
┌──────────────────────────────────────────────────────────┐
│  packages/canvas-viewport/    WebGL2 rect renderer        │
│                                pan/zoom/coords            │
│                                viewport culling            │
│                                framework-agnostic          │
│                                (litmus: empty index.html)  │
└──────────────────────────────────────────────────────────┘
         │ typed arrays (positions, sizes, colors, flags)
         ▼
┌──────────────────────────────────────────────────────────┐
│  features/canvas/             Business logic + interaction │
│                               JSON Canvas read/write       │
│                               selection, undo, toolbar     │
│                               live note embed overlay      │
│                               groups, edge labels          │
└──────────────────────────────────────────────────────────┘
         │ Tauri invoke (batched)
         ▼
┌──────────────────────────────────────────────────────────┐
│  crates/basalt-canvas/        Rust compute                 │
│                               JSON Canvas parse/serialize  │
│                               spatial index (quadtree)     │
│                               LOD proxy generation         │
│                               auto-layout                  │
└──────────────────────────────────────────────────────────┘
```

Dependencies flow downward only. No cycles. Per ADR-018, Canvas registers as a **leaf** via `registerView()` in `registrations.ts` and opens as a tab inside the split-pane tree (ADR-032).

### Rendering: culled WebGL2, not DOM

**`packages/canvas-viewport/`** adapts the existing graph renderer (`packages/graph/src/renderer.ts`):

- **Rect nodes:** instance quads (4 verts per node, `gl.TRIANGLES`) — same instancing pattern as graph edges but for node rectangles. Each quad receives `position`, `size`, `color`, `flag` via typed arrays, same as the graph buffer contract.
- **Viewport culling:** spatial index (Rust quadtree via `crates/basalt-canvas`) computes visible-node set each frame; only visible nodes are uploaded to GPU buffers. Upload is `O(visible)` not `O(total)`.
- **Edges:** reuse graph's instanced edge-quad pattern; add label texture or HTML overlay for edge text.
- **Group backgrounds:** large instanced quads behind nodes, drawn first (z-order: groups → edges → nodes).
- **Transparent clear:** same premultiplied-alpha blending as graph; app theme shows through.

**Content compositing (note embeds):** live notes are editable CM6 views. These are rendered in an **HTML overlay** positioned via the same world→screen transform. At each frame:
1. WebGL renders rectangles (backgrounds, group fills, edges).
2. Visible note embed overlays are positioned with `transform: translate(...)` in CSS.
3. Editable notes are mounted/unmounted based on visibility (DOM cost = O(visible notes), not O(total)).

This two-layer approach (WebGL geometry + HTML overlay for interactive content) matches how Excalidraw composites its own `<canvas>` layer with React DOM.

### LOD: Rust-generated, zoom-tiered

`crates/basalt-canvas` generates tiered proxies off the main thread:

- **Note cards:** text-only cards render at every zoom; note embeds at low zoom show a lightweight title+preview-text thumbnail (pre-rasterized by Rust, cached to disk). At high zoom, the full CM6 editor overlay activates.
- **Media embeds:** downscaled image proxies at tiers (128 / 320 / 768 / 1600 px), matching the pattern from the community `canvas-image-lod` plugin but done natively in Rust rather than in JS — no plugin needed, no browser re-rasterization.
- **Downgrades apply immediately; upgrades are deferred** until 200ms after the gesture ends (proven pattern from the LOD plugin; prevents heavy loads mid-zoom).

### Spatial index: Rust quadtree

`crates/basalt-canvas` owns the spatial index:

- Insert / remove / update node rects when nodes move or resize.
- Viewport query returns visible-node set given camera bounds.
- Hit-testing for mouse interactions (click, drag, multi-select).
- Maintained in Rust; the frontend receives only the visible set for buffer upload.

### Data model: JSON Canvas

`crates/basalt-canvas` reads and writes the [JSON Canvas spec v1.0](https://jsoncanvas.org/spec/1.0):

```jsonc
{
  "nodes": [
    { "id": "1", "type": "text",  "x": 100, "y": 100, "width": 400, "height": 200, "text": "..." },
    { "id": "2", "type": "file",  "x": 600, "y": 100, "width": 400, "height": 200, "file": "Note.md" },
    { "id": "3", "type": "link",  "x": 100, "y": 400, "width": 400, "height": 200, "url": "https://…" }
  ],
  "edges": [
    { "id": "e1", "fromNode": "1", "fromSide": "right", "toNode": "2", "toSide": "left", "label": "related" }
  ],
  "groups": [
    { "id": "g1", "x": 50, "y": 50, "width": 1000, "height": 600, "label": "Research", "color": "4" }
  ]
}
```

Spec is intentionally conservative (no per-node rotation, no port constraints). We implement the full spec, then extend with Basalt-specific fields (e.g. `notePreview` cache hints) as private additions — consistent with how the spec is designed to be extended.

### File integration

- `.canvas` files appear in the file tree (vault feature) alongside `.md`.
- Canvas is a registered leaf (ADR-018): `registerView({ type: "canvas", ... })`.
- Canvas opens as a tab in the editor split tree (ADR-032).
- Backlinks/search can reference canvas nodes that embed notes (future: canvas node edges surface in the graph view).
- Canvas embeds inside notes work the same as other leaf embeds.

### Rust compute split

| Concern | Layer | Notes |
| ------- | ----- | ----- |
| JSON Canvas parse / serialize | `crates/basalt-canvas` | On vault open (parse), on every save (serialize). Off main thread. |
| Spatial index | `crates/basalt-canvas` | Quadtree, Rust-owned, queried by frontend each frame. |
| LOD proxy generation | `crates/basalt-canvas` | Image downscale tiers + note preview rasterization. Runs in background. |
| Auto-layout | `crates/basalt-canvas` | Optional: force-directed arrangement for imported cards. Reuse `basalt-graph` force sim. |
| Viewport culling query | `crates/basalt-canvas` | Spatial index query returns visible set; sent to frontend as typed array. |

## Consequences

### Benefits

- **Obsidian `.canvas` files open in Basalt** — zero-friction migration for Obsidian users.
- **No 3,000-node crash** — culled WebGL2 renderer handles tens of thousands of nodes. Upload is `O(visible)`, not `O(total)`.
- **No zoom re-rasterization** — LOD proxies mean zoom is always fluid regardless of image count.
- **Matches the graph renderer's proven architecture** — no unproven rendering pipeline; adapts an existing, benchmarked WebGL2 system.
- **Rust compute where Obsidian can't follow** — JSON parsing, spatial index, LOD generation are all native-speed, off the JS main thread, exactly per ADR-020's invariant ("JS renders pixels; Rust owns every byte of truth").

### Costs / risks

- **Two-layer rendering (WebGL + HTML overlay)** is a new pattern in the repo. The graph renderer is WebGL-only. Proven in Excalidraw, but adds coordination: the overlay must track the WebGL viewport transform each frame.
- **Live note embeds in cards** are DOM elements inside an overlay, subject to DOM cost if many are visible simultaneously. Mitigated by LOD (low zoom swaps to static previews) and mount/unmount on visibility.
- **New Rust crate** (`basalt-canvas`) — adds to the workspace. Scoped to a single concern; no new Tauri commands needed until the spatial index and LOD are wired.
- **JSON Canvas spec extensions** must remain backward-compatible (private fields only, ignored by other tools).

### Non-goals

- **Freehand drawing tools** — separate feature, separate session.
- **Real-time collaboration** — Obsidian Canvas has no collaboration; parity target is local-first.
- **Canvas export to image/PDF** — future work; note that the WebGL renderer would need a readPixels or canvas-to-image path.
- **Plugin API for canvas nodes** — defer until the core node/edge/group system is stable.
- **DQL/callout rendering inside canvas cards** — `.md`-content embedding is future work (same as ADR-034 non-goal).

## Implementation plan (file-level)

**Phase 1 — JSON Canvas interop** (smallest, proves format):
1. `crates/basalt-canvas/` (new): `CanvasDocument`, `CanvasNode`, `CanvasEdge`, `CanvasGroup` types; `parse_canvas(&str) -> CanvasDocument`; `serialize_canvas(&CanvasDocument) -> String`. Round-trip tests against real Obsidian `.canvas` files.

**Phase 2 — Viewport primitive:**
2. `packages/canvas-viewport/` (new): `CanvasViewportRenderer` class, adapted from `packages/graph/src/renderer.ts`. Rect instancing (4-vert quads), same `GraphTransform` (scale/ox/oy), same buffer contract (`setPositions`, `setSizes`, `setColors`, `setFlags`), same context-loss handling. Pan/zoom wired to the same input pattern as graph.
3. `features/canvas/CanvasView.tsx`: React leaf that mounts `<canvas>` + `CanvasViewportRenderer`, wires pointer events for pan/zoom/select.

**Phase 3 — Spatial index + culling:**
4. `crates/basalt-canvas`: `SpatialIndex` — quadtree, insert/remove/update rects, `query_viewport(bounds) -> &[NodeId]`. Expose via Tauri invoke (returns visible node IDs as `Uint32Array`).
5. `packages/canvas-viewport`: only upload visible nodes to GPU buffers per frame. Profile at 5k / 10k / 25k node counts.

**Phase 4 — Node interaction:**
6. `features/canvas/`: node create (double-click), move (drag), resize (handle), multi-select (marquee), delete. Edge create (drag from side handle), label edit. Group create (select → group), label/color edit.
7. Rectangle hit-testing via spatial index queries (not DOM).

**Phase 5 — Content compositing:**
8. `packages/canvas-viewport`: HTML overlay layer, positioned per frame from the same `GraphTransform`. Mount/unmount note embeds based on viewport visibility.
9. `features/canvas/`: note embed overlay renders a read-only CM6 view (reusing `previewExtensions()` from ADR-029). Click-to-edit activates full CM6 view.

**Phase 6 — LOD + persistence:**
10. `crates/basalt-canvas`: LOD proxy generation (image downscale tiers, note preview thumbnails). Cache to `.basalt/canvas-lod/`.
11. `features/canvas/persistence.ts`: save/load `.canvas` files via Rust parse/serialize; integrate with vault file watcher.
