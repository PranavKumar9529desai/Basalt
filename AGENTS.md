# Basalt — Agent Rules

> These rules are mandatory for ALL AI agents working on this codebase.
> Violating any rule marked 🚫 is a hard error — stop and fix it.

---

## 1. Three-Layer Architecture

Every UI feature MUST be split across exactly three layers:

| Layer | Location | Responsibility | Knows about Tauri? |
|-------|----------|---------------|---------------------|
| **Primitives** | `packages/ui/` | Visual components. Props in, DOM out. | 🚫 NEVER |
| **Features** | `apps/tauri/src/features/` | State, hooks, business logic, IPC | ✅ Yes |
| **Shell** | `apps/tauri/src/app-shell/` | Layout composition. Thin glue only | ✅ Yes |

### The litmus test
> "Can this component render in an empty `index.html` with zero backend?"
> - **Yes** → `packages/ui/`
> - **No** → `apps/tauri/src/features/`

---

## 2. Component Rules (packages/ui)

### 🚫 ALWAYS prefer shadcn/Radix over raw Tailwind markup
Whenever a shadcn/ui component exists for what you need, **USE IT**.
Do NOT hand-write raw `<div>` / `<button>` with Tailwind classes when a
shadcn primitive already covers it — this includes buttons, inputs, dialogs,
dropdowns, scroll areas, separators, cards, tooltips, popovers, modals, etc.

Only write a raw Tailwind element when NO shadcn component exists for it
(e.g., a custom graph canvas or a unique layout container).

```tsx
// ❌ WRONG — raw Tailwind button
<button className="px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-700">
  Save
</button>

// ✅ CORRECT — shadcn Button component
import { Button } from "@workspace/ui/components/ui/button";
<Button variant="default">Save</Button>

// ❌ WRONG — raw Tailwind scroll container
<div className="overflow-y-auto h-full">{children}</div>

// ✅ CORRECT — shadcn ScrollArea
import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
<ScrollArea className="h-full">{children}</ScrollArea>

// ❌ WRONG — raw custom dropdown
function Dropdown({ items }) {
  const [open, setOpen] = useState(false);
  return <div className="dropdown">{/* hand-rolled logic */}</div>;
}

// ✅ CORRECT — built on Radix primitives
import { DropdownMenu } from "@radix-ui/react-dropdown-menu";
function MyMenu({ items }) {
  return <DropdownMenu.Root>{/* compose Radix primitives */}</DropdownMenu.Root>;
}
```

### 🚫 UI components MUST be dumb (stateless/presentational)
Components in `packages/ui/` receive data and callbacks via props.
They MUST NOT:
- Call `invoke()` or any Tauri API
- Fetch data
- Manage business state
- Import from `apps/tauri/`
- Import from `@tauri-apps/*`

They MAY contain:
- Internal UI state only (hover, open/close, animation state)
- Refs for DOM measurement
- Event handlers that call prop callbacks

```tsx
// ❌ WRONG — UI component fetching data
function FileTree() {
  const files = await invoke("get_vault_tree");  // 🚫 NO
  return <ul>{files.map(...)}</ul>;
}

// ✅ CORRECT — dumb component, data comes via props
function FileTree({ nodes, onFileClick }: FileTreeProps) {
  return <ul>{nodes.map(n => <li onClick={() => onFileClick(n)}>{n.name}</li>)}</ul>;
}
```

### Folder structure for components
Group related components into feature folders, not flat files:

```
packages/ui/src/components/
├── ui/                    # Atomic shadcn primitives (button, input, dialog, etc.)
│   ├── button.tsx
│   ├── dialog.tsx
│   └── scroll-area.tsx
│
├── tabs/                  # Feature-scoped component group
│   ├── TabBar.tsx
│   ├── TabItem.tsx
│   └── index.ts           # Re-exports all public components
│
├── sidebar/               # Another feature group
│   ├── SidebarRoot.tsx
│   ├── SidebarPanel.tsx
│   └── index.ts
│
└── CommandPalette.tsx      # Standalone components are fine as single files
```

**Rules:**
- `ui/` subfolder = shadcn-generated atomic primitives (do not manually edit)
- Feature folders (e.g., `tabs/`, `sidebar/`) = composed components built FROM `ui/` primitives
- Every feature folder MUST have an `index.ts` that re-exports the public API
- One component per file. File name = component name (PascalCase)

---

## 3. Feature Rules (apps/tauri/src/features/)

Each feature is a self-contained folder:

```
features/
└── tabs/
    ├── types.ts           # TypeScript types and interfaces
    ├── store.ts           # State management (useReducer / zustand)
    ├── hooks/
    │   ├── useTabs.ts     # Primary hook — the feature's public API
    │   └── useTabDnD.ts   # Secondary hooks for specific concerns
    ├── components/        # Feature-specific components (optional, only if needed)
    │   └── TabContextMenu.tsx
    └── index.ts           # Re-exports
```

**Rules:**
- Features MUST NOT import from other features directly. Communicate through the shell layer.
- Every feature exposes its API via hooks (e.g., `useTabs()` returns `{ tabs, openTab, closeTab }`).
- State updates use `useReducer` or a lightweight store. No prop drilling.

---

## 4. Navigation Model

This is a **desktop workspace app**, NOT a web page app.

- **Routes** are used ONLY for fundamentally different application modes:
  - `/` → Main workspace (sidebar + tabs + editor)
  - `/onboarding` → Vault picker / first-run experience
- **Within the workspace**, navigation is state-driven (tabs, panels), NOT URL-driven.
- NEVER create a route for something that should be a tab or panel (graph view,
  settings, backlinks — these are all tabs or sidebar panels, not routes).

---

## 5. Styling Rules

- Use **Tailwind CSS** utility classes for layout/spacing.
- Use **`cn()`** utility (from `@workspace/ui/lib/utils`) for conditional class merging.
- Prefer CSS transitions/animations over JS animation libraries.
- No inline `style={{}}` except for dynamic values (e.g., virtualizer offsets).

### 🚫 ALWAYS use `--sat-*` theme variables for ALL colors
Every color in the app MUST come from a `--sat-*` CSS custom property.
Never hard-code hex values, Tailwind color classes (`bg-blue-600`), or
rgb/hsl values. This ensures themes work correctly across the entire app.

```tsx
// ❌ WRONG — hard-coded colors
<div className="bg-blue-600 text-white border-gray-700">
<div className="bg-[#1e293b] text-[#f8fafc]">
<div style={{ backgroundColor: '#0f172a' }}>

// ✅ CORRECT — --sat-* theme variables
<div className="bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] border-[var(--sat-layout-border)]">

// ✅ ALSO CORRECT — using inside component styles
<Button className="bg-[var(--sat-accent-primary)] hover:bg-[var(--sat-accent-hover)]">
```

The `--sat-*` token families:
- `--sat-surface-*` — background layers (1, 2, 3)
- `--sat-text-*` — text colors (primary, secondary, muted, inverse)
- `--sat-accent-*` — brand/action colors (primary, hover)
- `--sat-layout-*` — structural elements (border, divider)
- `--sat-state-*` — semantic states (danger, warning, success)
- `--sat-editor-*` — editor-specific tokens (background, cursor, selection)

---

## 6. Performance Rules

- Heavy compute (parsing, search, indexing) → **Rust** (crates/).
- UI rendering → **React** with proper memoization.
- Long lists → **always virtualize** (`@tanstack/react-virtual`).
- Batch Tauri `invoke()` calls. Never make N serial calls when 1 batched call works.
- Lazy-load non-critical panels with `React.lazy()` + `Suspense`.

---

## 7. Theming

- All theme values come from `--sat-*` CSS custom properties.
- Components MUST use these variables, never raw colors.
- Theme definitions live in `packages/ui/src/styles/` and `packages/ui/theme/`.
- See `docs/theming-architecture.md` for full details.

---

## Quick Reference: Where does it go?

| I need to... | Put it in... |
|---|---|
| Create a visual component (button, tab, panel) | `packages/ui/src/components/` |
| Add a shadcn primitive (dialog, popover) | `packages/ui/src/components/ui/` |
| Add tab open/close/reorder logic | `apps/tauri/src/features/tabs/` |
| Wire sidebar + tabs + editor together | `apps/tauri/src/app-shell/` |
| Add a Tauri command handler | `apps/tauri/src-tauri/src/lib.rs` |
| Add markdown parsing logic | `crates/basalt_core/` |
| Add file system operations | `crates/basalt_fs/` |
