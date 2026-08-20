# Basalt Packages

Shared libraries for the Basalt workspace app.

## Package Overview

| Package | Responsibility | Tauri? |
|---|---|---|
| [`@workspace/ui`](./ui) | Visual components. Props in, DOM out. | Never |
| [`@workspace/editor`](./editor) | CodeMirror markdown editor extensions & theme | Never |
| [`@workspace/commands`](./commands) | CommandService — global command registry | Never |
| [`@workspace/keybindings`](./keybindings) | KeybindingService — hotkey resolution + when clauses | Never |
| [`@workspace/theme`](./theme) | SAT CSS token system & themes | Never |

## Architecture

All packages follow the [architecture rules](../CONVENTIONS.md):

```
packages/         ← Primitives layer (no Tauri, no business state)
apps/tauri/src/
├── features/     ← Business logic, state, IPC
├── shared/       ← Cross-feature orchestration
└── app-shell/    ← Layout composition (thin glue)
```

### Package Conventions

- Each package has a single responsibility
- Each package has a clean `src/index.ts` barrel with a minimal public API
- Exports use deep import paths for tree-shaking: `@workspace/ui/components/ui/button`
- Dependencies are explicitly listed in `package.json`

### When to Create a New Package

Create a package when:
1. The code passes the primitives litmus test (no Tauri, no business state)
2. It will be used by multiple features or other packages
3. It has a clear single responsibility

Do NOT create a package for:
- Something that only one feature uses (keep it in `apps/tauri/src/features/`)
- Something that manages business state (that belongs in features)

## Naming

- Package names: `@workspace/<name>` (e.g., `@workspace/editor`)
- Directory names: lowercase, single word (`ui`, `editor`, `commands`, `keybindings`, `theme`)
- Command IDs: `feature:action-name` (e.g., `editor:bold`, `tabs:close-active`)
