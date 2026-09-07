// Plain-text excerpt for hover preview (ADR-038 §3 graph split): drop
// frontmatter, strip common markdown markers, collapse whitespace, cap length.
// Keeps the preview cheap (no CM6).
export const EXCERPT_MAX = 600;

export function noteExcerpt(md: string): string {
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const cleaned = body
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>`]/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return cleaned.length > EXCERPT_MAX
    ? cleaned.slice(0, EXCERPT_MAX).replace(/\s+\S*$/, "") + "…"
    : cleaned;
}