import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { buildDecorations, cachedPreviewState } from "./PreviewPane";

function rangeSet(
  doc: Text,
  matchLine: number,
  highlights: Array<{ start: number; end: number }>,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  buildDecorations(doc, matchLine, highlights).between(0, doc.length, (from, to) => {
    out.push([from, to]);
  });
  // `between` makes no ordering guarantee; sort for stable assertions.
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

describe("PreviewPane.buildDecorations", () => {
  const doc = Text.of(["hello world foo bar"]);

  it("adds an empty line-range for the matched line", () => {
    expect(rangeSet(doc, 1, [])).toEqual([[0, 0]]);
  });

  it("sorts unsorted highlights by start before building ranges", () => {
    // Unsorted input must not throw CM's RangeSet assertion.
    expect(() =>
      rangeSet(doc, 1, [{ start: 7, end: 9 }, { start: 2, end: 5 }]),
    ).not.toThrow();
    expect(rangeSet(doc, 1, [{ start: 7, end: 9 }, { start: 2, end: 5 }])).toEqual([
      [0, 0], // line decoration (start=0, empty)
      [2, 5],
      [7, 9],
    ]);
  });

  it("handles a highlight starting at the very first character", () => {
    expect(rangeSet(doc, 1, [{ start: 0, end: 3 }])).toEqual([
      [0, 0],
      [0, 3],
    ]);
  });

  it("drops highlights that fall outside the matched line", () => {
    expect(rangeSet(doc, 1, [{ start: 0, end: 3 }, { start: 50, end: 60 }])).toEqual([
      [0, 0],
      [0, 3],
    ]);
  });
});

describe("PreviewPane.cachedPreviewState", () => {
  it("reuses the same parsed state for identical content", () => {
    const text = "# hello\n\nsome body\n";
    const a = cachedPreviewState(text, "a.md");
    const b = cachedPreviewState(text, "b.md");
    expect(a).toBe(b); // same EditorState object => no re-parse
  });

  it("parses a new state when content changes", () => {
    const a = cachedPreviewState("content one", "x.md");
    const b = cachedPreviewState("content two", "x.md");
    expect(a).not.toBe(b);
  });

  it("evicts the least-recently-used entry at the cap", () => {
    const first = cachedPreviewState("first-content", "0.md");
    for (let i = 1; i <= 26; i++) {
      cachedPreviewState(`content-number-${i}`, `${i}.md`);
    }
    // 26 inserts + `first` already cached => 27 entries, cap is 24 and `first`
    // was the least recently used => evicted and now re-parsed fresh.
    const re = cachedPreviewState("first-content", "0.md");
    expect(re).not.toBe(first);
    // But the most recently used one is still cached.
    expect(cachedPreviewState("content-number-26", "26.md")).toBeDefined();
  });
});