# Task: Markdown Folding

**Branch:** `feat/editor-folding`
**Worktree:** `../.worktrees/basalt-feat-editor-folding`
**Agent:** _ (assigned by orchestrator)
**Depends on:** _ (none — branch from main)
**Risk:** Low-Medium

## Files to touch

```
packages/editor/src/input/folding.ts                              ← create
packages/editor/src/editor.ts                                     ← register provider + theme
apps/tauri/src/features/editor/components/EditorComponent.tsx      ← foldGutter: false → true
```

## Purpose

Add Obsidian-style folding for headings, fenced code blocks, nested lists, and callouts/blockquotes, plus a fold gutter.

## Task List

- [ ] **Step 1:** Read `packages/editor/src/editor.ts` (registration point) and `apps/tauri/src/features/editor/components/EditorComponent.tsx` (`BASIC_SETUP`, lines ~36-42).
- [ ] **Step 2:** Create `input/folding.ts` exporting `markdownFoldProvider` and `FOLDING_THEME`.
  - Use `@codemirror/language` `foldService` (or `syntaxTree`-based) to return foldable ranges.
  - Foldable: `ATXHeading1..6` (to next same-or-higher heading), `FencedCode` (keep fences), `BulletList`/`OrderedList` (nested items), `BlockQuote`/`Callout` (body).
  - **Do NOT fold tables.**
  - Gutter marker styling uses `--sat-*` tokens only (e.g. `--sat-editor-fold-gutter`).
- [ ] **Step 3:** Register in `editor.ts`: import `markdownFoldProvider, FOLDING_THEME` and add both to the extensions array.
- [ ] **Step 4:** In `EditorComponent.tsx` set `foldGutter: true` (keep `lineNumbers: false`).
- [ ] **Step 5:** Verify (note: run tsc from apps/tauri, which pulls in packages/editor):
  ```bash
  cd /home/pranav/Projects/Basalt/apps/tauri && bunx tsc --noEmit
  cd /home/pranav/Projects/Basalt && bun run lint
  ```
- [ ] **Step 6:** Manual test fold chevrons + `Cmd/Ctrl+Shift+[` / `]` on headings/code/lists/callouts.
- [ ] **Step 7:** Commit: `feat(editor): add markdown fold provider + fold gutter` then `git push origin feat/editor-folding`.

## Verification

- [ ] `bunx tsc --noEmit` passes (apps/tauri)
- [ ] `bun run lint` passes
- [ ] No new console.log or dead code
- [ ] Tables remain unfolded
- [ ] Gutter uses `--sat-*` tokens, no raw hex