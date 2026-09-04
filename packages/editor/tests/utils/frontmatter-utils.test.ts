/**
 * Tests for `src/frontmatter-utils.ts` — shared frontmatter predicates and
 * structural equality. `frontmatterValuesEqual` deep-compares type-tagged
 * values without allocating a JSON string on every update.
 */
import { describe, expect, it } from "vitest";
import {
  frontmatterValuesEqual,
  isNullValue,
  valueType,
} from "../../src/frontmatter-utils";
import type { FrontmatterValue } from "../../src/types";

describe("isNullValue", () => {
  it("accepts the null variant", () => {
    expect(isNullValue({ type: "null" })).toBe(true);
  });

  it("rejects value-carrying variants", () => {
    expect(isNullValue({ type: "text", value: "hi" })).toBe(false);
    expect(isNullValue({ type: "list", items: [] })).toBe(false);
  });
});

describe("valueType", () => {
  it("returns the interned discriminator", () => {
    expect(valueType({ type: "text", value: "hi" })).toBe("text");
    expect(valueType({ type: "datetime", value: "x" })).toBe("datetime");
  });
});

describe("frontmatterValuesEqual", () => {
  it("compares null variants", () => {
    expect(frontmatterValuesEqual({ type: "null" }, { type: "null" })).toBe(
      true,
    );
    expect(
      frontmatterValuesEqual({ type: "null" }, { type: "text", value: "x" }),
    ).toBe(false);
  });

  it("compares scalar variants by type and value", () => {
    expect(
      frontmatterValuesEqual({ type: "text", value: "a" }, {
        type: "text",
        value: "a",
      }),
    ).toBe(true);
    expect(
      frontmatterValuesEqual({ type: "text", value: "a" }, {
        type: "text",
        value: "b",
      }),
    ).toBe(false);
    expect(
      frontmatterValuesEqual({ type: "link", name: "x", path: "x" }, {
        type: "text",
        value: "x",
      }),
    ).toBe(false);
    expect(
      frontmatterValuesEqual({ type: "number", value: 1 }, {
        type: "number",
        value: 1,
      }),
    ).toBe(true);
    expect(
      frontmatterValuesEqual({ type: "checkbox", value: true }, {
        type: "checkbox",
        value: false,
      }),
    ).toBe(false);
  });

  it("compares link variants by name and path", () => {
    const a: FrontmatterValue = { type: "link", name: "A", path: "A" };
    expect(frontmatterValuesEqual(a, { type: "link", name: "A", path: "A" })).toBe(
      true,
    );
    expect(frontmatterValuesEqual(a, { type: "link", name: "A", path: "B" })).toBe(
      false,
    );
  });

  it("compares list variants structurally", () => {
    expect(
      frontmatterValuesEqual(
        { type: "list", items: [{ type: "text", value: "a" }, { type: "text", value: "b" }] },
        { type: "list", items: [{ type: "text", value: "a" }, { type: "text", value: "b" }] },
      ),
    ).toBe(true);
    expect(
      frontmatterValuesEqual(
        { type: "list", items: [{ type: "text", value: "a" }] },
        { type: "list", items: [{ type: "text", value: "a" }, { type: "text", value: "b" }] },
      ),
    ).toBe(false);
    expect(
      frontmatterValuesEqual(
        { type: "list", items: [{ type: "text", value: "a" }] },
        { type: "list", items: [{ type: "number", value: 1 }] },
      ),
    ).toBe(false);
  });

  it("mismatches a list against a scalar", () => {
    expect(
      frontmatterValuesEqual({ type: "text", value: "a" }, {
        type: "list",
        items: [],
      }),
    ).toBe(false);
  });
});
