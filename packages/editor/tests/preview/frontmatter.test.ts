/**
 * Tier 2/3 — preview handler tests for `src/preview/frontmatter.ts`
 * (`handleFrontmatterNode`, `handleFrontmatterFallback`).
 *
 * Behavior contract (values pinned from real trees):
 *  - `handleFrontmatterNode` handles only `YAMLFrontMatter` nodes. Every line
 *    in the block gets `cm-live-frontmatter`; the first and last lines also get
 *    `cm-live-frontmatter-fence`; interior lines with a `key:` prefix get a
 *    `cm-live-frontmatter-key` mark on the key name.
 *  - `handleFrontmatterFallback` is a regex fallback used when no node exists:
 *    line 1 must be exactly `---`; it classes lines up to and including the
 *    closing `---`, with key marks on interior lines.
 */
import { describe, expect, it } from "vitest";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  handleFrontmatterFallback,
  handleFrontmatterNode,
} from "../../src/preview/frontmatter";
import { makeContext, makeCollector } from "../_helpers";

function fmNode(state: ReturnType<typeof makeContext>["state"]) {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = null;
  tree.iterate({
    enter(n) {
      if (n.name === "YAMLFrontMatter") {
        node = n.node;
        return false;
      }
    },
  });
  return node;
}

describe("handleFrontmatterNode", () => {
  it("classes every line and fences the first/last lines for a YAMLFrontMatter node", () => {
    const doc = "---\ntitle: Hello\ntags: [a]\n---\nbody";
    const { ctx, state } = makeContext(doc);
    const node = fmNode(state);
    expect(node).not.toBeNull();
    const c = makeCollector();
    const handled = handleFrontmatterNode(
      { from: node!.from, to: node!.to, type: { name: "YAMLFrontMatter" } as never, node: node as never } as never,
      ctx,
      c,
    );
    expect(handled).toBe(true);
    const fenceLines = [0, 27]; // first + last frontmatter lines
    const bodyLines = [4, 17];
    for (const pos of [...fenceLines, ...bodyLines]) {
      expect(c.lines).toContainEqual({ pos, className: "cm-live-frontmatter" });
    }
    for (const pos of fenceLines) {
      expect(c.lines).toContainEqual({ pos, className: "cm-live-frontmatter-fence" });
    }
  });

  it("marks key names on interior lines", () => {
    const doc = "---\ntitle: Hello\ntags: [a]\n---";
    const { ctx, state } = makeContext(doc);
    const node = fmNode(state);
    const c = makeCollector();
    handleFrontmatterNode(
      { from: node!.from, to: node!.to, type: { name: "YAMLFrontMatter" } as never, node: node as never } as never,
      ctx,
      c,
    );
    expect(c.marks).toContainEqual({ from: 4, to: 9, className: "cm-live-frontmatter-key" });
    expect(c.marks).toContainEqual({ from: 17, to: 21, className: "cm-live-frontmatter-key" });
  });

  it("returns false and adds nothing when there is no frontmatter", () => {
    const { ctx, state } = makeContext("just text");
    const node = fmNode(state);
    const c = makeCollector();
    const handled = handleFrontmatterNode(
      { from: 0, to: 5, type: { name: "Paragraph" } as never } as never,
      ctx,
      c,
    );
    expect(node).toBeNull();
    expect(handled).toBe(false);
    expect(c.lines).toHaveLength(0);
  });
});

describe("handleFrontmatterFallback", () => {
  it("classes a --- delimited block and marks interior keys", () => {
    const { ctx, state } = makeContext("---\ntitle: x\n---\nbody");
    const c = makeCollector();
    handleFrontmatterFallback(ctx, c);
    expect(c.lines).toContainEqual({ pos: 0, className: "cm-live-frontmatter" });
    expect(c.lines).toContainEqual({ pos: 0, className: "cm-live-frontmatter-fence" });
    expect(c.lines).toContainEqual({ pos: 13, className: "cm-live-frontmatter" });
    expect(c.lines).toContainEqual({ pos: 13, className: "cm-live-frontmatter-fence" });
    expect(c.marks).toContainEqual({ from: 4, to: 9, className: "cm-live-frontmatter-key" });
  });

  it("adds nothing when the doc does not start with ---", () => {
    const { ctx } = makeContext("no frontmatter here");
    const c = makeCollector();
    handleFrontmatterFallback(ctx, c);
    expect(c.lines).toHaveLength(0);
    expect(c.marks).toHaveLength(0);
  });
});
