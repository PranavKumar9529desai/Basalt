# Phase 7: Centralize Keyboard Shortcuts

**Branch:** `phase-7-shortcuts`
**Worktree:** `../basalt-phase7`

## Problem

3 separate `window.addEventListener("keydown", ...)` effects scattered across the codebase:
- `features/editor/hooks/useEditor.ts` → `Ctrl+S` (save)
- `app-shell/AppCommands.tsx` → `Ctrl+F`, `Ctrl+O`, `Ctrl+,`  
- `features/editor/EditorCommandPalette.tsx` → `Ctrl+P`

If two handlers try to bind the same key, one silently wins. No ordering guarantee.

## Solution

Single `useKeyboardShortcuts` hook in `app-shell/hooks/` with an explicit shortcut map.

## Task List

- [ ] **Step 1:** Create `app-shell/hooks/useKeyboardShortcuts.ts`
  ```ts
  export interface ShortcutMap {
    [key: string]: {
      key: string;           // event.key value
      ctrl?: boolean;
      meta?: boolean;
      handler: () => void;
      capture?: boolean;
      preventDefault?: boolean;
    };
  }
  
  export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
    // Single useEffect with one keydown listener
    // Iterate shortcuts, match on key + ctrlKey/metaKey
  }
  ```
- [ ] **Step 2:** Wire up all global shortcuts in one place in `app-shell/App.tsx`:
  ```ts
  useKeyboardShortcuts({
    "save":         { key: "s", meta: true, handler: performSave },
    "search":       { key: "f", meta: true, handler: openSearch },
    "quick-open":   { key: "o", meta: true, handler: openSwitcher },
    "settings":     { key: ",", meta: true, handler: openSettings },
    "command-palette": { key: "p", meta: true, handler: () => setCommandPaletteOpen(true) },
  });
  ```
- [ ] **Step 3:** Remove the 3 raw `useEffect` + `addEventListener` blocks:
  - From `useEditor.ts` — make `performSave` a callback prop instead of binding globally
  - From `AppCommands.tsx` — remove the second `useEffect` with keydown handler
  - From `EditorCommandPalette.tsx` — remove the `useEffect` with keydown handler
- [ ] **Step 4:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  rg "window\.addEventListener.*keydown" apps/tauri/src/  # should only be in useKeyboardShortcuts.ts
  ```
- [ ] **Step 5:** Commit:
  ```bash
  git add -A && git commit -m "refactor(app-shell): centralize keyboard shortcuts into useKeyboardShortcuts"
  ```
