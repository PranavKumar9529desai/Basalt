/**
 * Tier 2 — preview handler tests for `src/preview/inline-marks.ts`
 * (`handleInlineNode`, `handleTagsInLine`).
 *
 * `handleInlineNode` dispatches on Lezer node names and adds mark decorations:
 *   InlineCode -> cm-live-inline-code (handled, no descend)
 *   WikiLink   -> cm-live-wikilink  (handled, no descend)
 *   Highlight  -> cm-live-highlight (handled, no descend)
 *   Strikethrough -> cm-live-strikethrough (handled, no descend)
 *   HTMLTag    -> cm-live-html-tag  (handled, no descend)
 *   StrongEmphasis -> cm-live-strong (returns false to descend)
 *   Emphasis   -> cm-live-em        (returns false to descend)
 *   anything else -> false, no marks
 */
import { describe, expect, it } from "vitest";
import { handleInlineNode, handleTagsInLine } from "../../src/preview/inline-marks";
import { makeCollector } from "../_helpers/mock-collector";
import { parseMarkdown } from "../_helpers/parse-markdown";
import type { SyntaxNodeRef } from "@lezer/common";

/** Get the first descendant node of a given type from a parsed doc. */
function firstNode(
  type: ReturnType<typeof parseMarkdown>["tree"],
  name: string,
): SyntaxNodeRef | null {
  let result: { from: number; to: number; type: SyntaxNodeRef["type"] } | null = null;
  type.iterate({
    enter(node) {
      if (node.name === name) {
        result = { from: node.from, to: node.to, type: node.type };
        return false;
      }
    },
  });
  return result as SyntaxNodeRef | null;
}

/** Wrap a node into a minimal SyntaxNodeRef to pass to handleInlineNode. */
function nodeRef(from: number, to: number, name: string): SyntaxNodeRef {
  return { from, to, type: { name } as SyntaxNodeRef["type"] } as SyntaxNodeRef;
}

describe("handleInlineNode", () => {
  it("maps InlineCode -> cm-live-inline-code, does not descend", () => {
    const { tree } = parseMarkdown("text `code` more");
    const node = firstNode(tree, "InlineCode");
    expect(node).not.toBeNull();
    const collector = makeCollector();
    const handled = handleInlineNode(nodeRef(node!.from, node!.to, "InlineCode"), collector);
    expect(handled).toBe(true);
    expect(collector.marks).toEqual([
      { from: node!.from, to: node!.to, className: "cm-live-inline-code" },
    ]);
  });

  it("maps WikiLink -> cm-live-wikilink", () => {
    const { tree } = parseMarkdown("see [[note]] pls");
    const node = firstNode(tree, "WikiLink");
    expect(node).not.toBeNull();
    const collector = makeCollector();
    handleInlineNode(nodeRef(node!.from, node!.to, "WikiLink"), collector);
    expect(collector.marks).toEqual([
      { from: node!.from, to: node!.to, className: "cm-live-wikilink" },
    ]);
  });

  it("maps Highlight -> cm-live-highlight", () => {
    const { tree } = parseMarkdown("==hl==");
    const node = firstNode(tree, "Highlight");
    expect(node).not.toBeNull();
    const collector = makeCollector();
    handleInlineNode(nodeRef(node!.from, node!.to, "Highlight"), collector);
    expect(collector.marks).toEqual([
      { from: node!.from, to: node!.to, className: "cm-live-highlight" },
    ]);
  });

  it("maps Strikethrough -> cm-live-strikethrough", () => {
    const { tree } = parseMarkdown("~~gone~~");
    const node = firstNode(tree, "Strikethrough");
    expect(node).not.toBeNull();
    const collector = makeCollector();
    handleInlineNode(nodeRef(node!.from, node!.to, "Strikethrough"), collector);
    expect(collector.marks).toEqual([
      { from: node!.from, to: node!.to, className: "cm-live-strikethrough" },
    ]);
  });

  it("maps StrongEmphasis -> cm-live-strong and descends", () => {
    const { tree } = parseMarkdown("**bold**");
    const node = firstNode(tree, "StrongEmphasis");
    expect(node).not.toBeNull();
    const collector = makeCollector();
    const handled = handleInlineNode(nodeRef(node!.from, node!.to, "StrongEmphasis"), collector);
    expect(handled).toBe(false);
    expect(collector.marks).toEqual([
      { from: node!.from, to: node!.to, className: "cm-live-strong" },
    ]);
  });

  it("maps Emphasis -> cm-live-em and descends", () => {
    const { tree } = parseMarkdown("*em*");
    const node = firstNode(tree, "Emphasis");
    expect(node).not.toBeNull();
    const collector = makeCollector();
    const handled = handleInlineNode(nodeRef(node!.from, node!.to, "Emphasis"), collector);
    expect(handled).toBe(false);
    expect(collector.marks).toEqual([
      { from: node!.from, to: node!.to, className: "cm-live-em" },
    ]);
  });

  it("maps HTMLTag -> cm-live-html-tag", () => {
    const collector = makeCollector();
    const handled = handleInlineNode(nodeRef(0, 5, "HTMLTag"), collector);
    expect(handled).toBe(true);
    expect(collector.marks).toEqual([
      { from: 0, to: 5, className: "cm-live-html-tag" },
    ]);
  });

  it("returns false and adds no marks for an unrelated node name", () => {
    const collector = makeCollector();
    const handled = handleInlineNode(nodeRef(0, 3, "Paragraph"), collector);
    expect(handled).toBe(false);
    expect(collector.marks).toHaveLength(0);
  });
});

describe("handleTagsInLine", () => {
  it("marks a valid #tag with cm-live-tag at correct offsets", () => {
    const collector = makeCollector();
    handleTagsInLine(0, "#hello world", [], collector);
    expect(collector.marks).toEqual([{ from: 0, to: 6, className: "cm-live-tag" }]);
  });

  it("skips tags whose span falls inside a code-block range", () => {
    const collector = makeCollector();
    // Whole line lives inside a fenced code block -> no tags marked.
    handleTagsInLine(0, "#code here", [{ from: 0, to: 14 }], collector);
    expect(collector.marks).toHaveLength(0);
  });

  it("skips tags not preceded by whitespace or start-of-line", () => {
    const collector = makeCollector();
    handleTagsInLine(0, "foo#bar", [], collector);
    expect(collector.marks).toHaveLength(0);
  });

  it("marks multiple valid tags with correct absolute offsets", () => {
    const collector = makeCollector();
    handleTagsInLine(100, "#a #b #c", [], collector);
    expect(collector.marks).toEqual([
      { from: 100, to: 102, className: "cm-live-tag" },
      { from: 103, to: 105, className: "cm-live-tag" },
      { from: 106, to: 108, className: "cm-live-tag" },
    ]);
  });

  it("line with no tags produces no marks", () => {
    const collector = makeCollector();
    handleTagsInLine(0, "just text", [], collector);
    expect(collector.marks).toHaveLength(0);
  });
});
