# Basalt — Agent Rules

> Mandatory for ALL AI agents (Claude, Codex, Gemini, etc.).  
> Violating any rule marked 🚫 is a hard error — stop and fix it.  
>
> **START HERE:** Before reading anything below, read these two files first:
> - [`CONVENTIONS.md`](./CONVENTIONS.md) — Authoritative coding standards (supersedes ADRs where they conflict)
> - [`PLAN.md`](./PLAN.md) — Active cleanup campaign with parallel worktree tasks
>
> Agent task files live in `.agents/tasks/TEMPLATE.md` — use the template to define new tasks.
> **Parallel agents:** See [`PLAN.md`](./PLAN.md) for the worktree workflow. Each task gets its own branch + worktree via `scripts/make-worktree.sh`.

---

## What We're Building

Basalt is an Obsidian-class desktop Markdown workspace — Tauri (Rust) backend, React frontend.  
Goal: match or beat Obsidian in feel (sub-16ms input latency, <800ms TTI, <150ms search on 5k notes).

## Current State (as of 2026-06-24)

| Area | Status |
|---|---|
| Three-layer architecture | ✅ Established |
| Tab system | ✅ Complete |
| Per-pane editor (PaneContent) | ✅ Complete — replaces old PaneManager |
| Theming (`--sat-*` tokens) | ✅ Established |
| Command palette | ✅ Working |
| File tree / sidebar | ✅ Working |
| Note creation (Obsidian-style instant) | ✅ Complete |
| Search (⌘F + ⌘O, tantivy + nucleo) | ✅ Complete |
| NoteGraph / backlinks | ⏳ Not started |
| Rust acceleration (batched IPC) | ⏳ Not started |
| Editor inline title (rename via title bar) | ⏳ Not started |

### Refactoring completed (2026-06-24)

The following structural cleanups are DONE and should be treated as the current state:

- **Duplication eliminated**: `PaneInstance.tsx` deleted → `PaneContent.tsx` is the single editor pane source
- **Circular import broken**: vault no longer re-exports editor hooks
- **Store slices merged**: 5 tabs store slice files → 2 (`core.ts` + `persistence.ts`)
- **Dead code removed**: duplicate shadcn ui copies, unused wrapper hooks, unused plugin registration
- **Vault hooks collapsed**: 9 hooks → 4 (`useVaultTree`, `useVaultMutations`, `useVaultController`, `useVaultActions`)
- **Editor session store shrunk**: syncing ALL editor state on every keystroke → minimal focused-pane atom
- **Keyboard shortcuts centralized**: 3 raw `addEventListener("keydown")` → single `useKeyboardShortcuts` hook in `app-shell/hooks/`
- **Theme persistence abstracted**: `ThemeProvider` no longer hardcodes `invoke()` — injectable `ThemePersistence` interface
- **Layout merged**: `layout/` + `features/workspace/` → `app-shell/` (single glue layer)
- **PascalCase enforced**: all component files renamed to match their export name

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

### Current directory structure

```
apps/tauri/src/
├── app-shell/              ← Thin glue (wires features into layout)
│   ├── ActivityBar.tsx
│   ├── AppCommands.tsx      ← Command palette registration
│   ├── Sidebar.tsx
│   ├── StatusBar.tsx
│   ├── ThemeProvider.tsx
│   ├── ThemeSelect.tsx
│   ├── WorkspaceOverlays.tsx
│   ├── WorkspaceView.tsx    ← Main shell entry point
│   ├── index.ts
│   └── hooks/
│       ├── useKeyboardShortcuts.ts
│       ├── useWorkspaceSidebar.ts
│       └── useWorkspaceTabHandlers.ts
├── features/               ← Business logic (no cross-feature imports)
│   ├── editor/
│   ├── search/
│   ├── settings/
│   ├── tabs/
│   └── vault/
├── routes/                 ← TanStack Router (2 routes max)
│   ├── __root.tsx
│   ├── index.tsx
│   └── routeTree.gen.ts
└── main.tsx
```

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
    ├── store/         # Zustand: max 2 files (core.ts + persistence.ts)
    ├── hooks/
    │   ├── useTabs.ts       # Primary hook — feature's public API
    │   └── useTabDnD.ts     # Secondary hooks for specific concerns
    └── index.ts             # Re-exports
```

### 🚫 Store conventions (established during 2026-06 refactoring)
- **Max 2 store files per feature** — merge all mutation slices into `core.ts`, put persistence/snapshot logic in `persistence.ts`
- **No "mirror" stores** — if a store only exists to reflect another feature's state, delete it and read from the source directly
- **No echo-chamber effects** — don't sync ALL editor state into a store on every keystroke. Only store what other components actually consume

### 🚫 Hook conventions (established during 2026-06 refactoring)
- **Max 4 hooks per feature** — if you have more, merge smaller hooks into the 3-4 that compose naturally
- **No wrapper hooks that just spread sub-hooks** — merge sub-hook logic directly
- **Pass state objects as hook params** — don't require callers to call 4 separate hooks before calling the 5th orchestrator hook

### 🚫 Cross-feature imports
Features MUST NOT import from other features directly. Cross-feature wiring goes through shell.

Every feature exposes its API via hooks. State: Zustand (see [ADR-005](docs/adr/005-zustand-feature-state.md)). No prop drilling.

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

## 7. Conventions Established During 2026-06 Refactoring

### Keyboard shortcuts
- All **global** keyboard shortcuts go in `app-shell/hooks/useKeyboardShortcuts.ts`
- Editor-specific shortcuts (like Ctrl+S save) stay in the editor hook — they need editor state
- Modal/dialog-scoped shortcuts (like Escape to close) stay in the modal — they're not global

### Theme persistence
- `ThemeProvider` accepts an optional `persistence` prop implementing `ThemePersistence`
- Default implementation uses `invoke()` — but tests/Storybook can inject a mock
- Avoid calling `invoke()` directly inside context providers unless absolutely necessary

### File naming
- `*.tsx` component files: **PascalCase** matching the exported name (`WorkspaceTabs.tsx`, `PaneContent.tsx`)
- `*.ts` hook files: **camelCase** with `use` prefix (`useTabs.ts`)
- `*.ts` store/config/type files: **camelCase** (`store.ts`, `types.ts`, `constants.ts`)
- `index.ts` barrel exports: use `index.ts` (not PascalCase)

---

## 8. Commands

```bash
bun run dev          # Start Tauri dev server
bun run lint         # Biome lint
bunx tsc --noEmit    # TypeScript type-check (run after any structural change)
bun run build        # Production build
```

Always run `bun run lint && bunx tsc --noEmit` after completing any implementation step.

---

## 9. Architectural Decision Records

When we finalize an architectural decision, document it in `docs/adr/NNN-name.md`:

<!-- ADR_INDEX_START -->
| File | Decision |
|---|---|
| [001-three-layer-architecture](docs/adr/001-three-layer-architecture.md) | ADR-001: Three-Layer UI Architecture |
| [002-sat-css-theme-tokens](docs/adr/002-sat-css-theme-tokens.md) | ADR-002: `--sat-*` CSS Custom Properties for All Colors |
| [003-shadcn-radix-over-raw-html](docs/adr/003-shadcn-radix-over-raw-html.md) | ADR-003: shadcn/Radix Over Raw Tailwind Markup |
| [004-state-driven-navigation](docs/adr/004-state-driven-navigation.md) | ADR-004: State-Driven Navigation Within the Workspace |
| [005-zustand-feature-state](docs/adr/005-zustand-feature-state.md) | ADR-005: Zustand for Feature State Management |
| [006-pane-manager-per-pane-editor](docs/adr/006-pane-manager-per-pane-editor.md) | ADR-006: PaneManager — One Editor Instance Per Visible Pane |
| [007-typescript-rust-responsibilities](docs/adr/007-typescript-rust-responsibilities.md) | ADR-007: TypeScript vs Rust Responsibility Split |
| [008-native-search-architecture](docs/adr/008-native-search-architecture.md) | ADR-008: Native Search Architecture — Tantivy + Nucleo |
| [009-rust-crate-restructure](docs/adr/009-rust-crate-restructure.md) | ADR-009: Rust Crate Restructure — Hyphenated Names, Single Responsibility |
| [010-obsidian-style-note-creation](docs/adr/010-obsidian-style-note-creation.md) | ADR-010: Obsidian-Style Instant Note Creation |
| [011-prose-typography-system](docs/adr/011-prose-typography-system.md) | ADR-011: Prose Typography System — Inter, Heading Scale, Editor Font Wiring |
| [017-benchmark-infrastructure](docs/adr/017-benchmark-infrastructure.md) | ADR-017: Benchmark Infrastructure — Criterion for Performance Measurement |
<!-- ADR_INDEX_END -->

---

## Quick Reference: Where Does It Go?

| I need to... | Put it in... |
|---|---|
| Create a visual component | `packages/ui/src/components/` |
| Add a shadcn primitive | `packages/ui/src/components/ui/` |
| Add tab/pane business logic | `apps/tauri/src/features/tabs/` |
| Add editor business logic | `apps/tauri/src/features/editor/` |
| Add vault/sidebar business logic | `apps/tauri/src/features/vault/` |
| Add search business logic | `apps/tauri/src/features/search/` |
| Wire sidebar + tabs + editor together | `apps/tauri/src/app-shell/` |
| Register a global keyboard shortcut | `app-shell/hooks/useKeyboardShortcuts.ts` |
| Add a Tauri command handler | `apps/tauri/src-tauri/src/lib.rs` |
| Add markdown parsing logic | `crates/basalt_core/` |
| Add filesystem operations | `crates/basalt_fs/` |
