# Obsidian Editing Interactions — Implementation Plan

> **Date:** 2026-08-07
> **Status:** Approved
> **Scope:** `packages/editor/src/input/` + `apps/tauri/src/features/editor/`
> **Depends on:** `main` (syntax-decoration layer already merged — lists, tables, callouts, highlights, tags, frontmatter are all live)

> **For agentic workers:** Each track runs in its own git worktree (see `PLAN.md`). Steps use checkbox (`- [ ]`) syntax.

## Problem

The Basalt editor already *renders* Obsidian markdown beautifully (tables with styled headers, callouts, task lists, highlights, etc. — all done). But it does not yet *behave* like Obsidian while editing:

- **Tables** are static text — no `Tab`/`Shift-Tab` cell navigation, no `Enter`-to-next-row, no row append at table end.
- **Task lists** — clicking a checkbox toggles `[ ]`↔`[x]` (works today via `task-list.ts`), but there is no `Cmd/Ctrl+Enter` keyboard toggle and no list-continuation on `Enter`.
- **Lists** — pressing `Enter` on a bullet doesn't continue the list; there's no `Tab` indent / `Shift-Tab` outdent.
- **Folding** — no fold gutter, no fold commands, headings/code blocks/lists/callouts can't collapse.

These are the "Obsidian feel" interactions. This plan adds them in **3 parallel tracks** that touch non-overlapping files, except the shared registration point `editor.ts`.

## Current architecture (verified)

- All editor logic lives in `packages/editor/src/`:
  - `editor.ts` → `createEditorExtensions()` — the single registration point (imports keymaps, themes, plugins).
  - `input/backticks.ts` → the one existing keymap (`backticksKeymap`), registered as `keymap.of(backticksKeymap)` in `editor.ts:52`.
  - `input/task-list.ts` → `taskListPlugin` (click-to-toggle checkbox widget, already wired).
  - `input/suggestions.ts`, `input/context-menu.ts`, `input/index.ts` (barrel).
  - `preview/live-preview.ts` → `LIVE_PREVIEW_THEME` + `livePreviewPlugin` (block/inline decorations). **Do not touch in these tracks.**
- App-side wrapper: `apps/tauri/src/features/editor/components/EditorComponent.tsx` — `BASIC_SETUP = { foldGutter: false, ... }` (line 36-42).
- No test framework — verification is `bunx tsc --noEmit` + `bun run lint` + manual `bun run dev`.
- CodeMirror markdown parser (`@codemirror/lang-markdown` + `@lezer/markdown`) already parses `Table`, `TableCell`, `TableRow`, `TaskMarker`, `BulletList`, `OrderedList`, `ListItem` nodes.

## Track split (parallel, 3 agents)

| Track | Branch | Deliverable | Files |
|---|---|---|---|
| **A — Table cell navigation & editing** | `feat/editor-table-interactions` | `tableKeys` keymap: Tab/Shift-Tab cell jump, Enter next row + row append, Esc exit table | `input/table-keys.ts` (create), `editor.ts` (register) |
| **B — Task toggle + list continuation** | `feat/editor-task-list-keys` | `taskToggleKeymap` (Cmd/Ctrl+Enter checkbox toggle), list continuation on Enter, Tab/Shift-Tab indent/outdent | `input/task-keys.ts` (create), `editor.ts` (register) |
| **C — Folding** | `feat/editor-folding` | Fold service for headings/code/lists/callouts + fold gutter | `input/folding.ts` (create), `editor.ts` (register), `EditorComponent.tsx` (foldGutter: true) |

Each track touches `editor.ts` only to add one import + one entry — expected small merge conflict, resolved by the orchestrator (same pattern as the 2026-04-04 markdown-syntax merge).

---

## Track A — Table cell navigation & editing

**Branch:** `feat/editor-table-interactions`
**Risk:** Medium (new keymap must not fight CodeMirror's default Tab/Enter)

### Task A-1: Create `packages/editor/src/input/table-keys.ts`

- [ ] **Step 1:** Create the file. Export `tableKeys: KeyBinding[]` and `TABLE_KEYS_THEME` (if any styling needed).
  - Use `syntaxTree(view.state)` and find the `Table`/`TableCell`/`TableRow` nodes containing the cursor (`view.state.selection.main.head`).
  - Implement per Obsidian:
    - `Tab` → move cursor to next cell in the row (or next row's first cell); `Shift-Tab` → previous cell. If at the last cell of the last row, create a new row (`|  |  |` appended, cursor in first cell).
    - `Enter` → move cursor to the same column of the next row; if in the last row, append a new row and move to it.
    - `Escape` → exit table mode (plain text cursor movement resumes). Only intercept `Escape` when inside a table.
  - Return `false` from handlers when the cursor is **not** inside a table (let default behavior handle it). This is the key safety rule.
  - Do NOT touch the table **delimiter** row (`TableDelimiter`) when moving rows.
- [ ] **Step 2:** Type-check: `cd packages/editor && bunx tsc --noEmit` — zero errors.
- [ ] **Step 3:** Manual test in `bun run dev` with a 3x3 table; verify Tab/Shift-Tab/Enter/Escape behavior and that outside a table Tab still indents normally.
- [ ] **Step 4:** Commit: `feat(editor): add table cell navigation keymap (Tab/Shift-Tab/Enter/Escape)`

### Task A-2: Register in `editor.ts`

- [ ] **Step 1:** Add `import { tableKeys } from "./input/table-keys";`
- [ ] **Step 2:** Add `keymap.of(tableKeys)` next to `keymap.of(backticksKeymap)` in `editor.ts`.
- [ ] **Step 3:** `cd packages/editor && bunx tsc --noEmit` — zero errors; `cd /home/pranav/Projects/Basalt && bun run lint` — zero errors.
- [ ] **Step 4:** Commit: `feat(editor): register table navigation keymap`

---

## Track B — Task toggle + list continuation

**Branch:** `feat/editor-task-list-keys`
**Risk:** Medium (Enter-key interception overlaps CodeMirror default newline behavior)

### Task B-1: Create `packages/editor/src/input/task-keys.ts`

- [ ] **Step 1:** Create the file. Export `taskToggleKeymap: KeyBinding[]` and `LIST_KEYS_THEME` (if styling needed).
  - `Cmd/Ctrl+Enter` → if the current line contains a task marker (`[ ]` / `[x]`), toggle it; otherwise insert a new line below the current line (Obsidian "insert below").
  - `Enter` list continuation (Obsidian behavior):
    - If cursor is inside a `ListItem`, split at cursor and keep the bullet/number marker + indent on the new line.
    - If the current line is an **empty** list item (only the marker), pressing `Enter` removes the marker and moves to the parent indent level (or out of the list).
    - Preserve ordered-list numbering (next number = previous + 1) and task markers (`- [ ]` continued as `- [ ]`).
    - Otherwise return `false` (normal newline).
  - `Tab` / `Shift-Tab` → when inside a list, indent/outdent the whole list item (with nested children); otherwise return `false`.
  - `Backspace` at the start of an empty list item → remove the marker (Obsidian behavior). Only when the line contains nothing but the marker and cursor is at position 0.
  - Safety rule: return `false` whenever the cursor is **not** inside a list/task line.
- [ ] **Step 2:** Type-check: `cd packages/editor && bunx tsc --noEmit` — zero errors.
- [ ] **Step 3:** Manual test: bullet lists, ordered lists (`1.`→`2.`), task lists (`- [ ]` → `- [ ]`), nested indentation, Cmd/Ctrl+Enter toggle, empty-item removal.
- [ ] **Step 4:** Commit: `feat(editor): add task toggle + list continuation keymap (Cmd+Enter, Enter, Tab, Backspace)`

### Task B-2: Register in `editor.ts`

- [ ] **Step 1:** Add `import { taskToggleKeymap } from "./input/task-keys";`
- [ ] **Step 2:** Add `keymap.of(taskToggleKeymap)` next to the backticks keymap in `editor.ts`.
- [ ] **Step 3:** `cd packages/editor && bunx tsc --noEmit` — zero errors; `bun run lint` — zero errors.
- [ ] **Step 4:** Commit: `feat(editor): register task toggle + list continuation keymap`

---

## Track C — Folding

**Branch:** `feat/editor-folding`
**Risk:** Low-Medium (uses CodeMirror's built-in fold infrastructure)

### Task C-1: Create `packages/editor/src/input/folding.ts`

- [ ] **Step 1:** Create the file. Export `markdownFoldProvider` (a `FoldService`/`foldNodeProp`-style provider) and `FOLDING_THEME`.
  - Use `@codemirror/language` `foldService` (or `syntaxTree`-based fold ranges).
  - Foldable ranges (Obsidian parity):
    - Headings (`ATXHeading1..6`) → fold until the next heading of same-or-higher level.
    - Fenced code blocks (`FencedCode`) → fold the body, keep the fences.
    - Lists (`BulletList`/`OrderedList`) → fold nested list items.
    - Blockquotes / callouts (`BlockQuote`, `Callout`) → fold body.
  - Provide a `foldGutter`-compatible gutter marker theme using `--sat-*` tokens (`--sat-editor-fold-gutter`, etc.).
  - Do NOT fold tables (cells need editing).
- [ ] **Step 2:** Type-check: `cd packages/editor && bunx tsc --noEmit` — zero errors.
- [ ] **Step 3:** Commit: `feat(editor): add markdown fold provider (headings, code, lists, callouts)`

### Task C-2: Register in `editor.ts` + enable gutter in `EditorComponent.tsx`

- [ ] **Step 1:** In `editor.ts`: `import { markdownFoldProvider, FOLDING_THEME } from "./input/folding";` then add the fold provider + theme to the extensions array.
- [ ] **Step 2:** In `apps/tauri/src/features/editor/components/EditorComponent.tsx`: change `BASIC_SETUP.foldGutter` from `false` to `true` (line 38). Keep `lineNumbers: false`.
- [ ] **Step 3:** `cd /home/pranav/Projects/Basalt/apps/tauri && bunx tsc --noEmit` — zero errors; `bun run lint` — zero errors.
- [ ] **Step 4:** Manual test: hover fold chevrons next to headings, code fences, nested lists, callouts; verify `Cmd/Ctrl+Shift+[` / `]` fold/unfold and that the fold gutter renders with theme tokens.
- [ ] **Step 5:** Commit: `feat(editor): enable markdown folding + fold gutter`

---

## Final Merge (Orchestrator)

Merge in any order (independent except the `editor.ts` registration line):

```bash
./scripts/merge-tree.sh feat/editor-table-interactions --delete-worktree
./scripts/merge-tree.sh feat/editor-task-list-keys --delete-worktree
./scripts/merge-tree.sh feat/editor-folding --delete-worktree
```

Expected conflict at `editor.ts` (imports + the `keymap.of(...)` / extensions array). Resolve to include **all** three:

```typescript
import { tableKeys } from "./input/table-keys";
import { taskToggleKeymap } from "./input/task-keys";
import { markdownFoldProvider, FOLDING_THEME } from "./input/folding";
```

Then verify:

```bash
cd /home/pranav/Projects/Basalt
bun run lint && cd apps/tauri && bunx tsc --noEmit
```

## Success Criteria

- [ ] Tab/Shift-Tab move between table cells; Enter advances rows and appends at table end; Esc exits table mode
- [ ] Cmd/Ctrl+Enter toggles task checkboxes; Enter continues bullets, ordered lists, and task lists with correct markers; empty-list-item Enter/Backspace removes the marker
- [ ] Tab/Shift-Tab indent/outdent list items (nested children included)
- [ ] Headings, code blocks, nested lists, and callouts fold/unfold with gutter chevrons and Cmd/Ctrl+Shift+[ / ]
- [ ] Outside tables/lists, Tab/Enter behave exactly as before (handlers return `false`)
- [ ] `bun run lint` + `bunx tsc --noEmit` pass with zero errors
- [ ] All colors/classes use `--sat-*` tokens; no raw hex in new code
