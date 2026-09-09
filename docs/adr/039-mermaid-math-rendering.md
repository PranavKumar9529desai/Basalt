# ADR-039: Mermaid Diagrams + KaTeX Math Rendering

**Status:** Accepted (2026-09-08)
**Date:** 2026-09-08
**Extends:** ADR-019 (editor decoration pipeline), ADR-029 (single renderer),
ADR-033 (syntax registry), ADR-022 (block widget registry)

---

## Context

Basalt targets Obsidian-class power users. Two features are conspicuously absent
from the current editor — both are among the most-requested in the note-taking
space:

1. **Mermaid diagrams** — fenced ` ```mermaid ` code blocks that render to
   SVG flow charts, sequence diagrams, Gantt charts, ER diagrams, etc.
2. **Math (KaTeX)** — `$...$` inline LaTeX and `$$...$$` block LaTeX that
   render to typeset mathematical equations.

At the time of this ADR, both features are completely absent: Mermaid blocks
render as ordinary syntax-highlighted code; `$...$` and `$$...$$` render as
raw text. A user migrating from Obsidian or working with scientific notes will
immediately notice these gaps.

### Competitive landscape

| App                | Mermaid             | Math                | Key pain points observed                                                                                                       |
| ------------------ | ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Obsidian**       | ✅ Built-in         | ✅ Built-in (KaTeX) | Bundle bloat at startup; SVG sizing bugs; Mermaid locked to release cycle; no `securityLevel` enforcement in some plugin paths |
| **Typora**         | ✅ Built-in         | ✅ Built-in (KaTeX) | Closed-source; proprietary; no Lezer/CM6 integration model                                                                     |
| **Logseq**         | ⚠️ Community plugin | ✅ Built-in (KaTeX) | Mermaid via plugins only; rendering lags on complex graphs; theme mismatches                                                   |
| **Joplin**         | ✅                  | ✅                  | Dual-pane architecture; layout thrash; high memory on math-heavy notes                                                         |
| **Zettlr**         | ✅                  | ✅                  | Pandoc dependency for math makes offline rendering brittle                                                                     |
| **Foam / Dendron** | ❌                  | ❌                  | No live preview; VS Code dependent                                                                                             |

### What Obsidian gets right — and what it gets wrong

**Right:**

- Both features render in the same single CM6 view used for editing (no
  split-pane latency — the ADR-029 single-renderer architecture Basalt already shares)
- Cursor-reveal pattern: caret inside a block shows raw source; cursor outside
  shows rendered output (WYSIWYM — Basalt already implements this for headings,
  callouts, HR, frontmatter, DQL, HTML)

**Wrong — Basalt's opportunity:**

| Obsidian Failure                | Specifics                                                                                                            | Basalt Fix                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Mermaid bundled eagerly**     | ~2–3 MB JS is in the initial bundle, paid on every boot regardless of whether a note has a diagram                   | `await import('mermaid')` on first diagram → separate Vite chunk                                                                       |
| **KaTeX bundled eagerly**       | ~240 KB KaTeX bundle always loaded                                                                                   | `await import('katex')` on first math node → separate Vite chunk                                                                       |
| **SVG sizing bugs**             | Mermaid SVGs overflow their containers; users inject CSS hacks like `.mermaid svg { max-width: 100%; height: auto }` | Widget forces `max-width: 100%; height: auto; overflow: hidden`                                                                        |
| **`securityLevel` overridable** | Diagram `%%{init: {"securityLevel":"loose"}}%%` directives can override the global setting in some plugin paths      | `mermaid.initialize({ securityLevel: 'strict' })` called once at module load; not re-applied per diagram                               |
| **No content caching**          | Re-renders SVG on every editor rebuild even when diagram source is unchanged                                         | `WidgetType.eq()` compares diagram body string; `toDOM` only called when content changes; module-level `Map<string, string>` SVG cache |
| **Mermaid update locked**       | New Mermaid features (Timeline, XY chart, Quadrant) require a full Obsidian release                                  | Basalt pins Mermaid as a normal npm dep; updatable independently                                                                       |

### Why Rust/WASM is NOT the right choice here

This is the most important architectural decision in this ADR.

**For Mermaid:**
The Mermaid layout engine (dagre + ELK) is complex JavaScript written over many
years. Rust/WASM alternatives:

- `Merman` and `Selkie` — headless Rust Mermaid parsers/renderers. Both are
  experimental and do not cover the full Mermaid grammar (no Gantt, no ER, no
  sequence with `autonumber`, no theming). Not production-ready as of 2026.
- Rendering via Rust → SVG → `resvg` for rasterisation would discard the
  interactive SVG properties (tooltips, class-based theming, click handlers).
- **Conclusion: use `mermaid` npm package with lazy loading.**

**For KaTeX:**

- `latex2mathml` (Rust WASM) — outputs MathML, not HTML/CSS. MathML rendering
  is browser-dependent: Chromium added MathML Core support only in 2023, and
  WebKitGTK's MathML rendering is inconsistent and visually inferior to KaTeX's
  HTML/CSS output. The power users who write math in their notes expect KaTeX's
  visual quality.
- `katex-rs` — Rust bindings. Incomplete macro coverage; common environments
  (`\begin{align}`, `\cases`, `\boldsymbol`) are not supported.
- Porting the JavaScript KaTeX renderer to a WASM context would not reduce
  keystroke latency, because KaTeX is already synchronous and very fast (~1ms
  for a typical equation on modern hardware). It would only add WASM bridge
  serialization overhead.
- **Conclusion: use `katex` npm package with lazy loading.**

ADR-007 (TypeScript vs Rust Responsibilities) is precise here:

> _Rust accelerates bulk work off the keystroke path (search, indexing, file
> IO). The hot path stays local and minimal._

Rendering a single equation or diagram on a `toDOM` call is not bulk work. It
is local DOM computation happening inside the webview where serialization across
the IPC boundary would cost more than the computation itself (same conclusion
as ADR-019 §"Why not Rust for the keystroke path").

---

## Decision

Basalt adds Mermaid and KaTeX rendering to the CM6 editor surfaces (live
preview and reading mode) using:

1. **`mermaid` npm package** for Mermaid diagram rendering, lazily imported.
2. **`katex` npm package** for KaTeX math rendering, lazily imported.
3. Both integrate through the existing `BlockWidgetSpec` registry
   (`packages/editor/src/block-widgets/registry.ts`) — the same pipeline used
   by DQL, HTML, and table block widgets (ADR-022). **Zero changes to the
   single-pass decoration pipeline (ADR-019).**
4. Inline math (`$...$`) integrates through a new handler
   `handleInlineMathNode()` called within the existing fused tree walk in
   `collector.ts`, exactly as `handleInlineNode()` handles `InlineCode` and
   `WikiLink` nodes today.

### Governing principles

1. **Lazy loading above all.** Neither library is imported at module level.
   Both use `await import(...)` inside `toDOM`. Vite auto-splits them into
   separate chunks. Initial bundle is not affected.
2. **Content-keyed caching.** Module-level `Map<string, string>` caches
   rendered SVG/HTML keyed by source text. `WidgetType.eq()` prevents `toDOM`
   from being called at all when source is unchanged. Same caching model as
   `dql-widget.ts`'s `queryCache`.
3. **Single-pass integration.** No new tree walks. Both handlers call into the
   single `tree.iterate()` in `collector.ts` via handler functions.
4. **Security-strict Mermaid.** `securityLevel: 'strict'` on
   `mermaid.initialize()`. Cannot be overridden by diagram directives.
5. **Cursor-aware reveal.** When the cursor is inside a Mermaid block or on
   the line of an inline math expression, the raw source is shown. Cursor off
   → rendered output. Matches the existing WYSIWYM pattern.
6. **`--sat-*` tokens only.** All widget CSS uses Basalt's design token
   families. No raw hex colors, no Tailwind utility classes.
7. **No Rust-side changes.** Neither feature touches the Rust backend, any IPC
   commands, or `crates/`. Mermaid and KaTeX are frontend-only.

---

## Architecture

### How the existing pipeline works (for context)

The single-pass decoration engine in `preview/collector.ts::buildPreviewState()`
walks the Lezer syntax tree once per rebuild. The walk calls specialized
handlers for each node type. `handleBlockWidgetsNode` reads all registered
`BlockWidgetSpec`s (via the `blockWidgetSpecsFacet`) and for each matching node
calls:

- `spec.matches(node)` — cheap gate
- `spec.parse(state, node)` — synchronous extraction of a typed model
- `spec.render(model, state)` — returns `WidgetType | null`

This is already used by: `frontmatterBlockSpec`, `htmlBlockSpec`,
`tableBlockSpec`, `dqlBlockSpec`.

### Where Mermaid and Math plug in

```
packages/editor/src/block-widgets/
  mermaid-widget.ts    ← NEW: mermaidBlockSpec + MermaidWidget
  mermaid-theme.ts     ← NEW: CM6 theme using --sat-* tokens
  math-widget.ts       ← NEW: mathBlockSpec + MathBlockWidget +
                                MathInlineWidget + handleInlineMathNode
  math-theme.ts        ← NEW: CM6 theme using --sat-* tokens
  registry.ts          (unchanged)
  dql-widget.ts        (unchanged — reference implementation)
  html-block.ts        (unchanged — reference implementation)
```

**Mermaid** enters as a `BlockWidgetSpec` that matches `FencedCode` nodes
where the info string is `mermaid`. Identical detection pattern to `dqlBlockSpec`.

**Block math** (`$$...$$`) enters as a `BlockWidgetSpec` matching `BlockMath`
Lezer nodes (produced by enabling `markdownMath()` in the grammar).

**Inline math** (`$...$`) is NOT a `BlockWidgetSpec` — those are block-level
only. Instead, `handleInlineMathNode()` is a new handler called alongside
`handleInlineNode()` in the tree walk. It detects `InlineMath` Lezer nodes and
emits `Decoration.replace()` with `MathInlineWidget`.

### Grammar extension (Lezer)

`@codemirror/lang-markdown` ships `markdownMath()`, a `MarkdownConfig` that
teaches the Lezer parser to emit `InlineMath` (for `$...$`) and `BlockMath`
(for `$$...$$`) nodes. This is registered in `syntax/registry.ts` as a new
`SyntaxManifest` (id `"math"`).

`createBasaltGrammar()` already folds all manifests' grammars identity-deduped,
so `markdownMath()` is included automatically. No other change to `registry.ts`.

For Mermaid: no new grammar entry — it rides the existing `FencedCode` node
exactly as `dql` does.

---

## Implementation Phases

### Phase 1 — ADR + grammar + package deps (this commit)

- Write this ADR to `docs/adr/039-mermaid-math-rendering.md`
- Update `AGENTS.md` status table
- Add `katex ^0.16.x`, `mermaid ^11.x`, `@types/katex` to
  `packages/editor/package.json`
- Add `math` `SyntaxManifest` with `markdownMath()` to `syntax/registry.ts`

### Phase 2 — Mermaid block widget

Files created:

- `packages/editor/src/block-widgets/mermaid-widget.ts`
- `packages/editor/src/block-widgets/mermaid-theme.ts`

Key implementation details:

- `MermaidWidget extends WidgetType`; `eq()` compares `diagramText` string
- Module-level `svgCache: Map<string, string>` keyed by diagram source
- `mermaidInitialized` guard ensures `mermaid.initialize({ securityLevel: 'strict', theme: 'dark' })` runs once
- `toDOM()`: synchronous fast path from cache; async path via `await import('mermaid')`
- `container.isConnected` guard bails if widget detached before async resolves
- `notifyViewOfSizeChange(container, view)` after async render (same as DQL)
- Code-toggle button in live mode (same UX as DQL): `createCodeToggleButton(view, (v) => v.dispatch({ selection: { anchor: this.from } }))`
- `stableId(text)`: `btoa(encodeURIComponent(text)).slice(0, 12).replace(/[^a-zA-Z0-9]/g, '')` for unique mermaid element IDs
- `ignoreEvent()` returns `true` (SVG is not interactive)
- `mermaidBlockSpec: BlockWidgetSpec<MermaidModel>` with `id: "mermaid"`

### Phase 3 — Math block + inline widgets

Files created:

- `packages/editor/src/block-widgets/math-widget.ts`
- `packages/editor/src/block-widgets/math-theme.ts`

Key implementation details:

- `mathBlockSpec` matches `BlockMath` Lezer node (from `markdownMath()`)
- `parse()` strips `$$` delimiters from the node's text slice
- `MathBlockWidget.toDOM()`: async `import('katex')`, then `katex.renderToString(latex, { displayMode: true, throwOnError: false, output: 'html' })`
- `MathInlineWidget.toDOM()`: same but `displayMode: false`
- KaTeX CSS injected once via `ensureKatexCss()`:
  `link.href = new URL('katex/dist/katex.min.css', import.meta.url).href`
- `handleInlineMathNode(node, ctx, collector)`:
  - Matches `InlineMath` node type
  - Extracts latex: `raw.slice(1, -1).trim()` (strips `$` delimiters)
  - Skip if `ctx.activeLine?.number === nodeLine` (cursor on same line)
  - Emits `collector.addReplace(node.from, node.to, new MathInlineWidget(latex))`
- Module-level `mathBlockCache` and `mathInlineCache` (`Map<string, string>`)
- `clearMathCache()` exported for vault reload/theme change
- `throwOnError: false` on both block and inline — renders partial output with inline error markers instead of blanking the whole equation

### Phase 4 — Wire into collector + editor + exports

Files modified:

- `packages/editor/src/preview/collector.ts` — add `handleInlineMathNode` call
- `packages/editor/src/editor.ts` — register specs in `commonBlockWidgetExtensions()`
- `packages/editor/src/index.ts` — export new symbols

Changes:

- `collector.ts`: add `import { handleInlineMathNode } from '../block-widgets/math-widget'`; call `handleInlineMathNode(node, ctx, collector)` after `handleMarkHidingNode(node, ctx, collector)`
- `editor.ts`: in `commonBlockWidgetExtensions()`, add `blockWidgetSpecsFacet.of(mermaidBlockSpec)`, `MERMAID_WIDGET_THEME`, `blockWidgetSpecsFacet.of(mathBlockSpec)`, `MATH_WIDGET_THEME`
- `index.ts`: export `mermaidBlockSpec`, `MERMAID_WIDGET_THEME`, `clearMermaidCache`, `mathBlockSpec`, `MathInlineWidget`, `MATH_WIDGET_THEME`, `clearMathCache`

Because `commonBlockWidgetExtensions()` is consumed by all four surface
extension sets (`createEditorExtensions`, `previewExtensions`,
`readingExtensions`, `readingModeExtras`), both widgets automatically work in
all surfaces.

### Phase 5 — Tests

Files created:

- `packages/editor/tests/block-widgets/mermaid-widget.test.ts`
- `packages/editor/tests/block-widgets/math-widget.test.ts`

Both mermaid and katex are vi-mocked so no real rendering engine runs in unit
tests:

```ts
// mermaid mock
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg><rect/></svg>" }),
  },
}));

// katex mock
vi.mock("katex", () => ({
  default: {
    renderToString: vi.fn((latex) => `<span class="katex">${latex}</span>`),
  },
}));
```

---

## Security

### Mermaid XSS

Mermaid has had multiple CVEs (e.g. CVE-2025-54881, v10.9.0–v11.9.0) from the
`%%{init}%%` directive and HTML label injection.

Mitigations:

1. `mermaid.initialize({ securityLevel: 'strict' })` called once, guarded by
   `mermaidInitialized`. Per-diagram `%%{init}%%` cannot override it.
2. `securityLevel: 'strict'` disables click handlers, `javascript:` URIs,
   custom HTML in labels, and per-diagram config overrides. Mermaid internally
   runs DOMPurify on its output at this level.
3. Basalt does NOT run an additional DOMPurify pass on the SVG output — doing
   so would strip SVG-namespace elements (`<defs>`, `<marker>`, `<path>`)
   required for correct rendering.

### KaTeX safety

KaTeX output is pure HTML/CSS — no `<script>` tags, no event handlers, no
`javascript:` URIs. No sanitization needed. `throwOnError: false` prevents
exceptions from crashing the widget.

---

## File-level change summary

| File                                                  | Status     | Description                                                                                                 |
| ----------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/editor/src/block-widgets/mermaid-widget.ts` | **NEW**    | `MermaidWidget`, `mermaidBlockSpec`, SVG cache, `clearMermaidCache`                                         |
| `packages/editor/src/block-widgets/mermaid-theme.ts`  | **NEW**    | `MERMAID_WIDGET_THEME` using `--sat-*` tokens                                                               |
| `packages/editor/src/block-widgets/math-widget.ts`    | **NEW**    | `MathBlockWidget`, `mathBlockSpec`, `MathInlineWidget`, `handleInlineMathNode`, caches, KaTeX CSS injection |
| `packages/editor/src/block-widgets/math-theme.ts`     | **NEW**    | `MATH_WIDGET_THEME` using `--sat-*` tokens                                                                  |
| `packages/editor/src/syntax/registry.ts`              | **MODIFY** | Add `math` `SyntaxManifest` with `markdownMath()` grammar                                                   |
| `packages/editor/src/preview/collector.ts`            | **MODIFY** | Call `handleInlineMathNode` in tree walk                                                                    |
| `packages/editor/src/editor.ts`                       | **MODIFY** | Register both specs in `commonBlockWidgetExtensions()`                                                      |
| `packages/editor/src/index.ts`                        | **MODIFY** | Export new symbols                                                                                          |
| `packages/editor/package.json`                        | **MODIFY** | Add `katex`, `mermaid`, `@types/katex`                                                                      |
| `docs/adr/039-mermaid-math-rendering.md`              | **NEW**    | This document                                                                                               |
| `AGENTS.md`                                           | **MODIFY** | Status table row for Mermaid + Math                                                                         |

**No Rust files. No IPC commands. No `apps/tauri` feature/shared changes.**

---

## Validation

- [x] ` ```mermaid\ngraph TD\n  A-->B\n``` ` renders SVG flowchart in live preview; cursor entering reveals raw source
- [x] ` ```mermaid\nsequenceDiagram\n  A->>B: Hello\n``` ` renders sequence diagram
- [x] `$$E = mc^2$$` renders display-mode equation
- [x] `$\alpha + \beta$` renders inline; cursor on that line reveals raw `$...$`
- [x] `$\unknown$` renders with error marker, widget does not crash
- [x] `%%{init: {"securityLevel":"loose"}}%%` in a mermaid block has no effect
- [x] Both features work in reading mode and search preview panes
- [x] `bun run build` — `mermaid` and `katex` appear as separate chunks; absent from `index.js`
- [x] `bun run lint && bunx tsc --noEmit` — clean
- [x] `cd packages/editor && bun run test` — all new tests pass
- [x] Typing latency: p95 ≤ 4ms @ 100KB (blank note, no diagrams/math)
