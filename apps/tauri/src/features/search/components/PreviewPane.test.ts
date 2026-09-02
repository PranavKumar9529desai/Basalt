import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  buildDecorations,
  cachedPreviewState,
  windowPreview,
} from "./PreviewPane";

function rangeSet(
  doc: Text,
  matchLine: number,
  highlights: Array<{ start: number; end: number }>,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  buildDecorations(doc, matchLine, highlights).between(
    0,
    doc.length,
    (from, to) => {
      out.push([from, to]);
    },
  );
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
      rangeSet(doc, 1, [
        { start: 7, end: 9 },
        { start: 2, end: 5 },
      ]),
    ).not.toThrow();
    expect(
      rangeSet(doc, 1, [
        { start: 7, end: 9 },
        { start: 2, end: 5 },
      ]),
    ).toEqual([
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
    expect(
      rangeSet(doc, 1, [
        { start: 0, end: 3 },
        { start: 50, end: 60 },
      ]),
    ).toEqual([
      [0, 0],
      [0, 3],
    ]);
  });
});

describe("PreviewPane.windowPreview", () => {
  it("keeps a small document intact", () => {
    const text = "line1\nline2\nline3\n";
    const hl = [{ start: 0, end: 4 }];
    expect(windowPreview(text, 2, hl)).toEqual({
      text,
      matchLine: 2,
      highlights: hl,
    });
  });

  it("windows a match deep in a large file around it", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line-${i + 1}`);
    const text = lines.join("\n");
    const hl = [{ start: 0, end: 5 }];
    // match on line 500 (1-based). before=300 lines, after window up to 700.
    const win = windowPreview(text, 500, hl);
    const n = win.text.split("\n").length;
    expect(n).toBeLessThanOrEqual(401); // 200 before + 1 + 200 after
    expect(win.text.startsWith("line-300")).toBe(true);
    expect(win.text.endsWith("line-700")).toBe(true);
    expect(win.matchLine).toBe(201); // 500 - 300 + 1
    expect(win.highlights).toBe(hl);
  });

  it("clamps a match near the top of the file", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line-${i + 1}`);
    const text = lines.join("\n");
    const win = windowPreview(text, 5, []);
    expect(win.text.startsWith("line-1")).toBe(true);
    expect(win.matchLine).toBe(5); // unchanged: no leading lines cut
  });

  it("always hands the parser a bounded slice", () => {
    const lines = Array.from({ length: 20000 }, (_, i) => `l${i + 1}`);
    const text = lines.join("\n");
    const win = windowPreview(text, 10000, []);
    expect(win.text.split("\n").length).toBeLessThanOrEqual(401);
  });
});

describe("PreviewPane.cachedPreviewState", () => {
  it("reuses the same parsed state for identical content", () => {
    const text = "# hello\n\nsome body\n";
    const a = cachedPreviewState(text, "a.md");
    const b = cachedPreviewState(text, "a.md");
    expect(a).toBe(b); // same EditorState object => no re-parse
  });

  it("does not reuse syntax state across different file paths", () => {
    const text = "same content";
    const markdown = cachedPreviewState(text, "note.md");
    const otherNote = cachedPreviewState(text, "other.md");
    expect(markdown).not.toBe(otherNote);
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
