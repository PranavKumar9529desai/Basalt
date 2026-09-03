# Current Work — Session Handoff

> Point a new session at this file: _"Read docs/CURRENT_WORK.md and continue."_
> Foundation docs (AGENTS.md, CONVENTIONS.md, docs/adr/018) auto-load; this file
> only tracks the active workstream. Delete/rewrite freely — it's a scratchpad
> with authority only over "what are we doing right now".

---

## Frontend Restructure — ACTIVE

**Branch:** `feat/frontend-restructure`
**Worktree:** `/home/pranav/Projects/.worktrees/basalt-feat/frontend-restructure`
**Based on:** `main` at `fb83910`

### Goal

Standardize the internal layout of every feature to a consistent pattern, and
move misplaced files to their correct layers. The four-layer architecture
(routes → app-shell → shared → features) and registry-driven workbench
(ADR-018) are sound — this restructure fixes inconsistency _within_ those
layers.

### Standard Feature Layout (canonical)

```
features/<name>/
├── index.ts          (barrel — the ONLY import surface)
├── types.ts          (TypeScript interfaces/enums)
├── lib/              (pure business logic — no React, no hooks)
├── store/            (Zustand store — or store.ts if simple)
├── hooks/            (React hooks — stateful, side-effectful)
└── components/       (React components — JSX, props in, DOM out)
```

### Phase 1: Standardize features — add `lib/` dirs, move scattered root files

| Move                     | From                                                                        | To                                                           | Import updates needed                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rename `logic/` → `lib/` | `editor/logic/*`                                                            | `editor/lib/*`                                               | `editor/index.ts`: `./logic/frontmatter` → `./lib/frontmatter`; `editor/hooks/useNoteIO.ts`: `../logic/frontmatter` → `../lib/frontmatter`; `editor/controller/EditorController.ts`: 4 imports `../logic/*` → `../lib/*`; `editor/hooks/useEditor.ts`: `../logic/reconcile` → `../lib/reconcile` |
| Move selectors           | `tabs/selectors.ts` + `tabs/selectors.test.ts`                              | `tabs/lib/selectors.ts` + `tabs/lib/selectors.test.ts`       | `tabs/index.ts`: `./selectors` → `./lib/selectors`; `selectors.test.ts`: `./types` → `../types`                                                                                                                                                                                                  |
| Move search logic        | `search/commands.ts` + `search/benchmark.ts`                                | `search/lib/commands.ts` + `search/lib/benchmark.ts`         | `search/index.ts`: `import "./commands"` → `import "./lib/commands"`; `commands.ts`: `./benchmark` → `./benchmark` (same, both moved together), `./store` → `../store`                                                                                                                           |
| Move settings logic      | `settings/settings-data.ts` + `settings/commands.ts`                        | `settings/lib/settings-data.ts` + `settings/lib/commands.ts` | `settings/index.ts`: `./settings-data` → `./lib/settings-data`, `import "./commands"` → `import "./lib/commands"`; `commands.ts`: `./store` → `../store`; `shared/useWorkspace.test.ts`: `../features/settings/settings-data` → `../features/settings/lib/settings-data`                         |
| Move graph logic         | `graph/nodeScale.ts` + `graph/spatialGrid.ts` + `graph/spatialGrid.test.ts` | `graph/lib/*`                                                | `graph/index.ts`: `./spatialGrid` → `./lib/spatialGrid`; `graph/components/Graph.tsx`: `../spatialGrid` → `../lib/spatialGrid`, `../nodeScale` → `../lib/nodeScale`                                                                                                                              |
| Create empty `lib/`      | —                                                                           | `vault/lib/`                                                 | No imports to update (placeholder for future logic)                                                                                                                                                                                                                                              |

**Verification:** `bun run lint && bunx tsc --noEmit` from `apps/tauri/`
**Commit:** `git add -A && git commit -m "refactor: standardize feature layout — lib/ directories"`

### Phase 2: Slim `app-shell/` → `shared/`

| Move                  | From                            | To                                 | Import updates needed                                                    |
| --------------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Cross-feature context | `app-shell/AppProvider.tsx`     | `shared/AppProvider.tsx`           | `app-shell/index.ts` barrel, `app-shell/Shell.tsx` (imports AppProvider) |
| One-time init         | `app-shell/Boot.tsx`            | `shared/Boot.tsx`                  | `routes/index.tsx` (imports Boot)                                        |
| Leaf services         | `app-shell/useLeafServices.ts`  | `shared/useLeafServices.ts`        | `app-shell/index.ts` barrel, `app-shell/Shell.tsx`                       |
| Shell commands        | `app-shell/useShellCommands.ts` | `shared/shellCommands.ts` (rename) | `app-shell/index.ts` barrel, `app-shell/Shell.tsx`                       |
| TTI instrumentation   | `app-shell/tti.ts`              | `shared/tti.ts`                    | `app-shell/index.ts` barrel, `app-shell/Boot.tsx` (now also in shared)   |
| Per-leaf chrome       | `app-shell/ViewHeader.tsx`      | `shared/ViewHeader.tsx`            | `app-shell/index.ts` barrel, `app-shell/Shell.tsx`                       |

ViewHeader is NOT a dumb component — it calls `useTabsStore`,
`useRenameSignalStore`, and `commandService.execute`, so it belongs in
`shared/`, not `packages/ui/`.

Update `shared/index.ts` barrel to export all moved files.
Update `app-shell/index.ts` barrel to remove moved exports.
Update `app-shell/Shell.tsx` to import from `shared/` instead of local.

**Verification:** `bun run lint && bunx tsc --noEmit` from `apps/tauri/`
**Commit:** `git add -A && git commit -m "refactor: move orchestration from app-shell to shared/"`

### Phase 3: Final verification

- `bun run lint` (oxlint)
- `bunx tsc --noEmit` (typecheck)
- `bun run build` (production build)
- `bun run test` (vitest)

**Commit:** only if fixes needed.

---

## Previous Work (completed, for context)

See git log for completed features: ADR-023 (inline title + rename), editor
performance campaign (ADR-019/020, p95 = 4ms @ 100KB), graph view (ADR-021),
DQL query engine (ADR-027/028). All merged to main.
