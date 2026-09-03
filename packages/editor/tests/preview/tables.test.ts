/**
 * Tier 2 — preview handler tests for `src/preview/tables.ts` (`handleTableNode`).
 *
 * Behavior contract (from source):
 *  - Only `Table` node names are handled (returns true).
 *  - Iterates the direct children of the Table node:
 *      * TableDelimiter child -> `cm-live-table` + `cm-live-table-delimiter`.
 *      * TableRow child       -> `cm-live-table`; the FIRST TableRow also gets
 *        `cm-live-table-header`.
 *    (Note: the TableHeader child is not classified — observed real behavior,
 *    pinned here.)
 *  - Non-Table nodes return false and add nothing.
 */
import { describe, expect, it } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import { handleTableNode } from "../../src/preview/tables";
import { makeContext, makeCollector } from "../_helpers";

/** Find the first Table syntax node in the doc and return it as a SyntaxNodeRef. */
function tableRef(state: ReturnType<typeof makeContext>["state"]): SyntaxNode | null {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = null;
  tree.iterate({
    enter(n) {
      if (n.name === "Table") {
        node = n.node;
        return false;
      }
    },
  });
  return node;
}

describe("handleTableNode", () => {
  it("marks the delimiter and first table row with the expected line classes", () => {
    const doc = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { ctx, state } = makeContext(doc);
    const node = tableRef(state);
    expect(node).not.toBeNull();
    const collector = makeCollector();
    const handled = handleTableNode(
      { from: node!.from, to: node!.to, type: { name: "Table" } as never, node: node as never } as never,
      ctx,
      collector,
    );
    expect(handled).toBe(true);
    const delimRow = state.doc.line(2).from; // "|---|---|"
    const firstRow = state.doc.line(3).from; // "| 1 | 2 |"
    expect(collector.lines).toEqual([
      { pos: delimRow, className: "cm-live-table" },
      { pos: delimRow, className: "cm-live-table-delimiter" },
      { pos: firstRow, className: "cm-live-table" },
      { pos: firstRow, className: "cm-live-table-header" },
    ]);
  });

  it("returns false and adds nothing for a non-Table node", () => {
    const { ctx } = makeContext("plain text");
    const collector = makeCollector();
    const handled = handleTableNode(
      { from: 0, to: 5, type: { name: "Paragraph" } as never } as never,
      ctx,
      collector,
    );
    expect(handled).toBe(false);
    expect(collector.lines).toHaveLength(0);
  });
});
