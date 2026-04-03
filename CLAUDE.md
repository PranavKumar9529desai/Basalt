# Basalt — Claude Code Context

> Architecture rules for all agents are in `AGENTS.md`.  
> Architectural decisions and their rationale are in `docs/adr/`.  
> Read both before making structural changes.

---

## What We're Building

Basalt is an Obsidian-class desktop Markdown workspace — Tauri (Rust) backend, React frontend.  
Goal: match or beat Obsidian in feel (sub-16ms input latency, <800ms TTI, <150ms search on 5k notes).

## Current State (as of 2026-04-04)

| Area | Status |
|---|---|
| Three-layer architecture | ✅ Established |
| Tab system (Phases 0–4) | ✅ Complete |
| Per-pane editor (PaneManager) | ✅ Complete — see [ADR-006](docs/adr/006-pane-manager-per-pane-editor.md) |
| Theming (`--sat-*` tokens) | ✅ Established |
| Command palette | ✅ Working |
| File tree / sidebar | 🔄 In progress |
| Search | ⏳ Not started (after command palette) |
| NoteGraph / backlinks | ⏳ Not started |
| Rust acceleration (batched IPC) | ⏳ Phase 5 pending |

## Commands

```bash
bun run dev          # Start Tauri dev server
bun run lint         # Biome lint
bunx tsc --noEmit    # TypeScript type-check (run after any structural change)
bun run build        # Production build
```

Always run `bun run lint && bunx tsc --noEmit` after completing any implementation step.

## Architectural Decision Records

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
<!-- ADR_INDEX_END -->

## How to Work on This Project

### Before any architectural decision
Use the `superpowers:brainstorming` skill to explore tradeoffs before writing code.

### For multi-step implementation
Use the `superpowers:writing-plans` skill to produce a step-by-step plan file (like `Editor-Per-Pane.md`) before touching code. Mark steps `[x]` as they complete.

### After completing a feature
Run `superpowers:requesting-code-review` to validate against the plan and `AGENTS.md` rules.

### When encountering a bug
Use `superpowers:systematic-debugging` before proposing fixes.

## Key Files to Know

| File | What it is |
|---|---|
| `apps/tauri/src/features/tabs/` | Tab + layout state (Zustand slices, hooks) |
| `apps/tauri/src/app-shell/panes/` | PaneManager — per-pane editor lifecycle |
| `apps/tauri/src/routes/index.tsx` | Shell composition entry point |
| `packages/ui/src/components/tabs/` | Dumb tab UI primitives |
| `packages/ui/src/styles/` | `--sat-*` token definitions |
| `packages/ui/theme/` | Theme manifests |
| `crates/basalt_core/` | Rust: Markdown parsing, NoteGraph, metadata |
| `crates/basalt_fs/` | Rust: Vault indexing, filesystem watcher |
