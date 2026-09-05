import { describe, expect, it } from "vitest";
import { parseWhen, type WhenEvaluator } from "../src/when-parser";

type Ctx = Record<string, boolean | string | number>;

function ev(when: string, ctx: Ctx): boolean {
  const evaluator = parseWhen(when);
  expect(evaluator).not.toBeNull();
  return (evaluator as WhenEvaluator)(ctx);
}

describe("parseWhen", () => {
  it("returns null for empty input (caller treats as unconditional)", () => {
    expect(parseWhen("")).toBeNull();
    expect(parseWhen("   ")).toBeNull();
  });

  it("returns null for syntax errors", () => {
    expect(parseWhen("editorFocused &&")).toBeNull();
    expect(parseWhen("&& editorFocused")).toBeNull();
    expect(parseWhen("(editorFocused")).toBeNull();
    expect(parseWhen("editorFocused ||")).toBeNull();
    expect(parseWhen("editorFocused == ")).toBeNull();
    expect(parseWhen("editorFocused ==")).toBeNull();
    expect(parseWhen("!")).toBeNull();
    expect(parseWhen("editorFocused & modalOpen")).toBeNull();
  });

  describe("bare keys", () => {
    it("matches when the key is true", () => {
      expect(ev("editorFocused", { editorFocused: true })).toBe(true);
      expect(ev("editorFocused", { editorFocused: false })).toBe(false);
    });

    it("does not match when the key is missing", () => {
      expect(ev("editorFocused", { modalOpen: true })).toBe(false);
    });

    it("treats only strict true as match", () => {
      expect(ev("editorFocused", { editorFocused: "true" })).toBe(false);
    });
  });

  describe("negation", () => {
    it("inverts a bare key", () => {
      const not = parseWhen("!editorFocused") as WhenEvaluator;
      expect(not({ editorFocused: false })).toBe(true);
      expect(not({ editorFocused: true })).toBe(false);
      expect(not({})).toBe(true);
    });

    it("supports negated compound expressions via parens", () => {
      const notCompound = parseWhen("!(editorFocused && modalOpen)") as WhenEvaluator;
      expect(notCompound({ editorFocused: true, modalOpen: true })).toBe(false);
      expect(notCompound({ editorFocused: true, modalOpen: false })).toBe(true);
    });
  });

  describe("boolean composition", () => {
    it("AND", () => {
      const and = parseWhen("editorFocused && editorHasSelection") as WhenEvaluator;
      expect(and({ editorFocused: true, editorHasSelection: true })).toBe(true);
      expect(and({ editorFocused: true, editorHasSelection: false })).toBe(false);
      expect(and({ editorFocused: true })).toBe(false);
    });

    it("OR", () => {
      const or = parseWhen("modalOpen || viewMode == 'reading'") as WhenEvaluator;
      expect(or({ modalOpen: true })).toBe(true);
      expect(or({ viewMode: "reading" })).toBe(true);
      expect(or({})).toBe(false);
    });

    it("applies && before ||", () => {
      const mixed = parseWhen("a || b && c") as WhenEvaluator;
      expect(mixed({ a: false, b: true, c: false })).toBe(false);
      expect(mixed({ a: false, b: true, c: true })).toBe(true);
      expect(mixed({ a: true })).toBe(true);
    });

    it("respects parentheses", () => {
      const parens = parseWhen("(a || b) && c") as WhenEvaluator;
      expect(parens({ a: true, c: true })).toBe(true);
      expect(parens({ a: true, b: false, c: false })).toBe(false);
      expect(parens({ b: true, c: true })).toBe(true);
    });
  });

  describe("typed comparisons", () => {
    it("== against a quoted string", () => {
      expect(ev("viewMode == 'reading'", { viewMode: "reading" })).toBe(true);
      expect(ev("viewMode == 'reading'", { viewMode: "live" })).toBe(false);
      expect(ev("viewMode == 'reading'", {})).toBe(false);
    });

    it("!= against a quoted string (missing key is not the value)", () => {
      expect(ev("viewMode != 'reading'", { viewMode: "live" })).toBe(true);
      expect(ev("viewMode != 'reading'", { viewMode: "reading" })).toBe(false);
      expect(ev("viewMode != 'reading'", {})).toBe(true);
    });

    it("== against a number", () => {
      expect(ev("tabCount == 3", { tabCount: 3 })).toBe(true);
      expect(ev("tabCount == 3", { tabCount: 4 })).toBe(false);
      expect(ev("tabCount != 3", { tabCount: 4 })).toBe(true);
    });

    it("== against a boolean via 'true'/'false' strings", () => {
      expect(ev("editorFocused == 'true'", { editorFocused: true })).toBe(true);
      expect(ev("editorFocused == 'true'", { editorFocused: false })).toBe(false);
      expect(ev("editorFocused != 'true'", { editorFocused: false })).toBe(true);
    });

    it("bare words on the right compare as strings", () => {
      expect(ev("viewMode == reading", { viewMode: "reading" })).toBe(true);
      expect(ev("viewMode == reading", { viewMode: "live" })).toBe(false);
    });
  });

  it("compiles complex clauses like VS Code", () => {
    const evaluator = parseWhen(
      "editorFocused && !modalOpen && (viewMode == 'reading' || viewMode == 'preview')",
    ) as WhenEvaluator;
    expect(
      evaluator({ editorFocused: true, modalOpen: false, viewMode: "reading" }),
    ).toBe(true);
    expect(
      evaluator({ editorFocused: true, modalOpen: false, viewMode: "preview" }),
    ).toBe(true);
    expect(
      evaluator({ editorFocused: true, modalOpen: true, viewMode: "reading" }),
    ).toBe(false);
    expect(evaluator({ editorFocused: false, viewMode: "reading" })).toBe(false);
    expect(evaluator({ editorFocused: true, viewMode: "live" })).toBe(false);
  });
});