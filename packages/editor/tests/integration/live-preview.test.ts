/**
 * Phase 6 — full-pipeline integration test for `src/preview/live-preview.ts`.
 *
 * Drives the entire decoration engine through `livePreviewPlugin` +
 * `testMarkdownFixture` (a real `EditorState.create`, real StateField build) and
 * asserts the end-to-end report with `assertDecorations`. This verifies the
 * seam between the individual handlers and the field, not just each handler in
 * isolation.
 *
 * State-level notes: the field starts unfocused (`focused=false`), so live mode
 * behaves like an unfocused editor for block widgets. The WYSIWYG reveal remains:
 * a block widget/header is only rendered when the caret is OUTSIDE the block.
 * Reading mode forces full render regardless of caret — the never-raw invariant
 * under ADR-029.
 */
import { describe, expect, it } from "vitest";
import { assertDecorations, testMarkdownFixture } from "../_helpers";

describe("live-preview full pipeline — default (live) state", () => {
  it("produces a complete report and records the fenced code-block range", () => {
    const doc = "```js\ncode\n```";
    const { report } = testMarkdownFixture(doc);
    expect(report.complete).toBe(true);
    expect(report.codeBlockRanges).toEqual([{ from: 0, to: doc.length }]);
  });

  it("mutes the # marker on the heading line classes and block-mark", () => {
    const { report } = testMarkdownFixture("# Heading", { selection: 0 });
    assertDecorations(report)
      .toHaveLineClass(0, "cm-live-heading-1")
      .toHaveMark(0, 2, "cm-live-block-mark");
  });

  it("renders inline marks for a paragraph (strong / highlight / wikilink / code)", () => {
    const doc = "**bold** ==hl== [[note]] `code`";
    const { report } = testMarkdownFixture(doc);
    assertDecorations(report)
      .toHaveMark(0, 8, "cm-live-strong")
      .toHaveMark(9, 15, "cm-live-highlight")
      .toHaveMark(16, 24, "cm-live-wikilink")
      .toHaveMark(25, 31, "cm-live-inline-code");
  });

  it("replaces the bullet on the non-active list line (WYSIWYG reveal)", () => {
    const doc = "- a\n- b";
    const { report } = testMarkdownFixture(doc, { selection: 0 }); // caret on first item
    assertDecorations(report)
      .toHaveLineClass(0, "cm-live-list-depth-1")
      // first line is active (raw marker), second is replaced
      .toHaveReplace(4, 6, "ListBulletWidget");
  });

  it("does not render a list-bullet widget for the active line", () => {
    const doc = "- a\n- b";
    const { report } = testMarkdownFixture(doc, { selection: 0 });
    // the active (first) line's bullet stays raw — no report.replace at [0..2]
    expect(report.replaces.some((r) => r.from === 0)).toBe(false);
  });

  it("renders a code header only when the caret is outside the block (live)", () => {
    const doc = "before\n```js\ncode\n```";
    const { report } = testMarkdownFixture(doc, { selection: 0 }); // caret in "before"
    assertDecorations(report).toHaveReplace(7, 12, "CodeHeaderWidget");
  });

  it("keeps a fenced block raw when the caret is inside it (live reveal)", () => {
    const doc = "```js\ncode\n```";
    const { report } = testMarkdownFixture(doc, { selection: 5 }); // caret inside
    expect(report.replaces.some((r) => r.widget === "CodeHeaderWidget")).toBe(false);
  });
});

describe("live-preview full pipeline — reading mode (never raw)", () => {
  it("hides the heading marker even with the caret on the heading", () => {
    const { report } = testMarkdownFixture("# Heading", {
      renderMode: "reading",
      selection: 0,
    });
    assertDecorations(report)
      .toHaveLineClass(0, "cm-live-heading-1")
      .toHaveMark(0, 2, "cm-live-hide");
  });

  it("renders a code header widget even with the caret inside the block", () => {
    const doc = "```js\ncode\n```";
    const { report } = testMarkdownFixture(doc, {
      renderMode: "reading",
      selection: 5,
    });
    assertDecorations(report).toHaveReplace(0, 5, "CodeHeaderWidget");
  });

  it("renders a callout header with the caret off the first line (reading)", () => {
    const doc = "> [!note] Title\n> body";
    // caret on the body line; the callout header widget replaces the marker line
    const { report } = testMarkdownFixture(doc, {
      renderMode: "reading",
      selection: 17,
    });
    assertDecorations(report)
      .toHaveLineClass(16, "cm-live-callout")
      .toHaveReplace(0, 15, "CalloutHeaderWidget");
  });
});
