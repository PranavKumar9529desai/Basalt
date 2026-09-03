/**
 * Tier 2 — preview handler tests for `src/preview/headings.ts`
 * (`handleHeadingNode`, `handleHeading7Lines`).
 *
 * `handleHeadingNode`:
 *   - Maps ATXHeading{1..7} / SetextHeading{1,2} to `cm-live-heading-N` on the
 *     whole starting line (HEADING_CLASS table).
 *   - Returns true only for recognized heading node names.
 *
 * `handleHeading7Lines`:
 *   - Scans visible lines for the 7-hash heading (not supported by Lezer).
 *   - Skips lines inside code-block ranges.
 *   - Hides the `####### ` marker (cm-live-hide) UNLESS the line is the active
 *     line (the one the cursor is on).
 */
import { describe, expect, it } from "vitest";
import {
  handleHeadingNode,
  handleHeading7Lines,
} from "../../src/preview/headings";
import { makeContext, makeUnfocusedContext } from "../_helpers/mock-context";
import { makeCollector } from "../_helpers/mock-collector";
import type { SyntaxNodeRef } from "@lezer/common";

function nodeRef(from: number, to: number, name: string): SyntaxNodeRef {
  return { from, to, type: { name } as SyntaxNodeRef["type"] } as SyntaxNodeRef;
}

describe("handleHeadingNode", () => {
  it.each([
    ["ATXHeading1", "cm-live-heading-1"],
    ["ATXHeading2", "cm-live-heading-2"],
    ["ATXHeading3", "cm-live-heading-3"],
    ["ATXHeading4", "cm-live-heading-4"],
    ["ATXHeading5", "cm-live-heading-5"],
    ["ATXHeading6", "cm-live-heading-6"],
    ["ATXHeading7", "cm-live-heading-7"],
    ["SetextHeading1", "cm-live-heading-1"],
    ["SetextHeading2", "cm-live-heading-2"],
  ])("maps %s -> %s on the line start", (nodeName, className) => {
    const { ctx } = makeContext("x\ny\nz", { headPos: 3 });
    const collector = makeCollector();
    // Node at offset 3 (start of line 2)
    const handled = handleHeadingNode(nodeRef(3, 12, nodeName), ctx, collector);
    expect(handled).toBe(true);
    // addLineClass uses line.from -> line 2 starts at offset 3 (after "x\n")
    expect(collector.lines).toEqual([{ pos: ctx.state.doc.lineAt(3).from, className }]);
  });

  it("returns false for a non-heading node", () => {
    const { ctx } = makeContext("hello");
    const collector = makeCollector();
    const handled = handleHeadingNode(nodeRef(0, 5, "Paragraph"), ctx, collector);
    expect(handled).toBe(false);
    expect(collector.lines).toHaveLength(0);
  });

  it("applies the class to the full line the heading node starts on", () => {
    const { ctx } = makeContext("before\n# Title\nmore", { headPos: 10 });
    // heading node starts at index of "#"
    const headingStart = ctx.state.doc.line(2).from; // line 2
    const collector = makeCollector();
    handleHeadingNode(nodeRef(headingStart, 12, "ATXHeading1"), ctx, collector);
    expect(collector.lines).toEqual([
      { pos: ctx.state.doc.line(2).from, className: "cm-live-heading-1" },
    ]);
  });
});

describe("handleHeading7Lines", () => {
  it("marks a 7-hash heading line and hides its marker when not active", () => {
    const { ctx } = makeContext("####### deep\nbody", { headPos: 14 }); // cursor in body (line 2)
    const collector = makeCollector();
    handleHeading7Lines(0, ctx.state.doc.length, ctx, collector);
    expect(collector.lines).toEqual([
      { pos: 0, className: "cm-live-heading-7" },
    ]);
    // marker "####### " is 8 chars: from 0 to 8
    expect(collector.marks).toEqual([
      { from: 0, to: 8, className: "cm-live-hide" },
    ]);
  });

  it("does NOT hide the marker on the active heading line", () => {
    const { ctx } = makeContext("####### deep\nbody", { headPos: 3 }); // cursor inside heading
    const collector = makeCollector();
    handleHeading7Lines(0, ctx.state.doc.length, ctx, collector);
    expect(collector.lines).toEqual([{ pos: 0, className: "cm-live-heading-7" }]);
    // no hide mark because it's the active line
    expect(collector.marks).toHaveLength(0);
  });

  it("skips 7-hash lines inside code blocks", () => {
    const codeBlockRanges = [{ from: 0, to: 20 }];
    const { ctx } = makeContext("####### deep", { headPos: 0, codeBlockRanges });
    const collector = makeCollector();
    handleHeading7Lines(0, ctx.state.doc.length, ctx, collector);
    expect(collector.lines).toHaveLength(0);
  });

  it("ignores an active line with fewer than 7 hashes", () => {
    const { ctx } = makeContext("###### not-seven", { headPos: 0 });
    const collector = makeCollector();
    handleHeading7Lines(0, ctx.state.doc.length, ctx, collector);
    expect(collector.lines).toHaveLength(0);
    expect(collector.marks).toHaveLength(0);
  });
});

describe("handleHeading7Lines unfocused", () => {
  it("hides the marker even when the heading is not focused (activeLine null)", () => {
    const { ctx } = makeUnfocusedContext("####### deep");
    const collector = makeCollector();
    handleHeading7Lines(0, ctx.state.doc.length, ctx, collector);
    expect(collector.lines).toEqual([{ pos: 0, className: "cm-live-heading-7" }]);
    expect(collector.marks).toEqual([{ from: 0, to: 8, className: "cm-live-hide" }]);
  });
});
