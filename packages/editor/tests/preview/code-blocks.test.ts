/**
 * Tier 2 — preview handler tests for `src/preview/code-blocks.ts`
 * (`handleCodeBlockNode`, `CodeHeaderWidget`, `CodeFooterWidget`).
 *
 * Behavior contract (from source; values pinned from real Lezer trees):
 *  - FencedCode with `dql`/`dataview` lang: adds `cm-live-code`/`-begin`/`-end`
 *    line classes, returns `false` (defers widget dispatch to the DQL block
 *    widget), and does NOT record a code-block range.
 *  - Other FencedCode / CodeBlock: records the block range into
 *    `ctx.codeBlockRanges`, adds begin/mid/end code-block line classes. Every
 *    line carries the base `cm-live-code`; the first line additionally gets
 *    `cm-live-code-begin`, the last `cm-live-code-end`, and a single-line block
 *    gets `cm-live-code-begin` + `cm-live-code-end`. Returns `true`.
 *  - Header/footer widgets are added ONLY when there is no cursor inside the
 *    block. `hasCursor` requires renderModeFacet === "live" AND the head inside
 *    [node.from..node.to]; in reading mode the widgets always render.
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, EditorSelection, type Extension } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { describe, expect, it } from "vitest";
import { CodeFooterWidget, CodeHeaderWidget, handleCodeBlockNode } from "../../src/preview/code-blocks";
import { renderModeFacet } from "../../src/preview/render-mode";
import { basaltMarkdownExtensions, makeCollector, testMarkdownFixture } from "../_helpers";

function stateFor(doc: string, headPos: number, extra: Extension[] = []) {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(headPos),
    extensions: [
      markdown({ base: markdownLanguage, extensions: basaltMarkdownExtensions }),
      ...extra,
    ],
  });
}

function codeNode(state: EditorState, name: string): SyntaxNode {
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  let node: SyntaxNode | null = null;
  tree.iterate({
    enter(n) {
      if (n.name === name) {
        node = n.node;
        return false;
      }
    },
  });
  expect(node).not.toBeNull();
  return node!;
}

function invoke(
  doc: string,
  headPos: number,
  nodeName: string,
  extra: Extension[] = [],
) {
  const state = stateFor(doc, headPos, extra);
  const node = codeNode(state, nodeName);
  const ranges: { from: number; to: number }[] = [];
  const ctx = { activeLine: null as never, headPos, state, codeBlockRanges: ranges };
  const c = makeCollector();
  const handled = handleCodeBlockNode(
    { from: node.from, to: node.to, type: { name: nodeName } as never, node: node as never } as never,
    0,
    state.doc.length,
    ctx,
    c,
  );
  return { handled, ranges, lines: c.lines, replaces: c.replaces };
}

describe("handleCodeBlockNode — FencedCode (js)", () => {
  it("records the range, adds code lines, and returns true", () => {
    const doc = "```js\ncode\n```";
    const { handled, ranges, lines } = invoke(doc, 10, "FencedCode");
    expect(handled).toBe(true);
    expect(ranges).toEqual([{ from: 0, to: doc.length }]);
    expect(lines).toEqual([
      { pos: 0, className: "cm-live-code cm-live-code-begin" },
      { pos: 6, className: "cm-live-code" },
      { pos: 11, className: "cm-live-code cm-live-code-end" },
    ]);
  });

  it("does not render header/footer when the cursor is inside (live mode)", () => {
    const doc = "```js\ncode\n```";
    const { replaces } = invoke(doc, 5, "FencedCode");
    expect(replaces).toHaveLength(0);
  });

  it("renders header/footer when the cursor is outside (live mode)", () => {
    const doc = "before\n```js\ncode\n```\nafter";
    // FencedCode node spans the ```js ... ``` block; cursor on "after" is outside
    const { replaces } = invoke(doc, doc.length - 1, "FencedCode");
    expect(replaces).toHaveLength(2);
    expect(replaces[0].widget).toBeInstanceOf(CodeHeaderWidget);
    expect(replaces[1].widget).toBeInstanceOf(CodeFooterWidget);
  });

  it("renders header/footer in reading mode even with the cursor inside", () => {
    const doc = "```js\ncode\n```";
    const { replaces } = invoke(doc, 5, "FencedCode", [renderModeFacet.of("reading")]);
    expect(replaces.length).toBeGreaterThan(0);
    expect(replaces[0].widget).toBeInstanceOf(CodeHeaderWidget);
    expect(replaces[1].widget).toBeInstanceOf(CodeFooterWidget);
  });
});

describe("handleCodeBlockNode — FencedCode (dql)", () => {
  it("adds code lines, defers (returns false), and does NOT record a range", () => {
    const doc = "```dql\nTABLE FROM x\n```";
    const { handled, ranges, lines } = invoke(doc, 5, "FencedCode");
    expect(handled).toBe(false);
    expect(ranges).toEqual([]);
    expect(lines).toEqual([
      { pos: 0, className: "cm-live-code cm-live-code-begin" },
      { pos: 7, className: "cm-live-code" },
      { pos: 20, className: "cm-live-code cm-live-code-end" },
    ]);
  });
});

describe("handleCodeBlockNode — indented CodeBlock", () => {
  it("records the range, adds code lines, returns true, no widgets", () => {
    const doc = "    indented";
    const { handled, ranges, lines, replaces } = invoke(doc, 0, "CodeBlock");
    expect(handled).toBe(true);
    expect(ranges).toEqual([{ from: 4, to: doc.length }]);
    expect(lines).toEqual([
      {
        pos: 0,
        className: "cm-live-code cm-live-code-begin cm-live-code-end",
      },
    ]);
    expect(replaces).toHaveLength(0);
  });
});

describe("handleCodeBlockNode — non-code node", () => {
  it("returns false for a Paragraph node", () => {
    const state = stateFor("plain", 0);
    const ranges: { from: number; to: number }[] = [];
    const ctx = { activeLine: null as never, headPos: 0, state, codeBlockRanges: ranges };
    const c = makeCollector();
    const handled = handleCodeBlockNode(
      { from: 0, to: 5, type: { name: "Paragraph" } as never } as never,
      0,
      5,
      ctx,
      c,
    );
    expect(handled).toBe(false);
    expect(ranges).toEqual([]);
    expect(c.lines).toHaveLength(0);
  });
});

describe("code-block box — constant height invariant", () => {
  const doc = "before\n```js\nconst x = 1\n```\nafter";

  /** The geometry-affecting line classes (begin/mid/end strips) for a fixture.
   * These are what drive the box's height; if they are identical whether the
   * caret is inside or outside the block, the block cannot grow/shrink on
   * reveal (the header/footer are absolute overlays that consume no height). */
  function codeLineClasses(selection: number): { pos: number; class: string }[] {
    const { report } = testMarkdownFixture(doc, { selection });
    return report.lineClasses
      .filter((l) => l.class.includes("cm-live-code"))
      .sort((a, b) => a.pos - b.pos);
  }

  it("produces identical code-line geometry classes inside vs outside the block", () => {
    // "before" is outside; a position inside the code (e.g. 12) is inside.
    const outside = codeLineClasses(0);
    const inside = codeLineClasses(12);
    expect(inside).toEqual(outside);
    expect(inside).toContainEqual({
      pos: 7,
      class: "cm-live-code cm-live-code-begin",
    });
    expect(inside).toContainEqual({ pos: 13, class: "cm-live-code" });
    expect(inside).toContainEqual({
      pos: 25,
      class: "cm-live-code cm-live-code-end",
    });
  });

  it("does not change the number of code-block lines between caret states", () => {
    expect(codeLineClasses(0)).toHaveLength(3);
    expect(codeLineClasses(12)).toHaveLength(3);
  });

  it("still reveals the header/footer chrome only when the caret is outside (live)", () => {
    const outside = testMarkdownFixture(doc, { selection: 0 });
    const inside = testMarkdownFixture(doc, { selection: 12 });
    expect(
      outside.report.replaces.filter((r) => r.widget === "CodeHeaderWidget"),
    ).toHaveLength(1);
    expect(
      outside.report.replaces.filter((r) => r.widget === "CodeFooterWidget"),
    ).toHaveLength(1);
    expect(
      inside.report.replaces.some((r) => r.widget === "CodeHeaderWidget"),
    ).toBe(false);
  });

  it("forces chrome in reading mode even with the caret inside the block", () => {
    const reading = testMarkdownFixture(doc, {
      renderMode: "reading",
      selection: 12,
    });
    expect(
      reading.report.replaces.some((r) => r.widget === "CodeHeaderWidget"),
    ).toBe(true);
  });
});
