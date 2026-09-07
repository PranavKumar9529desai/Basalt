# ADR-011: Prose Typography System — Inter, Heading Scale, Editor Font Wiring

**Date:** 2026-04-04  
**Status:** Accepted

## Context

Basalt's early UI used system fonts with no deliberate typographic hierarchy. Headings had inconsistent sizing, weight, and spacing. The CodeMirror editor used its own default monospace font rather than the app's prose font. The result was a flat, unpolished feel that fell short of Obsidian's standard.

## Decision

A full prose typography system was implemented across `packages/ui/src/styles/` and the editor layer:

### Font

- **Inter variable font** (`@fontsource-variable/inter`) installed as the primary prose font
- Exposed as `--sat-font-sans` token, applied globally
- Monospace font exposed as `--sat-font-mono` token for inline code and code blocks

### Heading Scale (`editor.css` + `html-typography.ts`)

A seven-level heading scale (h1–h7) for live/reading surfaces with a deliberate weight ladder. Applied to `.cm-line.cm-live-heading-1..7` in `packages/ui/src/styles/editor.css` (and mirrored in `packages/editor/src/preview/html-typography.ts` for block HTML):

| Level | Size   | Weight | Letter-spacing | Line-height |
| ----- | ------ | ------ | -------------- | ----------- |
| h1    | 2em    | 700    | −0.03em        | 1.15        |
| h2    | 1.6em  | 650    | −0.02em        | 1.2         |
| h3    | 1.37em | 580    | −0.01em        | 1.25        |
| h4    | 1.25em | 520    | 0              | 1.3         |
| h5    | 1.12em | 470    | 0              | 1.35        |
| h6    | 1em    | 430    | 0              | 1.35        |
| h7    | 1em    | 400    | 0              | 1.5         |

Heading color tokens (`--sat-editor-heading1..7` → `--sat-text-primary`/`--sat-text-muted`) provide a visual hierarchy: larger headings render darker, smaller headings render muted.

The `--sat-editor-h1..h7-letter-spacing` tokens are referenced (with hardcoded fallbacks) at the use sites but are **not yet emitted** by the theme generator — they remain a declared-intent gap, not live tokens.

### Editor Font Wiring (`base.ts`, `editor.css`)

- Inter applied to `.cm-scroller` (the CodeMirror scroll container) — all prose in the editor uses the prose font
- Monospace applied via token to inline code spans only
- Suggestions popup (`cm-tooltip-autocomplete`) also explicitly set to the prose font to avoid falling back to system monospace

### Syntax Marker Muting (`mark-hiding.ts`)

`##`, `**`, and `_` syntax markers are handled by the decoration pipeline's mark-hiding pass: on **non-active lines** the markers are **hidden** (`.cm-live-hide { display: none }`); on the **active line** they are **muted to `--sat-text-muted`** via `.cm-live-block-mark`/`.cm-live-inline-mark`. This reduces visual noise while the user is typing without hiding structure on other lines, and (per ADR-019) the pass is a single fused walk.

## Consequences

- The editor and UI share a consistent typographic voice
- All future font/size changes go through `--sat-font-*` and `--sat-heading-*` tokens — no raw font-family strings in component code
- The monospace/prose split is explicit and token-driven, making it easy to swap either independently
- The active-line marker muting applies only within the editor decorations layer and does not affect rendered output
