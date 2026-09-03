/**
 * Tier 2 — preview handler tests for `src/preview/callouts.ts`
 * (`handleCalloutNode`, `CalloutHeaderWidget`).
 *
 * Behavior contract (from source; values pinned from real trees):
 *  - Only `Blockquote` nodes are considered; the first line must match
 *    `CALLOUT_RE = /^>\s*\[!([a-zA-Z]+)\]([+-]?)(?:\s+(.*))?$/`.
 *  - On a callout:
 *      * `hasCursor` is true when the head is within the FIRST line.
 *      * Every callout line gets `cm-live-callout` + `cm-live-callout-<canonical>`
 *        line classes UNLESS `!hasCursor`, in which case the first line is
 *        skipped (it is replaced by the header widget; CM can't stack a
 *        line decoration and a block replace on the same position).
 *      * When `!hasCursor`, the first line is replaced with a
 *        `CalloutHeaderWidget`.
 *  - Non-callout blockquotes and non-Blockquote nodes return false.
 */
import { describe, expect, it } from "vitest";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { CalloutHeaderWidget, handleCalloutNode } from "../../src/preview/callouts";
import { makeContext, makeCollector } from "../_helpers";

function firstCalloutNode(
  state: ReturnType<typeof makeContext>["state"],
): SyntaxNode | null {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = null;
  tree.iterate({
    enter(n) {
      if (n.name === "Blockquote") {
        node = n.node;
        return false;
      }
    },
  });
  return node;
}

function run(doc: string, headPos: number) {
  const { ctx, state } = makeContext(doc, { headPos });
  const node = firstCalloutNode(state);
  expect(node).not.toBeNull();
  const c = makeCollector();
  const ref: never = {
    from: node!.from,
    to: node!.to,
    type: { name: "Blockquote" },
    node,
  } as never;
  const handled = handleCalloutNode(ref, ctx, c);
  return { handled, lines: c.lines, replaces: c.replaces };
}

describe("handleCalloutNode", () => {
  it("keeps the callout raw and classes all lines when the cursor is on the first line", () => {
    const doc = "> [!note] Title\n> body line";
    const { handled, lines, replaces } = run(doc, 2);
    expect(handled).toBe(true);
    expect(replaces).toHaveLength(0);
    expect(lines).toEqual([
      { pos: 0, className: "cm-live-callout" },
      { pos: 0, className: "cm-live-callout-note" },
      { pos: 16, className: "cm-live-callout" },
      { pos: 16, className: "cm-live-callout-note" },
    ]);
  });

  it("replaces the first line with a header widget when the cursor is on a body line", () => {
    const doc = "> [!note] Title\n> body line";
    const { handled, lines, replaces } = run(doc, 20);
    expect(handled).toBe(true);
    expect(replaces).toHaveLength(1);
    expect(replaces[0].from).toBe(0);
    expect(replaces[0].to).toBe(15); // first line text "> [!note] Title"
    expect(replaces[0].widget).toBeInstanceOf(CalloutHeaderWidget);
    // first line skipped for line classes; only the body line is classed
    expect(lines).toEqual([
      { pos: 16, className: "cm-live-callout" },
      { pos: 16, className: "cm-live-callout-note" },
    ]);
  });

  it("resolves the canonical class from a non-default callout type", () => {
    const doc = "> [!warning] Danger";
    const { handled, lines } = run(doc, 5);
    expect(handled).toBe(true);
    const classes = lines.map((l) => l.className);
    expect(classes).toContain("cm-live-callout-warning");
    expect(classes).toContain("cm-live-callout");
  });

  it("renders a header widget for an off-first-line cursor on a multi-line callout", () => {
    const doc = "> [!warning] Danger\n> lines\n> here";
    const { replaces } = run(doc, 30); // cursor on last line (> here)
    expect(replaces).toHaveLength(1);
    expect(replaces[0].widget).toBeInstanceOf(CalloutHeaderWidget);
  });

  it("returns false for a blockquote that is not a callout", () => {
    const { handled, lines, replaces } = run("> plain quote", 5);
    expect(handled).toBe(false);
    expect(lines).toHaveLength(0);
    expect(replaces).toHaveLength(0);
  });

  it("handles the bare `> [!tip]` marker with the cursor off the first line", () => {
    // "body" is a lazy blockquote continuation; cursor on it => warn widget replaces
    // the marker line and the body line is styled.
    const doc = "> [!tip]\nbody";
    const { handled, replaces, lines } = run(doc, doc.length - 1);
    expect(handled).toBe(true);
    expect(replaces).toHaveLength(1);
    expect(replaces[0].widget).toBeInstanceOf(CalloutHeaderWidget);
    expect(lines).toEqual([
      { pos: 9, className: "cm-live-callout" },
      { pos: 9, className: "cm-live-callout-tip" },
    ]);
  });
});
