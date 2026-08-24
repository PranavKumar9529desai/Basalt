# Basalt — Agent Rules

> Mandatory for ALL AI agents (Claude, Codex, Gemini, etc.).  
> Violating any rule marked 🚫 is a hard error — stop and fix it.  
>
> **READ FIRST:**
> - [`CONVENTIONS.md`](./CONVENTIONS.md) — Authoritative coding standards (supersedes ADRs where they conflict)
> - [`docs/adr/018-registry-driven-workbench.md`](docs/adr/018-registry-driven-workbench.md) — Current architectural direction
> - [`docs/CURRENT_WORK.md`](docs/CURRENT_WORK.md) — Active workstream handoff (what we're doing right now)

---

## What We're Building

**Basalt** — an Obsidian-class desktop Markdown workspace. Tauri (Rust) backend, React frontend.

The bar is Obsidian, and then beat it: sub-16ms input latency, <800ms TTI, <150ms search on 5k notes. Every change is measured against that feel. When in doubt, prefer the approach that keeps the app fast.

## Current State (as of 2026-06-25)

| Area | Status |
|---|---|
| Four-layer architecture | ✅ Established |
| CommandService + KeybindingService (registry pattern) | ✅ Complete |
| Workspace grid + unified header band (`StripSeparator`) | ✅ Complete |
| Tab system (single pane, DnD, persistence, overflow dropdown) | ✅ Complete |
| Per-pane editor (`PaneContent`) | ✅ Complete |
| Theming (`--sat-*` tokens) + ThemeProvider (injectable persistence) | ✅ Complete |
| Command palette / quick switcher / search (tantivy + nucleo) | ✅ Complete |
| File tree / sidebar / note creation (Obsidian-style instant) | ✅ Complete |
| **View registry + generic side docks (ADR-018 Phase 1)** | ✅ Complete |
| **Leaf registry + uncontrolled CM6 editor (ADR-018 Phase 2)** | ✅ Complete |
| Layout as serializable tree / pane splits (ADR-018 Phase 3) | ⏳ Not started |
| Editor perf baseline (typing-latency harness) | ⏳ Next up |
| NoteGraph / backlinks panel | ⏳ Backlinks sidebar exists; graph not started |
| Rust acceleration (batched IPC) | ⏳ Not started |
| Plugin host (ADR-018 Phase 5) | ⏳ Not started — do not build before phases 1–4 |

**Direction:** the shell renders from registries, not hardcoded imports (ADR-018). New panels = `registerView()` calls in `app-shell/viewRegistrations.ts`, never shell surgery. Views read app state via `useWorkspaceContext()`.

---

## 1. Architecture

Four layers. Dependencies flow downward only. No cycles.

```
┌─────────────────────────────────────────────────────┐
│  routes/          TanStack Router (2 routes max)    │
│  main.tsx         App entry, provider tree          │
└────────────────────────┬────────────────────────────┘
                         │ imports
┌────────────────────────▼────────────────────────────┐
│  app-shell/         Layout composition              │
│                     Wires features into UI          │
│                     ONLY place cross-feature        │
│                     wiring happens                  │
├─────────────────────────────────────────────────────┤
│  shared/            Cross-feature orchestration     │
│                     Vault ↔ Tabs ↔ Editor wiring    │
│                     Commands that need multiple     │
│                     features' stores                │
└────────────────────────┬────────────────────────────┘
                         │ imports
┌────────────────────────▼────────────────────────────┐
│  features/          Business logic per domain       │
│  ├── vault/         File tree, CRUD, IPC            │
│  ├── tabs/          Tab state, groups, persistence  │
│  ├── editor/        CodeMirror, focused pane atom   │
│  ├── search/        Tantivy + Nucleo search         │
│  └── settings/      Preferences, theme              │
│                                                     │
│  🚫 NEVER import from another feature               │
│  ✅ MAY import types from another feature's types.ts│
└────────────────────────┬────────────────────────────┘
                         │ imports
┌────────────────────────▼────────────────────────────┐
│  packages/          ui/, editor/, commands/,        │
│                     keybindings/, theme/            │
│                     Primitives + registries.        │
│  🚫 No Tauri, no business state, no IPC (ui/)       │
└─────────────────────────────────────────────────────┘
```

| Layer | Location | Responsibility | Tauri? |
|---|---|---|---|
| **Primitives** | `packages/ui/` | Visual components. Props in, DOM out. | 🚫 Never |
| **Features** | `apps/tauri/src/features/` | State, hooks, business logic, IPC. One per domain. | ✅ Yes |
| **Shared** | `apps/tauri/src/shared/` | Cross-feature orchestration. Imports from 2+ features. | ✅ Yes |
| **Shell** | `apps/tauri/src/app-shell/` | Layout composition. Thin glue only. | ✅ Yes |

**Litmus test:** Can this render in an empty `index.html` with zero backend?
- Yes → `packages/ui/`
- No, it's one domain → `apps/tauri/src/features/`
- No, it wires 2+ features → `apps/tauri/src/shared/`
- It's layout/chrome → `apps/tauri/src/app-shell/`

### Current directory structure

```
apps/tauri/src/
├── app-shell/              ← Layout composition (thin glue)
│   ├── ActivityBar.tsx       (becomes Ribbon per ADR-018 lexicon)
│   ├── Sidebar.tsx
│   ├── RightSidebar.tsx
│   ├── StatusBar.tsx
│   ├── ThemeProvider.tsx
│   ├── ThemeSelect.tsx
│   ├── WorkspaceView.tsx     ← Workspace grid + header band
│   ├── WorkspaceOverlays.tsx
│   ├── WorkspaceInit.tsx     ← One-time boot + persistence
│   └── hooks/
│       └── useWorkspaceTabHandlers.ts
├── shared/                 ← Cross-feature orchestration
│   ├── useWorkspace.ts
│   └── paneCommands.ts
├── features/               ← Business logic (zero cross-feature imports)
│   ├── editor/  search/  settings/  tabs/  vault/
├── routes/                 ← TanStack Router (2 routes max)
└── main.tsx
```

---

## 2. Component Rules — [ADR-003](docs/adr/003-shadcn-radix-over-raw-html.md)

### 🚫 Always prefer shadcn/Radix over raw Tailwind markup

```tsx
// ❌ WRONG
<button className="px-4 py-2 bg-[var(--sat-accent-primary)] rounded">Save</button>
<div className="overflow-y-auto h-full">{children}</div>

// ✅ CORRECT
import { Button } from "@workspace/ui/components/ui/button";
<Button variant="default">Save</Button>
```

### 🚫 UI components MUST be dumb (stateless/presentational)

Components in `packages/ui/` MUST NOT: call `invoke()`, fetch data, manage business state, import from `apps/tauri/`, import from `@tauri-apps/*`.

They MAY contain: internal UI state (hover, open/close), refs for DOM measurement, event handlers that call prop callbacks.

---

## 3. Feature Rules

Full standards (naming, file budgets, state rules, anti-patterns) live in [`CONVENTIONS.md`](./CONVENTIONS.md). The hard lines:

- **Max 2 store files per feature** (`core.ts` + `persistence.ts`) — no mirror stores, no echo-chamber effects
- **Max 4 hooks per feature** — no wrapper hooks that just spread sub-hooks
- **🚫 No cross-feature imports** — wiring goes through `shared/`; types-only exception
- **Every feature folder has `index.ts`** — the only legal import surface for other layers

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

## 7. Commands

```bash
bun run dev          # Start Tauri dev server (repo root)
bun run lint         # Biome lint (repo root)
cd apps/tauri && bunx tsc --noEmit   # TypeScript type-check
bun run build        # Production build
```

Always run `bun run lint && bunx tsc --noEmit` after completing any implementation step.

---

## 8. Architectural Decision Records

When we finalize an architectural decision, document it in `docs/adr/NNN-name.md`:

<!-- ADR_INDEX_START -->
| File | Decision |
|---|---|
| [002-sat-css-theme-tokens](docs/adr/002-sat-css-theme-tokens.md) | ADR-002: `--sat-*` CSS Custom Properties for All Colors |
| [003-shadcn-radix-over-raw-html](docs/adr/003-shadcn-radix-over-raw-html.md) | ADR-003: shadcn/Radix Over Raw Tailwind Markup |
| [004-state-driven-navigation](docs/adr/004-state-driven-navigation.md) | ADR-004: State-Driven Navigation Within the Workspace |
| [005-zustand-feature-state](docs/adr/005-zustand-feature-state.md) | ADR-005: Zustand for Feature State Management |
| [007-typescript-rust-responsibilities](docs/adr/007-typescript-rust-responsibilities.md) | ADR-007: TypeScript vs Rust Responsibility Split |
| [008-native-search-architecture](docs/adr/008-native-search-architecture.md) | ADR-008: Native Search Architecture — Tantivy + Nucleo |
| [009-rust-crate-restructure](docs/adr/009-rust-crate-restructure.md) | ADR-009: Rust Crate Restructure — Hyphenated Names, Single Responsibility |
| [010-obsidian-style-note-creation](docs/adr/010-obsidian-style-note-creation.md) | ADR-010: Obsidian-Style Instant Note Creation |
| [011-prose-typography-system](docs/adr/011-prose-typography-system.md) | ADR-011: Prose Typography System — Inter, Heading Scale, Editor Font Wiring |
| [017-benchmark-infrastructure](docs/adr/017-benchmark-infrastructure.md) | ADR-017: Benchmark Infrastructure — Criterion for Performance Measurement |
| [018-registry-driven-workbench](docs/adr/018-registry-driven-workbench.md) | ADR-018: Registry-Driven Workbench |
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
| Wire sidebar + tabs + editor together | `apps/tauri/src/shared/` |
| Register a global keyboard shortcut | `packages/keybindings/` (keybindings.json) |
| Add a Tauri command handler | `apps/tauri/src-tauri/src/lib.rs` |
| Add markdown parsing logic | `crates/basalt-parser/` |
| Add vault/filesystem operations | `crates/basalt-vault/` |
| Add shared Rust domain types | `crates/basalt-types/` |
| Add graph/backlinks compute | `crates/basalt-graph/` |
| Add search/indexing compute | `crates/basalt-search/` |
