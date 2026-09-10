# ADR-031: PDF Export — Snapshot of Reading Mode

**Status:** Accepted (implemented)
**Date:** 2026-09-04
**Extends:** ADR-029 (single renderer), ADR-018 (registry-driven workbench), ADR-026 (HTML rendering in markdown)

> **Implementation status:** live. PDF export is shipped as feature
> `features/export` (real media + DQL execute in the export). Not implemented:
> graph→image rasterization, paginated in-dialog preview, batch/Toc export, and
> vault-file templates. See the phases at the end.

## Context

Basalt renders every markdown feature through a **single** CM6 view
(`readingExtensions()` + block-widget system, ADR-029). Live mode, reading
mode, and the search preview all produce the same pixels from the same
Lezer/Codemirror DOM — there is no second renderer, and `Reading.tsx` is gone.

Users will need to export notes to PDF. Every existing tool in this space
(Pandoc, Obsidian's Enhancing Export, Press PDF Export, the Obsidian Typst
plugin) refactors in one critical way: **they re-parse the raw Markdown
_source_ through a separate engine** (pulldown-cmark, markdown-it, Pandoc,
Typst). Because they do not own the live renderer, their export diverges from
what the user sees on screen, and — the most-reported limitation — **dynamic
content (DQL/DataView query blocks, live graph, resolved embeds) never appears
in the PDF**:

- Obsidian Typst export: _"DataView queries … will not appear … the plugin
  exports the raw Markdown source before evaluation."_
- Press PDF Export: DataView/database blocks don't render.
- Obsidian's built-in export shares the same re-render gap.

This is a structural weakness of the _entire_ ecosystem. Basalt does not have
it, because Basalt owns both the renderer (CM6/Lezer) and the data layer
(`basalt-tables`, `basalt-graph`, `basalt-vault`).

## Decision

**A PDF export is a styled snapshot of the reading-mode renderer.** We do not
re-parse Markdown source into a second HTML/AST engine. The export builds a
fresh read-only CM6 view from the _same_ `readingExtensions()` stack (ADR-029)
in a hidden print container, lets the block widgets resolve (DQL, embeds,
frontmatter, tables, HTML), then lays that DOM out for paper via the browser's
print pipeline.

```
raw note text (current CM state, features/export/commands.ts)
  └─ read-only CM6 view = readingExtensions(deps)          ← same renderer as reading mode
       ├─ block widgets resolve in place:
       │    ├─ DQL blocks      → execute via basalt-tables → live table
       │    ├─ ![[embeds]]     → resolve via resolveAsset → media
       │    ├─ frontmatter     → Properties panel
       │    └─ tables/HTML     → typed blocks
       └─ print pipeline
            ├─ @page: size (A4/Letter/Legal) + margins, orientation
            ├─ @media print: body hidden; #export-preview-container visible
            ├─ optional theme reset (plain "no theme" mode)
            └─ .cm-* made transparent / overflow-visible ("auto-height")
```

### The invariant: content is identical by construction

Because the export renders through the since `readingExtensions()` stack the
user already reads with, **any feature that renders correctly in reading mode
automatically exports correctly**. There is no per-feature export work and no
parallel rendering pipeline to keep in sync. New markdown widgets (math,
mermaid, future DQL) appear in the PDF for free — they are correct in reading
mode, therefore they are correct in the export.

### What the stylesheet controls (chrome only)

The print stylesheet is a **thin print overlay on the reading-mode DOM**, never
a re-typesetter (contrast with Pandoc, which re-typesets content in LaTeX/Typst
and so diverges from the editor).

| Chrome controls (implemented)                   | Must NOT touch (content)  |
| ----------------------------------------------- | ------------------------- |
| Page size + margins (`@page`), orientation      | Paragraph text / ordering |
| Font size scaler (`--sat-font-prose`, px)       | Markdown semantics        |
| Theme (a "no theme" print reset)                | DQL table content / rows  |
| Include toggles (properties/images/tables/code) | Callout / code structure  |

A forum-request is to be able to export **without** the app's color theme
("Export To PDF with no color theme"). The implementation offers both: the
`includeTheme` toggle falls back to a `@media print` reset (`#000`/`#fff`
overrides), since `--sat-*` surface colors that look good on screen do not
render as a clean document.

### Where code lives

```
apps/tauri/src/features/export/       ← feature (business logic, own layer)
├── index.ts
├── commands.ts                       ← export:note — grabs active CM state + H1 name
├── store.ts                          ← useExportStore (open/closed, options, content features)
├── types.ts                          ← ExportOptions, PageSize, PageOrientation, ContentFeatures
├── lib/
│   └── pdf.ts                        ← renderAndPrint(): hidden reading-mode CM6 + print styles
└── components/
    └── ExportDialog.tsx              ← modal: page size/orientation/font/toggles → renderAndPrint()

The shell injects the reading-mode deps (PreviewDeps, features/search/types.ts)
into the dialog; the export never imports another feature directly.
```

No `basalt-export` Rust crate exists — the export is pure frontend over the
existing reading renderer. `basalt-parser::process_markdown` is **not** used:
re-parsing would re-introduce a second renderer and break the invariant.

## Consequences

### Advantages

- **One renderer, forever.** No parallel md→HTML/AST engine, no drift, no
  duplicated render logic to maintain.
- **Future features auto-work in PDF.** Correct in reading mode ⟹ correct in
  the export. This is the load-bearing property of the whole design.
- **Dynamic blocks export** (DQL, embeds, frontmatter properties) — the
  differentiator no Pandoc-based tool offers, because they re-parse source.
- **Live preview is literal and free**: the print DOM _is_ the reading-mode
  DOM laid out for paper — what you see is what you get by construction.

### Costs / risks

1. **Page breaks are the one real divergence.** The screen is one long scrolled
   document; a PDF must break cleanly (browser print engine + `break-inside`
   rules). The shipped v1 accepts browser-print defaults (`@page` margins only,
   no `break-inside` tuning).
2. **Theme bleed.** The `includeTheme` toggle's `@media print` reset handles the
   plain/no-theme mode.
3. **Async resolution.** DQL and embeds resolve over a fixed 500ms settle wait
   before `window.print()`; a very slow block could print stale. Accepted for v1.
4. **No true typesetting ceiling in v1.** Ligatures/hyphenation/widow control
   are browser-print limits. Accepted for v1; a Typst tier is possible later
   only if it consumes resolved content (out of scope here).

## Phased implementation

Verification invariant per phase: `bun run lint && bunx tsc --noEmit` from
`apps/tauri/`, plus existing feature/editor tests remain green.

### Phase 1 — Snapshot through the reading-mode renderer (implemented)

`lib/pdf.ts` `renderAndPrint()` builds a hidden `#export-preview-container`,
constructs `EditorState` over `readingExtensions(deps)` +
`EditorState.readOnly.of(true)` + `EditorView.editable.of(false)` + an
auto-height/transparent print theme, and mounts a real `EditorView` so the
block widgets render for real.

### Phase 2 — Dynamic blocks resolve (implemented, graph deferred)

DQL blocks execute through the same `readingExtensions` widget path.
Embeds resolve to real media. Graph is a live leaf, not rasterized into the
PDF — a graph→image renderer is **not** implemented.

### Phase 3 — Chrome-only layout + print stylesheet (implemented)

`@page` size (A4/Letter/Legal) + margins + orientation, the `@media print`
visibility swap onto `#export-preview-container`, the no-theme reset, and the
`.cm-*` auto-height overrides. Include-toggles (frontmatter properties, images,
tables, code blocks) are content-aware via `detectFeatures()` in `store.ts`.

### Phase 4 — Export dialog (implemented)

`ExportDialog.tsx` — modal with page size, orientation, font-size, theme, and
include toggles. Single-note export. No paginated in-dialog preview pane, no
template presets — those remain deferred.

### Phase 5 — (Deferred) paginated preview, batch + ToC manifests

A paginated WYSIWYG preview in the dialog, exporting a folder into one PDF /
one-PDF-per-note, and a ToC note in order — none shipped in v1.

### Phase 6 — (Deferred) vault-file templates

Data-driven templates as vault files (`.pdf-templates/<name>/template + css`),
discovered at runtime. No plugin host (ADR-018 Phase 5) required; explicitly
a later phase per this ADR.

## Out of scope (v1)

- Typst / true-typesetting tier (would require consuming resolved content;
  possible future ADR)
- Plugin-host-based export extension points (ADR-018 Phase 5)
- Any re-parse of Markdown source through a second engine to build the PDF — the
  whole point is to not have a second renderer
