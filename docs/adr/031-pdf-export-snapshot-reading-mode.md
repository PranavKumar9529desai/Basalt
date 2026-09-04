# ADR-031: PDF Export — Snapshot of Reading Mode

**Status:** Draft for review (no code changed)
**Date:** 2026-09-04
**Extends:** ADR-029 (single renderer), ADR-018 (registry-driven workbench), ADR-026 (HTML rendering in markdown)

## Context

Basalt renders every markdown feature through a **single** CM6 view
(`readingExtensions()` + block-widget system, ADR-029). Live mode, reading
mode, and the search preview all produce the same pixels from the same
Lezer/Codemirror DOM — there is no second renderer, and `Reading.tsx` is gone.

Users will need to export notes to PDF. Every existing tool in this space
(Pandoc, Obsidian's Enhancing Export, Press PDF Export, the Obsidian Typst
plugin) refactors in one critical way: **they re-parse the raw Markdown
*source* through a separate engine** (pulldown-cmark, markdown-it, Pandoc,
Typst). Because they do not own the live renderer, their export diverges from
what the user sees on screen, and — the most-reported limitation — **dynamic
content (DQL/DataView query blocks, live graph, resolved embeds) never appears
in the PDF**:

- Obsidian Typst export: *"DataView queries … will not appear … the plugin
  exports the raw Markdown source before evaluation."*
- Press PDF Export: DataView/database blocks don't render.
- Obsidian's built-in export shares the same re-render gap.

This is a structural weakness of the *entire* ecosystem. Basalt does not have
it, because Basalt owns both the renderer (CM6/Lezer) and the data layer
(`basalt-tables`, `basalt-graph`, `basalt-vault`).

## Decision

**A PDF export is a styled snapshot of the reading-mode DOM.** We do not
re-parse Markdown source into a second HTML/AST engine. Instead we capture the
already-rendered reading-mode output and lay it out for paper.

```
reading mode (one CM6 view, ADR-029)
  └─ EXPORT SNAPSHOT                ← capture the live DOM, not the source
       ├─ resolve / materialize dynamic blocks into static content
       │    ├─ DQL blocks      → execute via basalt-tables → static table
       │    ├─ graph view      → export current graph → image
       │    ├─ ![[embeds]]     → inline resolved note content
       │    ├─ [[wikilinks]]   → resolve → real links / ToC anchors
       │    └─ callouts/code   → already-typed HTML widgets (keep as-is)
       └─ output to PDF
            ├─ layout = chrome only (page, margins, header/footer, theme)
            └─ page-break handling + print stylesheet (the one divergence)
```

### The invariant: content is identical by construction

Because the PDF is built from the same DOM the user already sees, **any
feature that renders correctly in reading mode automatically exports
correctly**. There is no per-feature export work and no parallel rendering
pipeline to keep in sync. New markdown widgets (math, mermaid, future DQL)
appear in the PDF for free — they are correct in reading mode, therefore they
are correct in the export.

### What the template/stylesheet controls (chrome only)

The "template" is a **thin print overlay on the live DOM**, never a
re-typesetter (contrast with Pandoc, which re-typesets content in LaTeX/Typst
and so diverges from the editor).

| Template controls (chrome)              | Must NOT touch (content)            |
| --------------------------------------- | ----------------------------------- |
| Page size, margins, orientation         | Paragraph text / ordering           |
| Running header/footer, page numbers     | Markdown semantics                  |
| Base font, size, line-height            | DQL table content / rows            |
| Theme (incl. a "plain / no theme" mode) | Graph rendering / dimensions        |
| Page-break rules                        | Callout / code structure            |

A forum-request is to be able to export **without** the app's color theme
("Export To PDF with no color theme"). The export must therefore offer both a
theme-tinted view and a plain "print" reset (the `@media print` reset
pattern), since `--sat-*` surface colors that look good on screen do not
render as a clean document.

### Where code lives

```
apps/tauri/src/features/export/       ← feature (business logic, own layer)
├── index.ts
├── types.ts                          ← ExportRequest, ExportTemplate, ExportResult
├── lib/
│   ├── snapshot.ts                   ← capture the reading-mode DOM + resolve dynamics
│   ├── layout.ts                     ← chrome-only pagination, page/header/footer, theme
│   └── templates.ts                  ← preset + (later) vault-file template discovery
├── store/                            ← export settings + last-used template persistence
├── hooks/                            ← useExport()
└── components/
    ├── ExportDialog.tsx              ← modal: live preview + config panel
    ├── PreviewPane.tsx               ← paginated WYSIWYG of the actual PDF
    └── TemplatePicker.tsx

packages/editor/                       ← no change for v1; reads existing DOM
```

No new `basalt-export` Rust crate is required for v1. `basalt-parser::process_markdown`
is **not** used here — re-parsing would re-introduce a second renderer and
break the invariant. If a higher-typography tier is ever needed, it would have
to consume the *resolved* content, not re-parse source (and is explicitly out
of scope for this ADR's v1).

## Consequences

### Advantages

- **One renderer, forever.** No parallel md→HTML/AST engine, no drift, no
  duplicated render logic to maintain.
- **Future features auto-work in PDF.** Correct in reading mode ⟹ correct in
  the export. This is the load-bearing property of the whole design.
- **Dynamic blocks export** (DQL / graph / embeds / wikilinks) — the
  differentiator no Pandoc-based tool offers, because they re-parse source.
- **Live preview is literal and free**: the preview pane *is* the reading-mode
  DOM laid out for paper — what you see is what you get by construction.

### Costs / risks

1. **Page breaks are the one real divergence.** The screen is one long scrolled
   document; a PDF must break cleanly across tables, code blocks, headings.
   This is the only genuinely print-specific work. Mitigation: print
   stylesheet + `break-inside` rules (or Paged.js for pagination; the Pre-view
   precedent shows we can reuse a read-only CM6 view for a print-preview pass).
2. **Theme bleed.** Must provide a plain/no-theme mode (`@media print` reset),
   or `--sat-*` colors render as a poor document.
3. **Resolution is not always trivial.** DQL executes fresh and graph must be
   rasterized; both are async and must complete before layout. This is the
   moat feature and the bulk of the engineering, not the renderer.
4. **No true typesetting ceiling in v1.** Ligatures/hyphenation/widow control
   are browser-print limits. Accepted for v1; a Typst tier is possible later
   only if it consumes resolved content (out of scope here).

## Phased implementation

Verification invariant per phase: `bun run lint && bunx tsc --noEmit` from
`apps/tauri/`, plus existing feature/editor tests remain green.

### Phase 1 — Snapshot the reading-mode DOM
Reuse the ADR-029 `readingExtensions()` stack (the same read-only CM6 view
`PreviewPane` already uses). Add `lib/snapshot.ts` to serialize the rendered
block widgets to a static HTML fragment for export, keeping content structure
intact.

### Phase 2 — Resolve dynamic blocks (the moat)
Back the snapshot's placeholders with real data:
- DQL blocks → `basalt-tables` → static table HTML (runQueryFacet path)
- graph → export current `basalt-graph` layout → image
- embeds / wikilinks → resolve via the vault layer → inline / real links
This is the feature that no Pandoc-based PDF tool can replicate.

### Phase 3 — Chrome-only layout + print stylesheet
Add page-size/margins/header-footer/theme controls and the `@media print`
reset. Offer preset templates (minimal / article / report) plus a plain
"no theme" mode.

### Phase 4 — Export dialog (live preview)
Modal with a paginated WYSIWYG preview (left) and a config panel (right):
template preset + no-theme toggle, page/typography, included-block toggles,
header/footer, ToC + outline. Persist last-used template in `features/export/store`.

### Phase 5 — Batch + ToC manifests
Export a single note, a folder into one PDF, a folder into one-PDF-per-note,
or a ToC note listing `[[links]]` in order (concatenation), with concurrency.

### Phase 6 — (Deferred) vault-file templates
Data-driven templates as vault files (`.pdf-templates/<name>/template + css`),
discovered at runtime. No plugin host (ADR-018 Phase 5) required; explicitly
a later phase per this ADR.

## Out of scope (v1)

- Typst / true-typesetting tier (would require consuming resolved content;
  possible future ADR)
- Plugin-host-based export extension points (ADR-018 Phase 5)
- Any re-parse of Markdown source to build the PDF — the whole point is to not
  re-parse
