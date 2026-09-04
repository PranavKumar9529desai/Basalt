/**
 * Tests for `src/frontmatter-utils.ts` — shared frontmatter predicates and
 * structural equality. `frontmatterValuesEqual` deep-compares variant values
 * without allocating a JSON string on every update.
 */
import { describe, expect, it } from "vitest";
import {
  frontmatterValuesEqual,
  getVariantKey,
  isFrontmatterObject,
} from "../../src/frontmatter-utils";
import type { FrontmatterValue } from "../../src/types";

describe("isFrontmatterObject", () => {
  it("rejects the None string sentinel", () => {
    expect(isFrontmatterObject("None")).toBe(false);
  });

  it("accepts variant objects", () => {
    expect(isFrontmatterObject({ Text: "hi" })).toBe(true);
    expect(isFrontmatterObject({ List: [] })).toBe(true);
  });
});

describe("getVariantKey", () => {
  it("finds a key case-insensitively", () => {
    expect(getVariantKey({ Text: "hi" }, "text")).toBe("Text");
    expect(getVariantKey({ DateTime: "x" }, "datetime")).toBe("DateTime");
  });

  it("returns undefined for a missing key", () => {
    expect(getVariantKey({ Text: "hi" }, "Number")).toBeUndefined();
  });
});

describe("frontmatterValuesEqual", () => {
  it("compares None sentinels", () => {
    expect(frontmatterValuesEqual("None", "None")).toBe(true);
    expect(frontmatterValuesEqual("None", { Text: "x" })).toBe(false);
  });

  it("compares scalar variants by key and value", () => {
    expect(frontmatterValuesEqual({ Text: "a" }, { Text: "a" })).toBe(true);
    expect(frontmatterValuesEqual({ Text: "a" }, { Text: "b" })).toBe(false);
    expect(frontmatterValuesEqual({ Link: "x" }, { Text: "x" })).toBe(false);
    expect(frontmatterValuesEqual({ Number: 1 }, { Number: 1 })).toBe(true);
    expect(frontmatterValuesEqual({ Checkbox: true }, { Checkbox: false })).toBe(
      false,
    );
  });

  it("compares list variants structurally", () => {
    expect(
      frontmatterValuesEqual({ List: [{ Text: "a" }, { Text: "b" }] }, {
        List: [{ Text: "a" }, { Text: "b" }],
      } as FrontmatterValue),
    ).toBe(true);
    expect(
      frontmatterValuesEqual({ List: [{ Text: "a" }] }, {
        List: [{ Text: "a" }, { Text: "b" }],
      } as FrontmatterValue),
    ).toBe(false);
    expect(
      frontmatterValuesEqual({ List: [{ Text: "a" }] }, {
        List: [{ Number: 1 }],
      } as FrontmatterValue),
    ).toBe(false);
  });

  it("mismatches a list against a scalar of the same key shape", () => {
    expect(
      frontmatterValuesEqual({ Text: "a" }, { List: [] } as FrontmatterValue),
    ).toBe(false);
  });
});
