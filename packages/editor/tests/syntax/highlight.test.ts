/**
 * Tier 1 — grammar tests for the ==highlight== Lezer extension
 * (`src/syntax/highlight.ts`).
 *
 * Behavior contract (from source):
 *  - `==text==` parses to a `Highlight` node with two `HighlightMark` children
 *    (the opening `==` and closing `==`).
 *  - Highlights are single-line: a newline before `==` aborts the match.
 *  - Runs BEFORE the Emphasis parser.
 *
 * Note (from probing): `====` (4 equals, no inner text) DOES produce a
 * Highlight — the source requires only that a `==` closer is found, not that
 * non-empty text lies between.
 */
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../_helpers";

function nodesOfType(tree: ReturnType<typeof parseMarkdown>["tree"], name: string) {
  const found: { from: number; to: number }[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === name) {
        found.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });
  return found;
}

function highlightInner(
  tree: ReturnType<typeof parseMarkdown>["tree"],
  state: ReturnType<typeof parseMarkdown>["state"],
): string[] {
  const inner: string[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === "Highlight") {
        inner.push(state.doc.sliceString(node.from + 2, node.to - 2));
        return false;
      }
    },
  });
  return inner;
}

describe("highlightExtension", () => {
  it("parses ==text== into a Highlight node with two marks", () => {
    const { tree } = parseMarkdown("==highlighted==");
    expect(nodesOfType(tree, "Highlight")).toHaveLength(1);
    expect(nodesOfType(tree, "HighlightMark")).toHaveLength(2);
  });

  it("extracts the inner text between the == delimiters", () => {
    const { tree, state } = parseMarkdown("==highlighted==");
    expect(highlightInner(tree, state)).toEqual(["highlighted"]);
  });

  it("parses a highlight embedded inside a paragraph", () => {
    const { tree, state } = parseMarkdown("text ==hl== more");
    expect(nodesOfType(tree, "Highlight")).toHaveLength(1);
    expect(highlightInner(tree, state)).toEqual(["hl"]);
  });

  it("skips unclosed == with no closing delimiter", () => {
    const { tree } = parseMarkdown("==unclosed");
    expect(nodesOfType(tree, "Highlight")).toHaveLength(0);
  });

  it("does not span newlines", () => {
    const { tree } = parseMarkdown("==a\nb==");
    expect(nodesOfType(tree, "Highlight")).toHaveLength(0);
  });

  it("parses multiple highlights on one line", () => {
    const { tree, state } = parseMarkdown("==a== ==b==");
    expect(nodesOfType(tree, "Highlight")).toHaveLength(2);
    expect(highlightInner(tree, state)).toEqual(["a", "b"]);
  });

  it("treats ==== as an empty highlight (closer found, no inner text)", () => {
    // Documented quirk: matches the source's scan-for-closer behavior.
    const { tree } = parseMarkdown("====");
    expect(nodesOfType(tree, "Highlight")).toHaveLength(1);
  });

  it("produces exactly one HighlightMark at start and end", () => {
    const { tree, state } = parseMarkdown("==x==");
    const marks = nodesOfType(tree, "HighlightMark").map((m) =>
      state.doc.sliceString(m.from, m.to),
    );
    expect(marks).toEqual(["==", "=="]);
  });
});
