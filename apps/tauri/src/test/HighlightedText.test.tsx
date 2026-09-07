import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HighlightedText } from "@workspace/ui/components/palette-shell";

const hitSpans = (container: HTMLElement): (string | null)[] =>
  [...container.querySelectorAll("span span")].map((s) => s.textContent);

describe("HighlightedText", () => {
  it("renders plain text when the query is empty", () => {
    const { container } = render(<HighlightedText text="Daily note" />);
    expect(container.textContent).toBe("Daily note");
    expect(hitSpans(container)).toEqual([]);
  });

  it("highlights a contiguous substring match as one emphasized span", () => {
    const { container } = render(
      <HighlightedText text="Daily note" query="note" />,
    );
    const hits = [...container.querySelectorAll("span span")];
    expect(hits).toHaveLength(1);
    expect(hits[0].textContent).toBe("note");
    // The CommandPalette hit styling contract: color via text-foreground,
    // weight/underline emphasis.
    expect(hits[0].className).toContain("text-foreground");
    expect(hits[0].className).toContain("underline");
  });

  it("highlights non-contiguous fuzzy matches per run", () => {
    const { container } = render(
      <HighlightedText text="quick-switcher.tsx" query="qsw" />,
    );
    expect(hitSpans(container)).toEqual(["q", "sw"]);
    expect(container.textContent).toBe("quick-switcher.tsx");
  });

  it("matches case-insensitively", () => {
    const { container } = render(
      <HighlightedText text="Hello world" query="heWO" />,
    );
    expect(hitSpans(container)).toEqual(["He", "wo"]);
  });

  it("renders plain text when the query does not match", () => {
    const { container } = render(
      <HighlightedText text="Daily note" query="zzz" />,
    );
    expect(hitSpans(container)).toEqual([]);
    expect(container.textContent).toBe("Daily note");
  });
  it("uses nucleo-provided indices verbatim, superseding the query", () => {
    const { container } = render(
      <HighlightedText
        text="borrow-checker"
        query="zzz"
        indices={[0, 1, 2, 3, 4, 5]}
      />,
    );
    // "zzz" has no subsequence match — only the indices decide what pops.
    expect(hitSpans(container)).toEqual(["borrow"]);
  });

  it("maps UTF-8 byte offsets across multi-byte characters", () => {
    const { container } = render(
      <HighlightedText text="café-notes" indices={[0, 1, 2, 3]} />,
    );
    // Byte 3 is the first byte of é (2-byte UTF-8); é must not be split.
    expect(hitSpans(container)).toEqual(["café"]);
    expect(container.textContent).toBe("café-notes");
  });
});