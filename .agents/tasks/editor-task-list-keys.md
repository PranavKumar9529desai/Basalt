# Task: Task Toggle + List Continuation

**Branch:** `feat/editor-task-list-keys`
**Worktree:** `../.worktrees/basalt-feat-editor-task-list-keys`
**Agent:** _ (assigned by orchestrator)
**Depends on:** _ (none — branch from main)
**Risk:** Medium

## Files to touch

```
packages/editor/src/input/task-keys.ts   ← create
packages/editor/src/editor.ts              ← add keymap.of(taskToggleKeymap) + import
```

## Task List

- [ ] **Step 1:** Read `packages/editor/src/editor.ts`, `packages/editor/src/input/backticks.ts` (existing keymap pattern), and `packages/editor/src/input/task-list.ts` (existing checkbox widget — the click-toggle lives there; this track adds the keyboard/list behavior only).
- [ ] **Step 2:** Create `input/task-keys.ts` exporting `taskToggleKeymap: KeyBinding[]`. Implement (Obsidian behavior):
  - `Cmd/Ctrl+Enter`: toggle the task marker (`[ ]`↔`[x]`) on the current line; if no marker, insert a new line below the current line.
  - `Enter` list continuation: split at cursor, keep bullet/number marker + indent; empty-list-item Enter removes the marker and returns to parent level, ending the list. Preserve ordered numbering and task markers.
  - `Tab`/`Shift-Tab`: indent/outdent the list item (with nested children); return `false` outside lists.
  - `Backspace` at start of an empty list item: remove the marker.
  - **Safety rule:** return `false` whenever the cursor is not inside a list/task line.
- [ ] **Step 3:** Register in `editor.ts`: `import { taskToggleKeymap } from "./input/task-keys";` and add `keymap.of(taskToggleKeymap)`.
- [ ] **Step 4:** Verify:
  ```bash
  cd packages/editor && bunx tsc --noEmit
  cd /home/pranav/Projects/Basalt && bun run lint
  ```
- [ ] **Step 5:** Manual test bullets, ordered lists (`1.`→`2.`), task lists, nested indentation, Cmd/Ctrl+Enter toggle, empty-item removal.
- [ ] **Step 6:** Commit: `feat(editor): add task toggle + list continuation keymap (Cmd+Enter, Enter, Tab, Backspace)` then `git push origin feat/editor-task-list-keys`.

## Verification

- [ ] `bunx tsc --noEmit` passes (packages/editor)
- [ ] `bun run lint` passes
- [ ] No new console.log or dead code
- [ ] Outside lists, Tab handles indentation normally; Enter newlines normally