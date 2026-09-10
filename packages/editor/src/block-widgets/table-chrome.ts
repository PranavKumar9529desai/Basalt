import { EditorView } from "@codemirror/view";
import { createCodeToggleButton } from "./code-toggle-button";
import { setTableRawMode } from "./table-state";
import type { TableBlockModel } from "./table-parse";
import type { TableRenderCallbacks } from "./table-render";

// ---------------------------------------------------------------------------
// Table interactive chrome — code toggle button, ghost column/row "+" buttons
// and hover labels, and the mutually-exclusive col/row zone tracking.
//
// Split out of table-widget.ts (Live Preview only): the widget owns lifecycle
// + commits; this file owns the hover/zone presentation on top of the table
// built by table-render.ts.
// ---------------------------------------------------------------------------

/**
 * Append the Live Preview interactive chrome to `container`: code-toggle
 * button (top-right), ghost column "+" button + label (right edge), ghost row
 * "+" button + label (bottom edge), and the zone tracker that highlights the
 * correct ghost edge on hover.
 */
export function buildInteractiveChrome(
  model: TableBlockModel,
  view: EditorView | undefined,
  container: HTMLElement,
  table: HTMLElement,
  thead: HTMLElement,
  cbs: TableRenderCallbacks,
): void {
  // 1. Top-Right Code Toggle Button (Live Preview only)
  let codeBtn: HTMLElement | undefined;
  if (model.isLive && view) {
    codeBtn = createCodeToggleButton(
      view,
      (v) => {
        const lineFrom = v.state.doc.lineAt(model.from).from;
        const lineTo = v.state.doc.lineAt(model.to).to;
        v.dispatch({
          effects: setTableRawMode.of({ from: lineFrom, to: lineTo }),
          selection: { anchor: model.from },
        });
      },
      { className: "cm-table-btn-code" },
    );
  }
  if (codeBtn) {
    container.appendChild(codeBtn);
  }

  // Ghost column "+" button & hover label
  const addColBtn = document.createElement("button");
  addColBtn.className = "cm-table-ghost-btn-col cm-table-add-col-btn";
  addColBtn.type = "button";
  addColBtn.setAttribute("aria-label", "Add column to the right");
  addColBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

  const colLabel = document.createElement("div");
  colLabel.className = "cm-table-ghost-label-col";
  colLabel.textContent = "Add column to the right";

  addColBtn.addEventListener("mouseenter", () =>
    colLabel.classList.add("visible"),
  );
  addColBtn.addEventListener("mouseleave", () =>
    colLabel.classList.remove("visible"),
  );
  addColBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cbs.onAddColumn();
  });

  // Ghost row "+" button & hover label
  const addRowBtn = document.createElement("button");
  addRowBtn.className = "cm-table-ghost-btn-row cm-table-add-row-btn";
  addRowBtn.type = "button";
  addRowBtn.setAttribute("aria-label", "Add row below");
  addRowBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

  const rowLabel = document.createElement("div");
  rowLabel.className = "cm-table-ghost-label-row";
  rowLabel.textContent = "Add row below";

  addRowBtn.addEventListener("mouseenter", () =>
    rowLabel.classList.add("visible"),
  );
  addRowBtn.addEventListener("mouseleave", () =>
    rowLabel.classList.remove("visible"),
  );
  addRowBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cbs.onAddRow();
  });

  container.appendChild(addColBtn);
  container.appendChild(colLabel);
  container.appendChild(addRowBtn);
  container.appendChild(rowLabel);

  // Zone tracking: "none" | "col" | "row" (mutually exclusive)
  let currentZone: "none" | "col" | "row" = "none";

  const setZone = (zone: "none" | "col" | "row") => {
    if (currentZone === zone) return;
    currentZone = zone;
    if (zone === "col") {
      container.classList.add("cm-zone-col-active");
      container.classList.remove("cm-zone-row-active");
    } else if (zone === "row") {
      container.classList.add("cm-zone-row-active");
      container.classList.remove("cm-zone-col-active");
    } else {
      container.classList.remove("cm-zone-col-active");
      container.classList.remove("cm-zone-row-active");
    }
  };

  container.addEventListener("mousemove", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 0. Source code button — hovering code toggle must never activate ghost col/row
    if (target.closest(".cm-table-btn-code")) {
      setZone("none");
      return;
    }

    // 1. Directly over or inside col button / label / ghost col cell
    if (
      target.closest(
        ".cm-table-ghost-btn-col, .cm-table-ghost-label-col, .cm-table-ghost-col-cell",
      )
    ) {
      setZone("col");
      return;
    }

    // 2. Directly over or inside row button / label / ghost row
    if (
      target.closest(
        ".cm-table-ghost-btn-row, .cm-table-ghost-label-row, .cm-table-ghost-row, .cm-table-ghost-row-cell",
      )
    ) {
      setZone("row");
      return;
    }

    // 3. Over a cell in the table
    const cell = target.closest("th, td") as HTMLElement | null;
    if (cell && table.contains(cell)) {
      // Never trigger ghost row/col from the header row — keeps header stable and clean
      if (cell.tagName.toLowerCase() === "th") {
        setZone("none");
        return;
      }

      const isLastCol = cell.classList.contains("cm-table-col-last");
      const isLastRow = cell.classList.contains("cm-table-row-last");

      if (isLastCol && isLastRow) {
        const rect = cell.getBoundingClientRect();
        const distToRight = rect.right - e.clientX;
        const distToBottom = rect.bottom - e.clientY;
        setZone(distToRight < distToBottom ? "col" : "row");
        return;
      } else if (isLastCol) {
        setZone("col");
        return;
      } else if (isLastRow) {
        setZone("row");
        return;
      } else {
        setZone("none");
        return;
      }
    }

    // 4. In padding/outer zone of container
    const tableRect = table.getBoundingClientRect();
    const theadEl = thead.getBoundingClientRect();

    // Right-side zone: only below the header row (never in the header band where codeBtn is)
    if (
      e.clientY > theadEl.bottom &&
      e.clientY <= tableRect.bottom + 24 &&
      e.clientX >= tableRect.right - 28
    ) {
      setZone("col");
    } else if (
      e.clientY >= tableRect.bottom - 4 &&
      e.clientX >= tableRect.left &&
      e.clientX <= tableRect.right + 24
    ) {
      setZone("row");
    } else {
      setZone("none");
    }
  });

  container.addEventListener("mouseleave", () => {
    setZone("none");
    colLabel.classList.remove("visible");
    rowLabel.classList.remove("visible");
  });
}
