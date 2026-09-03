/**
 * Tier 2 — preview handler tests for `src/preview/mark-hiding.ts`
 * (`handleMarkHidingNode`).
 *
 * Behavior contract (from source):
 *  - HIDE_MARKS = { HeaderMark, QuoteMark, LinkMark, EmphasisMark, CodeMark,
 *    WikiLinkMark, HighlightMark, StrikethroughMark }.
 *  - On the ACTIVE (focused) line: mark the marker as muted
 *    (cm-live-block-mark for HeaderMark/QuoteMark incl. trailing space;
 *    cm-live-inline-mark for the rest).
 *  - On any NON-active line: hide the marker (cm-live-hide); HeaderMark and
 *    QuoteMark also absorb the trailing space.
 */
import { describe, expect, it } from "vitest";
import { HIDE_MARKS, handleMarkHidingNode } from "../../src/preview/mark-hiding";
import { makeContext, makeUnfocusedContext } from "../_helpers/mock-context";
import { makeCollector } from "../_helpers/mock-collector";
import type { SyntaxNodeRef } from "@lezer/common";

function nodeRef(from: number, to: number, name: string): SyntaxNodeRef {
  return { from, to, type: { name } as SyntaxNodeRef["type"] } as SyntaxNodeRef;
}

describe("HIDE_MARKS", () => {
  it("contains the expected marker node types", () => {
    expect([...HIDE_MARKS].sort()).toEqual([
      "CodeMark",
      "EmphasisMark",
      "HeaderMark",
      "HighlightMark",
      "LinkMark",
      "QuoteMark",
      "StrikethroughMark",
      "WikiLinkMark",
    ]);
  });
});

describe("handleMarkHidingNode on the active line", () => {
  it("mutes the HeaderMark and its trailing space (cm-live-block-mark)", () => {
    // doc: "#Headers" ; HeaderMark = "#" at 0..1, trailing space at 1
    const { ctx } = makeContext("# Headers", { headPos: 0 });
    const collector = makeCollector();
    const handled = handleMarkHidingNode(nodeRef(0, 1, "HeaderMark"), ctx, collector);
    expect(handled).toBe(true);
    // skipTrailingSpaces extends to index 2 (the space)
    expect(collector.marks).toEqual([{ from: 0, to: 2, className: "cm-live-block-mark" }]);
  });

  it("mutes the QuoteMark and its trailing space", () => {
    const { ctx } = makeContext("> quote", { headPos: 2 });
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 1, "QuoteMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 2, className: "cm-live-block-mark" }]);
  });

  it("mutes an inline marker without trailing space (cm-live-inline-mark)", () => {
    // Active line, EmphasisMark "*" at 0..1
    const { ctx } = makeContext("*text*", { headPos: 0 });
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 1, "EmphasisMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 1, className: "cm-live-inline-mark" }]);
  });

  it("mutes a LinkMark / CodeMark the same way", () => {
    const { ctx } = makeContext("[a](b)", { headPos: 0 });
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 1, "LinkMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 1, className: "cm-live-inline-mark" }]);
  });
});

describe("handleMarkHidingNode on a non-active line", () => {
  it("hides the HeaderMark and trailing space (cm-live-hide)", () => {
    // cursor on line 2 (offset 10) -> line 1 is not active
    const { ctx } = makeContext("# Headers\nbody", { headPos: 10 });
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 1, "HeaderMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 2, className: "cm-live-hide" }]);
  });

  it("hides a QuoteMark and its trailing space", () => {
    const { ctx } = makeContext("> quote\nbody", { headPos: 10 });
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 1, "QuoteMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 2, className: "cm-live-hide" }]);
  });

  it("hides an inline marker without trailing space", () => {
    const { ctx } = makeContext("**bold**\nbody", { headPos: 10 });
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 2, "EmphasisMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 2, className: "cm-live-hide" }]);
  });
});

describe("handleMarkHidingNode unfocused", () => {
  it("hides markers when the editor is unfocused (activeLine null)", () => {
    const { ctx } = makeUnfocusedContext("# heading");
    const collector = makeCollector();
    handleMarkHidingNode(nodeRef(0, 1, "HeaderMark"), ctx, collector);
    expect(collector.marks).toEqual([{ from: 0, to: 2, className: "cm-live-hide" }]);
  });
});

describe("handleMarkHidingNode non-marker", () => {
  it("returns false and adds nothing for non-marker nodes", () => {
    const { ctx } = makeContext("plain");
    const collector = makeCollector();
    const handled = handleMarkHidingNode(nodeRef(0, 5, "Paragraph"), ctx, collector);
    expect(handled).toBe(false);
    expect(collector.marks).toHaveLength(0);
  });
});
