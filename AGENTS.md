# Basalt — Agent Rules

> Mandatory for ALL AI agents (Claude, Codex, Gemini, etc.).  
> Violating any rule marked 🚫 is a hard error — stop and fix it.

---

## Context model — how to read these docs

This repo is large; the docs are layered so an agent loads only what it needs.
Treat the files below as **lazily loaded on trigger**, not as an always-on
dump. Keeping the always-loaded window lean is the single biggest lever for
correctness — a bloated context window degrades an agent's recall (the
"context rot" / lost-in-the-middle effects) and stale docs actively poison
decisions.

| File                                                             | Load when…                                                               | Always loaded?      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| **`AGENTS.md`** (this file)                                      | Every session                                                            | ✅ yes — keep lean  |
| [`CONVENTIONS.md`](./CONVENTIONS.md)                             | Writing/refactoring code (naming, state, comments)                       | ⚠️ on demand        |
| [`root README.md`](./README.md)                                  | Human orientation / quick start                                          | ⚠️ on demand        |
| [`apps/tauri/AGENTS.md`](apps/tauri/AGENTS.md)                   | Working inside `apps/tauri/` (app-layer rules)                           | ⚠️ auto via nesting |
| [`docs/CURRENT_WORK.md`](./docs/CURRENT_WORK.md)                 | Starting a session — the active workstream handoff                       | ✅ every session    |
| [`docs/RELEASE.md`](./docs/RELEASE.md)                           | Release / CI work — triggers, cost model, macOS-tag-only rule, checklist | ⚠️ on demand        |
| [`docs/adr/018-*.md`](docs/adr/018-registry-driven-workbench.md) | Registry / shell / leaf / pane work (the architectural spine)            | ⚠️ on demand        |

Rules for keeping this lean:

- **This file is an index, not a reference.** Detail belongs in the lazy
  documents above, never duplicated here. If an explanation exists elsewhere,
  link to it (§8 ADR-as-provenance).
- **Never paste a whole ADR or a whole `README.md` into this file.**
- **Keep the status table fresh.** If it disagrees with `CURRENT_WORK.md`,
  CURRENT_WORK wins — and this table must be updated.
- **One concept, one word.** Vocabulary lives in CONVENTIONS §1.6; do not coin
  synonyms.

---

## What We're Building

**Basalt** — an Obsidian-class desktop Markdown workspace. Tauri (Rust) backend, React frontend.

The bar is Obsidian, and then beat it: sub-16ms input latency, <800ms TTI, <150ms search on 5k notes. Every change is measured against that feel. When in doubt, prefer the approach that keeps the app fast.

## Current State (as of 2026-09-09)

| Area                                                                | Status                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four-layer architecture                                             | ✅ Established                                                                                                                                                                                                                                                                                                                      |
| CommandService + KeybindingService (registry pattern)               | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| Workspace grid + unified header band (`HeaderBandRule`)             | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| Tab system (single pane, DnD, persistence, overflow dropdown)       | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| Theming (`--sat-*` tokens) + ThemeProvider (injectable persistence) | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| Command palette / quick switcher / search (tantivy + nucleo)        | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| File tree / sidebar / note creation (Obsidian-style instant)        | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| **View registry + generic side docks (ADR-018 Phase 1)**            | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| **Leaf registry + uncontrolled CM6 editor (ADR-018 Phase 2)**       | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| Layout as serializable tree / pane splits (ADR-032)                 | ✅ Complete — root layout tree, per-pane tab bars, DnD between panes, v2 persistence, resize sashes (persisted `size` ratios), edge-drop split zones                                                                                                                                                                                |
| Editor perf campaign (typing-latency harness, ADR-019/020)          | ✅ Gate passed — prod full-stack p95 = 3.10 ms @ 100KB (recorded; gate ≤ 4 ms)                                                                                                                                                                                                                                                      |
| **Inline title + rename (ADR-023)**                                 | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| **Single renderer (ADR-029)** — unified live + reading mode         | ✅ Complete — one CM6 view, `readingExtensions()`; `Reading.tsx` deleted; search preview full parity                                                                                                                                                                                                                                |
| Graph view (ADR-021)                                                | ✅ Complete (leaf + WASM force sim, perf pass done); UI in features/graph, renderer in packages/graph, compute in crates/basalt-graph                                                                                                                                                                                               |
| **Tab lifecycle & persistence (ADR-025)**                           | ✅ Complete                                                                                                                                                                                                                                                                                                                         |
| **Rust quality-hardening (ADR-030)**                                | ✅ Complete (all phases 0–5: typed errors, module splits, `NodeId`/`QueryColumnType`, search `SearchError`, perf: HashMap `group_rows`, `eq_ignore_ascii_case`, hoisted `AhoCorasick`; Phase 2 value-type unification — `FrontmatterValue` collapsed into the internally-tagged `TypedValue`)                                       |
| **Embed rendering (ADR-034)**                                       | ✅ Complete — real media (img/video/audio) in reading + live preview + rich table cells; Linux loopback Range server (Part A), table embeds (B), live-preview media in every caret state (C), reading-mode link bracket slicing + table-link navigation (D), stem-aware `resolveAsset` (E)                                          |
| **DQL query engine (ADR-027/028)**                                  | ✅ Complete — `basalt-tables` (boolean FROM, WHERE/SORT/LIMIT, GROUP BY/FLATTEN, aggregates), `TypedValue::List`, typed `AppError` wrapper                                                                                                                                                                                          |
| **PDF export (ADR-031)**                                            | ✅ Complete — `features/export`: reading-mode snapshot via `readingExtensions()` into a print `@page` pipeline; page size/orientation/font, theme + no-theme, include toggles                                                                                                                                                       |
| **Infinite canvas (ADR-035)**                                       | ✅ Complete — `@xyflow/react` leaf over `basalt-canvas` (JSON Canvas v1.0), custom nodes/edges, alignment guidelines; legacy viewport primitive deprecated (dir `packages/canvas`)                                                                                                                                                  |
| **Templates + Daily notes core plugins (ADR-036)**                  | ✅ Complete — `features/templates` (picker, TS date/template expansion) + `commands/{templates,dailies}` (Rust list/read/open-or-create), settings sections, ribbon + palette entries                                                                                                                                               |
| **File decomposition (ADR-038)**                                    | ✅ Complete — 5 phases, one commit each (`3e8036b` · `3147787` · `d40231b` · `1c6d21c` · phase-5 gate); pure structure, import surfaces frozen, entry barrels re-export identical symbols; **2026-09-08 pass:** `packages/editor` module splits (`table-*` role modules, per-widget `*-theme.ts`, `frontmatter/` + `perf/` folders) |
| **File DnD (tree → editor, tree → canvas)**                         | ✅ Complete — pointer-drag notes insert `[[wikilink]]` at caret or spawn a canvas file node; surfaces survey in `CURRENT_WORK.md`                                                                                                                                                                                                   |
| **Backlinks panel (ADR-039 branch)**                                | ✅ Complete — context snippets + link resolution + rich panel                                                                                                                                                                                                                                                                       |
| **Mermaid + KaTeX math (ADR-039)**                                  | ✅ Complete — lazy mermaid/katex via widget registry, strict securityLevel, content-keyed cache (phase 5 gate)                                                                                                                                                                                                                      |
| **Brand + typography (volcanic theme)**                             | ✅ Complete — custom typography architecture, volcanic theme, asset suite                                                                                                                                                                                                                                                           |
| **Tags (sidebar + tag: search + #tag pills)**                       | ✅ Complete — Tags dock + tantivy `tag:` operator + clickable `#tag` pills open prefilled search                                                                                                                                                                                                                                    |
| **Typing latency pipeline (ADR-040)**                               | ✅ Complete — collector switch-dispatch, O(1) code-block cursor, heading-7 bypass, deco caches, pre-allocated list widgets, 48KB lazy path + hysteresis; `perf/benchmark.ts` + watchdog                                                                                                                                             |
| **Zero-AST parser + SIMD (ADR-041)**                                | ✅ Complete — memchr3 scan, ASCII Tier-1 fast path, SpanCursor Tier-2, in-place sort+dedup; >500k notes/s @ 25k gate unverified                                                                                                                                                                                                     |
| **Parallel indexing + binary cache (ADR-042)**                      | ✅ Complete — Rayon map-reduce, deferred asset hashing, `BSLT` bincode cache (magic + atomic rename); cold ≤250 ms / warm ≤15 ms @ 25k gates unverified                                                                                                                                                                             |
| **Full-text + fuzzy search (ADR-043)**                              | ✅ Complete — MmapDirectory BM25, nucleo two-stage scoring, SIMD snippet prefilter, 10s commit delay; switcher < 16 ms target unverified                                                                                                                                                                                            |
| **Graph WASM force sim (ADR-044)**                                  | ✅ Complete — Barnes-Hut quadtree, C-ABI wasm, WebGL2 double-buffered renderer; graph_step 25k = 13.70 ms (≤ 16.6 ms gate passes); binary IPC snapshot decoding wired                                                                                                                                                               |
| **DQL query engine exec (ADR-045)**                                 | ✅ Complete — Schwartzian sort, streaming top-K heap selection, predicate push-down, 3VL                                                                                                                                                                                                                                            |
| **Two-tier boot (ADR-046)**                                         | ✅ Complete — instant O(1) warm boot (<20ms) + `fast_scan_flat_tree` + fused worker (`core/indexing.rs`) + background mtime sync + progress toast                                                                                                                                                                                   |
| **Native task management (ADR-048)**                                | ✅ Complete — Rust task scanner + query engine + IPC (`commands/tasks/{line,signifiers,serializer}.rs`), ```tasks block widget, editor signifier decorations, create/edit modal, settings + commands + keybindings (CURRENT_WORK archived; kanban excluded by user)                                                                  |
| **Calendar sidebar (Obsidian plugin parity)**                       | ✅ Complete — shadcn Calendar dock (`features/calendar/` + `shared/useCalendar`), Rust `calendar_activity` batch scan (word-count + unfinished-task dots, date-format compiler — no regex dep), locale week start, dailies-section settings, `calendar:open-today` command |
| Rust acceleration (batched IPC)                                     | ⏳ Not started                                                                                                                                                                                                                                                                                                                      |
| Plugin host (ADR-018 Phase 5)                                       | ⏳ Not started — do not build before phases 1–4                                                                                                                                                                                                                                                                                     |

> **Freshness:** the authoritative "what's done / what's next" is
> [`docs/CURRENT_WORK.md`](docs/CURRENT_WORK.md). If this table disagrees with
> that file, CURRENT_WORK wins — update this table (see Context model above).

**Direction:** the shell renders from registries, not hardcoded imports (ADR-018). New panels = `registerView()` calls in `app-shell/registrations.ts`, never shell surgery. Views read app state via `useAppContext()`.

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

| Layer          | Location                    | Responsibility                                         | Tauri?   |
| -------------- | --------------------------- | ------------------------------------------------------ | -------- |
| **Primitives** | `packages/ui/`              | Visual components. Props in, DOM out.                  | 🚫 Never |
| **Features**   | `apps/tauri/src/features/`  | State, hooks, business logic, IPC. One per domain.     | ✅ Yes   |
| **Shared**     | `apps/tauri/src/shared/`    | Cross-feature orchestration. Imports from 2+ features. | ✅ Yes   |
| **Shell**      | `apps/tauri/src/app-shell/` | Layout composition. Thin glue only.                    | ✅ Yes   |

**Litmus test:** Can this render in an empty `index.html` with zero backend?

- Yes → `packages/ui/`
- No, it's one domain → `apps/tauri/src/features/`
- No, it wires 2+ features → `apps/tauri/src/shared/`
- It's layout/chrome → `apps/tauri/src/app-shell/`

### Current directory structure

```
apps/tauri/src/
├── app-shell/              ← Layout composition (thin glue)
│   ├── Ribbon.tsx            (far-left quick-access bar; Obsidian lexicon)
│   ├── SideDock.tsx          (generic registry-driven side dock)
│   ├── StatusBar.tsx
│   ├── ThemeProvider.tsx
│   ├── Shell.tsx            ← Workspace grid + header band
│   ├── Overlays.tsx
│   ├── Boot.tsx             ← One-time boot + persistence
│   ├── registrations.ts   ← registerView()/leaf registry entries
│   └── views/               ← Registered dock views (FileExplorer, Backlinks)
├── shared/                 ← Cross-feature orchestration
│   ├── useWorkspace.ts     (useWorkspace)
│   └── tabCommands.ts
├── features/               ← Business logic (zero cross-feature imports)
│  ├── editor/  search/  settings/  tabs/  vault/  graph/
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
- **🚫 No cross-feature or upward imports** — features never import each other; features NEVER import `shared/` or `app-shell/`; wiring goes through `shared/` (types-only exception via `types.ts`)
- **Every feature folder has `index.ts`** — the only legal import surface for other layers
- **Standard layout**: `lib/commands.ts` for commands; `lib/` for non-component context/helpers; named exports only (no `export default`)
- **Shared path utilities**: always use `{ basename, stemOf, isMarkdownPath, isCanvasPath, isDocumentPath, normalizePath }` from `@workspace/ui` rather than ad-hoc path parsing

---

## 4. Navigation Model — [ADR-004](docs/adr/004-state-driven-navigation.md)

Desktop workspace app — navigation is **state-driven**, not URL-driven.

The single route is `/` → Main workspace. 🚫 NEVER create a route for
something that should be a tab or panel (graph view, settings, backlinks,
canvas).

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
- **Benchmark and compare at SUPER-LARGE vault scale (≥25k notes).** Our
  target userbase is power users with huge vaults (the people Obsidian's
  forums describe lagging). Every performance claim, benchmark fixture, and
  Obsidian comparison MUST be made at that scale — small-vault numbers are
  marketing, not evidence. Criterion tiers: include a 25k fixture wherever
  a 5k one exists.

---

## 7. Commands

```bash
bun run dev          # Start Tauri dev server (repo root)
bun run lint         # Oxlint (repo root)
cd apps/tauri && bunx tsc --noEmit   # TypeScript type-check
bun run build        # Production build
```

Always run `bun run lint && bunx tsc --noEmit` after completing any implementation step.

---

## 8. Architectural Decision Records

When we finalize an architectural decision, document it in `docs/adr/NNN-name.md`:

<!-- ADR_INDEX_START -->

| File                                                                                                             | Decision                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [002-sat-css-theme-tokens](docs/adr/002-sat-css-theme-tokens.md)                                                 | ADR-002: `--sat-*` CSS Custom Properties for All Colors                     |
| [003-shadcn-radix-over-raw-html](docs/adr/003-shadcn-radix-over-raw-html.md)                                     | ADR-003: shadcn/Radix Over Raw Tailwind Markup                              |
| [004-state-driven-navigation](docs/adr/004-state-driven-navigation.md)                                           | ADR-004: State-Driven Navigation Within the Workspace                       |
| [005-zustand-feature-state](docs/adr/005-zustand-feature-state.md)                                               | ADR-005: Zustand for Feature State Management                               |
| [007-typescript-rust-responsibilities](docs/adr/007-typescript-rust-responsibilities.md)                         | ADR-007: TypeScript vs Rust Responsibility Split                            |
| [008-native-search-architecture](docs/adr/008-native-search-architecture.md)                                     | ADR-008: Native Search Architecture — Tantivy + Nucleo                      |
| [009-rust-crate-restructure](docs/adr/009-rust-crate-restructure.md)                                             | ADR-009: Rust Crate Restructure — Hyphenated Names, Single Responsibility   |
| [010-obsidian-style-note-creation](docs/adr/010-obsidian-style-note-creation.md)                                 | ADR-010: Obsidian-Style Instant Note Creation                               |
| [011-prose-typography-system](docs/adr/011-prose-typography-system.md)                                           | ADR-011: Prose Typography System — Inter, Heading Scale, Editor Font Wiring |
| [017-benchmark-infrastructure](docs/adr/017-benchmark-infrastructure.md)                                         | ADR-017: Benchmark Infrastructure — Criterion for Performance Measurement   |
| [018-registry-driven-workbench](docs/adr/018-registry-driven-workbench.md)                                       | ADR-018: Registry-Driven Workbench                                          |
| [019-editor-decoration-pipeline](docs/adr/019-editor-decoration-pipeline.md)                                     | ADR-019: Editor Decoration Pipeline — Single-Pass Architecture              |
| [020-desktop-tier-performance](docs/adr/020-desktop-tier-performance.md)                                         | ADR-020: Desktop-Tier Performance Architecture                              |
| [021-graph-view-architecture](docs/adr/021-graph-view-architecture.md)                                           | ADR-021: Graph View Architecture                                            |
| [022-frontmatter-engine](docs/adr/022-frontmatter-engine.md)                                                     | ADR-022: Frontmatter Engine — Structured, Typed, First-Class Properties     |
| [023-inline-title-rename](docs/adr/023-inline-title-rename.md)                                                   | ADR-023: Inline Note Title + Rename — Scroller-Injected React Title         |
| [024-editor-surface-typography](docs/adr/024-editor-surface-typography.md)                                       | ADR-024: Editor Surface Typography and Spatial Rhythm                       |
| [025-tab-lifecycle-and-persistence](docs/adr/025-tab-lifecycle-and-persistence.md)                               | ADR-025: Tab Lifecycle and Workspace Persistence                            |
| [026-html-rendering-in-markdown](docs/adr/026-html-rendering-in-markdown.md)                                     | ADR-026: HTML Rendering in Markdown — Sanitization and Rendering Pipeline   |
| [027-dql-query-engine](docs/adr/027-dql-query-engine.md)                                                         | ADR-027: DQL Query Engine — basalt-tables Crate                             |
| [028-dql-aggregation](docs/adr/028-dql-aggregation.md)                                                           | ADR-028: DQL Aggregation — GROUP BY, FLATTEN, Aggregate Functions           |
| [029-single-renderer-architecture](docs/adr/029-single-renderer-architecture.md)                                 | ADR-029: Single Renderer — Unify Edit and Reading Modes                     |
| [030-rust-crates-quality-refactor](docs/adr/030-rust-crates-quality-refactor.md)                                 | ADR-030: Rust Crates Quality Refactor — Practices, Structure, Plan          |
| [031-pdf-export-snapshot-reading-mode](docs/adr/031-pdf-export-snapshot-reading-mode.md)                         | ADR-031: PDF Export — Snapshot of Reading Mode                              |
| [032-split-pane-layout-tree](docs/adr/032-split-pane-layout-tree.md)                                             | ADR-032: Split Pane Layout Tree — VS Code Grid + Obsidian Flexibility       |
| [033-syntax-registry](docs/adr/033-syntax-registry.md)                                                           | ADR-033: Syntax Registry — Single-Parser Grammar Manifests                  |
| [034-embed-rendering](docs/adr/034-embed-rendering.md)                                                           | ADR-034: Embed Rendering — Real Media in Every Surface                      |
| [035-infinite-canvas](docs/adr/035-infinite-canvas.md)                                                           | ADR-035: Infinite Canvas — Spatial Note Layout                              |
| [036-core-plugin-architecture](docs/adr/036-core-plugin-architecture.md)                                         | ADR-036: Core Plugin Architecture — Self-Contained First-Party Plugins      |
| [037-settings-system-architecture](docs/adr/037-settings-system-architecture.md)                                 | ADR-037: Settings System Architecture — Registry-Driven Settings Modal      |
| [038-file-decomposition-structural-clarity](docs/adr/038-file-decomposition-structural-clarity.md)               | ADR-038: File Decomposition for Structural Clarity                          |
| [039-mermaid-math-rendering](docs/adr/039-mermaid-math-rendering.md)                                             | ADR-039: Mermaid Diagrams + KaTeX Math Rendering                            |
| [040-editor-typing-latency-optimization](docs/adr/040-editor-typing-latency-optimization.md)                     | ADR-040: Editor Typing Latency & Live-Preview Pipeline Optimization         |
| [041-zero-ast-parser-simd-optimization](docs/adr/041-zero-ast-parser-simd-optimization.md)                       | ADR-041: Markdown & Frontmatter Zero-AST Scanner + SIMD Optimization        |
| [042-vault-parallel-indexing-and-binary-cache](docs/adr/042-vault-parallel-indexing-and-binary-cache.md)         | ADR-042: Vault Parallel Indexing & Binary Cache Architecture                |
| [043-full-text-and-fuzzy-search-architecture](docs/adr/043-full-text-and-fuzzy-search-architecture.md)           | ADR-043: Full-Text & Fuzzy Search Engine Architecture                       |
| [044-graph-view-layout-and-wasm-simulation](docs/adr/044-graph-view-layout-and-wasm-simulation.md)               | ADR-044: Graph View Layout & WASM Force Simulation                          |
| [045-dql-query-engine-execution-and-optimization](docs/adr/045-dql-query-engine-execution-and-optimization.md)   | ADR-045: DQL Query Engine Execution & Optimization                          |
| [046-instant-two-tier-boot-and-decoupled-indexing](docs/adr/046-instant-two-tier-boot-and-decoupled-indexing.md) | ADR-046: Instant Two-Tier Boot & Decoupled Indexing Architecture            |

| [047-native-drawing-infinite-canvas](docs/adr/047-native-drawing-infinite-canvas.md) | ADR-047: Native Drawing and Infinite Whiteboard Integration |
| [048-native-task-management-system](docs/adr/048-native-task-management-system.md) | ADR-048: Native Task Management System |


<!-- ADR_INDEX_END -->

---

## Quick Reference: Where Does It Go?

| I need to...                          | Put it in...                               |
| ------------------------------------- | ------------------------------------------ |
| Create a visual component             | `packages/ui/src/components/`              |
| Add a shadcn primitive                | `packages/ui/src/components/ui/`           |
| Add tab/pane business logic           | `apps/tauri/src/features/tabs/`            |
| Add editor business logic             | `apps/tauri/src/features/editor/`          |
| Add graph view/leaf UI + engine       | `apps/tauri/src/features/graph/`           |
| Add vault/sidebar business logic      | `apps/tauri/src/features/vault/`           |
| Add search business logic             | `apps/tauri/src/features/search/`          |
| Wire sidebar + tabs + editor together | `apps/tauri/src/shared/`                   |
| Register a global keyboard shortcut   | `packages/keybindings/` (keybindings.json) |
| Add a Tauri command handler           | `apps/tauri/src-tauri/src/lib.rs`          |
| Add markdown parsing logic            | `crates/basalt-parser/`                    |
| Add vault/filesystem operations       | `crates/basalt-vault/`                     |
| Add shared Rust domain types          | `crates/basalt-types/`                     |
| Add graph/backlinks compute           | `crates/basalt-graph/`                     |
| Add canvas/viewport business logic    | `apps/tauri/src/features/canvas/`          |
| Add canvas viewport primitive         | `packages/canvas/`                         |
| Add canvas compute (Rust)             | `crates/basalt-canvas/`                    |
| Add search/indexing compute           | `crates/basalt-search/`                    |

---

## Git Commit Rules

- 🚫 **NEVER** add a `Co-Authored-By` trailer (or any auto-generated trailer such as `Co-Authored-By: ...`) to commit messages. This is a hard, user-mandated rule — commit messages must carry **no trailers**. When asked to commit, write the message body yourself and omit trailers entirely.
