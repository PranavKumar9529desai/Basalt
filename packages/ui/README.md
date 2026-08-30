# @workspace/ui — Visual Primitives

The primitive UI layer for Basalt. **Props in, DOM out. Zero business logic.**

## Responsibility

All visual components that pass the three-layer litmus test:

> "Can this render in an empty `index.html` with zero backend?"

Components in this package MUST NOT:

- Call `invoke()` or any Tauri IPC
- Import from `@tauri-apps/*`
- Import from `apps/tauri/`
- Manage business state (no Zustand stores, no data fetching)
- Import from feature-level packages

They MAY contain:

- Internal UI state (hover, open/close, scroll position)
- Refs for DOM measurement
- Event handlers that call prop callbacks
- Layout/styling using Tailwind + `--sat-*` CSS variables

## Component Organization

```
src/components/
├── ui/                  # Atomic shadcn/Base UI primitives (do not manually edit)
│   ├── button.tsx
│   ├── command.tsx
│   ├── context-menu.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── input-group.tsx
│   ├── scroll-area.tsx
│   ├── separator.tsx
│   ├── textarea.tsx
│   └── tooltip.tsx
├── command-palette/     # Feature-group panels — each a folder with an index barrel
├── confirm-dialog/
├── file-tree/
├── header-band/          # HeaderBandRule — the unified header band cut-through
├── input-dialog/
├── palette-shell/
├── ribbon/               # Ribbon + RibbonItem (far-left quick-access bar)
├── sidebar/              # ResizeHandle, SidebarHeader, SidebarPanel
└── tabs/                 # TabsBar, TabItem, TabListFrame, types, useTabChrome
```

### Convention: Folder vs Flat

| Rule                             | When to use                                                |
| -------------------------------- | ---------------------------------------------------------- |
| **Folder** (`tabs/`, `sidebar/`) | Multi-file components (types, subcomponents, index barrel) |
| **File** (`component.tsx`)       | NOT used anymore — all components now use folders          |

Every feature folder MUST have an `index.ts` barrel that re-exports the public API.

> **Lexicon:** the far-left quick-access bar is the **Ribbon** (Obsidian
> lexicon) — it was renamed from `ActivityBar`. See
> `apps/tauri/src/app-shell/Ribbon.tsx` for the shell-side wiring.

## Usage

```tsx
// Import shadcn primitives from their full path:
import { Button } from "@workspace/ui/components/ui/button";
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";

// Import feature-group components from their barrel:
import { FileTree } from "@workspace/ui/components/file-tree";
import { TabsBar } from "@workspace/ui/components/tabs";

// Import utilities:
import { cn } from "@workspace/ui/lib/utils";
```

## Styling Rules

- ✅ Use `--sat-*` CSS variables for ALL colors (see `@workspace/theme`)
- ✅ Use Tailwind for layout/spacing only (`flex`, `gap-2`, `p-4`, `w-full`)
- ❌ Never use hardcoded color values (hex, tailwind color classes, etc.)
- ❌ Never use `@apply` directives
