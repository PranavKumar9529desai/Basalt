/**
 * Tier 3 — XSS-boundary utility tests for `src/preview/html-sanitize.ts`
 * (`sanitizeHtml`, `HTML_SANITIZE_CONFIG`).
 *
 * `sanitizeHtml` is the single sanitization boundary for every HTML render
 * surface. These tests pin that dangerous markup is stripped and safe markup
 * passes through under the shared allow-list.
 */
import { describe, expect, it } from "vitest";
import { HTML_SANITIZE_CONFIG, sanitizeHtml } from "../../src/preview/html-sanitize";

describe("sanitizeHtml allow-list", () => {
  it("allow-lists common safe inline/block tags", () => {
    const out = sanitizeHtml("<p>Hello <strong>world</strong></p><ul><li>a</li></ul>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
  });

  it("strips <script> and inline event handlers (XSS boundary)", () => {
    const out = sanitizeHtml(
      '<p onclick="alert(1)">hi<img src=x onerror="alert(2)"><script>alert(3)</script></p>',
    );
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
  });

  it("strips javascript: URLs in href", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">bad</a>');
    expect(out).not.toContain("javascript:");
  });

  it("permits data: img src (used for embedded media)", () => {
    const out = sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="x">');
    expect(out).toContain("data:image/png");
  });

  it("drops disallowed tags entirely but keeps safe text", () => {
    const out = sanitizeHtml("<iframe src='x'></iframe>text");
    expect(out).not.toContain("iframe");
    expect(out).toContain("text");
  });
});

describe("HTML_SANITIZE_CONFIG", () => {
  it("disallows data attributes (ALLOW_DATA_ATTR false)", () => {
    expect(HTML_SANITIZE_CONFIG.ALLOW_DATA_ATTR).toBe(false);
  });

  it("does not allow script or iframe tags", () => {
    expect(HTML_SANITIZE_CONFIG.ALLOWED_TAGS).not.toContain("script");
    expect(HTML_SANITIZE_CONFIG.ALLOWED_TAGS).not.toContain("iframe");
    expect(HTML_SANITIZE_CONFIG.ALLOWED_TAGS).not.toContain("object");
    expect(HTML_SANITIZE_CONFIG.ALLOWED_TAGS).not.toContain("embed");
  });

  it("allows table + figure structure used by widgets", () => {
    for (const t of ["table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption"]) {
      expect(HTML_SANITIZE_CONFIG.ALLOWED_TAGS).toContain(t);
    }
  });
});
