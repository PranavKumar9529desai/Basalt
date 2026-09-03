/**
 * Tier 1 — grammar tests for the [[WikiLink]] Lezer extension
 * (`src/syntax/wiki-links.ts`).
 *
 * Behavior contract (from source):
 *  - `[[...]]` parses to a `WikiLink` node with two `WikiLinkMark` children
 *    (the opening `[[` and closing `]]`).
 *  - The content between the marks is the link target (parsed as inline text).
 *  - WikiLinks are single-line: a newline before `]]` aborts the match.
 *  - Runs BEFORE the standard Link parser (so `[[x]]` is a wikilink, not a link).
 *  - There is NO alias (`|`) handling in the grammar itself — the target is
 *    the raw text between the brackets.
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

function linkTargets(
  tree: ReturnType<typeof parseMarkdown>["tree"],
  state: ReturnType<typeof parseMarkdown>["state"],
): string[] {
  const targets: string[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === "WikiLink") {
        targets.push(state.doc.sliceString(node.from + 2, node.to - 2));
        return false;
      }
    },
  });
  return targets;
}

describe("wikiLinkExtension", () => {
  it("parses a standalone [[Note]] into a WikiLink node", () => {
    const { tree } = parseMarkdown("[[My Note]]");
    expect(nodesOfType(tree, "WikiLink")).toHaveLength(1);
    expect(nodesOfType(tree, "WikiLinkMark")).toHaveLength(2);
  });

  it("extracts the raw link target text between the brackets", () => {
    const { tree, state } = parseMarkdown("[[My Note]]");
    expect(linkTargets(tree, state)).toEqual(["My Note"]);
  });

  it("parses a wikilink embedded inside a paragraph", () => {
    const { tree, state } = parseMarkdown("text [[link]] text");
    expect(nodesOfType(tree, "WikiLink")).toHaveLength(1);
    expect(linkTargets(tree, state)).toEqual(["link"]);
  });

  it("skips unclosed [[ with no closing ]]", () => {
    const { tree } = parseMarkdown("[[unclosed");
    expect(nodesOfType(tree, "WikiLink")).toHaveLength(0);
  });

  it("does not span newlines — [[a\nb]] is not a wikilink", () => {
    const { tree } = parseMarkdown("[[a\nb]]");
    expect(nodesOfType(tree, "WikiLink")).toHaveLength(0);
  });

  it("parses multiple wikilinks on one line", () => {
    const { tree, state } = parseMarkdown("[[a]] and [[b]]");
    expect(nodesOfType(tree, "WikiLink")).toHaveLength(2);
    expect(linkTargets(tree, state)).toEqual(["a", "b"]);
  });

  it("treats the raw bracket content as the target (no alias splitting)", () => {
    // The grammar doesn't parse `|` aliases; the whole inner text is the target.
    const { tree, state } = parseMarkdown("[[folder/note]]");
    expect(linkTargets(tree, state)).toEqual(["folder/note"]);
  });

  it("produces exactly one WikiLinkMark at the start and one at the end", () => {
    const { tree, state } = parseMarkdown("[[x]]");
    const marks = nodesOfType(tree, "WikiLinkMark").map((m) =>
      state.doc.sliceString(m.from, m.to),
    );
    expect(marks).toEqual(["[[", "]]"]);
  });
});
