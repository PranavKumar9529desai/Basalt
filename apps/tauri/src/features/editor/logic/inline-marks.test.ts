import { describe, expect, it } from "vitest";
import { handleTagsInLine } from "@workspace/editor";

function makeCollector() {
  const marks: { from: number; to: number; className: string }[] = [];
  return {
    marks,
    collector: {
      addLineClass() {},
      addMark(from: number, to: number, className: string) {
        marks.push({ from, to, className });
      },
      addReplace() {},
    },
  };
}

describe("handleTagsInLine", () => {
  it("applies cm-live-tag mark to valid #tags", () => {
    const { marks, collector } = makeCollector();
    handleTagsInLine(0, "#hello world", [], collector);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({ from: 0, to: 6, className: "cm-live-tag" });
  });

  it("skips #tags inside code blocks without hanging", () => {
    const { collector } = makeCollector();
    // #tag at positions 0-4 is inside code block range 0-20
    const start = performance.now();
    handleTagsInLine(0, "#tag in code block", [{ from: 0, to: 20 }], collector);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("skips #tags not preceded by whitespace without hanging", () => {
    const { collector } = makeCollector();
    const start = performance.now();
    handleTagsInLine(0, "foo#bar baz#qux", [], collector);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("handles multiple valid tags on one line", () => {
    const { marks, collector } = makeCollector();
    handleTagsInLine(0, "#a #b #c", [], collector);
    expect(marks).toHaveLength(3);
    expect(marks[0].className).toBe("cm-live-tag");
    expect(marks[1].className).toBe("cm-live-tag");
    expect(marks[2].className).toBe("cm-live-tag");
  });

  it("mix of valid and skipped tags completes quickly", () => {
    const { collector } = makeCollector();
    // "#valid" (0-6) is valid, "#code" (7-12) is inside code block, "#another" (13-21) is valid
    const line = "#valid #code #another";
    const ranges = [{ from: 7, to: 12 }]; // covers #code
    const start = performance.now();
    handleTagsInLine(0, line, ranges, collector);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("handles line with no tags", () => {
    const { marks, collector } = makeCollector();
    handleTagsInLine(0, "just plain text", [], collector);
    expect(marks).toHaveLength(0);
  });

  it("handles empty line", () => {
    const { marks, collector } = makeCollector();
    handleTagsInLine(0, "", [], collector);
    expect(marks).toHaveLength(0);
  });

  it("handles tag at start of line preceded by newline offset", () => {
    const { marks, collector } = makeCollector();
    const LINE_OFFSET = 100;
    handleTagsInLine(LINE_OFFSET, "#tag here", [], collector);
    expect(marks).toHaveLength(1);
    expect(marks[0].from).toBe(LINE_OFFSET);
    expect(marks[0].to).toBe(LINE_OFFSET + 4);
  });

  it("does not apply marks to tags inside multiple code blocks", () => {
    const { marks, collector } = makeCollector();
    const line = "#a x #b y #c";
    // #b at index 4-7 is inside code block, #a and #c are valid
    const ranges = [{ from: 4, to: 7 }];
    handleTagsInLine(0, line, ranges, collector);
    expect(marks).toHaveLength(2);
    expect(marks[0].from).toBe(0); // #a
    expect(marks[1].from).toBe(10); // #c
  });
});
