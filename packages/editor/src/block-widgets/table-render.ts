import type { EditorView } from "@codemirror/view";
import type { TableBlockModel } from "./table-parse";
import { renderInlineCell, type ResolveAssetFn } from "./table-html";

// ---------------------------------------------------------------------------
// Table DOM rendering — builds the <table> element and its cells.
//
// Split out of table-widget.ts: the widget owns lifecycle + editing commits,
// this file owns pure DOM construction. Cell editing (Tab/Enter/Escape,
// commit-on-blur) is wired through the `TableRenderCallbacks` interface so the
// renderer stays framework-agnostic about how changes reach the document.
// ---------------------------------------------------------------------------

/** Callbacks the widget provides so the renderer can drive document edits. */
export interface TableRenderCallbacks {
  commitCell(
    row: number,
    col: number,
    text: string,
    nextFocus?: { row: number; col: number },
    wrapper?: HTMLElement,
  ): void;
  commitAndAppendRow(
    row: number,
    col: number,
    text: string,
    targetCol: number,
  ): void;
  focusCell(root: HTMLElement, row: number, col: number): void;
  onAddColumn(): void;
  onAddRow(): void;
}

/**
 * Build the `<table>` element (thead + tbody + ghost cells) and wire cell
 * editing events. Returns the table plus its thead, which the interactive
 * chrome needs for zone tracking.
 */
export function buildTableElement(
  model: TableBlockModel,
  resolve: ResolveAssetFn | undefined,
  view: EditorView | undefined,
  wrapper: HTMLElement,
  cbs: TableRenderCallbacks,
): { table: HTMLElement; thead: HTMLElement } {
  const table = document.createElement("table");
  table.className = "cm-table-rendered";

  const { headers, body, alignments } = model;
  const totalRows = body.length + 1;
  const totalCols = headers.length;

  // <thead>
  const thead = document.createElement("thead");
  const headerTr = document.createElement("tr");

  const setupCellEvents = (
    cell: HTMLElement,
    rowIdx: number,
    colIdx: number,
  ) => {
    cell.addEventListener("focus", () => {
      cell.textContent = cell.dataset.raw ?? "";
    });

    cell.addEventListener("blur", () => {
      const newText = (cell.textContent ?? "").trim();
      const oldText = (cell.dataset.raw ?? "").trim();
      if (newText !== oldText) {
        cell.dataset.raw = newText;
        cbs.commitCell(rowIdx, colIdx, newText);
      } else {
        cell.innerHTML = renderInlineCell(newText, resolve);
      }
    });

    cell.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const clean = text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
      document.execCommand("insertText", false, clean);
    });

    cell.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        const newText = (cell.textContent ?? "").trim();
        const oldText = (cell.dataset.raw ?? "").trim();
        const changed = newText !== oldText;
        if (changed) cell.dataset.raw = newText;

        if (e.shiftKey) {
          let prevRow = rowIdx;
          let prevCol = colIdx - 1;
          if (prevCol < 0) {
            prevRow--;
            prevCol = totalCols - 1;
          }
          if (prevRow >= 0) {
            if (changed) {
              cbs.commitCell(
                rowIdx,
                colIdx,
                newText,
                { row: prevRow, col: prevCol },
                wrapper,
              );
            } else {
              cbs.focusCell(wrapper, prevRow, prevCol);
            }
          }
        } else {
          let nextRow = rowIdx;
          let nextCol = colIdx + 1;
          if (nextCol >= totalCols) {
            nextRow++;
            nextCol = 0;
          }
          if (nextRow >= totalRows) {
            cbs.commitAndAppendRow(rowIdx, colIdx, newText, nextCol);
          } else {
            if (changed) {
              cbs.commitCell(
                rowIdx,
                colIdx,
                newText,
                { row: nextRow, col: nextCol },
                wrapper,
              );
            } else {
              cbs.focusCell(wrapper, nextRow, nextCol);
            }
          }
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const newText = (cell.textContent ?? "").trim();
        const oldText = (cell.dataset.raw ?? "").trim();
        const changed = newText !== oldText;
        if (changed) cell.dataset.raw = newText;

        const nextRow = rowIdx + 1;
        if (nextRow >= totalRows) {
          cbs.commitAndAppendRow(rowIdx, colIdx, newText, colIdx);
        } else {
          if (changed) {
            cbs.commitCell(
              rowIdx,
              colIdx,
              newText,
              { row: nextRow, col: colIdx },
              wrapper,
            );
          } else {
            cbs.focusCell(wrapper, nextRow, colIdx);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cell.blur();
        view?.focus();
      }
    });
  };

  for (let c = 0; c < headers.length; c++) {
    const th = document.createElement("th");
    const a = alignments[c] ?? "none";
    if (a === "left") th.style.textAlign = "left";
    else if (a === "center") th.style.textAlign = "center";
    else if (a === "right") th.style.textAlign = "right";

    th.innerHTML = renderInlineCell(headers[c], resolve);

    if (model.isLive) {
      th.setAttribute("contenteditable", "plaintext-only");
      try {
        th.contentEditable = "plaintext-only";
      } catch {
        // fallback for non-compliant DOM engines
      }
      th.dataset.row = "0";
      th.dataset.col = String(c);
      th.dataset.raw = headers[c];
      setupCellEvents(th, 0, c);
    }
    headerTr.appendChild(th);
  }

  // Trailing ghost column header (Live Preview only)
  if (model.isLive) {
    const ghostColTh = document.createElement("th");
    ghostColTh.className =
      "cm-table-ghost-col-cell cm-table-ghost-col-th cm-table-add-col-th";
    headerTr.appendChild(ghostColTh);
  }
  thead.appendChild(headerTr);
  table.appendChild(thead);

  // <tbody>
  const tbody = document.createElement("tbody");
  for (let r = 0; r < body.length; r++) {
    const bodyTr = document.createElement("tr");
    if (r % 2 === 1) bodyTr.className = "cm-table-row-alt";

    for (let c = 0; c < headers.length; c++) {
      const td = document.createElement("td");
      const a = alignments[c] ?? "none";
      if (a === "left") td.style.textAlign = "left";
      else if (a === "center") td.style.textAlign = "center";
      else if (a === "right") td.style.textAlign = "right";

      if (c === headers.length - 1) {
        td.classList.add("cm-table-col-last");
      }
      if (r === body.length - 1) {
        td.classList.add("cm-table-row-last");
      }

      const cellText = body[r]?.[c] ?? "";
      td.innerHTML = renderInlineCell(cellText, resolve);

      if (model.isLive) {
        td.setAttribute("contenteditable", "plaintext-only");
        try {
          td.contentEditable = "plaintext-only";
        } catch {
          // fallback for non-compliant DOM engines
        }
        td.dataset.row = String(r + 1);
        td.dataset.col = String(c);
        td.dataset.raw = cellText;
        setupCellEvents(td, r + 1, c);
      }
      bodyTr.appendChild(td);
    }

    if (model.isLive) {
      const ghostColTd = document.createElement("td");
      ghostColTd.className =
        "cm-table-ghost-col-cell cm-table-ghost-col-td cm-table-add-col-td";
      bodyTr.appendChild(ghostColTd);
    }
    tbody.appendChild(bodyTr);
  }

  // Trailing ghost row with matching cell divisions (Live Preview only)
  if (model.isLive) {
    const ghostRowTr = document.createElement("tr");
    ghostRowTr.className = "cm-table-ghost-row cm-table-add-row-tr";
    for (let c = 0; c < headers.length; c++) {
      const ghostRowCell = document.createElement("td");
      ghostRowCell.className = "cm-table-ghost-row-cell";
      ghostRowTr.appendChild(ghostRowCell);
    }
    // Corner cell for intersection with ghost column
    const ghostCornerCell = document.createElement("td");
    ghostCornerCell.className =
      "cm-table-ghost-row-cell cm-table-ghost-corner-cell cm-table-add-row-td";
    ghostRowTr.appendChild(ghostCornerCell);
    tbody.appendChild(ghostRowTr);
  }

  table.appendChild(tbody);

  return { table, thead };
}
