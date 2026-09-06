/**
 * Table cell navigation (editor table interactions — Phase 1).
 *
 * Tab/Shift-Tab/Enter move the cursor between cells of a native markdown table
 * in the raw source, wrapping rows and appending a new row at the table's end.
 * Mirrors Obsidian's Advanced Tables behavior.
 */
import { afterEach, describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Table } from "@lezer/markdown";
import {
  tableNavigationKeymap,
  tabForward,
  tabBackward,
  enterInTable,
} from "../src/input/table-navigation";

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect;
}

// Table (Lezer tree):
//   TableHeader [0,9]: pipes [0, 4, 8]  — cell A=[1,3], cell B=[5,7]
//   TableDelimiter [10,18]
//   TableRow [20,28]:  pipes [20, 24, 28] — cell 1=[21,23], cell 2=[25,27]
const DOC = "| A | B |\n|---|---|\n| 1 | 2 |";

function buildView(doc: string, pos: number) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: pos },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [Table] }),
        keymap.of(tableNavigationKeymap),
      ],
    }),
    parent,
  });
  return { view, parent };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("tabForward", () => {
  it("moves to the next cell in the same row", () => {
    const { view } = buildView(DOC, 2); // in "A"
    expect(tabForward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(5); // start of "B"
  });

  it("wraps to the first cell of the next row", () => {
    const { view } = buildView(DOC, 6); // in "B"
    expect(tabForward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(21); // first cell of body row
  });

  it("appends a new row from the last cell of the last row", () => {
    const { view } = buildView(DOC, 26); // in "2"
    expect(tabForward(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n|---|---|\n| 1 | 2 |\n|  |  |",
    );
    expect(view.state.selection.main.head).toBe(31); // first cell of new row
  });

  it("returns false outside a table", () => {
    const { view } = buildView("plain text", 4);
    expect(tabForward(view)).toBe(false);
    expect(view.state.selection.main.head).toBe(4);
  });
});

describe("tabBackward", () => {
  it("moves to the previous cell in the same row", () => {
    const { view } = buildView(DOC, 26); // in "2"
    expect(tabBackward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(21); // first cell of body row
  });

  it("wraps to the last cell of the previous row", () => {
    const { view } = buildView(DOC, 22); // in "1" (first cell of body row)
    expect(tabBackward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(5); // "B" (last cell of header)
  });

  it("is a no-op at the first cell of the first row", () => {
    const { view } = buildView(DOC, 2); // in "A"
    expect(tabBackward(view)).toBe(false);
    expect(view.state.selection.main.head).toBe(2);
  });
});

describe("enterInTable", () => {
  it("appends a new row from the last cell of the last row", () => {
    const { view } = buildView(DOC, 26); // in "2"
    expect(enterInTable(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "| A | B |\n|---|---|\n| 1 | 2 |\n|  |  |",
    );
    expect(view.state.selection.main.head).toBe(31);
  });

  it("falls through (false) mid-table, preserving multiline editing", () => {
    const { view } = buildView(DOC, 2); // in "A" — header row
    expect(enterInTable(view)).toBe(false);
    expect(view.state.selection.main.head).toBe(2);
  });

  it("falls through (false) at the last cell of a non-last row", () => {
    const { view } = buildView(DOC, 6); // in "B" — last cell of header
    expect(enterInTable(view)).toBe(false);
    expect(view.state.selection.main.head).toBe(6);
  });
});

describe("keymap integration", () => {
  it("handles a Tab keydown through the registered keymap", () => {
    const { view } = buildView(DOC, 2); // in "A"
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(view.state.selection.main.head).toBe(5); // start of "B"
  });
});
