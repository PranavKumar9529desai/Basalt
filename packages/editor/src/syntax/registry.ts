import { Table, type MarkdownConfig } from "@lezer/markdown";
import { yamlFrontmatterExtension } from "./frontmatter";
import { highlightExtension } from "./highlight";
import { EMBED_MARK, wikiLinkExtension } from "./wiki-links";

/**
 * Basalt Markdown Syntax Registry (ADR-033) — the single source of truth for
 * the editor's Lezer grammar.
 *
 * Every Basalt Markdown syntax declares one manifest: the nodes it addresses
 * in the ONE parser, the custom Lezer `MarkdownConfig`(s) needed to produce
 * them, and fixture documents the coverage test parses and asserts against.
 *
 * Encoding rule: a syntax gets a *custom* grammar node only when the base
 * parser cannot produce a usable node (a parser collision — frontmatter `---`
 * vs `HorizontalRule`, highlight `==` vs `Emphasis`, wikilink `[[` vs `Link`,
 * embed `![[` vs `Image`). Constructs the base parser already addresses
 * correctly (tables, HTML blocks, fenced/DQL code) declare their built-in node
 * names with no grammar. We do not rename built-in nodes.
 *
 * `createBasaltGrammar()` folds the manifests into the one `MarkdownConfig[]`
 * used by every `markdown({ extensions })` call in `editor.ts` and the test
 * helper — no more hand-listed extension arrays.
 */
export interface SyntaxManifest {
  /** Stable id, e.g. "wikilink", "frontmatter", "highlight", "table",
   *  "html-block", "dql". */
  id: string;
  /** One-line description — feeds README and fixture-test failure messages. */
  description: string;
  /** Nodes this syntax addresses in the single parser (built-ins allowed). */
  nodeNames: string[];
  /** Custom Lezer `MarkdownConfig`s — only for parser collisions/gaps. */
  grammar?: MarkdownConfig[];
  /** Delimiter nodes live-preview hides ("WikiLinkMark", "EmbedMark", …).
   *  Derived into the shared `HIDE_MARKS` set by preview/mark-hiding.ts. */
  hiddenMarks?: string[];
  /** Real document samples; the registry test parses each and asserts every
   *  `nodeNames` entry appears. The mandatory coverage contract. */
  fixtures: string[];
}

export const basaltSyntaxManifests: SyntaxManifest[] = [
  {
    id: "wikilink",
    description:
      "[[WikiLink]] and ![[embed]] — custom nodes because the base Link/Image parsers would steal the [[.",
    nodeNames: ["WikiLink", "WikiLinkMark", EMBED_MARK],
    grammar: [wikiLinkExtension],
    hiddenMarks: ["WikiLinkMark", EMBED_MARK],
    fixtures: [
      "See [[My Note]] and [[folder/Other|alias]] here.",
      "![[attachments/photo.png]]",
      "![[sound.mp3|100x50]]",
    ],
  },
  {
    id: "frontmatter",
    description:
      "YAML frontmatter — custom block node because the base parser reads the opening --- as an HR.",
    nodeNames: ["YAMLFrontMatter"],
    grammar: [yamlFrontmatterExtension],
    fixtures: ["---\ntitle: Hello\ntags: [a, b]\n---\n\nBody text"],
  },
  {
    id: "highlight",
    description:
      "==highlight== — custom inline node because the base Emphasis parser steals the ==.",
    nodeNames: ["Highlight", "HighlightMark"],
    grammar: [highlightExtension],
    hiddenMarks: ["HighlightMark"],
    fixtures: ["This is ==important== text", "==spans== and ==more=="],
  },
  {
    id: "table",
    description:
      "GFM tables — declared via the @lezer/markdown Table extension (built-in Table node).",
    nodeNames: ["Table"],
    grammar: [Table],
    fixtures: [
      "| A | B |\n|---|---|\n| 1 | 2 |",
      "| Name | Age |\n|:-----|----:|\n| Ada  | 36  |",
    ],
  },
  {
    id: "html-block",
    description:
      "Raw HTML blocks — the base CommonMark parser already emits HTMLBlock.",
    nodeNames: ["HTMLBlock"],
    fixtures: ["<div>\n<p>hello</p>\n</div>\n\nText"],
  },
  {
    id: "dql",
    description:
      "```dql query blocks — ride the base FencedCode node (semantics via the info string).",
    nodeNames: ["FencedCode"],
    fixtures: ['```dql\nTABLE FROM "docs"\n```'],
  },
];

/**
 * Fold every manifest's grammar into the ONE grammar list consumed by the
 * editor. Identity-deduped and ordered by manifest declaration so precedence
 * (`before`/`after`) is deterministic and collision-free.
 */
export function createBasaltGrammar(): MarkdownConfig[] {
  const seen = new Set<MarkdownConfig>();
  const out: MarkdownConfig[] = [];
  for (const manifest of basaltSyntaxManifests) {
    for (const grammar of manifest.grammar ?? []) {
      if (seen.has(grammar)) continue;
      seen.add(grammar);
      out.push(grammar);
    }
  }
  return out;
}

/** Every hidden delimiter mark declared by the manifests. preview/mark-hiding.ts
 * merges these with the base mark set (HeaderMark, EmphasisMark, …). */
export function syntaxHiddenMarks(): string[] {
  const marks: string[] = [];
  for (const manifest of basaltSyntaxManifests) {
    marks.push(...(manifest.hiddenMarks ?? []));
  }
  return marks;
}
