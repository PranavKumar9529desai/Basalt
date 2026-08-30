# Basalt

Obsidian-class desktop Markdown workspace — Tauri (Rust) backend, React frontend.

## Architecture

Four layers, dependencies flow downward only. See [`AGENTS.md`](./AGENTS.md) and
[`CONVENTIONS.md`](./CONVENTIONS.md) for the authoritative standards.

```
packages/              ← Primitives (no Tauri, no business state, no IPC)
├── ui/                ← Visual components (shadcn / Base UI, Tailwind + --sat-*)
├── editor/            ← CodeMirror 6 markdown editor extensions & theme
├── views/             ← View & leaf registries + leaf services (ADR-018)
├── commands/          ← CommandService — global command registry
├── keybindings/       ← KeybindingService — hotkey resolution + when clauses
├── theme/             ← --sat-* CSS token system & themes
└── graph/             ← WebGL2 graph renderer (ADR-021)

apps/tauri/src/
├── features/          ← Business logic (vault, tabs, editor, search, settings, graph)
├── shared/            ← Cross-feature orchestration
├── app-shell/         ← Layout composition (thin glue)
└── routes/            ← TanStack Router (2 routes max)

crates/                ← Rust compute
├── basalt-types/      ← Shared domain types (AST, metadata, frontmatter, search)
├── basalt-vault/      ← Vault indexing, cache, filesystem watcher
├── basalt-parser/     ← CommonMark → AST, metadata extraction, frontmatter, link rewrite
├── basalt-graph/      ← Note graph, backlinks, force-directed layout
├── basalt-search/     ← Tantivy full-text + Nucleo fuzzy search
├── basalt-wasm/       ← wasm_bindgen bridge (render/meta/frontmatter/fuzzy)
├── frontmatter-wasm/  ← C-ABI keystroke-path frontmatter parser (ADR-022)
└── graph-wasm/        ← C-ABI graph force-layout sim for GraphWorker (ADR-021)
```

> Each package and crate has its own `README.md` documenting its public API.
> Architectural decisions live in [`docs/adr/`](./docs/adr/).

## Quick Start

```bash
bun install
bun run dev          # start the Tauri dev server (vite on apps/tauri)
```

Requires a working Tauri toolchain (see the [Tauri prerequisites](https://tauri.app/start/prerequisites/)).
`bun run build:wasm` is needed only after Rust changes to the graph or
frontmatter WASM crates.

## Commands

```bash
bun run dev               # Start the Tauri dev server (root)
bun run lint              # Oxlint (root)
bun run lint:fix          # Oxlint autofix
bun run lint:typed        # Oxlint type-aware
bun run format            # Oxfmt (format all files)
bun run check:size        # Bundle-size check
cd apps/tauri && bunx tsc --noEmit   # TypeScript type-check
cd apps/tauri && bun run test        # Vitest unit tests
cd apps/tauri && bun run build       # Production build (tsc + vite build)
bun run build:wasm        # Regenerate graph_sim.wasm + frontmatter wasm
bun run verify:wasm       # Verify the graph-wasm C-ABI surface
```

## Documentation

- [`AGENTS.md`](./AGENTS.md) — agent rules, architecture, where-code-goes map
- [`CONVENTIONS.md`](./CONVENTIONS.md) — coding standards
- [`docs/`](./docs/) — ADRs, benchmarks, current work handoff
- [`docs/CURRENT_WORK.md`](./docs/CURRENT_WORK.md) — active workstream
