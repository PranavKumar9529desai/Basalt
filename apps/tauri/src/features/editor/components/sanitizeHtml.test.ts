import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@workspace/editor";

describe("sanitizeHtml (ADR-026 render-boundary sanitizer)", () => {
  it("allows safe formatting and container tags", () => {
    const out = sanitizeHtml(
      "<details><summary>Title</summary><p>Body</p></details>",
    );
    expect(out).toContain("<details>");
    expect(out).toContain("<summary>");
    expect(out).toContain("<p>");
  });

  it("allows inline style attributes", () => {
    const out = sanitizeHtml('<span style="color:red">text</span>');
    expect(out).toContain('style="color:red"');
  });

  it("allows a safe href on anchor tags", () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it("strips <script> tags", () => {
    const out = sanitizeHtml("<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(3)">');
    expect(out).not.toContain("onerror");
  });

  it("strips javascript: URIs", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("strips <iframe> (not in the allow-list)", () => {
    const out = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(out).not.toContain("iframe");
  });
});
