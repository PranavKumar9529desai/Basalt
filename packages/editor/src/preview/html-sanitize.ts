import DOMPurify from "dompurify";

// The one XSS boundary: DOMPurify in the browser's own HTML5 parser closes the
// parser-differential/mXSS class server-side sanitizers can't (OWASP AppSec USA
// 2024). The Rust AST's HtmlBlock/HtmlInline strings are opaque and never
// rendered, so there is no Rust sanitizer. Insert `sanitizeHtml`'s return value
// into an HTML sink verbatim — never post-process or widen it.

/** Strict allow-list shared by every HTML render surface (CM6, Reading, Preview). */
export const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "div",
    "span",
    "p",
    "br",
    "hr",
    "pre",
    "code",
    "details",
    "summary",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "caption",
    "figure",
    "figcaption",
    "strong",
    "em",
    "del",
    "ins",
    "mark",
    "sub",
    "sup",
    "abbr",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "video",
    "audio",
    "source",
    "track",
  ],
  ALLOWED_ATTR: [
    "class",
    "style",
    "id",
    "href",
    "src",
    "alt",
    "title",
    "width",
    "height",
    "colspan",
    "rowspan",
    "scope",
    "controls",
    "autoplay",
    "loop",
    "muted",
    "poster",
    "preload",
  ],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(raw: string): string {
  return DOMPurify.sanitize(raw, HTML_SANITIZE_CONFIG);
}
