# ADR-035: Infinite Canvas — Spatial Note Layout

**Status:** Accepted (Amended 2026-09-06: Architecture revised from custom WebGL2 to `@xyflow/react` + Rust compute)  
**Date:** 2026-09-05  
**Amended:** 2026-09-06  
**Extends:** ADR-018 (registry-driven workbench), ADR-020 (desktop-tier performance), ADR-029 (single renderer), ADR-032 (split pane layout tree), ADR-034 (embed rendering)

---

## 1. Context & Motivation

Obsidian Canvas (Dec 2022) is an infinite 2D spatial surface for laying out notes, text cards, and media, linked by directional connections and visual groups. It is built on the open **JSON Canvas v1.0 spec** (MIT, [jsoncanvas.org](https://jsoncanvas.org/)), making `.canvas` files fully interoperable across tools.

### Why Obsidian Canvas Stumbles at Scale

Community profiling and stress testing demonstrate that Obsidian Canvas degrades rapidly on dense boards:

1. **Unvirtualized DOM Mounting Churn:** Viewport observers continuously mount and unmount cards as they cross screen boundaries during pan/zoom, causing repeated React/DOM initialization and severe frame stutter.
2. **Image Re-rasterization on Zoom:** Chromium re-rasterizes high-res images from source on every zoom animation frame (~1.2 GB decoded RGBA on a 100-image board).
3. **Heavy Editor Overhead:** Obsidian mounts a full CodeMirror 6 `EditorView` inside every card simultaneously, consuming massive memory and event listener pools.
4. **Layout Thrashing:** Moving cards without CSS containment forces Chromium to recalculate layout across the entire board.

---

## 2. Post-Mortem of Initial Attempt (Phase 1–6 WebGL2 Engine)

Our first implementation attempted to adapt Basalt's Graph WebGL2 renderer (`packages/canvas-viewport`) with an imperative DOM overlay (`overlay.ts`). While theoretically high-throughput for pure geometry, this approach proved architecturally unsuitable for an interactive knowledge canvas:

1. **Curved Arrows vs. Straight Quads:**  
   Obsidian Canvas connections are **smooth cubic Bezier curves** with directional arrowheads flush to node boundaries. In WebGL2, lines are drawn as instanced line quads (straight rectangles between centers). Generating cubic Bezier curves with dynamic width, arrowheads, edge hover, and label chips in WebGL requires custom curve tessellation on the CPU/GPU and complex shader math.
2. **Disconnected Arrowhead Geometry:**  
   The initial attempt used ad-hoc ray-box clipping (`rectLineIntersect`), which detached from box borders when cards moved diagonally or connected to specific sides (`fromSide` / `toSide`).
3. **The Two-Layer Illusion:**  
   WebGL only rendered blank background rectangles. Because notes require editable text, links, and markdown, an imperative DOM overlay (`syncOverlay`) was still necessary. Managing DOM elements via raw `document.createElement` bypassed React state, broke resize handles, and created severe UX defects.
4. **Why Pure WASM/WebGL (Figma/CanvasKit) Is Not the Answer for Notes:**  
   Figma spent 5+ years building a C++ vector engine, yet **even Figma injects an HTML DOM `<textarea>` overlay whenever you edit text**. Similarly, Google's **CanvasKit** (Skia WASM) explicitly recommends HTML overlays for text labels and cards. A Markdown canvas is fundamentally about prose and rich text, not vector paths.

---

## 3. Decision: The Hybrid `@xyflow/react` + Rust Architecture

We adopt **`@xyflow/react` (React Flow)** for the Canvas UI layer, backed by our existing **Rust crate (`crates/basalt-canvas`)** for data persistence, parsing, and serialization.

```
┌─────────────────────────────────────────────────────────────┐
│  crates/basalt-canvas/         Rust Backend                 │
│                                JSON Canvas v1.0 parse/      │
│                                serialize & file I/O         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Tauri invoke: open_canvas / save_canvas
┌──────────────────────────────▼──────────────────────────────┐
│  features/canvas/              Obsidian Canvas Feature UI   │
│  ├── CanvasView.tsx            React Flow Provider & Canvas │
│  ├── CanvasToolbar.tsx         Floating quick-action bar    │
│  ├── CanvasContextMenu.tsx     Right-click action menu      │
│  ├── nodes/                    Custom React Node Components │
│  │   ├── TextCardNode.tsx      Markdown card + inline edit  │
│  │   ├── FileNode.tsx          Vault note embed             │
│  │   ├── LinkNode.tsx          Web link card                │
│  │   └── GroupNode.tsx         Translucent group container  │
│  ├── edges/                    Obsidian Edge Definitions    │
│  │   └── CanvasEdge.tsx        Smooth Bezier + arrow marker │
│  ├── lib/                      Pure Domain Helpers          │
│  │   ├── mapper.ts             JSON Canvas ↔ XYFlow mapper  │
│  │   └── colors.ts             Obsidian 6-color presets     │
│  └── store/                    useCanvasStore (Zustand)     │
└─────────────────────────────────────────────────────────────┘
```

### Division of Responsibilities

1. **Rust Backend (`crates/basalt-canvas`):**
   - Implements JSON Canvas v1.0 schema (`CanvasDocument`, `CanvasNode`, `CanvasEdge`, `CanvasGroup`).
   - Fast native parse, validate, and serialize off the JS main thread.
   - Handled via Tauri IPC (`open_canvas`, `save_canvas`).
2. **SVG Connection Layer (`@xyflow/react`):**
   - Native cubic Bezier edge routing (`type: "bezier"`).
   - Tangents calculated based on handle side (`Top`, `Right`, `Bottom`, `Left`).
   - Closed arrowhead markers (`MarkerType.ArrowClosed`) snapping flush against card borders.
   - Live curved preview line while dragging from connection handles.
3. **DOM Card Layer (`@xyflow/react` + Custom Nodes):**
   - Rich React components styled with Basalt `--sat-*` theme tokens.
   - Native 8-point node resizing via `<NodeResizer />`.
   - Box marquee multi-selection, smooth pan/zoom with momentum, and dotted background grid.

---

## 4. Performance Guardrails (Avoiding Competitor Traps)

To prevent the performance degradation seen in Obsidian Canvas, the implementation must adhere to these five architectural rules:

1. **Level of Detail (LOD) for Editors:**  
   Never mount full CodeMirror 6 editors on all cards. By default, text cards render a lightweight, static Markdown preview. Double-clicking activates an inline editor **only on that single card**. Clicking outside unmounts the editor and restores the static preview.
2. **Strict Component Memoization:**  
   Every custom node and edge component must be wrapped in `React.memo`. When Node A is dragged, only Node A re-renders; other nodes on screen remain completely idle.
3. **CSS Containment:**  
   Cards must specify explicit dimensions (`width`, `height`) and use CSS `contain: layout style paint`. This isolates card reflows so modifications do not trigger document-wide layout recalculation.
4. **Generous Viewport Padding:**  
   Avoid aggressive 0-margin node unmounting. Use GPU hardware-accelerated transforms (`translate3d`) and generous buffer margins to ensure panning remains 60fps without mounting jitter.
5. **Fixed-Dimension Media:**  
   Images inside cards must have explicit aspect ratios and `loading="lazy"` to prevent Chromium from re-rasterizing decoded bitmaps during zoom gestures.

---

## 5. Detailed Specification for Implementation

### A. Data Mapper (`features/canvas/lib/mapper.ts`)

Bidirectional mapping between `CanvasDocument` (JSON Canvas 1.0) and `@xyflow/react`:

- **Nodes (`CanvasNode` / `CanvasGroup` $\leftrightarrow$ XYFlow `Node`):**
  - `id`: string identifier preserved 1:1.
  - `type`: `"text"` $\rightarrow$ `"canvasText"`, `"file"` $\rightarrow$ `"canvasFile"`, `"link"` $\rightarrow$ `"canvasLink"`, `"group"` $\rightarrow$ `"canvasGroup"`.
  - `position`: `{ x: node.x, y: node.y }`.
  - `style`: `{ width: node.width, height: node.height, zIndex: type === "group" ? -1 : 1 }`.
  - `data`: `{ text, file, url, label, color }`.
- **Edges (`CanvasEdge` $\leftrightarrow$ XYFlow `Edge`):**
  - `id`: string identifier.
  - `source`: `edge.fromNode`, `sourceHandle`: `edge.fromSide ?? "right"`.
  - `target`: `edge.toNode`, `targetHandle`: `edge.toSide ?? "left"`.
  - `label`: `edge.label`.
  - `type`: `"bezier"`.
  - `markerEnd`: `{ type: MarkerType.ArrowClosed, color: edgeColor }`.

### B. Node Components (`features/canvas/nodes/`)

1. **`TextCardNode.tsx`**:
   - Resizer: `<NodeResizer minWidth={160} minHeight={80} isVisible={selected} />`.
   - Handles: 4 pairs of overlapping source/target handles on `Top`, `Right`, `Bottom`, `Left`. Revealed on card hover or selection.
   - Body: Displays styled Markdown preview. Double-click swaps to inline textarea/editor. `Escape` or blur commits changes.
   - Header/Accent: Border or top bar tinted to preset colors ("1" to "6") or `--sat-surface-2`.
2. **`FileNode.tsx`**:
   - Vault note card referencing a `.md` note. Displays document icon, file title, and excerpt/tags. Double-click opens the note in an editor tab.
3. **`GroupNode.tsx`**:
   - Translucent container box with top-left editable label. Resizable, positioned in the background (`zIndex: -1`).
4. **`LinkNode.tsx`**:
   - Web bookmark card with URL, title, and external link icon.

### C. Edge Component (`features/canvas/edges/CanvasEdge.tsx`)

- Renders smooth cubic Bezier path using XYFlow's `getBezierPath`.
- Includes a centered, clickable label pill for setting/editing edge text.
- Connects flush to source/target handles with closed arrow markers.

### D. View & Chrome (`features/canvas/CanvasView.tsx`)

- Wraps board in `<ReactFlowProvider>` and `<ReactFlow>`:
  - `<Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />` (Obsidian dot grid).
  - Floating `CanvasToolbar`: Add text card, add note, add group, zoom in, zoom out, zoom to fit.
  - Context menu on right-click (canvas background vs. node).
  - Auto-save: Debounced write back to `.canvas` file via `save_canvas` on node drag end, resize end, text edit commit, or connection creation.

### E. Smart Alignment Guidelines (`features/canvas/lib/guidelines.ts`)

- **Magnetic Snapping (Figma/Canva-Style):** During card drag (`onNodeDrag`), inspect bounding boxes of neighboring cards along 6 reference axes:
  - Vertical alignments: `Left`, `CenterX`, `Right`.
  - Horizontal alignments: `Top`, `CenterY`, `Bottom`.
- **Threshold & Snapping:** Within a 5px proximity threshold, the dragged card coordinate magnetically snaps to match the aligned reference card.
- **Visual Reference Lines:** Renders dynamic accent-colored dashed reference lines across the canvas connecting the aligned cards.
- **Auto-Dismiss:** Reference lines disappear immediately on `onNodeDragStop`.

---

## 6. Deprecation & Cleanup

- Deprecate `packages/canvas-viewport` (remove from active rendering path).
- Remove obsolete imperative geometry and overlay files:
  - `apps/tauri/src/features/canvas/lib/scene.ts`
  - `apps/tauri/src/features/canvas/lib/interaction.ts`
  - `apps/tauri/src/features/canvas/lib/spatial.ts`
  - `apps/tauri/src/features/canvas/lib/overlay.ts`

---

## 7. Verification Plan

### Automated Verification

- Unit tests for `lib/mapper.ts` asserting lossless round-trip conversion:
  `JSON Canvas document -> XYFlow nodes/edges -> JSON Canvas document`.
- Type check: `bunx tsc --noEmit` from `apps/tauri/`.
- Lint: `bun run lint` clean across workspace.

### Manual UX Verification

1. **Curved Arrows:** Connect Card A (right) to Card B (left). Verify smooth S-curve with arrowhead touching Card B's border cleanly.
2. **Connection Handles:** Hover over a card; verify 4 circular handles appear. Drag from a handle to another card's handle and verify snapping.
3. **Resizing:** Select a card; verify 8-point resize handles appear and resize smoothly with minimum bounds.
4. **Text Editing:** Double-click a text card; type markdown; click outside; verify formatted markdown renders immediately.
5. **Obsidian Compatibility:** Open an existing Obsidian `.canvas` file; verify nodes, groups, colors, and edges load identically and save back cleanly.
