# Basalt

Obsidian-class desktop Markdown workspace — Tauri (Rust) backend, React frontend.

## Architecture

```
packages/ui/              ← Visual primitives (shadcn, Radix)
packages/editor/          ← CodeMirror markdown editor
packages/commands/        ← CommandService (TS class)
packages/keybindings/     ← KeybindingService (TS class)
packages/theme/           ← --sat-* CSS token system

apps/tauri/src/
├── features/             ← Business logic (vault, tabs, editor, search, settings)
├── shared/               ← Cross-feature orchestration
├── app-shell/            ← Layout composition (thin glue)
└── routes/               ← TanStack Router

crates/
├── basalt-core/          ← Markdown parsing, metadata extraction
├── basalt-fs/            ← Vault indexing, filesystem watcher
├── basalt-parser/        ← HeadlessAST markdown parser
├── basalt-graph/         ← Wikilink graph, backlinks
├── basalt-search/        ← Tantivy full-text + Nucleo fuzzy search
└── basalt-wasm/          ← WASM bindings
```

## Quick Start

```bash
bun install
bun run dev
```

## Commands

```bash
bun run dev          # Tauri dev server
bun run lint         # Biome lint
bunx tsc --noEmit    # TypeScript type-check
bun run build        # Production build
```
