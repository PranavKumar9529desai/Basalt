# Phase 6: Collapse Vault Hooks

**Branch:** `phase-6-vault-hooks`
**Worktree:** `../basalt-phase6`

## Problem

9 hooks for the vault feature. Most are tiny wrappers around `useState` + `invoke`. Over-splitting creates navigation overhead with zero benefit.

## Collapse Plan

| Current | New | Reason |
|---------|-----|--------|
| `useVaultCreateMutations.ts` | → merged into `useVaultMutations.ts` | Same patterns (error/isLoading/invoke) |
| `useVaultDeleteMutations.ts` | → merged into `useVaultMutations.ts` | Same as above |
| `useVaultMutations.ts` (wrapper) | → becomes the merged file | A merge is cleaner than a spread |
| `useVaultSelection.ts` | → merged into `useVaultController.ts` | Always used together |
| `useVaultClipboard.ts` | → merged into `useVaultController.ts` | Always used together |
| `useVaultContextMenu.ts` | → merged into `useVaultController.ts` | Always used together |
| `useVaultFileTreeController.ts` | → becomes renamed to `useVaultController.ts` | Main orchestrator |
| `useVaultTree.ts` | Keep as-is | Standalone, complex |
| `useVaultActions.ts` | Keep as-is | Standalone, simple |

## Task List

- [ ] **Step 1:** Create merged `useVaultMutations.ts` — copy code from create + delete, deduplicate `error`/`isLoading`/`invoke` patterns
- [ ] **Step 2:** Create merged `useVaultController.ts` — copy code from selection + clipboard + contextMenu + fileTreeController
  - Export a single hook `useVaultController` that returns everything the 4 old hooks returned
- [ ] **Step 3:** Update `vault/index.ts` exports — remove old hook exports, add new merged ones
- [ ] **Step 4:** Delete the 7 old hook files
- [ ] **Step 5:** Update all imports in `app-shell/` (or wherever they're consumed)
- [ ] **Step 6:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  rg "useVaultClipboard\|useVaultContextMenu\|useVaultCreateMutations\|useVaultDeleteMutations\|useVaultSelection\|useVaultFileTreeController" src/ --include='*.ts' --include='*.tsx' | grep -v "node_modules" | grep -v ".spec."
  ```
  Should only show references inside the merged files, not from other features.
- [ ] **Step 7:** Commit:
  ```bash
  git add -A && git commit -m "refactor(vault): collapse 9 hooks into 4 (tree, mutations, controller, actions)"
  ```
