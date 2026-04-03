# Basalt — Agent Rules

> Mandatory for ALL AI agents (Claude, Codex, Gemini, etc.).  
> Violating any rule marked 🚫 is a hard error — stop and fix it.  
> Rationale for each rule lives in `docs/adr/`.

---

## 1. Three-Layer Architecture — [ADR-001](docs/adr/001-three-layer-architecture.md)

Every UI feature MUST be split across exactly three layers:

| Layer | Location | Responsibility | Tauri? |
|---|---|---|---|
| **Primitives** | `packages/ui/` | Visual components. Props in, DOM out. | 🚫 Never |
| **Features** | `apps/tauri/src/features/` | State, hooks, business logic, IPC | ✅ Yes |
| **Shell** | `apps/tauri/src/app-shell/` | Layout composition. Thin glue only. | ✅ Yes |

**Litmus test:** Can this render in an empty `index.html` with zero backend?
- Yes → `packages/ui/`
- No → `apps/tauri/src/features/`

---

## 2. Component Rules — [ADR-003](docs/adr/003-shadcn-radix-over-raw-html.md)

### 🚫 Always prefer shadcn/Radix over raw Tailwind markup

Use shadcn/ui components for: buttons, inputs, dialogs, dropdowns, scroll areas, separators, cards, tooltips, popovers, modals, context menus.  
Only write raw HTML+Tailwind when no shadcn component covers the need.

```tsx
// ❌ WRONG
<button className="px-4 py-2 bg-[var(--sat-accent-primary)] rounded">Save</button>
<div className="overflow-y-auto h-full">{children}</div>

// ✅ CORRECT
import { Button } from "@workspace/ui/components/ui/button";
<Button variant="default">Save</Button>

import { ScrollArea } from "@workspace/ui/components/ui/scroll-area";
<ScrollArea className="h-full">{children}</ScrollArea>
```

### 🚫 UI components MUST be dumb (stateless/presentational)

Components in `packages/ui/` MUST NOT: call `invoke()`, fetch data, manage business state, import from `apps/tauri/`, import from `@tauri-apps/*`.

They MAY contain: internal UI state (hover, open/close), refs for DOM measurement, event handlers that call prop callbacks.

### Folder structure

```
packages/ui/src/components/
├── ui/           # Atomic shadcn primitives (do not manually edit)
├── tabs/         # Feature group — index.ts re-exports required
├── sidebar/      # Feature group — index.ts re-exports required
└── CommandPalette.tsx  # Standalone fine as single file
```

One component per file. Filename = component name (PascalCase). Every feature folder needs `index.ts`.

---

## 3. Feature Rules

```
features/
└── tabs/
    ├── types.ts
    ├── store/         # Zustand slices
    ├── hooks/
    │   ├── useTabs.ts       # Primary hook — feature's public API
    │   └── useTabDnD.ts     # Secondary hooks for specific concerns
    └── index.ts             # Re-exports
```

- Features MUST NOT import from other features directly. Cross-feature wiring goes through shell.
- Every feature exposes its API via hooks.
- State: Zustand (see [ADR-005](docs/adr/005-zustand-feature-state.md)). No prop drilling.

---

## 4. Navigation Model — [ADR-004](docs/adr/004-state-driven-navigation.md)

Desktop workspace app — navigation is **state-driven**, not URL-driven.

Routes exist ONLY for top-level app modes:
- `/` → Main workspace
- `/onboarding` → First-run experience

🚫 NEVER create a route for something that should be a tab or panel (graph view, settings, backlinks).

---

## 5. Styling — [ADR-002](docs/adr/002-sat-css-theme-tokens.md)

### 🚫 ALWAYS use `--sat-*` theme variables for ALL colors

```tsx
// ❌ WRONG
<div className="bg-blue-600 text-white border-gray-700">
<div className="bg-[#1e293b]">
<div style={{ backgroundColor: '#0f172a' }}>

// ✅ CORRECT
<div className="bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] border-[var(--sat-layout-border)]">
```

Token families: `--sat-surface-*`, `--sat-text-*`, `--sat-accent-*`, `--sat-layout-*`, `--sat-state-*`, `--sat-editor-*`

Tailwind is allowed for layout/spacing only (`flex`, `gap-2`, `p-4`, `grid`, `w-full`).

---

## 6. Performance — [ADR-007](docs/adr/007-typescript-rust-responsibilities.md)

- Heavy compute (parsing, search, indexing) → **Rust** (`crates/`)
- Long lists → always virtualize (`@tanstack/react-virtual`)
- Batch `invoke()` calls — never N serial calls when 1 batched call works
- Lazy-load non-critical panels with `React.lazy()` + `Suspense`

---

## Quick Reference: Where Does It Go?

| I need to... | Put it in... |
|---|---|
| Create a visual component | `packages/ui/src/components/` |
| Add a shadcn primitive | `packages/ui/src/components/ui/` |
| Add tab/pane business logic | `apps/tauri/src/features/tabs/` |
| Wire sidebar + tabs + editor together | `apps/tauri/src/app-shell/` |
| Add a Tauri command handler | `apps/tauri/src-tauri/src/lib.rs` |
| Add markdown parsing logic | `crates/basalt_core/` |
| Add filesystem operations | `crates/basalt_fs/` |
