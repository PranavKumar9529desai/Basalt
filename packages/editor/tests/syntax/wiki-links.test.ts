/**
 * Tier 1 — grammar tests for the [[WikiLink]]/![[embed]] Lezer extension
 * (`src/syntax/wiki-links.ts`).
 *
 * Behavior contract (from source):
 *  - `[[...]]` parses to a `WikiLink` node with two `WikiLinkMark` children
 *    (the opening `[[` and closing `]]`).
 *  - `![[...]]` parses to an `EmbedMark` (the `!`) as the sibling immediately
 *    before a `WikiLink` node — the built-in Image parser never swallows it
 *    (ADR-033).
 *  - The content between the marks is the link target (parsed as inline text).
 *  - WikiLinks and embeds are single-line: a newline before `]]` aborts the match.
 *  - The WikiLink parser runs BEFORE the standard Link parser (so `[[x]]` is a
 *    wikilink, not a link), and the embed parser before Image (so `![[x]]` is
 *    an embed, while `![alt](url)` stays a real image).
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

  describe("![[embeds]] (ADR-033 — Image collision)", () => {
    it("parses ![[img.png]] into an EmbedMark sibling before a WikiLink", () => {
      const { tree, state } = parseMarkdown("before ![[img.png]] after");
      const embeds = nodesOfType(tree, "EmbedMark");
      const links = nodesOfType(tree, "WikiLink");
      expect(embeds).toHaveLength(1);
      expect(links).toHaveLength(1);
      // The `!` is immediately before the WikiLink's opening `[`.
      expect(embeds[0].to).toBe(links[0].from);
      expect(state.doc.sliceString(embeds[0].from, embeds[0].to)).toBe("!");
      expect(state.doc.sliceString(links[0].from, links[0].to)).toBe("[[img.png]]");
    });

    it("keeps the raw bracket content as the embed target", () => {
      const { tree, state } = parseMarkdown("![[folder/img.png]]");
      expect(linkTargets(tree, state)).toEqual(["folder/img.png"]);
    });

    it("parses multiple embeds and wikilinks mixed on one line", () => {
      const { tree } = parseMarkdown("![[a.png]] and [[b]] and ![[c.mp3]]");
      expect(nodesOfType(tree, "EmbedMark")).toHaveLength(2);
      expect(nodesOfType(tree, "WikiLink")).toHaveLength(3);
    });

    it("does not swallow real images — ![alt](url) stays an Image", () => {
      const { tree } = parseMarkdown("![alt text](img.png)");
      expect(nodesOfType(tree, "EmbedMark")).toHaveLength(0);
      expect(nodesOfType(tree, "WikiLink")).toHaveLength(0);
      // An Image node (with its nested Link) must still be produced.
      expect(nodesOfType(tree, "Image")).toHaveLength(1);
    });

    it("does not convert ![]() empty images into embeds", () => {
      const { tree } = parseMarkdown("![]()");
      expect(nodesOfType(tree, "EmbedMark")).toHaveLength(0);
      expect(nodesOfType(tree, "WikiLink")).toHaveLength(0);
      expect(nodesOfType(tree, "Image")).toHaveLength(1);
    });

    it("skips unclosed ![[ with no closing ]]", () => {
      const { tree } = parseMarkdown("![[unclosed");
      expect(nodesOfType(tree, "EmbedMark")).toHaveLength(0);
      expect(nodesOfType(tree, "WikiLink")).toHaveLength(0);
    });

    it("does not span newlines — ![[a\nb]] is not an embed", () => {
      const { tree } = parseMarkdown("![[a\nb]]");
      expect(nodesOfType(tree, "EmbedMark")).toHaveLength(0);
      expect(nodesOfType(tree, "WikiLink")).toHaveLength(0);
    });
  });
});
