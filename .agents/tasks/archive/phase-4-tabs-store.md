# Phase 4: Merge Tabs Store Slices

**Branch:** `phase-4-tabs-store`
**Worktree:** `../basalt-phase4`

## Problem

5 slice files for zustand (~280 lines total) where 2 files would suffice. Over-engineering.

## Before
```
store/slices/groupSlice.ts     (40 lines)
store/slices/metaSlice.ts      (30 lines)
store/slices/moveSlice.ts      (50 lines)
store/slices/openCloseSlice.ts (80 lines)
store/slices/workspaceSlice.ts (80 lines)
store/helpers.ts               (70 lines)
store/layout.ts                (100 lines)
store/types.ts                 (70 lines)
store/index.ts                 (15 lines)
```

## After
```
store/core.ts           ← merged groupSlice + metaSlice + moveSlice + openCloseSlice
store/persistence.ts    ← merged workspaceSlice + some helpers
store/layout.ts         ← keep (layout tree logic is complex enough)
store/types.ts          ← keep
store/index.ts          ← updated
```

Remove `store/helpers.ts` — inline what's still needed.

## Task List

- [ ] **Step 1:** Read all slice files to understand what each does
- [ ] **Step 2:** Create `core.ts` — merge all logic from groupSlice, metaSlice, moveSlice, openCloseSlice
  - Keep the `StateCreator<TabsState>` pattern
  - Split into logical sections with comments (no need for separate files)
- [ ] **Step 3:** Create `persistence.ts` — extract `toWorkspaceSnapshot`/`hydrateFromWorkspaceSnapshot`/`reset`
- [ ] **Step 4:** Update `store/index.ts` to use `core` and `persistence`
- [ ] **Step 5:** Delete the 5 slice files + `helpers.ts`
- [ ] **Step 6:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  ```
- [ ] **Step 7:** Commit:
  ```bash
  git add -A && git commit -m "refactor(tabs): merge 5 store slices into core.ts + persistence.ts"
  ```
