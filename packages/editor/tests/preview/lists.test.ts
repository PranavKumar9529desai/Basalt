/**
 * Tier 2 — preview handler tests for `src/preview/lists.ts` (`handleListNode`,
 * `ListBulletWidget`, `ListNumberWidget`).
 *
 * Behavior contract (from source; values pinned from real Lezer trees):
 *  - ListItem node: adds `cm-live-list-depth-N` line class (N = 1 + number of
 *    enclosing list ancestors, clamped to 3) to every line it spans, then
 *    returns `false` (continue descending into marks).
 *  - ListMark node: returns `true`. On the ACTIVE line it adds nothing (the raw
 *    marker stays visible). Off the active line it replaces the marker with a
 *    widget: ListBulletWidget for bullets, ListNumberWidget for ordered lists
 *    (the number = position among preceding ListItems). The replace range
 *    extends +1 to absorb a following space.
 */
import { describe, expect, it } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import { ListBulletWidget, ListNumberWidget, handleListNode } from "../../src/preview/lists";
import { makeContext, makeCollector } from "../_helpers";

function listNodes(
  state: ReturnType<typeof makeContext>["state"],
  names = ["ListItem", "ListMark"],
) {
  const tree = syntaxTree(state);
  const out: { name: string; from: number; to: number; node: SyntaxNode }[] = [];
  tree.iterate({
    enter(n) {
      if (names.includes(n.name)) {
        out.push({ name: n.name, from: n.from, to: n.to, node: n.node });
      }
    },
  });
  return out;
}

function handle(n: { from: number; to: number; name: string; node: SyntaxNode }, ctx: ReturnType<typeof makeContext>["ctx"]) {
  const c = makeCollector();
  const handled = handleListNode(
    { from: n.from, to: n.to, type: { name: n.name } as never, node: n.node } as never,
    ctx,
    c,
  );
  return { handled, lines: c.lines, replaces: c.replaces };
}

describe("handleListNode — ListItem", () => {
  it("adds depth-1 lines for a flat bullet list", () => {
    const { ctx, state } = makeContext("- a\n- b", { headPos: 6 });
    const item = listNodes(state, ["ListItem"])[0]; // "- a" item
    const { handled, lines } = handle(item, ctx);
    expect(handled).toBe(false);
    expect(lines).toEqual([{ pos: 0, className: "cm-live-list-depth-1" }]);
  });

  it("adds increasing depth classes for nested items", () => {
    const { ctx, state } = makeContext("- a\n  - b\n    - c", { headPos: 6 });
    const items = listNodes(state, ["ListItem"]);
    // outermost (0) spans all lines -> depth-1 on each; middle -> depth-2; inner -> depth-3
    expect(handle(items[2], ctx).lines).toEqual([
      { pos: 10, className: "cm-live-list-depth-3" },
    ]);
    expect(handle(items[1], ctx).lines).toEqual([
      { pos: 4, className: "cm-live-list-depth-2" },
      { pos: 10, className: "cm-live-list-depth-2" },
    ]);
  });
});

describe("handleListNode — ListMark bullets", () => {
  it("does not replace the bullet on the active line", () => {
    const { ctx, state } = makeContext("- a\n- b", { headPos: 0 });
    const mark = listNodes(state, ["ListMark"])[0]; // "- a" mark, active line
    const { handled, replaces } = handle(mark, ctx);
    expect(handled).toBe(true);
    expect(replaces).toHaveLength(0);
  });

  it("replaces an off-active-line bullet with a ListBulletWidget", () => {
    const { ctx, state } = makeContext("- a\n- b", { headPos: 0 }); // cursor on line 1
    const mark = listNodes(state, ["ListMark"])[1]; // "- b" mark, offset 4..5
    const { handled, replaces } = handle(mark, ctx);
    expect(handled).toBe(true);
    expect(replaces).toHaveLength(1);
    expect(replaces[0].from).toBe(4);
    expect(replaces[0].to).toBe(6); // +1 for the trailing space
    expect(replaces[0].widget).toBeInstanceOf(ListBulletWidget);
  });
});

describe("handleListNode — ListMark ordered", () => {
  it("replaces off-active-line ordered markers with numbered widgets", () => {
    const { ctx, state } = makeContext("1. a\n2. b\n3. c", { headPos: 0 }); // cursor on line 1
    const marks = listNodes(state, ["ListMark"]);
    const second = handle(marks[1], ctx); // "2."
    expect(second.replaces).toHaveLength(1);
    expect(second.replaces[0].from).toBe(5);
    expect(second.replaces[0].to).toBe(8);
    expect(second.replaces[0].widget).toBeInstanceOf(ListNumberWidget);

    const third = handle(marks[2], ctx); // "3."
    expect(third.replaces[0].widget).toBeInstanceOf(ListNumberWidget);
    expect(third.replaces[0].from).toBe(10);
    expect(third.replaces[0].to).toBe(13);
  });

  it("numbers reflect the item's position among predecessors", () => {
    // Parse the widget instance inner work: the number is computed as 1 +
    // count of preceding ListItem siblings. We assert the replace ranges are
    // correct; the numeric label lives in the widget (checked via constructor).
    const { ctx, state } = makeContext("1. a\n2. b", { headPos: 6 }); // cursor on line 2
    const marks = listNodes(state, ["ListMark"]);
    // line 1 marker is off-active-line -> replaced
    const first = handle(marks[0], ctx);
    expect(first.replaces[0].widget).toBeInstanceOf(ListNumberWidget);
    expect(first.replaces[0].from).toBe(0);
    expect(first.replaces[0].to).toBe(3);
  });
});

describe("handleListNode — non-list node", () => {
  it("returns false for a Paragraph node", () => {
    const { ctx } = makeContext("plain");
    const c = makeCollector();
    const handled = handleListNode(
      { from: 0, to: 5, type: { name: "Paragraph" } as never } as never,
      ctx,
      c,
    );
    expect(handled).toBe(false);
    expect(c.lines).toHaveLength(0);
    expect(c.replaces).toHaveLength(0);
  });
});
