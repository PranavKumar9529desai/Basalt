import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";

describe("computeStats", () => {
  it("returns zero words and zero chars for an empty doc", () => {
    expect(computeStats("")).toEqual({ chars: 0, words: 0 });
  });

  it("counts char length including whitespace", () => {
    expect(computeStats("# Title\n")).toEqual({ chars: 8, words: 2 });
  });

  it("counts whitespace-separated words", () => {
    expect(computeStats("one two three")).toEqual({ chars: 13, words: 3 });
  });

  it("reports 0 words for a doc of only whitespace", () => {
    expect(computeStats("   \n  ")).toEqual({ chars: 6, words: 0 });
  });

  it("handles unicode letters", () => {
    expect(computeStats("café résumé")).toEqual({ chars: 11, words: 2 });
  });
});