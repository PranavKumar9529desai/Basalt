---
description: Mandatory UI development rules for Basalt — shadcn-first, --sat-* theme vars, three-layer architecture
---

# UI Development Rules

These rules apply to ALL UI work in the Basalt codebase. Follow them **before writing any component or styling code**.

---

## Step 1: Determine which layer the code belongs to

Ask: "Can this component render in an empty `index.html` with zero backend?"

- **YES** → it goes in `packages/ui/src/components/`
- **NO** (needs Tauri, IPC, vault state) → it goes in `apps/tauri/src/features/`
- **It wires multiple features together** → it goes in `apps/tauri/src/app-shell/`

| Layer | Location | Responsibility | Knows about Tauri? |
|-------|----------|---------------|---------------------|
| Primitives | `packages/ui/` | Visual components. Props in, DOM out. | 🚫 NEVER |
| Features | `apps/tauri/src/features/` | State, hooks, business logic, IPC | ✅ Yes |
| Shell | `apps/tauri/src/app-shell/` | Layout composition. Thin glue only | ✅ Yes |

---

## Step 2: Use shadcn/Radix — NEVER raw Tailwind components

Before writing ANY component, check if shadcn/ui already has it:
`Button`, `Input`, `Dialog`, `DropdownMenu`, `ScrollArea`, `Separator`, `Card`,
`Tooltip`, `Popover`, `Sheet`, `Tabs`, `Command`, `ContextMenu`, etc.

```tsx
// ❌ WRONG — raw Tailwind button
<button className="px-4 py-2 bg-blue-600 rounded text-white">Save</button>

// ✅ CORRECT
import { Button } from "@workspace/ui/components/ui/button";
<Button variant="default">Save</Button>

// ❌ WRONG — raw scroll container
<div className="overflow-y-auto h-full">{children}</div>

// ✅ CORRECT
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
<ScrollArea className="h-full">{children}</ScrollArea>
```

Only write raw Tailwind elements when NO shadcn component exists (e.g., custom canvas, unique layout wrappers).

---

## Step 3: Use `--sat-*` theme variables for ALL colors

Every single color in the app MUST use a `--sat-*` CSS custom property.
Tailwind is used ONLY for layout/spacing (flex, padding, gap, grid, width, height).

```tsx
// ❌ WRONG — hard-coded colors
<div className="bg-blue-600 text-white border-gray-700">
<div className="bg-[#1e293b] text-[#f8fafc]">
<div style={{ backgroundColor: '#0f172a' }}>

// ✅ CORRECT — theme variables
<div className="bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] border-[var(--sat-layout-border)]">
```

### Token families reference:
- `--sat-surface-*` — background layers (1, 2, 3)
- `--sat-text-*` — text (primary, secondary, muted, inverse)
- `--sat-accent-*` — brand/action (primary, hover)
- `--sat-layout-*` — structure (border, divider)
- `--sat-state-*` — semantic (danger, warning, success)
- `--sat-editor-*` — editor-specific (background, cursor, selection)

---

## Step 4: UI components must be dumb

Components in `packages/ui/` MUST NOT:
- Call `invoke()` or any Tauri API
- Fetch data or manage business state
- Import from `apps/tauri/` or `@tauri-apps/*`

They MAY contain:
- Internal UI state (hover, open/close, animation)
- Refs for DOM measurement
- Event handlers that call prop callbacks

```tsx
// ❌ WRONG
function FileTree() {
  const files = await invoke("get_vault_tree");  // NO
  return <ul>{files.map(...)}</ul>;
}

// ✅ CORRECT
function FileTree({ nodes, onFileClick }: FileTreeProps) {
  return <ul>{nodes.map(n => <li onClick={() => onFileClick(n)}>{n.name}</li>)}</ul>;
}
```

---

## Step 5: Follow folder structure conventions

```
packages/ui/src/components/
├── ui/                    # Atomic shadcn primitives (button, dialog, etc.)
│   ├── button.tsx         # Do NOT manually edit these — shadcn generates them
│   ├── dialog.tsx
│   └── scroll-area.tsx
│
├── tabs/                  # Feature-scoped component group
│   ├── TabBar.tsx         # One component per file, PascalCase
│   ├── TabItem.tsx
│   └── index.ts           # MUST re-export all public components
│
├── sidebar/
│   ├── SidebarRoot.tsx
│   ├── SidebarPanel.tsx
│   └── index.ts
│
└── CommandPalette.tsx     # Standalone components are fine as single files
```

For features in `apps/tauri/src/features/`:

```
features/<feature-name>/
├── types.ts               # TypeScript types and interfaces
├── store.ts               # State management (useReducer / zustand)
├── hooks/
│   ├── use<Feature>.ts    # Primary hook — the feature's public API
│   └── use<Concern>.ts    # Secondary hooks for specific concerns
├── components/            # Feature-specific components (optional)
└── index.ts               # Re-exports
```

---

## Step 6: Navigation model

This is a **desktop workspace app**, NOT a web page app.

- **Routes** = only for fundamentally different app modes (`/` workspace, `/onboarding`)
- **Tabs/panels** = content navigation within the workspace (notes, graph, settings)
- NEVER create a route for something that should be a tab or sidebar panel

---

## Quick validation checklist

Before submitting any UI code, verify:

- [ ] Using shadcn component instead of raw Tailwind? (buttons, inputs, dialogs, scroll areas, etc.)
- [ ] All colors use `--sat-*` vars? (no hex, no `bg-blue-*`, no rgb/hsl)
- [ ] Component in `packages/ui/` has zero Tauri imports?
- [ ] Feature folder has `types.ts`, `hooks/`, and `index.ts`?
- [ ] Using `cn()` for conditional class merging?
- [ ] Long lists are virtualized with `@tanstack/react-virtual`?
