# Phase 5: Shrink Editor Session Store

**Branch:** `phase-5-editor-store`
**Worktree:** `../basalt-phase5`

## Problem

`useEditorSessionsStore` syncs ALL editor state (selected, content, backlinks, saveStatus, status) on every keystroke via a `useEffect`. Only `selected` is actually consumed by other components. This means:
- Every keystroke triggers: React re-render → effect → zustand setState → any subscriber re-renders
- 80% of synced data is never read

## Before
```ts
interface EditorSessionsState {
  sessions: Record<string, {
    selected, content, backlinks, saveStatus, status  // all synced
  }>;
  ensureSession, updateSession, removeSession, reset  // all for full sync
}
```

## After
```ts
// Just the minimal atom that's actually consumed
interface FocusedPaneState {
  focusedPaneSelected: { path: string; name: string } | null;
  setFocusedPaneSelected: (note: { path: string; name: string } | null) => void;
}
```

## Task List

- [ ] **Step 1:** Find all consumers:
  ```bash
  rg "useEditorSessionsStore\|EditorSessionSnapshot" apps/tauri/src/
  ```
- [ ] **Step 2:** Replace `features/editor/store.ts` with minimal version
- [ ] **Step 3:** Update `PaneContent.tsx` (from Phase 3) to call `setFocusedPaneSelected` when the active tab changes
- [ ] **Step 4:** Update `app-shell/App.tsx` to read from new store
- [ ] **Step 5:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  rg "updateSession\|ensureSession\|removeSession" src/  # should be empty
  ```
- [ ] **Step 6:** Commit:
  ```bash
  git add -A && git commit -m "refactor(editor): replace session store with focused-pane atom"
  ```
