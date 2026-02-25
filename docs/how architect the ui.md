# Basalt UI Architecture

> See `AGENTS.md` at project root for full mandatory rules.

## Mandatory Rules

1. **Always use shadcn/Radix** — Never write raw custom interactive components. Every dropdown, dialog, menu, popover, and modal MUST be built on shadcn/ui or Radix UI primitives.
2. **UI components are dumb** — Components in `packages/ui/` are stateless/presentational. Props in, DOM out. Zero business logic, zero Tauri knowledge.
3. **Maintain folder structure** — Group related components into feature folders with an `index.ts` re-export. One component per file. PascalCase filenames.

---

## Three-Layer Architecture


│  packages/ui          — "WHAT it looks like"            │
│  (Headless primitives + styled shells)                  │
│  Zero business logic. Zero Tauri knowledge.             │
│  Reusable across desktop, web, storybook, tests.        │
├─────────────────────────────────────────────────────────┤
│  apps/tauri/src/features/*  — "HOW it behaves"          │
│  (State management, hooks, Tauri IPC)                   │
│  Composes UI primitives with business logic.            │
├─────────────────────────────────────────────────────────┤
│  apps/tauri/src/app-shell   — "WHERE it sits"           │
│  (Layout composition, wiring features together)         │
│  The final assembly. Thin glue only.                    │
└─────────────────────────────────────────────────────────┘




packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/                          # Atomic primitives (already have these)
│   │   │   ├── button.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── separator.tsx
│   │   │   └── context-menu.tsx
│   │   │
│   │   ├── tabs/                        # ← NEW: Tab system primitives
│   │   │   ├── TabBar.tsx               # The horizontal strip of tabs
│   │   │   ├── TabItem.tsx              # A single tab (icon + title + close + indicators)
│   │   │   ├── TabDropZone.tsx          # Drop indicator for drag-and-drop
│   │   │   └── index.ts                 # Re-exports
│   │   │
│   │   ├── pane/                        # ← NEW: Split pane primitives
│   │   │   ├── PaneSplitter.tsx         # Draggable divider between panes
│   │   │   ├── PaneContainer.tsx        # A single pane (tab bar + content area)
│   │   │   └── index.ts
│   │   │
│   │   ├── CommandPalette.tsx
│   │   └── context-menu.tsx
│   │
│   ├── hooks/
│   │   └── use-drag.ts                  # Generic drag-and-drop hook
│   ├── lib/
│   │   └── utils.ts
│   └── styles/

apps/tauri/
├── src/
│   ├── app-shell/                       # Layout composition layer
│   │   ├── AppShell.tsx                 # ← NEW: Master layout (replaces __root)
│   │   ├── WorkspaceLayout.tsx          # ← NEW: Sidebar + panes + right panel
│   │   ├── TitleBar.tsx                 # ← NEW: Custom window title bar
│   │   ├── StatusBar.tsx                # ← NEW: Bottom bar (word count, sync, etc.)
│   │   ├── ThemeProvider.tsx
│   │   └── ThemeSelect.tsx
│   │
│   ├── features/
│   │   ├── tabs/                        # ← NEW: Tab business logic
│   │   │   ├── store.ts                 # Tab state (all open tabs, active tab, order)
│   │   │   ├── types.ts                 # TabItem, TabKind, PaneState types
│   │   │   ├── hooks/
│   │   │   │   ├── useTabs.ts           # Open/close/switch/reorder tabs
│   │   │   │   ├── useTabDragDrop.ts    # DnD between panes
│   │   │   │   └── useTabPersistence.ts # Remember open tabs across restarts
│   │   │   └── index.ts
│   │   │
│   │   ├── panes/                       # ← NEW: Split pane logic
│   │   │   ├── store.ts                 # Pane tree state (splits, sizes)
│   │   │   ├── types.ts                 # PaneNode, SplitDirection
│   │   │   ├── hooks/
│   │   │   │   ├── usePaneLayout.ts     # Split/close/resize panes
│   │   │   │   └── usePaneResize.ts     # Drag-to-resize logic
│   │   │   └── index.ts
│   │   │
│   │   ├── sidebar/                     # ← NEW: Left sidebar logic
│   │   │   ├── types.ts                 # SidebarPanel enum (files, search, graph...)
│   │   │   ├── hooks/
│   │   │   │   └── useSidebar.ts        # Active panel, collapse state
│   │   │   └── index.ts
│   │   │
│   │   └── vault/                       # (existing, untouched)
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   ├── routes/
│   └── main.tsx
