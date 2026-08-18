# Task: Table Cell Navigation & Editing

**Branch:** `feat/editor-table-interactions`
**Worktree:** `../.worktrees/basalt-feat-editor-table-interactions`
**Agent:** _ (assigned by orchestrator)
**Depends on:** _ (none — branch from main)
**Risk:** Medium

## Files to touch

```
packages/editor/src/input/table-keys.ts   ← create
packages/editor/src/editor.ts              ← add keymap.of(tableKeys) + import
```

## Task List

- [ ] **Step 1:** Read `packages/editor/src/editor.ts`, `packages/editor/src/input/backticks.ts` (existing keymap pattern), and `packages/editor/src/input/index.ts` (barrel).
- [ ] **Step 2:** Create `input/table-keys.ts` exporting `tableKeys: KeyBinding[]`. Use `syntaxTree(view.state)` to find the `Table`/`TableCell`/`TableRow` nodes containing the cursor. Implement:
  - `Tab`/`Shift-Tab`: move to next/prev cell; if at last cell of last row, append a new row and move to it.
  - `Enter`: move to same-column next row; if last row, append a new row.
  - `Escape`: exit table mode (only intercept when inside a table).
  - **Safety rule:** return `false` whenever the cursor is NOT inside a table, so Tab still indents and Enter still newlines outside tables.
  - Never move the cursor onto the `TableDelimiter` row.
- [ ] **Step 3:** Register in `editor.ts`: `import { tableKeys } from "./input/table-keys";` and add `keymap.of(tableKeys)` next to the backticks keymap.
- [ ] **Step 4:** Verify:
  ```bash
  cd packages/editor && bunx tsc --noEmit
  cd /home/pranav/Projects/Basalt && bun run lint
  ```
- [ ] **Step 5:** Manual test a 3x3 table in `bun run dev`.
- [ ] **Step 6:** Commit: `feat(editor): add table cell navigation keymap (Tab/Shift-Tab/Enter/Escape)` then `git push origin feat/editor-table-interactions`.

## Verification

- [ ] `bunx tsc --noEmit` passes (packages/editor)
- [ ] `bun run lint` passes
- [ ] No new console.log or dead code
- [ ] Outside tables, Tab/Enter behave exactly as before