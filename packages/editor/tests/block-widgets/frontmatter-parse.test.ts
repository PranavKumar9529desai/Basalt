/**
 * Tier 2/3 — block-widget frontmatter `parse` region-slicing (ADR-019 hot path).
 *
 * The frontmatter widget must hand the injected WASM parser ONLY the frontmatter
 * block (`0..node.to`), never the whole document — serializing an entire note
 * body on every full rebuild (docs ≤ 48KB re-walk per keystroke) is the exact
 * cost this slicing eliminates. Because `YAMLFrontMatter` starts at offset 0,
 * the relative spans the parser returns are already absolute, so budgets stay
 * correct while the body is never touched.
 */
import { describe, expect, it, vi } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import { basaltMarkdownExtensions } from "../_helpers/parse-markdown";
import { frontmatterBlockWidget } from "../../src/block-widgets/frontmatter-block";
import { frontmatterParserFacet } from "../../src/block-widgets/frontmatter-block";
import type { FrontmatterModel, ParseFrontmatterFn } from "../../src/types";

function frontmatterNode(doc: string): { from: number; to: number } | null {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: basaltMarkdownExtensions,
      }),
    ],
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 10_000) ?? null;
  if (!tree) return null;
  let found: { from: number; to: number } | null = null;
  // Capture the range as primitives inside the callback — the SyntaxNodeRef
  // is a reused instance whose from/to are only valid during the visit.
  tree.iterate({
    enter(n: SyntaxNodeRef) {
      if (n.name === "YAMLFrontMatter") {
        found = { from: n.from, to: n.to };
        return false;
      }
    },
  });
  return found;
}

describe("frontmatterBlockWidget.parse region slicing", () => {
  it("passes the parser only the frontmatter block, not the whole document", () => {
    const doc =
      "---\ntitle: Hello\ntags: [a]\n---\n\nThis is a huge body that must not reach the parser.";
    const node = frontmatterNode(doc);
    expect(node).not.toBeNull();

    const parser = vi.fn((_text: string): FrontmatterModel | null => null);
    const extState = EditorState.create({
      doc,
      extensions: [
        markdown({
          base: markdownLanguage,
          extensions: basaltMarkdownExtensions,
        }),
        frontmatterParserFacet.of(parser as unknown as ParseFrontmatterFn),
      ],
    });

    frontmatterBlockWidget.parse!(extState, {
      from: node!.from,
      to: node!.to,
    } as SyntaxNodeRef);

    expect(parser).toHaveBeenCalledTimes(1);
    const input: unknown = parser.mock.calls[0][0];
    expect(typeof input).toBe("string");
    // The parser receives the frontmatter block (open + close fences), and
    // crucially the document body is never serialized into the input.
    expect((input as string).startsWith("---")).toBe(true);
    expect(input as string).toContain("tags: [a]");
    expect(input as string).toContain("---");
    expect(input as string).not.toContain("huge body");
  });

  it("returns null when no parser is injected", () => {
    const doc = "---\ntitle: x\n---\n\nbody";
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({
          base: markdownLanguage,
          extensions: basaltMarkdownExtensions,
        }),
      ],
    });
    const node = frontmatterNode(doc);
    expect(node).not.toBeNull();
    const result = frontmatterBlockWidget.parse!(state, {
      from: node!.from,
      to: node!.to,
    } as SyntaxNodeRef);
    expect(result).toBeNull();
  });
});
