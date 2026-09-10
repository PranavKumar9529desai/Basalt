# ADR-026: HTML Rendering in Markdown

**Status:** Accepted (2026-09-01)
**Date:** 2026-09-01
**Extends:** ADR-019 (editor decoration pipeline), ADR-020 (desktop-tier performance), ADR-024 (editor surface typography)

> **Implementation status:** HTML **block** rendering is shipped — the
> `html-block` widget, opaque AST variants, the single DOMPurify render
> boundary, and shared typography injection. HTML **inline** rendering (Phase 3)
> is **deferred**: inline `HTMLTag` nodes stay visible raw source with a
> `cm-live-html-tag` mark class. The planned 50-line viewport gate (Phase 2a)
> was not built. Validation below marks the shipped (block) subset.

## Context

Markdown CommonMark allows raw HTML in documents. Users migrating from
Obsidian, collaborating across editors, or pasting web content routinely
produce notes containing HTML blocks (`<details>`, `<table>`, `<div>`,
`<video>`) and inline HTML (`<span style="...">`, `<em class="...">`).

At the time of this ADR, Basalt silently dropped all HTML: the Rust parser's
event loop discarded `Event::Html`/`Event::InlineHtml`; `MarkdownNode` had no
`HtmlBlock`/`HtmlInline` variant; and while the CM6 Lezer grammar tokenizes
`HTMLBlock`/`HTMLTag`, neither the live-preview decoration pipeline nor the
reading view handled them. A note containing
`<details><summary>Click</summary>Hidden text</details>` rendered nothing
— a functional regression versus Obsidian, which renders sanitized HTML in
both reading mode and live preview.

### Why HTML rendering matters

| Use case             | Examples                                     | Frequency                                           |
| -------------------- | -------------------------------------------- | --------------------------------------------------- |
| Collapsible sections | `<details><summary>...</summary>`            | Very common — Obsidian community heavily uses these |
| Styled content       | `<div style="...">`, `<span class="...">`    | Common — paste from web, cross-editor notes         |
| Embedded media       | `<video>`, `<audio>`, `<img>` (non-markdown) | Occasional — vaults with media annotations          |
| HTML tables          | `<table>` with colspan/rowspan               | Occasional — data-heavy notes                       |
| Plugin output        | Dataview, Charts, Excalidraw HTML exports    | Common in Obsidian plugin ecosystem                 |
| Callout variants     | `<div class="admonition note">`              | Common — legacy callout syntax                      |
| CSS snippet styling  | `<div class="custom-class">` + CSS snippets  | Obsidian power-user workflow                        |

### How Obsidian handles HTML

Obsidian renders HTML in three modes:

1. **Reading mode / live preview:** The CM6 grammar tokenizes HTML nodes.
   `sanitizeHTMLToDom()` strips `<script>`, event handlers (`onclick`,
   `onload`), `javascript:` URIs, and `<iframe>` in block context. The
   sanitized DOM fragment renders inline. Obsidian explicitly does _not_
   allow Markdown inside HTML blocks.

2. **File embeds (`![[file.html]]`):** HTML files from the vault render in
   sandboxed iframes. Community plugins (`html-embed`, `artifact-embed`)
   extend this with custom protocol serving (`app://`), CSP headers, and
   DOMPurify in multiple security tiers.

3. **CSS snippets:** Users add classes via `<div class="my-class">` paired
   with custom CSS — a major customization workflow.

### Performance constraints

ADR-019 mandates: one keystroke = one transaction = one decoration pass.
The live-preview engine costs p95 = 4ms @ 100KB (production, full stack).
HTML rendering must not regress this budget. The key risks:

- Sanitization on the keystroke path would add DOMPurify cost per rebuild.
- Large HTML blocks (100+ lines) rendered as CM6 widgets on every rebuild
  would dominate the decoration pass.
- Rendering must not trigger cascading re-renders.

## Decision

Basalt renders raw HTML from markdown documents as sanitized, richly-rendered
content in the CM6 surfaces (live preview and the single-renderer reading
mode, ADR-029), using one shared block widget path. Sanitization happens off
the keystroke path.

### Governing principles

1. **Sanitize off the hot path.** HTML is sanitized at the render boundary
   (DOMPurify) when a block first enters a widget, never per-keystroke.
2. **Single-pass integration.** HTML block widgets plug into the existing
   `handleBlockWidgetsNode` dispatch — no new tree walks.
3. **Lazy by construction.** No explicit viewport gate is shipped; CM6 builds
   widgets lazily near the viewport and the >48KB doc-size budget defers the
   parse outside the keystroke path.
4. **Cursor-aware reveal.** When the cursor is inside an HTML block, the raw
   source is shown; when the cursor moves away, the rendered preview appears.
   This matches the existing WYSIWYM pattern (headings, blockquotes,
   horizontal rules).
5. **Single render-boundary sanitization.** DOMPurify runs in the browser's
   own HTML parser at every render sink (CM6 widgets, search `PreviewPane`).
   No Rust-side sanitizer — the AST's HTML strings are opaque and never
   rendered directly (see "Why one sanitizer").

### Why one sanitizer (DOMPurify), not two

Rendering raw HTML means rendering code the user did not write. A note
containing `<img src="x" onerror="…">` or `<script>…</script>` would execute
JavaScript inside the app if rendered verbatim — an XSS (Cross-Site Scripting)
vector that could read vault files, exfiltrate data, or run system commands.
Sanitizers strip the dangerous constructs (scripts, event handlers,
`javascript:` URLs) while keeping safe tags and attributes.

The architectural question is **where** to sanitize. The OWASP AppSec USA
2024 research ("Why Server-Side HTML Sanitization Fails") and the DOMPurify
threat model both converge on one principle: **sanitize where the content is
rendered, in the browser's own parser**.

> "XSS is not triggered on the server — it is triggered on the victim's
> browser. Server-side sanitizers parse with a different parser than the
> browser, producing **parser differentials**: markup that is inert to the
> server's parser becomes active when the browser re-parses — the foundation
> of mutation XSS (mXSS). The only defensible position is to sanitize where
> rendering actually occurs, on the client."

Basalt honors this: **DOMPurify is the primary and sole XSS sanitizer**,
running at the render boundary in the webview's own HTML parser. We do _not_
add a Rust-side `ammonia` sanitizer, because it would be both ineffective
and unnecessary for XSS in this application:

1. **Ineffective.** Ammonia/`libxml2`-style parsers are a different parser
   from the webview's HTML5 parser. A payload that survives ammonia's parse
   could reparse differently in the browser — the exact mXSS class server-side
   sanitizers cannot close. Sanitizing in the browser's parser eliminates the
   whole axis.

2. **Unnecessary.** The Rust AST's HTML content is **never rendered**.
   Basalt's frontend renders from the **raw file text** (confirmed:
   `open_files` returns `read_to_string` raw content; the CM6 buffer builds
   its Lezer tree from raw text). The Rust side (`basalt-vault`) consumes the
   parser only via `extract_metadata`, which reads wikilinks, tags, and
   metadata as **opaque strings** for graph, backlinks, and search index —
   none of which render HTML. A Rust-side `HtmlBlock` string would never reach
   the DOM, so sanitizing it buys nothing.

3. **Simpler.** One sanitizer, one allow-list, one place to audit. No
   cross-language config divergence, no risk of a "sanitized on the server"
   false sense of security.

The single render-boundary is enough because every HTML sink feeds through
it:

| Render surface                               | Reads from      | Sanitizer                            |
| -------------------------------------------- | --------------- | ------------------------------------ |
| CM6 live-preview block widget (`html-block`) | raw text buffer | DOMPurify                            |
| CM6 reading mode (same widget path)          | raw text buffer | DOMPurify                            |
| CM6 inline `HTMLTag`                         | raw text buffer | _no widget — stays raw + mark class_ |
| Search `PreviewPane` (CM6)                   | raw text        | DOMPurify                            |

DOMPurify runs once per block when it first enters the widget (not per
keystroke), and the `WidgetType.eq()` guard skips re-render when content is
unchanged. `dangerouslySetInnerHTML` is used only with the DOMPurify return
value, and the result is never post-processed.

**Security boundary adopted:** rendered markdown semantic markup is trusted
only after DOMPurify. Graphic/backlink/search metadata is treated as opaque
text and never rendered. There is no second "server-side" HTML render path in
this desktop app.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Note content on disk                                            │
│  open_files → read_to_string → RAW TEXT (never pre-sanitized)    │
└─────────────┬──────────────────────────────────┬────────────────┘
              │ raw file text                    │ raw file text
              ▼                                  ▼
┌───────────────────────────┐        ┌───────────────────────────────┐
│ CM6 Live Preview           │        │ Reading mode (single CM6      │
│ (raw buffer via Lezer)     │        │ view — ADR-029 readingExts)   │
│                            │        │ same htmlBlock widget path    │
│ HTMLBlock / HTMLTag nodes  │        │        │                     │
│        │                   │        │        ▼                     │
│        ▼                   │        │ shared htmlBlockSpec         │
│ handleBlockWidgetsNode     │        │   parse: slice + DOMPurify   │
│   → htmlBlockSpec          │        └───────────────────────────────┘
│   parse: slice + DOMPurify │
│   render: HtmlBlockWidget  │        ┌───────────────────────────────┐
│                            │        │ Search PreviewPane (CM6)      │
│ inline HTMLTag → raw       │        │ raw text → CM6 → DOMPurify    │
│   source + cm-live-html-   │        └───────────────────────────────┘
│   tag mark (deferred)      │
└───────────────────────────┘
        │  (search/backlinks/graph never render HTML —
        │   extract_metadata pulls opaque link/tag strings only)
```

**Note:** The Rust `basalt-parser` AST is not shown because it never renders
HTML. `basalt-vault` consumes the parser only through `extract_metadata`
(wikilinks, tags, metadata as opaque strings for graph/backlinks/search).
The `MarkdownNode::HtmlBlock` / `HtmlInline` variants keep the AST
representative of the source, but their string is opaque downstream and never
a sanitization or rendering boundary.

### Phase 1: Extend the AST (SHIPPED)

#### 1a. Extend MarkdownNode

`crates/basalt-types/src/node.rs`:

```rust
pub enum MarkdownNode {
    // ... existing variants ...
    HtmlBlock(String),    // raw HTML block (opaque downstream)
    HtmlInline(String),   // raw inline HTML (opaque downstream)
}
```

These variants make the AST representative of the source document. **No
sanitization happens here**: the strings are opaque to graph/backlinks/search
(which extract links/tags, never render). The frontend does not render from
this AST at all — it renders from raw file text via Lezer.

#### 1b. Handle HTML events in parse_markdown

`crates/basalt-parser/src/parser.rs` preserves the raw HTML (no sanitizer)
into `Event::Html` → `HtmlBlock` and `Event::InlineHtml` → `HtmlInline`. No
`ammonia` dependency is added.

#### 1c. Frontend dependency: DOMPurify

`dompurify` is a dependency of `packages/editor` (used by the CM6 widgets).
`@types/dompurify` ships alongside for typing.

#### 1d. DOMPurify configuration

A strict allow-list, consistent across all render surfaces, is the single
source of truth in `packages/editor/src/preview/html-sanitize.ts`:

```typescript
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
  // INSERT as-is; never re-process the returned value.
  return DOMPurify.sanitize(raw, HTML_SANITIZE_CONFIG);
}
```

### Phase 2: CM6 live-preview — HTML block widget (SHIPPED)

#### 2a. `packages/editor/src/block-widgets/html-block.ts`

Follows the `frontmatter.ts` block-widget pattern:

| Field                  | Value                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | `"html-block"`                                                                                                                   |
| `matches(node)`        | `node.type.name === "HTMLBlock"`                                                                                                 |
| `parse(state, node)`   | Extract text via `state.doc.sliceString(node.from, node.to)`, sanitize with `sanitizeHtml()`, return `{ html: string }`          |
| `render(model, state)` | `HtmlBlockWidget` — cursor-aware (`model.active`): raw source when the caret is inside the block, rendered `innerHTML` otherwise |
| `span(model, state)`   | `{ from: node.from, to: node.to }`                                                                                               |
| `theme`                | CSS for `.cm-live-html-block` / `.sat-html`                                                                                      |

Larger/off-screen blocks need no explicit gate: CM6 constructs widgets lazily
near the viewport, and the >48KB doc-size parse budget defers the block parse
off the keystroke path. `render()` returns `null` only when the caret is
inside the block (`model.active`, cursor-aware reveal).

#### 2b. Registration in editor.ts

The spec is registered through `commonBlockWidgetExtensions()` →
`blockWidgetSpecsFacet.of(htmlBlockSpec)` plus `HTML_BLOCK_THEME`
(`packages/editor/src/editor.ts`), inside the `blockWidgets` extension group
consumed by both the live-preview and reading-mode extension sets.

#### 2c. Theme tokens

`.cm-live-html-block` sets border, radius, padding, background
(`--sat-surface-2`), and `overflow-x: auto`; `.cm-live-html-block.cm-live-html-raw`
and `.cm-live-html-source` present the raw source (mono via `--sat-font-mono`).

### Phase 3: Inline HTML (DEFERRED)

The planned inline `HTMLTag` replacement widget was **not built**. Shipped
behavior: inline `HTMLTag` nodes stay visible, editable raw source carrying a
`cm-live-html-tag` mark class (`preview/inline-marks.ts`); no sanitization
sink, no `Decoration.replace`, no viewport-gating for long inline spans, and
`HTMLTag` is deliberately **not** in the `HIDE_MARKS` set. Rendered inline
HTML is a possible follow-up; until then inline tags are never hidden.

### Phase 4: Reading mode (obsolete under ADR-029)

The single-renderer architecture (ADR-029) deleted `Reading.tsx`; reading
mode runs the same CM6 view and the same `htmlBlockSpec` widget path. No
separate reading-mode renderer exists, so no separate sanitizer config.

### Typography model

Markdown carries no default styling — it only dictates which HTML element a
syntax construct becomes, and the editor's CM6 `.cm-content` strips the browser
UA stylesheet. So for injected HTML to render distinctly (a raw `<h1>` must not
look identical to `<p>`), the theme must style those elements, the way
Obsidian's `.markdown-rendered` rule set does.

Basalt mirrors markdown tokens so a raw `<h1>` matches `# h1`. A single shared
stylesheet, `HTML_TYPOGRAPHY_CSS` in
`packages/editor/src/preview/html-typography.ts`, is scoped under `.sat-html`
and applied to the rendered block container. The widget's `toDOM` container
carries `sat-html`; a one-time, idempotent `<style data-sat-html-typography>`
injects the shared source, guarded on `[data-sat-html-typography]` so exactly
one copy lands in `document.head`. Inline `HTMLTag` raw-source spans are
excluded (`:not(.sat-html)`) — they keep the mono raw-tag styling and are not
typography-rendered. `sanitizeHtml` strips user `<style>`/`<script>`, so the
injected stylesheet is the only CSS governing the block.

The rules reuse `--sat-editor-heading1..6`, `--sat-text-*`, `--sat-font-*`,
`--sat-editor-*`, and `--sat-layout-*` tokens with the same fallbacks as
`editor.css`, so there is one typography vocabulary for both Markdown and raw
HTML.

### Phase 5: Performance budget

#### 5a. Keystroke path — zero added cost

- DOMPurify in the CM6 widget's `parse()` runs once when a block first enters
  the widget, not on every rebuild. The `eq()` check on the `WidgetType`
  prevents DOM rebuild when content is unchanged.
- No Rust-side sanitizer is on any path — the AST holds raw HTML as opaque
  text that is never rendered.
- The `blockWidgets` extension group in the isolation benchmark attributes
  per-keystroke cost (ADR-022 rule 8) and was measured flat with HTML blocks
  present.

#### 5c. Verification

Shipped block rendering passes: `cargo test --workspace` (new `MarkdownNode`
variants), `bun run lint && bunx tsc --noEmit`, and the editor test suite
(`tests/integration`, `block-widgets/html-block` coverage, sanitize tests).

### Boundaries

- ADR-019 owns the single-pass decoration pipeline. HTML widgets must not add
  a second tree walk or nested dispatch.
- ADR-020 owns startup and bulk data. HTML sanitization is client-side only,
  consistent with "sanitize where rendered" (OWASP 2024).
- ADR-024 owns editor surface typography. HTML block theme tokens use
  `--sat-editor-*` and `--sat-layout-*` families.
- This ADR owns HTML parsing, sanitization, and rendering in the CM6 surfaces.
  The HTML file embed story (`![[file.html]]` in sandboxed iframe) is a future
  ADR (plugin host territory, ADR-018 Phase 5).

### Out of scope

- **HTML file embeds (`![[file.html]]`):** Requires sandboxed iframe, CSP
  headers, custom protocol serving. Separate ADR, Phase 5.
- **Markdown-inside-HTML:** Obsidian explicitly does not support this. Basalt
  follows the same constraint.
- **Inline HTML widget rendering:** deferred (Phase 3).
- **Plugin-generated HTML widgets:** Requires the plugin host (ADR-018
  Phase 5). This ADR provides the rendering primitives that plugins will use.

## Consequences

- Notes containing raw HTML **blocks** render correctly in live preview and
  reading mode, matching Obsidian compatibility.
- Single sanitizer (DOMPurify) runs at the render boundary in the browser's
  own HTML parser, eliminating the parser-differential / mXSS class that
  server-side sanitizers cannot close (OWASP AppSec USA 2024).
- The cursor-aware reveal pattern (raw source when editing, rendered when
  not) is consistent with headings, blockquotes, and horizontal rules.
- The `MarkdownNode` enum grows by two variants holding raw (opaque) HTML; no
  Rust sanitizer is added.
- `dompurify` is added to the frontend bundle (~7KB gzipped). This is
  acceptable for the security guarantees it provides.
- Inline HTML stays raw-with-mark (deferred); the reading-mode `<span
style="color:red">text</span>` validation item below is not yet met.

## Validation

HTML block rendering is considered compliant when:

- a note containing `<details><summary>Click</summary>Hidden</details>`
  renders a collapsible section in live preview and reading mode;
- `<script>alert(1)</script>` is stripped from rendered output;
- `onclick` event handlers are stripped from rendered output;
- `cargo test --workspace` passes;
- `bun run lint && bunx tsc --noEmit` passes.

Deferred (inline) items must not be treated as satisfied: styled inline spans
render as raw source plus the `cm-live-html-tag` mark; a 50-line HTML block
incurs no extra page-layout tax beyond what CM6's lazy widget construction
provides.
