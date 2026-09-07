/**
 * Split a (possibly expanded) template into its leading YAML frontmatter
 * block and the remaining body.
 *
 * Frontmatter is only recognized at the very first byte of a document
 * (`packages/editor/src/syntax/frontmatter.ts` requires `lineStart === 0`),
 * so template insertion must hoist a template's `---` block to the top of the
 * note rather than dropping it at the cursor where it would render as literal
 * text (ADR-022 research point 3: "the `---` must be byte-0").
 */

export interface SplitTemplate {
  /** The leading `---` block including both fences, or null when absent. */
  frontmatter: string | null;
  /** Everything after the frontmatter block (the template body). */
  body: string;
}

const LEADING_FRONTMATTER_RE = /^---\n[\s\S]*?\n---[ \t]*\n?/;

export function splitTemplateFrontmatter(template: string): SplitTemplate {
  const m = LEADING_FRONTMATTER_RE.exec(template);
  if (!m) return { frontmatter: null, body: template };
  const block = m[0].trimEnd(); // drop the trailing newline; keep the closing ---
  return { frontmatter: block, body: template.slice(m[0].length) };
}