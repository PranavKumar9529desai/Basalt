import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./htmlToMarkdown";

describe("htmlToMarkdown", () => {
  it("converts bold and italic", () => {
    expect(htmlToMarkdown("<p><b>hi</b> <i>there</i></p>")).toBe(
      "**hi** *there*",
    );
  });

  it("converts headings to atx", () => {
    expect(htmlToMarkdown("<h2>Section</h2>")).toBe("## Section");
  });

  it("converts links, keeping the URL", () => {
    expect(htmlToMarkdown('<a href="https://o.md">Obsidian</a>')).toBe(
      "[Obsidian](https://o.md)",
    );
  });

  it("drops unhandled rich markup like images copy from a browser", () => {
    const out = htmlToMarkdown(
      '<p>Hello <img src="x.png" alt="pic"> world</p>',
    );
    expect(out).toContain("Hello");
    expect(out).toContain("world");
  });
});