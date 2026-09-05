# ADR-033: Syntax Registry — Single-Parser Grammar Manifests

**Status:** Accepted (2026-09-05)
**Date:** 2026-09-05
**Extends:** ADR-019 (editor decoration pipeline), ADR-022 (frontmatter engine), ADR-029 (single renderer)

## Context

The editor frontend has **one** Markdown parser. `@lezer/markdown` is composable:
every Basalt `MarkdownConfig` (`wikiLinkExtension`, `yamlFrontmatterExtension`,
`highlightExtension`, plus the GFM `Table` extension) folds into a single Lezer
parser that serves edit mode, reading mode, and the search preview. There is no
second frontend rendering parser since ADR-029 deleted `Reading.tsx`.

That is the right architecture — but it was enforced by luck, not by structure.
Grammar coverage was ad-hoc:

| Syntax       | Custom Lezer node? | Why it was added                                   | Correct? |
| ------------ | ------------------ | -------------------------------------------------- | -------- |
| Frontmatter  | ✅ `YAMLFrontMatter` | `---` collides with `HorizontalRule`               | ✅       |
| Highlight    | ✅ `Highlight`       | `==` collides with `Emphasis`                      | ✅       |
| Wikilink     | ✅ `WikiLink`        | `[[` collides with `Link` — **only the bare half** | ⚠️ 🚫      |
| Embed `![[` | ❌ (never a node)    | None — the gap was never noticed                   | ❌       |
| Tables       | ✅ `Table` (GFM ext)  | –                                                  | ✅       |
| HTML blocks  | ✅ `HTMLBlock` (base) | –                                                  | ✅       |
| DQL blocks   | ✅ `FencedCode` (base)| –                                                  | ✅       |

The **Image parser collision** is the load-bearing example. `![[image.png]]`
was swallowed by the built-in `Image` parser (`![` …) before the wikilink
inline parser (`before: "Link"`) ever ran, so the tree contained a nested plain
`Link` and **no `WikiLink` node**. `scanEmbedWikiLinks` — the scanner behind
edit-mode embed chips *and* reading-mode embed media (ADR-029) — looks for
`WikiLink` nodes preceded by a literal `!`, so it matched nothing: embeds
silently stopped rendering. It worked before ADR-029 only because the deleted
`Reading.tsx` rendered embeds with a raw regex, bypassing the grammar entirely.

**Root failure:** there was no place that *forced* every Basalt Markdown syntax
to declare itself — no equivalent of what ADR-018 (view/leaf/command registries)
and ADR-022 (block-widget registry) already do for their surfaces. New syntax
was bolted onto `editor.ts` by hand, with no coverage contract.

## Decision

Introduce a **syntax registry** in `packages/editor/`: one manifest per Basalt
Markdown syntax, folded into the single grammar via `createBasaltGrammar()`.

### Principle: one parser, custom nodes only where the base parser misparses

- The editor's grammar is **one** Lezer parser (unchanged).
- A Basalt syntax gets a **custom Lezer node only when the base parser cannot
  produce a usable node** — i.e. on a parser collision (frontmatter `---` vs
  `HorizontalRule`, highlight `==` vs `Emphasis`, wikilink `[[` vs `Link`,
  embed `![[` vs `Image`).
- Constructs the base parser already addresses correctly (tables, HTML blocks,
  fenced/DQL code) **declare their built-in node names** — they are first-class
  citizens of the registry without a grammar reimplementation. We do **not**
  rename built-in nodes (`Table`, `HTMLBlock`, `FencedCode`): reimplementing
  those block parsers is invasive and buys nothing.

### Manifest shape

```ts
interface SyntaxManifest {
  /** Stable id, e.g. "wikilink", "frontmatter", "highlight", "table",
   *  "html-block", "dql". */
  id: string;
  /** One-line description — feeds README + fixture-test failure messages. */
  description: string;
  /** Nodes this syntax addresses in the single parser (built-ins allowed). */
  nodeNames: string[];
  /** Custom Lezer `MarkdownConfig`s — only for parser collisions/gaps. */
  grammar?: MarkdownConfig | MarkdownConfig[];
  /** Delimiter nodes live-preview mark-hiding hides ("WikiLinkMark",
   *  "EmbedMark", "HighlightMark", …) — derived into `HIDE_MARKS`. */
  hiddenMarks?: string[];
  /** Real document samples; the registry test parses each and asserts every
   *  `nodeNames` entry appears. The mandatory coverage contract. */
  fixtures: string[];
}
```

### The single source of truth

- `createBasaltGrammar()` folds the manifests' `grammar` entries (identity-
  deduped, in manifest order) into the one `MarkdownConfig[]` consumed by every
  `markdown({ extensions })` site in `editor.ts` and by the test helper
  (`tests/_helpers/parse-markdown.ts`). Hand-listed extension arrays are removed.
- The **embed grammar fix** lands with the registry: `syntax/wiki-links.ts`
  gains a `WikilinkEmbed` inline parser (`before: "Image"`) emitting an
  `EmbedMark` (`!`) sibling to the `WikiLink` node, so `scanEmbedWikiLinks`
  lights up unchanged and `![alt](url)` still parses as `Image`.

### Adding a Basalt syntax

1. Add the custom Lezer node(s) only if the base parser collides or gaps.
2. Add one `SyntaxManifest` to the registry (grammar + node names + fixtures).
3. Add one fixture test assertion in the registry coverage test.
4. If it has delimiters to hide, list them in `hiddenMarks`.

## Consequences

### Benefits

- Grammar coverage is **structured and enforced**: a syntax that must be
  tree-addressable cannot ship without a manifest entry and a parse fixture.
- The embed-`Image`-collision class of bug is caught by construction, not
  discovered after regressions ship.
- New syntax is a **single-file declaration**, consistent with the ADR-018 /
  ADR-022 registry spine.
- `mark-hiding` derives its delimiter set from the registry, so new syntaxes
  get WYSIWYM behavior for free.

### Costs

- One more registry to learn (but it mirrors the existing ones).
- Manifests for table/html/dql are mostly declarative (built-in node names +
  fixtures) — ceremony, but it is the deliberate honesty of "everything is a
  node".

### Non-goals / deferred

- **Vault parser parity** (Rust `basalt-parser`/`basalt-vault`) is separate by
  design — it serves index, graph, backlinks, and rename-rewrite. Parity is
  enforced by tests, not shared code.
- A distinct custom `DqlBlock` node (over `FencedCode`) is **deferred**: it
  would touch code-block styling, code-language highlighting, and
  `isInCodeBlock` exclusions for no current user-visible gain. Tracked as a
  possible follow-up if DQL blocks ever need first-class block semantics.

## Implementation

Implemented with the embed grammar fix in
`packages/editor/src/syntax/registry.ts` (tests:
`tests/syntax/registry.test.ts`, `tests/syntax/embed-scan.test.ts`,
`tests/syntax/wiki-links.test.ts`; documented in
`packages/editor/README.md`).