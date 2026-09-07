# Basalt Canvas Feature (`features/canvas`)

> **Architectural Reference & Contributor Guide**  
> Adheres to [ADR-018 (Registry-Driven Workbench)](../../../../docs/adr/018-registry-driven-workbench.md) and [ADR-035 (Infinite Canvas)](../../../../docs/adr/035-infinite-canvas.md).

---

## 1. Overview & Purpose

The **Canvas** feature provides a freeform 2D spatial workspace for thinking, mind-mapping, and note arrangement.

It is 100% compliant with the open **JSON Canvas v1.0** specification (`.canvas` files), ensuring full bidirectional interoperability with Obsidian and the broader canvas ecosystem.

---

## 2. High-Performance Architecture: Note Rendering & Interactions

```
                  ┌──────────────────────────────────────────────┐
                  │          Canvas View (React Flow)            │
                  │   onlyRenderVisibleElements={true}           │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     [ Blurred / Inactive Cards ]                     [ Single Focused Card ]
   ─────────────────────────────────               ─────────────────────────────
   • Lightweight Markdown Renderer                 • Active Editor Mounted
   • Pure DOM (HTML: <h1>, <ul>, <input>)          • CodeMirror or styled input
   • Fast, zero CodeMirror overhead                • Inline [[ autocomplete popup
   • Checkbox clicks toggle markdown in place      • Floating action toolbar on top
```

### Why We Do NOT Mount Full Editors on Every Card

Mounting a full CodeMirror 6 instance on every note card across an infinite canvas of 100+ cards destroys WebView memory and frame rates (dropping pan/zoom to 20fps).

To ensure **Obsidian-class 60fps performance**:

1. **Lightweight Display Mode (Inactive Cards)**:
   - Inactive cards render lightweight, sanitized Markdown DOM elements styled using `--sat-*` tokens.
   - Headings get prose typography sizing and accent colors.
   - Task lists (`- [ ]`) render as clickable checkboxes that update the underlying Markdown without entering full edit mode.
2. **Single Active Editor on Edit**:
   - Double-clicking or clicking "Edit" mounts the live editor on _only the single focused card_.
   - Only one active editor instance exists at any time.
3. **Viewport Virtualization**:
   - Canvas utilizes React Flow's `onlyRenderVisibleElements={true}` so off-screen elements are culled from DOM painting during pan and zoom.
4. **Wikilink `[[ ]]` Autocompletion**:
   - Typing `[[` inside an active card triggers an inline popover dropdown connected to `invoke("autocomplete_links")`.
   - Keyboard accessible (`Up`/`Down`/`Enter`), inserting `[[Target Note]]`.
5. **Floating Card Toolbar**:
   - Selected cards display a contextual action bar:
     - 🗑️ Delete node and connected edges
     - 🎨 Color palette (sets JSON Canvas color `1`–`6` or custom)
     - 🔍 Zoom to fit card
     - ✏️ Edit mode toggle

---

## 3. Architectural Data Flow

```
                     ┌───────────────────────────────┐
                     │ .canvas File (JSON on Disk)   │
                     └───────────────┬───────────────┘
                                     │ open_canvas / save_canvas
                                     ▼
                     ┌───────────────────────────────┐
                     │  Tauri IPC / Rust Backend     │
                     │  crates/basalt-canvas (Schema)│
                     │  crates/basalt-vault (I/O)    │
                     └───────────────┬───────────────┘
                                     │ JSON string
                                     ▼
                     ┌───────────────────────────────┐
                     │        lib/mapper.ts          │
                     │  mapToXYFlow / mapToCanvasDoc │
                     └───────────────┬───────────────┘
                                     │ CanvasXYNode[] & Edge[]
                                     ▼
                     ┌───────────────────────────────┐
                     │    CanvasView (React Flow)    │
                     │  Nodes, Edges, Gestures, Pan  │
                     └───────────────────────────────┘
```

### Clarification: File Watcher vs. Auto-Save

- **`VaultWatcher` (Rust crate `basalt-vault`)**: A background file-system observer using `notify`. It watches disk events to reload external modifications (e.g., git checkouts, third-party edits). It **never** auto-saves or flushes in-memory frontend changes to disk.
- **Frontend Auto-Save (`CanvasView`)**: The frontend holds live graph state in React Flow. Any user interaction (moving cards, resizing, typing, connecting arrows) marks the tab as dirty (`services.markTabDirty(tab.id, true)`), runs a debounced timer (500ms), and calls `invoke("save_canvas", ...)`. On success, the tab is marked clean (`services.markTabDirty(tab.id, false)`).

---

## 4. Directory Layout

```
features/canvas/
├── CanvasView.tsx              # Primary leaf component registered in leaf registry
├── CanvasToolbar.tsx           # Floating action toolbar (Add Card, Note, Media, Link, Group)
├── CanvasContextMenu.tsx       # Right-click context menu (Canvas background & node actions)
├── CanvasContext.ts            # React Context (provides updateText, updateUrl, saveNow)
├── types.ts                    # JSON Canvas v1.0 TypeScript definitions (CanvasDocument, CanvasNode, CanvasEdge)
├── commands.ts                 # Canvas workbench commands (Zoom to fit, reset view, etc.)
├── lib/
│   ├── mapper.ts               # Bidirectional translation: JSON Canvas <-> @xyflow/react
│   ├── mapper.test.ts          # Unit tests for projection logic & ghost exclusion
│   ├── colors.ts               # Resolves Canvas color indices (1-6) and hex to --sat-* tokens
│   └── guidelines.ts           # Smart alignment algorithm (calculates horizontal/vertical snaps)
├── components/
│   ├── GuidelineLines.tsx      # SVG overlay rendering smart snapping lines
│   ├── NotePickerModal.tsx     # Fuzzy picker modal for inserting vault notes
│   └── AssetPickerModal.tsx    # Media/asset picker modal (images, audio, video, pdfs)
├── nodes/
│   ├── TextCardNode.tsx        # Markdown text card with inline double-click editing
│   ├── FileNode.tsx            # Embedded note (.md) or media (images, video, audio, pdf)
│   ├── GroupNode.tsx           # Visual bounding container for grouping cards
│   ├── LinkNode.tsx            # External URL link preview card with inline URL editing
│   ├── GhostCardNode.tsx       # Obsidian UX: ghost preview card when stretching arrows
│   └── CardHandles.tsx         # Shared 4-sided connection handles (top, bottom, left, right)
└── edges/
    └── CanvasEdge.tsx          # Custom Bezier edge with arrow marker and theme colors
```

---

## 5. Critical Invariants & Rules for AI Agents

> 🚫 **NEVER BREAK THESE INVARIANTS**

### 1. The Persistence Guard Rules (`isLoadedRef` & `isDirtyRef`)

Canvas documents are loaded asynchronously over Tauri IPC (`invoke("open_canvas")`).

- **Rule A (`isLoadedRef`)**: NEVER save or flush state before `open_canvas` has resolved and loaded the existing nodes. Otherwise, initial empty arrays (`[]`) will overwrite and wipe the user's `.canvas` file!
- **Rule B (`isDirtyRef`)**: NEVER flush on unmount/tab close unless `isDirtyRef.current === true`. Unconditionally flushing on unmount causes race conditions during tab transitions and destroys content.
- **Rule C (`markTabDirty`)**: Always call `services.markTabDirty(tab.id, true)` when mutating state and `services.markTabDirty(tab.id, false)` after saving. This renders the dirty dot indicator in the tab bar and prevents accidental tab closing.

### 2. The Four-Layer Architecture Rule

Per repo-wide `AGENTS.md`:

- `features/canvas` **MUST NEVER** import directly from other features (e.g., `features/tabs`, `features/vault`, `features/editor`).
- Access cross-feature capabilities strictly through `useLeafServices()` from `@workspace/views`.

### 3. Theming & Token Rule

Per [ADR-002](../../../../docs/adr/002-sat-css-theme-tokens.md):

- **NEVER** hardcode hex colors or raw Tailwind colors (e.g. `bg-blue-600`, `border-gray-700`).
- **ALWAYS** use `--sat-*` theme variables (e.g. `var(--sat-surface-1)`, `var(--sat-layout-border)`, `var(--sat-accent-primary)`).
- When resolving JSON Canvas color numbers `1` through `6`, use `resolveCanvasColor()` in `lib/colors.ts`.

---

## 6. Extending Nodes & Components

When adding a new node type:

1. Create `nodes/YourNode.tsx` using `memo(...)` and `@xyflow/react`'s `NodeProps<CanvasXYNode>`.
2. Include `<NodeResizer onResizeEnd={() => canvas.saveNow()} />` if resizable.
3. Include `<CardHandles ... />` for connecting arrows.
4. Register the node in `nodeTypes` in `CanvasView.tsx`.
5. Update `mapToXYFlow` and `mapToCanvasDocument` in `lib/mapper.ts` to map the node to/from the JSON Canvas v1.0 spec.
