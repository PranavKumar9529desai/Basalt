/**
 * Tier 3 — pure utility tests for `src/preview/types.ts`
 * (`isInCodeBlock`, `sortCodeBlockRanges`).
 *
 * `isInCodeBlock` binary-searches a sorted array of `{from,to}` ranges; it
 * reports a position as inside any range when `from <= pos <= to`.
 * `sortCodeBlockRanges` sorts an array of ranges in-place by `from`.
 */
import { describe, expect, it } from "vitest";
import { isInCodeBlock, sortCodeBlockRanges } from "../../src/preview/types";

describe("isInCodeBlock", () => {
  it("returns false for an empty range list", () => {
    expect(isInCodeBlock(0, [])).toBe(false);
    expect(isInCodeBlock(42, [])).toBe(false);
  });

  it("reports a position inside a single range", () => {
    const ranges = [{ from: 10, to: 20 }];
    expect(isInCodeBlock(10, ranges)).toBe(true);
    expect(isInCodeBlock(15, ranges)).toBe(true);
    expect(isInCodeBlock(20, ranges)).toBe(true); // inclusive of `to`
  });

  it("reports a position outside a single range", () => {
    const ranges = [{ from: 10, to: 20 }];
    expect(isInCodeBlock(0, ranges)).toBe(false);
    expect(isInCodeBlock(9, ranges)).toBe(false);
    expect(isInCodeBlock(21, ranges)).toBe(false);
  });

  it("finds ranges anywhere in a larger sorted list", () => {
    const ranges = [
      { from: 10, to: 20 },
      { from: 50, to: 60 },
      { from: 100, to: 120 },
    ];
    expect(isInCodeBlock(15, ranges)).toBe(true); // first half
    expect(isInCodeBlock(55, ranges)).toBe(true); // middle
    expect(isInCodeBlock(110, ranges)).toBe(true); // last half
    expect(isInCodeBlock(5, ranges)).toBe(false);
    expect(isInCodeBlock(70, ranges)).toBe(false);
    expect(isInCodeBlock(200, ranges)).toBe(false);
  });
});

describe("sortCodeBlockRanges", () => {
  it("sorts ranges in place by `from` ascending", () => {
    const ranges = [
      { from: 50, to: 60 },
      { from: 10, to: 20 },
      { from: 30, to: 35 },
    ];
    sortCodeBlockRanges(ranges);
    expect(ranges).toEqual([
      { from: 10, to: 20 },
      { from: 30, to: 35 },
      { from: 50, to: 60 },
    ]);
  });

  it("is a no-op on an already-sorted or empty array", () => {
    const sorted = [
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ];
    sortCodeBlockRanges(sorted);
    expect(sorted).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);

    const empty: { from: number; to: number }[] = [];
    sortCodeBlockRanges(empty);
    expect(empty).toEqual([]);
  });
});
