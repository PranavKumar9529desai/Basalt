/**
 * Tier 1 — grammar tests for the YAML frontmatter Lezer extension
 * (`src/syntax/frontmatter.ts`).
 *
 * Behavior contract (from the source):
 *  - Frontmatter must start at the very beginning of the document (line 0).
 *  - Opens with `---`, closes with `---` or `...`.
 *  - If no closer is found, the block still spans to EOF (the parser consumes
 *    until EOF and emits the node).
 *  - The opening `---` must NOT be stolen by the horizontal-rule / setext
 *    parsers.
 */
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../_helpers";

/** Collect all descendant nodes of a given type name from the tree. */
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

describe("yamlFrontmatterExtension", () => {
  it("parses `---` delimited frontmatter at the top of the doc", () => {
    const { tree, state } = parseMarkdown("---\ntitle: Hello\n---\n\nBody");
    const nodes = nodesOfType(tree, "YAMLFrontMatter");
    expect(nodes).toHaveLength(1);
    // The block spans from the opening --- through the closing ---
    expect(state.doc.sliceString(nodes[0].from, nodes[0].to)).toBe(
      "---\ntitle: Hello\n---",
    );
  });

  it("parses `...` as a valid closing delimiter", () => {
    const { tree, state } = parseMarkdown("---\ntags:\n  - a\n...\n# H");
    const nodes = nodesOfType(tree, "YAMLFrontMatter");
    expect(nodes).toHaveLength(1);
    expect(state.doc.sliceString(nodes[0].from, nodes[0].to)).toBe(
      "---\ntags:\n  - a\n...",
    );
  });

  it("does not mistreat the opening --- as a setext heading or HR", () => {
    const { tree } = parseMarkdown("---\ntitle: x\n---");
    // Frontmatter node must exist, NOT SetextHeading2 / ThematicBreak
    expect(nodesOfType(tree, "YAMLFrontMatter")).toHaveLength(1);
    expect(nodesOfType(tree, "SetextHeading2")).toHaveLength(0);
  });

  it("keeps parsing content BEFORE the frontmatter out of the YAML node", () => {
    // Frontmatter must be the very first thing; a --- later is NOT frontmatter.
    const { tree } = parseMarkdown("intro text\n---\nfoo\n---");
    expect(nodesOfType(tree, "YAMLFrontMatter")).toHaveLength(0);
  });

  it("emits a YAMLFrontMatter node even when the closing delimiter is missing (EOF)", () => {
    const { tree, state } = parseMarkdown("---\ntitle: unclosed");
    const nodes = nodesOfType(tree, "YAMLFrontMatter");
    expect(nodes).toHaveLength(1);
    expect(state.doc.sliceString(nodes[0].from, nodes[0].to)).toBe(
      "---\ntitle: unclosed",
    );
  });

  it("treats an empty `---` ... `---` as an empty frontmatter block", () => {
    const { tree, state } = parseMarkdown("---\n---\n\nBody");
    const nodes = nodesOfType(tree, "YAMLFrontMatter");
    expect(nodes).toHaveLength(1);
    expect(state.doc.sliceString(nodes[0].from, nodes[0].to)).toBe("---\n---");
  });

  it("content after the frontmatter is parsed as normal markdown", () => {
    const { tree } = parseMarkdown("---\nkey: val\n---\n# Heading");
    expect(nodesOfType(tree, "ATXHeading1")).toHaveLength(1);
  });
});
