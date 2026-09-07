# Plan: Obsidian-Style Inline Table Editor

## Goal

Replace the current cursor-reveal table widget with an Obsidian-core-style
inline table editor: the table renders as a rich HTML table **with editable
cells by default**, carries a `</>` toggle to reveal raw markdown source, and
shows inline `+` buttons to add rows/columns at the table's edges.

This mirrors Obsidian's core table editor (v1.5.3+), which is distinct from
the Advanced Tables plugin sidebar we built earlier.

## Why the current approach is wrong for the user

Our current table block widget (ADR-034) shows the rich `<table>` **only when
the cursor is outside**; clicking inside immediately reverts to raw `|` source
(the `active` gate in `table-widget.ts:265-268`). The user wants the opposite:

| Aspect        | We have today                         | Obsidian core table editor        |
| ------------- | ------------------------------------- | --------------------------------- |
| Default view  | Raw source when cursor inside         | Rich table with editable cells    |
| Edit a cell   | Type into raw `\|` source             | Click cell, type in place         |
| Reveal source | Auto on cursor-inside                 | Manual `</>` toggle button        |
| Add row/col   | Sidebar buttons / context menu / keys | Inline `+` buttons at table edges |
| Row/col ops   | Sidebar + context menu                | Context menu + inline +           |

## Design constraints

1. **Keep the raw source as the source of truth.** All cell edits dispatch CM6
   changes against the table's source range — never a separate state model.
2. **Keep existing Phase 1-3 features.** Tab/Enter navigation, row/col
   mutations, alignment keybindings, and the context menu all still work.
   The inline editor is a _richer surface_ on top of the same mutation engine.
3. **No layout shift.** Editing one cell rewrites only that cell's source
   span, not the whole table (avoids the prettify conflict that made us
   defer auto-padding).
4. **Follow the block widget registry pattern** (ADR-018) — the table stays a
   registered block widget; we extend its DOM with edit affordances.

## Architecture

The table remains a `BlockWidgetSpec` in `table-widget.ts`. The key change is
the `render()` contract and the widget DOM.

### 1. Always render the rich table (drop the cursor-reveal gate)

`render(model, state)` currently returns `null` when `active` (cursor inside).
Change it to **always** return the widget when in live preview. Remove the
`active` field / gate from the model. The raw source is reachable via the
`</>` toggle instead of the cursor.

### 2. Widget DOM: editable cells + toggle + `+` buttons

`TableBlockWidget.toDOM()` builds:

```
<div class="cm-table-block">
  <div class="cm-table-toolbar">
    <button class="cm-table-edit-toggle"> </> </button>   ← toggle to source
  </div>
  <table class="cm-table-editable">
    <thead><tr>
      <th class="cm-table-add-col">+</th>                  ← column + button
      <th contenteditable>Header</th> ...
    </tr></thead>
    <tbody>
      <tr>
        <td class="cm-table-add-row">+</td>                ← row + button
        <td contenteditable>cell</td> ...
      </tr> ...
    </tbody>
    <tfoot><tr><td colspan>...</td></tr></tfoot>          ← trailing + row
  </table>
</div>
```

- **Cells**: `contenteditable=true`. Typing edits the cell in place.
- **`</>` toggle**: top toolbar button. Click → reveal raw source for this
  table (see §4).
- **`+` buttons**: leading "gutter" column/row of `+` cells, plus a trailing
  row, to append rows/columns. Hover to show, click to insert.

### 3. Cell editing → source mutation

The hard part: a `contenteditable` cell's text must write back to the correct
source span. Two sub-problems: **reading** (map cell → source position) and
**writing** (dispatch the change on input).

**Mapping cell → source span**: We already parse the table into rows/cells
(`parseMarkdownTable` + the mutation engine's `parseTableSource`). Each
`<td contenteditable>` is created from a known `(row, col)`; store those
indices as `data-row`/`data-col` attributes. The source span of a cell is
recomputed from the current source each time (pipes + whitespace), so edits
shift following cells correctly.

**Writing on input**: listen for `input` events on the widget DOM. On each
input:

1. Re-parse the table source to locate the exact `[from, to]` span of cell
   `(row, col)` (the text between its surrounding pipes, incl. its padding).
2. Compute the new cell text from the contenteditable's `textContent`.
3. `view.dispatch({ changes: { from, to, insert: newCell }, selection })` —
   replacing only that cell's source text.
4. CM6 re-parses; the widget re-renders with the new source.

**Keeping the caret alive**: after dispatch, restore focus to the same cell
and place the caret at the correct character offset (recompute from the
contenteditable's Selection after React/CM6 settle). This is the fiddly part —
see Risks.

**Cursor ↔ CM6 selection**: To make Tab/Enter navigation and the existing
keymap work, keep the CM6 selection synced to the focused cell. On cell focus,
set `view.selection` to the cell's source position. When the user presses Tab
in a contenteditable cell, forward it to CM6 (or handle directly).

### 4. `</>` toggle → reveal source

Clicking `</>` dispatches a CM6 transaction that moves the selection into the
table source (so the raw pipes are visible and editable). For a _per-table_
reveal (not whole-document source mode), render the raw source in place:
when toggled, `render()` returns a plain text widget (the raw `|` source) for
that table instead of the rich table, until the user clicks `</>` again (or
the toggle flips back). The existing `tableNavigationKeymap` operates on this
raw source — reuse it unchanged.

This replaces the current `active`-gate mechanism with an explicit,
user-driven toggle.

### 5. Inline `+` buttons → insert row/column

`+` button clicks call the existing mutation engine (`insertRowBelow`,
`insertColumnRight`, etc.) via `applyTableMutation`. No new mutation logic —
just new trigger surfaces. After insert, re-focus the cell at the cursor.

## Files

| File                                                | Change                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/editor/src/block-widgets/table-widget.ts` | Drop `active` gate; build editable widget DOM (cells, toggle, `+`); cell↔source write-back; `</>` toggle state |
| `packages/editor/src/input/table-navigation.ts`     | Reuse for raw-source navigation (unchanged)                                                                    |
| `packages/editor/src/input/table-mutations.ts`      | Reuse for insert/delete/align (unchanged)                                                                      |
| `packages/editor/src/block-widgets/registry.ts`     | Support per-table "reveal source" widget state if needed                                                       |
| `apps/tauri/...`                                    | Table controls sidebar + context menu stay (still useful)                                                      |

## Behavior matrix

| Interaction             | Behavior                                              |
| ----------------------- | ----------------------------------------------------- |
| Click a cell            | Focus cell, sync CM6 selection, type in place         |
| Type in a cell          | Dispatch source change for that cell only             |
| Click `</>`             | Toggle this table to raw source (edit pipes directly) |
| Click `+` at row end    | Insert row below                                      |
| Click `+` at col end    | Insert column right                                   |
| Hover cell edge / `+`   | Show the add affordance                               |
| Right-click table       | Existing Table context submenu (row/col ops)          |
| Tab / Shift-Tab / Enter | Existing cell navigation (now in editable cells)      |
| Mod-Shift-L/C/R         | Existing alignment keybindings                        |

## Risks & open questions

1. **contenteditable ↔ CM6 caret sync** — the hardest part. Typing in
   contenteditable then dispatching a CM6 change risks caret jumps, undo
   churn, and IME issues. Mitigation: single-cell span edits, restore caret
   by recomputing offset from the new source. Consider `EditorView.contentAttributes` +
   a focused "edit session" per cell rather than persistent contenteditable.
2. **IME / composition** — must not dispatch partial composition text.
   Gate write-back on `compositionend` or use `beforeinput`/`input` with
   composition guard.
3. **Performance at 5k tables / huge vaults** — each keystroke re-parses one
   table (small). Re-parse only the table node, not the doc.
4. **Alignment of source on edit** — editing a cell in a padded table must
   preserve surrounding pipe spacing. Replace `[from,to]` with the cell's
   exact padded text so neighboring cells don't shift.
5. **Undo/redo** — each cell edit should be one undo step. Use CM6's
   transaction annotations / `addToHistory` correctly.
6. **Escaped pipes `\|` and wide tables** — the cell↔span mapping must handle
   escaped pipes inside cells and horizontal scroll in wide tables.
7. **"reveal source" state** — should it be per-table (toggled) or global?
   Per-table matches Obsidian (`</>` is per table). Needs per-table widget
   state, not just the global `active` flag.

## Stretch (future)

- Auto-prettify (pad cells to equal width) on toggle to source / on row
  insert — Advanced Tables parity. Deferred (rewrites whole table, fights
  caret stability).
- Drag column borders to resize — not in this plan.
- Multi-line cell editing in the rendered view — complex; defer.

## Verification

- `bunx tsc --noEmit` (apps/tauri + packages/editor)
- `bun run lint`
- `bun run test` (editor package) — extend tests for cell write-back span
  mapping, `</>` toggle state, `+` insert triggers
- Manual: open `Tables Test Suite.md`, click cells and type, toggle `</>`,
  click `+` to add rows/cols, verify raw source stays correct, undo works.

## Commit

`feat(editor): inline table editor — editable cells, </> toggle, + row/col buttons`
