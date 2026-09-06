# Plan: Editor Table Interactions — Spreadsheet-Like Editing for Native Markdown Tables

## Goal

Add interactive editing to the existing markdown table block widget so tables behave
like Obsidian's Advanced Tables plugin (Tab/Enter cell navigation, row/column
operations) — features that **Obsidian core does not provide natively**.

This is NOT about DQL/Dataview result tables; it is about native `| ... |` markdown
tables in the editor.

## Current state

| Aspect | What exists today | File |
|---|---|---|
| Block widget render | Rich `<table>` HTML when cursor is outside; raw source when cursor is inside | `packages/editor/src/block-widgets/table-widget.ts` |
| Cursor-reveal gate | `active = renderModeFacet === "live" && headLine ∈ [from, to]` — line-level granularity | `table-widget.ts:265-268` |
| Table source parser | `parseMarkdownTable()` splits on `\|`, detects alignment from delimiter row | `table-widget.ts:44-81` |
| Block widget registry | Facet-based spec list, `render()` returns `null` when `active` is true | `block-widgets/registry.ts` |
| Keymap pattern | `KeyBinding[]` exported, wired via `keymap.of(...)` in `input` group | `packages/editor/src/input/backticks.ts`, wired in `editor.ts:143` |
| Live-preview styling | Header/delimiter/body line classes only | `packages/editor/src/preview/tables.ts` |

**What does NOT exist:** Tab/Enter cell navigation, row/column insert/delete, or any
interaction beyond "reveal raw source on click."

## What Obsidian core does natively (for reference)

- Live Preview renders tables as rich HTML block widgets.
- Clicking to edit reverts the **entire table** to raw markdown source — NOT cell-by-cell.
- **No** Tab-to-next-cell, Enter-to-new-row, add/remove column, alignment, or spreadsheet navigation.
- All interactive features come from **community plugins** (Advanced Tables, Table Enhancer).

Obsidian's own forums confirm: "Editing the table transforms the whole table to its
source markdown format. It would be nice to have a WYSIWYG editor that works on a cell
by cell basis."

## Design constraints

1. **Do not break the cursor-reveal model.** The existing `active` flag + `render() → null`
   pattern is solid and shared with HTML blocks. Table interactions layer on top of it, not
   instead of it.
2. **Tab/Enter work on raw source, not the rendered widget.** When the user presses Tab,
   the cursor is already inside the table (raw source visible). The keymap moves the cursor
   to the next cell boundary in the source text.
3. **Pure CM6 keymap extension.** Follow the `backticksKeymap` pattern: `KeyBinding[]` in
   `packages/editor/src/input/table-navigation.ts`, wired in `editor.ts` under the `input`
   group. No new ViewPlugins for Phase 1.
4. **No new syntax nodes.** The Lezer grammar already provides `Table → TableRow | TableDelimiter`.
   Cell boundaries are derived from pipe characters in `TableRow` lines. This is the same
   approach the existing `parseMarkdownTable()` uses.

## Phase 1 — Cell navigation (Tab / Shift-Tab / Enter)

**Files:**
- New: `packages/editor/src/input/table-navigation.ts` — `tableNavigationKeymap: KeyBinding[]`
- Edit: `packages/editor/src/editor.ts` — add `keymap.of(tableNavigationKeymap)` to `input` group
- New: `packages/editor/src/input/table-navigation.test.ts`

**Behavior:**

| Key | Condition | Action |
|---|---|---|
| `Tab` | Cursor is inside a Table node | Move cursor to start of next cell in the same row. If at last cell of last row: append a new empty row below, move cursor to its first cell. |
| `Shift-Tab` | Cursor is inside a Table node | Move cursor to start of previous cell. If at first cell of first row: no-op (return false). |
| `Enter` | Cursor is inside a Table node | If at last cell of any row: append a new empty row below, move cursor to its first cell. Otherwise: insert a newline (default CM6 behavior — allow multi-line cell content). |

**Implementation sketch:**

```ts
// table-navigation.ts
import type { KeyBinding } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

/** Find all pipe positions on a given line (raw source). */
function pipePositions(line: string, lineFrom: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|") positions.push(lineFrom + i);
  }
  return positions;
}

/**
 * Given a cursor position inside a Table node, return the cell index
 * (0 = first cell after opening pipe, N-1 = last cell before closing pipe)
 * and the line number.
 */
function cellAtCursor(
  state: EditorState,
  head: number,
  tableFrom: number,
  tableTo: number,
): { row: number; col: number; pipes: number[]; lineNum: number } | null {
  const doc = state.doc;
  const line = doc.lineAt(head);
  const lineText = line.text;
  const pipes = pipePositions(lineText, line.from);

  // Skip if not enough pipes for a table row (need >= 2)
  if (pipes.length < 2) return null;

  // Cell index: count pipes before cursor
  let col = 0;
  for (let i = 0; i < pipes.length; i++) {
    if (pipes[i] < head) col = i;
  }

  // Row index: count TableRow nodes before this line
  let row = 0;
  const tree = syntaxTree(state);
  const tableNode = tree.resolve(tableFrom, 1);
  if (tableNode.type.name !== "Table") return null;

  let child = tableNode.firstChild;
  while (child) {
    if (child.name === "TableRow") {
      const childLine = doc.lineAt(child.from);
      if (childLine.number === line.number) break;
      row++;
    }
    child = child.nextSibling;
  }

  return { row, col, pipes, lineNum: line.number };
}

export const tableNavigationKeymap: KeyBinding[] = [
  {
    key: "Tab",
    run: (view) => { /* ... see below ... */ },
    shift: (view) => { /* Shift-Tab ... */ },
  },
  {
    key: "Enter",
    run: (view) => { /* ... */ },
  },
];
```

**Tab logic (detail):**
1. `syntaxTree(state)` → find the innermost node at `selection.main.head` that is or
   contains a `Table` node. If none → `return false` (let default Tab handle indent).
2. Call `cellAtCursor()` to get current row/col.
3. Get the list of `TableRow` nodes inside the Table (skip `TableDelimiter`).
4. **If not at last cell of last row:** find the next TableRow (or same row's next pipe).
   Set cursor to `nextPipePos + 1` (after the `|` and trailing space).
5. **If at last cell of last row:** build a new row string matching the column count
   (empty cells padded with `| `). Dispatch `changes: { from: tableTo, insert: "\n" + newRow }`
   and set selection to the first cell of the new row.
6. Dispatch and `return true`.

**Enter logic (detail):**
1. Same Table node detection as Tab.
2. Get last TableRow node; if cursor is inside it → append new row, same as Tab's last-row case.
3. Otherwise → `return false` (let CM6 handle the newline for multi-line cells).

**Verification:**
- `bunx tsc --noEmit` from `apps/tauri/`
- `bun run test` (table-navigation.test.ts)
- Manual smoke test: open a note with a 3×3 table, Tab/Shift-Tab through all cells, Enter
  at last row to add row, Shift-Tab at first cell does nothing.

**Commit:** `feat(editor): table cell navigation — Tab/Shift-Tab/Enter in raw source`

---

## Phase 2 — Row/column operations (keybindings + context menu)

**Files:**
- Edit: `packages/editor/src/input/table-navigation.ts` — extend with new KeyBindings
- Edit: `packages/editor/src/input/context-menu.ts` — add table-specific context menu entries
- Edit: `packages/editor/src/input/table-navigation.test.ts`

**Keybindings:**

| Key | Action |
|---|---|
| `Mod-Shift-ArrowUp` | Move row up |
| `Mod-Shift-ArrowDown` | Move row down |

**Context menu entries (right-click on a Table node):**

| Entry | Action |
|---|---|
| Insert row above | Insert empty row above current |
| Insert row below | Insert empty row below current |
| Delete row | Remove current row |
| Insert column left | Insert empty column left of current |
| Insert column right | Insert column right of current |
| Delete column | Remove current column |

**Implementation:** All operations work on raw markdown source text:
1. Parse the full Table node text into rows/columns (reuse `parseMarkdownTable()` or a shared
   utility — it's zero-dependency).
2. Mutate the in-memory structure (add/remove/splice).
3. Serialize back to markdown source, preserving alignment from the delimiter row.
4. Dispatch a single `changes` replacing the Table node's `[from, to]` range.
5. Place the cursor in a sensible position (same row, same column when possible).

**Verification:**
- `bunx tsc --noEmit` from `apps/tauri/`
- `bun run test` (extended test suite)
- Manual smoke test: 4×4 table, add/remove rows and columns, verify cursor stays in
  a reasonable cell, alignment is preserved.

**Commit:** `feat(editor): row/column insert, delete, and move for markdown tables`

---

## Phase 3 — Alignment + formatting

**Files:**
- Edit: `packages/editor/src/input/table-navigation.ts` or new `table-format.ts`

**Keybindings:**

| Key | Action |
|---|---|
| `Mod-Shift-L` | Set column alignment to left (`:---`) |
| `Mod-Shift-C` | Set column alignment to center (`:---:`) |
| `Mod-Shift-R` | Set column alignment to right (`---:`) |

**Behavior:** Rewrite only the delimiter row's cell for the current column. No full-table
reformat — this avoids the "whole table shifts" problem that makes prettify conflict with
the cursor-reveal model.

**Verification:**
- `bunx tsc --noEmit` from `apps/tauri/`
- Manual smoke test: set alignment on various columns, verify rendered table in reading
  mode reflects the alignment, raw source is correct.

**Commit:** `feat(editor): column alignment keybindings for markdown tables`

---

## Verification invariant (after every phase)

```
bun run lint && bunx tsc --noEmit   # from apps/tauri/
bun run test                          # from apps/tauri/
```

## Stretch goal (future, NOT part of this plan)

- Auto-prettify (pad cells to equal width) — Advanced Tables parity. Deferred because
  it rewrites the entire table source on every keystroke, which fights the cursor-reveal
  model and risks flicker.
- Multi-line cell editing in live preview (rendered cell view while editing other cells).
  High complexity, defer until Phase 1–2 are solid.
