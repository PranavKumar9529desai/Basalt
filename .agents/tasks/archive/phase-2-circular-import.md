# Phase 2: Eliminate Circular Import

**Branch:** `phase-2-circular-import`
**Worktree:** `../basalt-phase2`

## Problem

`features/vault/index.ts` re-exports editor types/hooks:
```ts
export type { UseEditorOptions, UseEditorReturn } from "../editor/hooks/useEditor";
export { useEditor } from "../editor/hooks/useEditor";
```

This creates: `vault → editor → vault/types` (circular).

## Task List

- [ ] Remove the 3 lines from `features/vault/index.ts`
- [ ] Find all files importing these from vault:
  ```bash
  rg "from.*vault.*UseEditor\|from.*vault.*useEditor" apps/tauri/src/
  ```
- [ ] Update those imports to point to `../../editor` or `../editor`
- [ ] Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  rg "from.*['\"]\.\./vault.*editor" apps/tauri/src/  # should be empty
  ```
- [ ] Commit:
  ```bash
  git add -A && git commit -m "refactor(vault): remove circular editor re-exports from vault index"
  ```
