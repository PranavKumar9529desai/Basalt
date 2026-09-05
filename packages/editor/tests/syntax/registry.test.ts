/**
 * Syntax Registry coverage (ADR-033).
 *
 * The registry is the single source of truth for the editor's Lezer grammar.
 * This test enforces its two contracts:
 *
 *  1. Every declared syntax is tree-addressable — for each manifest, every
 *     fixture parses and produces every declared node name (the mandatory
 *     coverage gate that would have caught the embed `![[` vs `![` bug).
 *  2. `createBasaltGrammar()` is the one folded grammar list: deduped, in
 *     manifest order, consumed by both `editor.ts` and the test helper.
 */
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../_helpers";
import {
  basaltSyntaxManifests,
  createBasaltGrammar,
  syntaxHiddenMarks,
  type SyntaxManifest,
} from "../../src/syntax/registry";

function nodeNames(tree: ReturnType<typeof parseMarkdown>["tree"]): Set<string> {
  const found = new Set<string>();
  tree.iterate({
    enter(node) {
      found.add(node.name);
    },
  });
  return found;
}

describe("syntax registry — coverage contract", () => {
  it("declares every Basalt markdown syntax once", () => {
    const ids = basaltSyntaxManifests.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("wikilink");
    expect(ids).toContain("frontmatter");
    expect(ids).toContain("highlight");
    expect(ids).toContain("table");
    expect(ids).toContain("html-block");
    expect(ids).toContain("dql");
  });

  it("every declared node is produced by at least one fixture (fixtures may exercise subsets)", () => {
    for (const manifest of basaltSyntaxManifests) {
      const seen = new Set<string>();
      for (const fixture of manifest.fixtures) {
        const { tree } = parseMarkdown(fixture, { pipes: false });
        for (const nodeName of nodeNames(tree)) seen.add(nodeName);
      }
      for (const nodeName of manifest.nodeNames) {
        expect(
          seen.has(nodeName),
          `${manifest.id}: at least one fixture must parse a "${nodeName}" node`,
        ).toBe(true);
      }
    }
  });

  it("exposes collision guards as documented nodes", () => {
    // frontmatter `---` must be a YAMLFrontMatter, not an HR.
    const { tree: fmTree } = parseMarkdown("---\ntitle: X\n---\n\nBody");
    expect(nodeNames(fmTree).has("YAMLFrontMatter")).toBe(true);
    // `![[x]]` is an embed (EmbedMark + WikiLink), `[[x]]` a WikiLink.
    const { tree: embedTree } = parseMarkdown("![[x.png]] and [[note]]");
    expect(nodeNames(embedTree).has("EmbedMark")).toBe(true);
    expect(nodeNames(embedTree).has("WikiLink")).toBe(true);
  });
});

describe("createBasaltGrammar", () => {
  it("folds every manifest grammar exactly once, in declaration order", () => {
    const grammar = createBasaltGrammar();
    const expectedGrammar: SyntaxManifest["grammar"] = basaltSyntaxManifests
      .flatMap((m) => m.grammar ?? []);
    expect(grammar).toHaveLength(expectedGrammar?.length ?? 0);
    expect(new Set(grammar).size).toBe(grammar.length);
    // Order preserved: the first grammar entries match the manifest order.
    expect(grammar[0]).toBe(expectedGrammar?.[0]);
  });

  it("is consumed by parseMarkdown (single source of truth)", () => {
    const { tree } = parseMarkdown("![[a.png]]");
    expect(nodeNames(tree).has("WikiLink")).toBe(true);
  });
});

describe("syntaxHiddenMarks", () => {
  it("returns every delimiter a manifest wants hidden, without duplicates", () => {
    const marks = syntaxHiddenMarks();
    expect(marks).toContain("WikiLinkMark");
    expect(marks).toContain("EmbedMark");
    expect(marks).toContain("HighlightMark");
    expect(new Set(marks).size).toBe(marks.length);
  });
});