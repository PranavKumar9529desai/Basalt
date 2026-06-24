# Phase 3: Eliminate PaneInstance Duplication

**Branch:** `phase-3-paneinstance`
**Worktree:** `../basalt-phase3`

## Problem

`PaneInstance.tsx` and `WorkspaceTabs.tsx`'s `renderDefaultGroupPane` are ~80% identical. Changes in one don't apply to the other → guaranteed bugs.

## Solution

1. Strip editor rendering OUT of `WorkspaceTabs.tsx` — it becomes a pure layout tree (tabs only)
2. Create `features/editor/PaneContent.tsx` — single source of truth for editor pane content
3. Delete `PaneInstance.tsx`

## Files to read first

- `apps/tauri/src/features/editor/PaneInstance.tsx`
- `apps/tauri/src/features/tabs/components/WorkspaceTabs.tsx`
- `apps/tauri/src/app-shell/App.tsx` (or wherever the current `renderGroupPane` is used)

## Task List

- [ ] **Step 1:** Read and understand both files
- [ ] **Step 2:** Create `features/editor/PaneContent.tsx` — extract the editor rendering logic from PaneInstance, but:
  - Accept `findNote` as a prop (not through `usePaneManager`)
  - Accept `groupId`, `activeTab`, `markTabDirty`, `onActivateGroup` as props
  - Call `useEditor({ findNote })` internally
  - Render `TabGroupFrame` + `TabsBar` + `Editor` + `ConflictBanner` + `SaveIndicator`
  - Do NOT accept `context: WorkspaceTabsGroupRenderContext` — accept flat props instead

- [ ] **Step 3:** Strip `WorkspaceTabs.tsx`:
  - Remove `renderDefaultGroupPane` method
  - Remove `renderGroupPane` prop; replace with `renderPane: (context) => ReactNode`
  - Remove `ConflictBanner` and `InactiveGroupPane` exports (move to editor feature)
  - Keep only layout tree + tab bar rendering

- [ ] **Step 4:** Delete `PaneInstance.tsx`
- [ ] **Step 5:** Update `App.tsx` (shell) to create `renderPane` callback using `PaneContent`
- [ ] **Step 6:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  rg "PaneInstance\|usePaneManager\|renderDefaultGroupPane" src/  # should be empty
  ```
- [ ] **Step 7:** Commit:
  ```bash
  git add -A && git commit -m "refactor(editor): eliminate PaneInstance duplication, extract PaneContent"
  ```
