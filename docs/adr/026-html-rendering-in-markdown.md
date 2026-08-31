# ADR-026: HTML Rendering in Markdown

**Status:** Accepted (2026-09-01)
**Date:** 2026-09-01
**Extends:** ADR-019 (editor decoration pipeline), ADR-020 (desktop-tier performance), ADR-024 (editor surface typography)

## Context

Markdown CommonMark allows raw HTML in documents. Users migrating from
Obsidian, collaborating across editors, or pasting web content routinely
produce notes containing HTML blocks (`<details>`, `<table>`, `<div>`,
`<video>`) and inline HTML (`<span style="...">`, `<em class="...">`).

Basalt silently drops all HTML today:

1. The Rust parser (`basalt-parser/src/parser.rs`) uses pulldown-cmark which
   emits `Event::Html` and `Event::InlineHtml`, but the event loop catches
   them with `_ => {}` — the content is discarded.
2. `MarkdownNode` (`basalt-types/src/node.rs`) has no `HtmlBlock` or
   `HtmlInline` variant.
3. The CM6 Lezer grammar (`@lezer/markdown` 1.6.3) _does_ tokenize
   `HTMLBlock` and `HTMLTag` nodes, but neither the live-preview decoration
   pipeline (`packages/editor/src/preview/`) nor the reading view
   (`Reading.tsx`) handle them — they fall through to bare-text fallbacks.

A note containing `<details><summary>Click</summary>Hidden text</details>`
renders nothing. `<video src="cat.mp4">` disappears. `<div style="color:red">`
is gone. This is a compatibility gap and a functional regression versus
Obsidian, which renders sanitized HTML inline in both reading mode and live
preview.

### Why HTML rendering matters

| Use case | Examples | Frequency |
|----------|----------|-----------|
| Collapsible sections | `<details><summary>...</summary>` | Very common — Obsidian community heavily uses these |
| Styled content | `<div style="...">`, `<span class="...">` | Common — paste from web, cross-editor notes |
| Embedded media | `<video>`, `<audio>`, `<img>` (non-markdown) | Occasional — vaults with media annotations |
| HTML tables | `<table>` with colspan/rowspan | Occasional — data-heavy notes |
| Plugin output | Dataview, Charts, Excalidraw HTML exports | Common in Obsidian plugin ecosystem |
| Callout variants | `<div class="admonition note">` | Common — legacy callout syntax |
| CSS snippet styling | `<div class="custom-class">` + CSS snippets | Obsidian power-user workflow |

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
- The Reading view renders React components — `dangerouslySetInnerHTML` is
  cheap but must not trigger cascading re-renders.

## Decision

Basalt will render raw HTML from markdown documents as sanitized,
richly-rendered content in both the CM6 live preview and the reading view.
Sanitization happens off the keystroke path. Large blocks are viewport-gated.

### Governing principles

1. **Sanitize off the hot path.** HTML is sanitized in Rust (parse time) or
   on mount (React), never per-keystroke.
2. **Single-pass integration.** HTML block widgets plug into the existing
   `handleBlockWidgetsNode` dispatch — no new tree walks.
3. **Viewport-gated rendering.** HTML blocks exceeding 50 lines are not
   rendered as widgets until they scroll into the viewport.
4. **Cursor-aware reveal.** When the cursor is inside an HTML block or on a
   line containing inline HTML, the raw source is shown; when the cursor
   moves away, the rendered preview appears. This matches the existing
   WYSIWYM pattern (headings, blockquotes, horizontal rules).
5. **Single render-boundary sanitization.** DOMPurify runs in the browser's
   own HTML parser at every render sink (CM6 widgets, `Reading.tsx`,
   `PreviewPane`). No Rust-side sanitizer — the AST's HTML strings are opaque
   and never rendered (see "Why one sanitizer").

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
   `open_files` returns `read_to_string` raw content; the CM6 buffer and
   `Reading.tsx` both build their Lezer trees from raw text). The Rust side
   (`basalt-vault`) consumes the parser only via `extract_metadata`, which
   reads wikilinks, tags, and metadata as **opaque strings** for graph,
   backlinks, and search index — none of which render HTML. A Rust-side
   `HtmlBlock` string would never reach the DOM, so sanitizing it buys nothing.

3. **Simpler.** One sanitizer, one allow-list, one place to audit. No
   cross-language config divergence, no risk of a "sanitized on the server"
   false sense of security.

The single render-boundary is enough because every HTML sink feeds through
it:

| Render surface | Reads from | Sanitizer |
|----------------|-----------|-----------|
| CM6 live-preview block widget | raw text buffer | DOMPurify |
| CM6 live-preview inline tag widget | raw text buffer | DOMPurify |
| `Reading.tsx` (`HTMLBlock` / `HTMLTag`) | raw markdown text | DOMPurify |
| Search `PreviewPane` (CM6) | raw text | DOMPurify |

DOMPurify runs once per block when it first enters the widget (not per
keystroke), and the `WidgetType.eq()` guard skips re-render when content is
unchanged. `dangerouslySetInnerHTML` is used only with the DOMPurify return
value, and the result is never post-processed (per DOMPurify's own guidance:
*sanitize for the sink, insert without post-processing*).

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
│ CM6 Live Preview           │        │ Reading View (Reading.tsx)    │
│ (raw buffer via Lezer)     │        │ (raw markdown via Lezer)      │
│                            │        │                               │
│ HTMLBlock / HTMLTag nodes  │        │ renderBlock/renderInlineNode  │
│        │                   │        │        │                     │
│        ▼                   │        │        ▼                     │
│ handleBlockWidgetsNode     │        │ slice raw source → DOMPurify │
│   → htmlBlockSpec          │        │   → dangerouslySetInnerHTML  │
│   parse: slice + DOMPurify │        └───────────────────────────────┘
│   render: HtmlBlockWidget  │
│                            │        ┌───────────────────────────────┐
│ handleInlineNode           │        │ Search PreviewPane (CM6)      │
│   → HTMLTag mark widget    │        │ raw text → CM6 → DOMPurify    │
│   + DOMPurify              │        └───────────────────────────────┘
└───────────────────────────┘
        │  (search/backlinks/graph never render HTML —
        │   extract_metadata pulls opaque link/tag strings only)
```

**Note:** The Rust `basalt-parser` AST is not shown because it never renders
HTML. `basalt-vault` consumes the parser only through `extract_metadata`
(wikilinks, tags, metadata as opaque strings for graph/backlinks/search).
The `MarkdownNode::HtmlBlock` / `HtmlInline` variants are added to keep the
AST representative of the source, but their string is opaque downstream and
never a sanitization or rendering boundary.

### Phase 1: Extend the AST

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
(which extract links/tags, never render), so cleaning them off the render
path would be dead work and a false security boundary. Note the frontend
does not render from this AST at all — it renders from raw file text via
Lezer.

#### 1b. Handle HTML events in parse_markdown

`crates/basalt-parser/src/parser.rs` — replace the `_ => {}` catch-all
with explicit handling that preserves the raw HTML (no sanitizer):

```rust
Event::Html(html) => {
    let raw = html.into_string();
    match stack.last_mut() {
        Some(MarkdownNode::Paragraph(ref mut children))
        | Some(MarkdownNode::Blockquote(ref mut children))
        | Some(MarkdownNode::ListItem(ref mut children)) => {
            children.push(MarkdownNode::HtmlBlock(raw));
        }
        None => doc.ast.push(MarkdownNode::HtmlBlock(raw)),
        _ => {}
    }
}
Event::InlineHtml(html) => {
    let raw = html.into_string();
    match stack.last_mut() {
        Some(MarkdownNode::Heading(_, ref mut children))
        | Some(MarkdownNode::Paragraph(ref mut children))
        | Some(MarkdownNode::ListItem(ref mut children))
        | Some(MarkdownNode::Blockquote(ref mut children)) => {
            children.push(MarkdownNode::HtmlInline(raw));
        }
        _ => {}
    }
}
```

No `ammonia` dependency is added.

#### 1c. Frontend dependency: DOMPurify

Add DOMPurify to the editor package (used by the CM6 widgets) and the app
(used by `Reading.tsx` and `PreviewPane`):

```bash
cd packages/editor && bun add dompurify && bun add -d @types/dompurify
cd apps/tauri && bun add dompurify && bun add -d @types/dompurify
```

DOMPurify is the OWASP-recommended sanitizer and runs in the browser's own
HTML5 parser, eliminating parser-differential / mXSS bypasses.

#### 1d. DOMPurify configuration

A strict allow-list, consistent across all render surfaces (single source of
truth in `packages/editor/src/preview/html-sanitize.ts`):

```typescript
export const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "hr", "pre", "code",
    "details", "summary",
    "table", "thead", "tbody", "tr", "th", "td", "caption",
    "figure", "figcaption",
    "strong", "em", "del", "ins", "mark", "sub", "sup", "abbr",
    "ul", "ol", "li",
    "a", "img", "video", "audio", "source", "track",
  ],
  ALLOWED_ATTR: [
    "class", "style", "id",
    "href", "src", "alt", "title", "width", "height",
    "colspan", "rowspan", "scope",
    "controls", "autoplay", "loop", "muted", "poster", "preload",
  ],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(raw: string): string {
  // INSERT as-is; never re-process the returned value.
  return DOMPurify.sanitize(raw, HTML_SANITIZE_CONFIG);
}
```

### Phase 2: CM6 live-preview — HTML block widget

#### 2a. New file: `packages/editor/src/block-widgets/html-block.ts`

Follows the `frontmatter.ts` pattern exactly.

**BlockWidgetSpec:**

| Field | Value |
|-------|-------|
| `id` | `"html-block"` |
| `matches(node)` | `node.type.name === "HTMLBlock"` |
| `parse(state, node)` | Extract text via `state.doc.sliceString(node.from, node.to)`, sanitize with `sanitizeHtml()` (the single render-boundary sanitizer), return `{ html: string, lineCount: number }` |
| `render(model, state)` | `HtmlBlockWidget` — cursor-aware (see below) |
| `span(model, state)` | `{ from: node.from, to: node.to }` |
| `theme` | CSS for `.cm-live-html-block` |

**HtmlBlockWidget (WidgetType):**

```typescript
class HtmlBlockWidget extends WidgetType {
  private view: EditorView | null = null;

  eq(other: HtmlBlockWidget) {
    return this.model.html === other.model.html;
  }

  toDOM(_view: EditorView) {
    this.view = _view;

    const container = document.createElement("div");
    container.className = "cm-live-html-block";

    // Cursor-aware: if cursor is inside this block, show raw source
    if (this.isCursorInside(_view)) {
      container.className += " cm-live-html-raw";
      const pre = document.createElement("pre");
      pre.className = "cm-live-html-source";
      pre.textContent = this.model.raw;
      container.appendChild(pre);
    } else {
      // `model.html` is already DOMPurify-clean from parse(); insert as-is,
      // never re-process the innerHTML sink afterward.
      container.innerHTML = this.model.html;
    }

    return container;
  }

  ignoreEvent() { return true; }

  private isCursorInside(view: EditorView): boolean {
    const pos = state.selection.main.head;
    return pos >= this.from && pos <= this.to;
  }
}
```

**Performance gate:** For HTML blocks exceeding 50 lines, the widget's
`render()` returns `null` when the block is outside the viewport (checked
via `view.visibleRanges`). The block falls through to the default raw-source
display. The idle scheduler (`PreviewScheduler` at `live-preview.ts:382`)
catches newly-visible blocks on the next idle callback — no rebuild needed.

#### 2b. Register in editor.ts

Add to the `blockWidgets` group at `editor.ts:94-101`:

```typescript
blockWidgets: [
  ...frontmatterBlockWidgetGroup({...}),
  registerBlockWidget(htmlBlockSpec),
],
```

Add to `previewExtensions()` at `editor.ts:127-141` with dim-mode
presentation (showing a faded preview of the HTML content).

#### 2c. Theme tokens

```css
.cm-live-html-block {
  border: 1px solid var(--sat-layout-divider, rgba(255,255,255,0.1));
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  background: var(--sat-surface-2, rgba(255,255,255,0.03));
  overflow-x: auto;
}

.cm-live-html-block.cm-live-html-raw {
  background: var(--sat-surface-1);
  padding: 0;
}

.cm-live-html-source {
  font-family: var(--sat-font-mono);
  font-size: 0.85em;
  padding: 0.75rem 1rem;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
```

### Phase 3: CM6 live-preview — HTML inline mark

#### 3a. Add HTMLTag handling to inline-marks.ts

`packages/editor/src/preview/inline-marks.ts` — add to `handleInlineNode()`:

```typescript
if (name === "HTMLTag") {
  // Inline HTML: render as a sanitized span widget.
  // Uses Decoration.replace (block: false) because a mark class cannot
  // contain HTML — only CSS classes.
  const raw = state.doc.sliceString(node.from, node.to);
  const sanitized = domPurify.sanitize(raw, DOMPURIFY_INLINE_CONFIG);
  collector.addReplace(node.from, node.to, new HtmlInlineWidget(sanitized, raw), false);
  return true;
}
```

The `HtmlInlineWidget` is a lightweight `WidgetType` that renders the
sanitized HTML inline (self-closing tags like `<img>` become rendered
elements; container tags like `<span>` wrap their text content).

#### 3b. Add to mark-hiding set

`packages/editor/src/preview/mark-hiding.ts` — add to `HIDE_MARKS`:

```typescript
"HTMLTagMark",  // the < and > delimiters of inline HTML
```

This hides the raw delimiters on non-active lines, showing only the
rendered output.

#### 3c. Viewport gating for large inline spans

Inline HTML spans exceeding 200 characters are not replaced with the
rendered widget — they stay as raw source with a muted highlight class.
This prevents pathological inline HTML (e.g., a pasted `<table>` that the
parser treats as inline) from blocking the decoration pass.

### Phase 4: Reading.tsx — sanitized HTML rendering

#### 4a. Add DOMPurify dependency

```bash
bun add dompurify
bun add -d @types/dompurify
```

#### 4b. Add HTMLBlock handling to renderBlock()

`apps/tauri/src/features/editor/components/Reading.tsx` — before the
fallback at line 338:

```tsx
if (node.name === "HTMLBlock") {
  const raw = source.slice(node.from, node.to);
  const sanitized = domPurify.sanitize(raw, READING_SANITIZE_CONFIG);
  return (
    <div
      key={key}
      className="markdown-reading-html"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
```

#### 4c. Add HTMLTag handling to renderInlineNode()

Before the fallback at line 214:

```tsx
case "HTMLTag": {
  const raw = source.slice(node.from, node.to);
  const sanitized = domPurify.sanitize(raw, READING_SANITIZE_CONFIG);
  return (
    <span
      key={key}
      className="markdown-reading-html-inline"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
```

#### 4d. Sanitization configuration

```typescript
const READING_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "hr", "pre", "code",
    "details", "summary",
    "table", "thead", "tbody", "tr", "th", "td", "caption",
    "figure", "figcaption",
    "strong", "em", "del", "ins", "mark", "sub", "sup", "abbr",
    "ul", "ol", "li",
    "a", "img", "video", "audio", "source", "track",
  ],
  ALLOWED_ATTR: [
    "class", "style", "id",
    "href", "src", "alt", "title", "width", "height",
    "colspan", "rowspan", "scope",
    "controls", "autoplay", "loop", "muted", "poster", "preload",
  ],
  ALLOW_DATA_ATTR: false,
};
```

### Phase 5: Performance budget

#### 5a. Keystroke path — zero added cost

- DOMPurify in the CM6 widget's `parse()` runs once when a block first
  enters the widget, not on every rebuild. The `eq()` check on the
  `WidgetType` prevents DOM rebuild when content is unchanged.
- Viewport gating ensures large blocks (50+ lines) are skipped on the
  decoration pass when not visible.
- No Rust-side sanitizer is on any path — the AST holds raw HTML as opaque
  text that is never rendered.

#### 5b. Expected benchmark impact

| Variant | p50 | p95 | Gate |
|---------|-----|-----|------|
| Full (no HTML) | ≤2ms | 4ms | Current |
| +HTML blocks (small) | ≤2ms | 4ms | No regression — blocks cached after first parse |
| +HTML blocks (large, in viewport) | ≤3ms | 5ms | Acceptable — viewport-gated |
| +HTML blocks (large, off-screen) | ≤2ms | 4ms | No regression — skipped |
| +HTML inline | ≤2ms | 4ms | No regression — mark cost is O(1) per tag |

#### 5c. Verification

1. Run the isolation benchmark with a 100KB document containing 50 HTML
   blocks of varying sizes — p95 must stay ≤5ms.
2. Open a document with a 500-line HTML block, scroll through it — measure
   scroll jank via `PerformanceObserver` (must not exceed 1 frame drop).
3. `cargo test --workspace` must pass with the new `MarkdownNode` variants.
4. `bun run lint && bunx tsc --noEmit` must pass.

### Boundaries

- ADR-019 owns the single-pass decoration pipeline. HTML widgets must not
  add a second tree walk or nested dispatch.
- ADR-020 owns startup and bulk data. HTML sanitization is client-side only,
  consistent with "sanitize where rendered" (OWASP 2024).
- ADR-024 owns editor surface typography. HTML block theme tokens use
  `--sat-editor-*` and `--sat-layout-*` families.
- This ADR owns HTML parsing, sanitization, and rendering in both CM6 and
  Reading views. The HTML file embed story (`![[file.html]]` in sandboxed
  iframe) is a future ADR (plugin host territory, ADR-018 Phase 5).

### Out of scope

- **HTML file embeds (`![[file.html]]`):** Requires sandboxed iframe,
  CSP headers, custom protocol serving. Separate ADR, Phase 5.
- **Markdown-inside-HTML:** Obsidian explicitly does not support this.
  Basalt follows the same constraint.
- **Plugin-generated HTML widgets:** Requires the plugin host (ADR-018
  Phase 5). This ADR provides the rendering primitives that plugins will
  use.

## Consequences

- Notes containing raw HTML now render correctly in both live preview and
  reading mode, matching Obsidian compatibility.
- Single sanitizer (DOMPurify) runs at every render sink in the browser's own
  HTML parser, eliminating the parser-differential / mXSS class that server-side
  sanitizers cannot close (OWASP AppSec USA 2024).
- The cursor-aware reveal pattern (raw source when editing, rendered when
  not) is consistent with headings, blockquotes, and horizontal rules.
- Viewport gating prevents pathological HTML content from degrading scroll
  or typing performance.
- The `MarkdownNode` enum grows by two variants holding raw (opaque) HTML;
  all match sites in the Rust parser must be updated. No Rust sanitizer is
  added.
- `dompurify` is added to the frontend bundle (~7KB gzipped). This is
  acceptable for the security guarantees it provides.

## Validation

HTML rendering is considered compliant when:

- a note containing `<details><summary>Click</summary>Hidden</details>`
  renders a collapsible section in live preview;
- a note containing `<span style="color:red">text</span>` renders styled
  text in reading mode;
- `<script>alert(1)</script>` is stripped from rendered output;
- `onclick` event handlers are stripped from rendered output;
- a document with 50+ HTML blocks maintains p95 ≤5ms typing latency;
- scrolling through a document with a 500-line HTML block does not drop
  frames;
- `cargo test --workspace` passes;
- `bun run lint && bunx tsc --noEmit` passes.
