/**
 * Tier 2 — preview handler test for `src/preview/blockquotes.ts`
 * (`handleBlockquoteNode`).
 *
 * Behavior contract:
 *  - Only `Blockquote` node names are handled (returns true).
 *  - Adds `cm-live-blockquote` line class to every line spanned by the
 *    blockquote, clipped to the visible build range [rangeFrom..rangeTo].
 */
import { describe, expect, it } from "vitest";
import { handleBlockquoteNode } from "../../src/preview/blockquotes";
import { makeContext } from "../_helpers/mock-context";
import { makeCollector } from "../_helpers/mock-collector";
import type { SyntaxNodeRef } from "@lezer/common";

function nodeRef(from: number, to: number, name: string): SyntaxNodeRef {
  return { from, to, type: { name } as SyntaxNodeRef["type"] } as SyntaxNodeRef;
}

describe("handleBlockquoteNode", () => {
  it("adds cm-live-blockquote to every line of a multi-line blockquote", () => {
    const doc = "> line one\n> line two\nplain";
    const { ctx, state } = makeContext(doc, { headPos: 20 });
    const collector = makeCollector();
    // Blockquote node spans the two "> " lines
    const handled = handleBlockquoteNode(
      nodeRef(0, 19, "Blockquote"),
      0,
      state.doc.length,
      ctx,
      collector,
    );
    expect(handled).toBe(true);
    expect(collector.lines).toEqual([
      { pos: state.doc.line(1).from, className: "cm-live-blockquote" },
      { pos: state.doc.line(2).from, className: "cm-live-blockquote" },
    ]);
  });

  it("clips to the visible range (rangeFrom/rangeTo)", () => {
    const doc = "> line one\n> line two\nplain";
    const { ctx, state } = makeContext(doc, { headPos: 20 });
    const collector = makeCollector();
    // Only the second quote line is in the visible range [11..19]
    handleBlockquoteNode(
      nodeRef(0, 19, "Blockquote"),
      11,
      19,
      ctx,
      collector,
    );
    expect(collector.lines).toEqual([
      { pos: state.doc.line(2).from, className: "cm-live-blockquote" },
    ]);
  });

  it("adds a single class for a single-line blockquote", () => {
    const doc = "> just one";
    const { ctx, state } = makeContext(doc, { headPos: 0 });
    const collector = makeCollector();
    handleBlockquoteNode(nodeRef(0, 10, "Blockquote"), 0, 10, ctx, collector);
    expect(collector.lines).toEqual([
      { pos: state.doc.line(1).from, className: "cm-live-blockquote" },
    ]);
  });

  it("returns false and adds nothing for a non-blockquote node", () => {
    const { ctx } = makeContext("plain");
    const collector = makeCollector();
    const handled = handleBlockquoteNode(nodeRef(0, 5, "Paragraph"), 0, 5, ctx, collector);
    expect(handled).toBe(false);
    expect(collector.lines).toHaveLength(0);
  });
});
