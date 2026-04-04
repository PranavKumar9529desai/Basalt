# ADR-011: Prose Typography System — Inter, Heading Scale, Editor Font Wiring

**Date:** 2026-04-04  
**Status:** Accepted

## Context

Basalt's early UI used system fonts with no deliberate typographic hierarchy. Headings had inconsistent sizing, weight, and spacing. The CodeMirror editor used its own default monospace font rather than the app's prose font. The result was a flat, unpolished feel that fell short of Obsidian's standard.

## Decision

A full prose typography system was implemented across `packages/ui/src/styles/` and the editor layer:

### Font

- **Inter variable font** (`@fontsource-variable/inter`) installed as the primary prose font
- Exposed as `--sat-font-prose` token, applied globally
- Monospace font exposed as `--sat-font-mono` token for inline code and code blocks

### Heading Scale (`globals.css`)

A seven-level heading scale (h1–h7) with a deliberate weight ladder and letter-spacing:

| Level | Size | Weight | Letter-spacing |
|---|---|---|---|
| h1 | 2rem | 700 | −0.03em |
| h2 | 1.5rem | 600 | −0.02em |
| h3 | 1.25rem | 600 | −0.015em |
| h4 | 1.125rem | 500 | −0.01em |
| h5 | 1rem | 500 | 0 |
| h6 | 0.875rem | 500 | 0 |
| h7 | 0.75rem | 400 | 0 (explicit) |

Heading color tokens (`--sat-text-primary`, `--sat-text-muted`) provide a visual hierarchy: larger headings render darker, smaller headings render muted.

Letter-spacing tokens were consolidated into the `--sat-editor-*` group for consistency.

### Editor Font Wiring (`base.ts`, `editor.css`)

- Inter applied to `.cm-scroller` (the CodeMirror scroll container) — all prose in the editor uses the prose font
- Monospace applied via token to inline code spans only
- Suggestions popup (`cm-tooltip-autocomplete`) also explicitly set to the prose font to avoid falling back to system monospace

### Syntax Marker Muting (`inline-marks.ts`)

`##`, `**`, and `_` syntax markers on the **active line** are rendered at reduced opacity rather than at full color. This reduces visual noise while the user is typing without hiding structure on other lines.

## Consequences

- The editor and UI share a consistent typographic voice
- All future font/size changes go through `--sat-font-*` and `--sat-heading-*` tokens — no raw font-family strings in component code
- The monospace/prose split is explicit and token-driven, making it easy to swap either independently
- The active-line marker muting applies only within the editor decorations layer and does not affect rendered output
