# Basalt Packages

Shared libraries for the Basalt workspace app.

## Package overview

| Package | Layer | Responsibility | Tauri? |
|---|---|---|---|
| [`@workspace/ui`](./ui) | Primitives | Visual components. Props in, DOM out. | Never |
| [`@workspace/editor`](./editor) | Primitives | CodeMirror markdown editor extensions & theme | Never |
| [`@workspace/commands`](./commands) | Cross-cutting | Global command palette state (Zustand) | Never |
| [`@workspace/theme`](./theme) | Primitives | SAT CSS token system & themes | Never |

## Architecture rules

All packages follow the [three-layer architecture](../docs/adr/001-three-layer-architecture.md):

```
packages/        ← Primitives layer (dumb, no Tauri)
apps/tauri/src/
├── features/   ← Business logic, state, IPC
└── app-shell/  ← Layout composition (thin glue)
```

### Package conventions

**DO:**
- Each package has a single responsibility
- Each package has a `README.md` explaining its purpose
- Each package has a clean `src/index.ts` barrel with a minimal public API
- Exports use deep import paths for tree-shaking: `@workspace/ui/components/ui/button`
- Dependencies are explicitly listed in `package.json`

**DON'T:**
- Don't put business state (Zustand stores) in primitive packages (see commands/)
- Don't import from `apps/tauri/` or `@tauri-apps/*` in packages
- Don't create deep subpath imports without documenting them in exports
- Don't leak feature-level concerns (icons, feature types) into primitive packages

### File naming conventions

| Entity | Convention | Example |
|---|---|---|
| React components | PascalCase | `FileTree.tsx`, `TabItem.tsx` |
| Hooks | camelCase, `use*` prefix | `useEditorCommands.ts` |
| Types/Interfaces | PascalCase | `types.ts` |
| Stores | camelCase | `store.ts` |
| Utilities | camelCase | `utils.ts` |
| Barrels | `index.ts` | `index.ts` |

### When to create a new package

Create a package when:
1. The code passes the primitives litmus test (no Tauri, no business state)
2. It will be used by multiple features or other packages
3. It has a clear single responsibility

Do NOT create a package for:
- Something that only one feature uses (keep it in `apps/tauri/src/features/`)
- Something that manages business state (that belongs in features)

## Naming

- Package names: `@workspace/<name>` (e.g., `@workspace/editor`)
- Directory names: lowercase, single word (`ui`, `editor`, `commands`, `theme`)
- Command IDs: `feature:action-name` (e.g., `editor:bold`, `tabs:close-active`)
