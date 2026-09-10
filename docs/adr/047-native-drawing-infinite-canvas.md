# ADR-047: Native Drawing and Infinite Whiteboard Integration

**Status:** Proposed  
**Date:** 2026-09-10  
**Extends:** ADR-018 (registry-driven workbench), ADR-020 (desktop-tier performance), ADR-029 (single renderer), ADR-032 (split pane layout tree), ADR-034 (embed rendering), ADR-035 (infinite canvas), ADR-042 (vault parallel indexing and binary cache), ADR-043 (full-text and fuzzy search)

---

## 1. Context & Motivation

Visual sketching and freeform spatial ideation are fundamental to personal knowledge management. In the Obsidian ecosystem, the community **Excalidraw plugin** (by Zsolt Viczián) is one of the most widely adopted extensions in the world.

However, plugins suffer from structural boundaries:

1. **Disjoint App Shell Experience:** Foreign UI chrome that clashes with app theme tokens, typography, and tab management.
2. **Sync & Storage Conflicts:** Opaque JSON formats often bloat plain-text vaults, disrupting git sync, file diffs, and full-text search.
3. **No Native Leaf Registration:** Plugins must hack view lifecycle management, leading to layout stutter during split-pane re-layouts.
4. **Main-Thread I/O Latency:** Synchronous serialization of massive canvas scenes blocks the JavaScript event loop during high-frequency pen interactions.

Basalt requires first-class, native support for **freeform drawing and sketching** that adheres to our desktop-tier performance standard (<16ms input latency, <20ms boot, zero-corruption atomic storage).

---

## 2. Strategic Evaluation: Build from Scratch vs. Adoption

| Strategy                                             | Speed to Ship | Performance                                   | Maintenance Burden                                    | Licensing Freedom | Native Basalt Integration |
| :--------------------------------------------------- | :------------ | :-------------------------------------------- | :---------------------------------------------------- | :---------------- | :------------------------ |
| **A. Pure Custom Rust-WASM + WebGL2**                | 🔴 3–5 months | 🚀 Extreme (50k+ elements @ 120 FPS)          | 🔴 High (custom arrow routing, math, transforms, IME) | 🟢 100% MIT       | 🟢 Deep native            |
| **B. Custom Headless (`perfect-freehand` + SVG)**    | 🟡 6–10 weeks | 🟢 High                                       | 🟡 Moderate (custom state machine & handles)          | 🟢 100% MIT       | 🟢 Deep native            |
| **C. `@excalidraw/excalidraw` + Rust Core (Chosen)** | ⚡ 1–2 weeks  | 🟢 High (with lazy-load + debounced Rust I/O) | 🟢 Low (battle-tested upstream)                       | 🟢 **100% MIT**   | 🟢 Native Leaf wrapper    |

### Why `@tldraw` Was Rejected for Core

While `@tldraw` offers an outstanding signals-based SDK, its licensing model is **not MIT for production distribution** (requiring a commercial license or enforcing a mandatory visible watermark). `@excalidraw/excalidraw` is **100% MIT-licensed**, fully open, and aligns with Basalt's open-source desktop ethos.

---

## 3. Decision: The Hybrid Architecture

We adopt **`@excalidraw/excalidraw`** for the frontend canvas rendering and gesture engine, encapsulated within a custom Basalt Leaf (`features/drawing`), powered by a dedicated **Rust backend core** for atomic disk persistence, hybrid file parsing, Tantivy text search indexing, and headless background exports.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                FRONTEND (React / Leaf Layer)                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  • Excalidraw Component (<Excalidraw />)                                               │
│    - Canvas2D interaction, zoom/pan camera, rough.js hand-drawn styling                │
│    - Tool selection (Pen, Eraser, Rectangle, Arrow, Diamond, Text)                     │
│  • App-Shell Leaf Wrapper (`ExcalidrawLeaf.tsx` / `DrawingView.tsx`)                   │
│    - Theme token bridge (`--sat-*` variables mapped to `.excalidraw`)                  │
│    - Top-right action buttons (Switch to Raw Markdown, Export to PDF/PNG)              │
│    - Auto-save debouncer (listens to `onChange`, sends delta/snapshot to Rust)         │
│  • Transclusion & Embed Engine                                                         │
│    - Off-screen renderer for LaTeX formulas, Mermaid charts, and [[wikilink]] cards    │
│    - Double-click interceptor to edit embedded formulas/notes                          │
│  • Markdown PostProcessor (`![[Drawing.md]]` / `![[Drawing.md#^frame=...]]`)           │
│    - Renders static/interactive SVG preview inside standard editor notes               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Tauri IPC Commands
                                            │ (read_drawing, save_drawing, export_drawing)
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                                  BACKEND (Rust Core)                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  • Hybrid File Parser & Serializer (`core/drawing.rs`)                                 │
│    - Deconstructs `.drawing.md` into YAML frontmatter, plain text, and JSON payload    │
│    - Atomic file saving (`tempfile` + rename) to guarantee zero file corruption        │
│  • Search & Indexing Engine (Tantivy / Nucleo)                                         │
│    - Extracts text inside drawings so Quick Switcher and Global Search find them       │
│  • Background Export Pipeline (`features/export/drawing.rs`)                           │
│    - Off-thread headless SVG-to-PNG / PDF rasterization (`resvg` / `tiny-skia`)         │
│    - Generates exports without dropping UI frame rates                                 │
│  • Vault Rename & Link Refactor Engine                                                 │
│    - Intercepts note renames and updates embedded `[[wikilinks]]` inside drawing JSON  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. File Format Specification: The Hybrid `.drawing.md` Backplane

To ensure complete interoperability with Markdown vaults, Git versioning, and Tantivy full-text search, drawing files are stored with the extension `.drawing.md` (or `.excalidraw.md`) using a three-tier format:

```markdown
---
type: excalidraw
version: 2
created: 2026-09-10T11:00:00Z
updated: 2026-09-10T11:05:00Z
---

# Drawing Text & Elements

- [[System Architecture]]
- Load Balancer
- PostgreSQL Cluster
- Worker Pool

%%#drawing-data
{"type":"excalidraw","version":2,"source":"basalt","elements":[{"type":"rectangle","id":"rect-1","x":100,"y":100,"width":200,"height":120,"strokeColor":"#ff5722","backgroundColor":"transparent","fillStyle":"hachure","strokeWidth":1,"roughness":1,"opacity":100}],"appState":{"viewBackgroundColor":"#121110","gridSize":20},"files":{}}
%%
```

### Advantages of the Hybrid Backplane:

1. **Searchability**: Tantivy and Nucleo index the `# Drawing Text & Elements` section automatically without needing to decompress the JSON scene.
2. **Graph View & Backlinks**: `[[wikilinks]]` placed inside drawing text boxes automatically generate edges in Basalt’s Graph View.
3. **Safety & Portability**: If opened in any plain text editor, the note is completely legible.

---

## 5. File & Module Decomposition Plan

Conforming strictly to the repo's four-layer architecture (`packages/` → `features/` → `shared/` → `app-shell/`):

### A. Frontend Feature Domain (`apps/tauri/src/features/drawing/`)

```
apps/tauri/src/features/drawing/
├── components/
│   ├── ExcalidrawWrapper.tsx         # Lazy-loaded wrapper with CSS & theme overrides
│   ├── DrawingHeaderActions.tsx      # Leaf header bar (Mode toggle, Export, Zoom)
│   └── DrawingEmbed.tsx              # Markdown postprocessor renderer for ![[drawing.md]]
├── hooks/
│   ├── useDrawingState.ts            # Manages dirty state, debounced auto-save (400ms)
│   └── useExcalidrawTheme.ts         # Bridges --sat-* theme tokens to .excalidraw classes
├── lib/
│   ├── parser.ts                     # TypeScript parser for .drawing.md hybrid format
│   └── export.ts                     # exportToSvg / exportToBlob helpers
├── DrawingView.tsx                   # The Workbench Leaf component
├── types.ts                          # TypeScript types for scenes, files, and IPC payloads
└── index.ts                          # Public feature barrel export
```

### B. Rust Core & Commands Layer (`src-tauri/`)

```
apps/tauri/src-tauri/src/
├── core/
│   └── drawing.rs                    # Fast SIMD parser, atomic file serializer (tempfile+rename)
└── commands/
    ├── drawing.rs                    # Tauri commands: read_drawing, save_drawing, export_drawing
    └── mod.rs                        # Command registration in Tauri invoke handler
```

### C. App Shell Layer (`app-shell/`)

- **`app-shell/registrations.ts`**:
  ```ts
  const Drawing = lazy(() =>
    import("../features/drawing").then((m) => ({ default: m.DrawingView })),
  );

  leafRegistry.register({
    type: "drawing",
    name: "Drawing",
    icon: IconPencil,
    extensions: [".drawing.md", ".excalidraw.md", ".excalidraw"],
    component: Drawing,
  });
  ```
- **`app-shell/Ribbon.tsx`**: Adds a "New Drawing" ribbon icon button and binds to the command palette.

---

## 6. Performance Guardrails (Strict Engineering Rules)

1. **Lazy Loading & Code Splitting**:  
   Excalidraw is dynamically imported (`React.lazy`) and loaded only when a drawing leaf is mounted. Startup bundle time remains unaffected (<20ms boot).
2. **Uncontrolled Component Architecture**:  
   `initialData` is supplied **only once** on component mount. State changes inside the canvas never trigger React component re-renders; external programmatic updates execute via `excalidrawAPI.updateScene()`.
3. **Trailing 400ms Auto-Save Debounce**:  
   User pointer events fire `onChange` 60–120 times per second. Disk serialization must be debounced with a 400ms trailing timer to prevent I/O thrashing.
4. **Deleted Element Pruning**:  
   On save, elements with `isDeleted: true` are filtered out before disk serialization, keeping memory and file sizes lean.
5. **Asset Separation**:  
   Pasted bitmap images are saved to the vault's assets folder (`_assets/`) and referenced via relative file paths rather than storing massive base64 strings directly in the JSON payload.

---

## 7. Transclusion & Embed Syntax

Drawings can be embedded anywhere within standard Markdown notes:

- **Full Canvas Embed**: `![[Architecture.drawing.md]]`
- **Marker Frame Slicing**: `![[Architecture.drawing.md#^frame=BackendCluster]]`
- Rendered via `DrawingEmbed.tsx` using `exportToSvg`, creating zero overhead (does not mount the full Excalidraw editor instance).

---

## 8. Verification & Test Plan

1. **Benchmarking Input Latency**: Verify pen/cursor drawing latency remains ≤16ms on 120Hz displays.
2. **Scale Testing**: Verify smooth panning and zooming on scenes with up to 3,000 mixed elements.
3. **Atomic Safety & Crash Resilience**: Verify that unexpected app termination during an active drawing session results in zero corrupted or truncated files.
4. **Search Parity**: Verify that words written inside drawings are immediately discoverable in Quick Switcher and Tantivy full-text search.
