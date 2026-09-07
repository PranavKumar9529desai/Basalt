import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconArrowUp,
  IconArrowDown,
  IconRowInsertTop,
  IconRowInsertBottom,
  IconTableOff,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
} from "@tabler/icons-react";
import { useTableCursorStore } from "../../features/editor";
import { resolveActiveController } from "../../shared/activeEditor";
import {
  tablePositionAtCursor,
  insertRowAbove,
  insertRowBelow,
  deleteRow,
  insertColumnLeft,
  insertColumnRight,
  deleteColumn,
  setAlignment,
  moveRowUp,
  moveRowDown,
} from "@workspace/editor";
import type { Alignment, MutationResult } from "@workspace/editor";

/**
 * Run a table mutation against the active editor. Resolves the view at call
 * time so buttons always target the focused pane.
 */
function mutate(
  fn: (raw: string, row: number, col: number) => MutationResult | null,
): () => void {
  return () => {
    const view = resolveActiveController()?.getView();
    if (!view) return;
    const pos = tablePositionAtCursor(view.state);
    if (!pos) return;
    const result = fn(pos.raw, pos.row, pos.col);
    if (!result) return;
    view.dispatch({
      changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
      selection: { anchor: pos.table.from + result.cursor },
    });
  };
}

function align(alignment: Alignment): () => void {
  return () => {
    const view = resolveActiveController()?.getView();
    if (!view) return;
    const pos = tablePositionAtCursor(view.state);
    if (!pos) return;
    const result = setAlignment(pos.raw, pos.col, alignment);
    if (!result) return;
    view.dispatch({
      changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
      selection: { anchor: pos.table.from + result.cursor },
    });
  };
}

function moveRow(delta: number): () => void {
  return () => {
    const view = resolveActiveController()?.getView();
    if (!view) return;
    const pos = tablePositionAtCursor(view.state);
    if (!pos) return;
    const fn = delta < 0 ? moveRowUp : moveRowDown;
    const result = fn(pos.raw, pos.row);
    if (!result) return;
    view.dispatch({
      changes: { from: pos.table.from, to: pos.table.to, insert: result.text },
      selection: { anchor: pos.table.from + result.cursor },
    });
  };
}

interface BtnProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

function Btn({ icon, title, onClick, disabled }: BtnProps) {
  return (
    <button
      className="flex size-7 items-center justify-center rounded transition-colors hover:bg-[var(--sat-surface-2)] disabled:opacity-30"
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-1 w-12 shrink-0 text-[10px] font-medium uppercase tracking-wider text-[var(--sat-text-secondary)]">
      {children}
    </span>
  );
}

export function TableControls() {
  const tableCursor = useTableCursorStore((s) => s.tableCursor);
  const inTable = tableCursor?.inTable ?? false;
  const iconSize = 16;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Section: Align */}
      <div className="flex items-center gap-1">
        <SectionLabel>Align</SectionLabel>
        <Btn
          icon={<IconAlignLeft size={iconSize} />}
          title="Left align (Mod-Shift-L)"
          onClick={align("left")}
          disabled={!inTable}
        />
        <Btn
          icon={<IconAlignCenter size={iconSize} />}
          title="Center align (Mod-Shift-C)"
          onClick={align("center")}
          disabled={!inTable}
        />
        <Btn
          icon={<IconAlignRight size={iconSize} />}
          title="Right align (Mod-Shift-R)"
          onClick={align("right")}
          disabled={!inTable}
        />
      </div>

      {/* Section: Move */}
      <div className="flex items-center gap-1">
        <SectionLabel>Move</SectionLabel>
        <Btn
          icon={<IconArrowUp size={iconSize} />}
          title="Move row up (Mod-Shift-ArrowUp)"
          onClick={moveRow(-1)}
          disabled={!inTable}
        />
        <Btn
          icon={<IconArrowDown size={iconSize} />}
          title="Move row down (Mod-Shift-ArrowDown)"
          onClick={moveRow(1)}
          disabled={!inTable}
        />
      </div>

      {/* Section: Edit */}
      <div className="flex items-center gap-1">
        <SectionLabel>Edit</SectionLabel>
        <Btn
          icon={<IconRowInsertTop size={iconSize} />}
          title="Insert row above"
          onClick={mutate(insertRowAbove)}
          disabled={!inTable}
        />
        <Btn
          icon={<IconRowInsertBottom size={iconSize} />}
          title="Insert row below"
          onClick={mutate(insertRowBelow)}
          disabled={!inTable}
        />
        <Btn
          icon={<IconTableOff size={iconSize} />}
          title="Delete row"
          onClick={mutate(deleteRow)}
          disabled={!inTable}
        />
      </div>

      <div className="flex items-center gap-1">
        <SectionLabel>Column</SectionLabel>
        <Btn
          icon={<IconColumnInsertLeft size={iconSize} />}
          title="Insert column left"
          onClick={mutate(insertColumnLeft)}
          disabled={!inTable}
        />
        <Btn
          icon={<IconColumnInsertRight size={iconSize} />}
          title="Insert column right"
          onClick={mutate(insertColumnRight)}
          disabled={!inTable}
        />
        <Btn
          icon={<IconColumnRemove size={iconSize} />}
          title="Delete column"
          onClick={mutate(deleteColumn)}
          disabled={!inTable}
        />
      </div>

      {/* Hint when no table */}
      {!inTable && (
        <p className="text-[11px] text-[var(--sat-text-secondary)] opacity-60">
          Place your cursor inside a table to enable controls.
        </p>
      )}
    </div>
  );
}
