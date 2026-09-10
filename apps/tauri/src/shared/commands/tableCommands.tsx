/**
 * tableCommands — app-level registrations for rich-table (native markdown
 * table) row/column operations. Registered separately with a table-specific
 * checkCallback (ADR-038 §3: split out of shared/editorCommands).
 */
import {
  tablePositionAtCursor,
  insertRowAbove,
  insertRowBelow,
  deleteRow,
  insertColumnLeft,
  insertColumnRight,
  deleteColumn,
} from "@workspace/editor";
import type { MutationResult } from "@workspace/editor";
import {
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertTop,
  IconRowInsertBottom,
  IconTableOff,
} from "@tabler/icons-react";
import { commandService } from "@workspace/commands";
import { getActiveView } from "./editorCommands";

function hasTableCursor(): boolean {
  const view = getActiveView();
  return view !== null && tablePositionAtCursor(view.state) !== null;
}

function tableMutate(
  mutate: (raw: string, row: number, col: number) => MutationResult | null,
): () => void {
  return () => {
    const view = getActiveView();
    if (!view) return;
    const pos = tablePositionAtCursor(view.state);
    if (!pos) return;
    const result = mutate(pos.raw, pos.row, pos.col);
    if (!result) return;
    view.dispatch({
      changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
      selection: { anchor: pos.table.from + result.cursor },
    });
  };
}

const tableCommands = [
  {
    id: "table:insert-row-above",
    name: "Insert Row Above",
    category: "Table",
    icon: <IconRowInsertTop size={16} />,
    callback: tableMutate(insertRowAbove),
  },
  {
    id: "table:insert-row-below",
    name: "Insert Row Below",
    category: "Table",
    icon: <IconRowInsertBottom size={16} />,
    callback: tableMutate(insertRowBelow),
  },
  {
    id: "table:delete-row",
    name: "Delete Row",
    category: "Table",
    icon: <IconTableOff size={16} />,
    callback: tableMutate(deleteRow),
  },
  {
    id: "table:insert-column-left",
    name: "Insert Column Left",
    category: "Table",
    icon: <IconColumnInsertLeft size={16} />,
    callback: tableMutate(insertColumnLeft),
  },
  {
    id: "table:insert-column-right",
    name: "Insert Column Right",
    category: "Table",
    icon: <IconColumnInsertRight size={16} />,
    callback: tableMutate(insertColumnRight),
  },
  {
    id: "table:delete-column",
    name: "Delete Column",
    category: "Table",
    icon: <IconColumnRemove size={16} />,
    callback: tableMutate(deleteColumn),
  },
];

tableCommands.forEach((cmd) =>
  commandService.register({ ...cmd, checkCallback: hasTableCursor }),
);
