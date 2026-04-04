# Prose Typography System — Design Spec

**Date:** 2026-04-04  
**Scope:** Prose typography only — body text, headings, inline marks, heading markers. Code blocks are excluded (separate spec).

---

## Goal

Make Basalt's editor feel as good as or better than Obsidian for everyday prose writing. The three concrete problems to solve:

1. **Body text is cramped and thin** — no explicit font-size, weight, or line-height on prose
2. **Headings have no visual hierarchy** — all H3–H6 are the same weight (600) and same color
3. **Rhythm is flat** — spacing between elements feels uniform, headings don't stand out

Additionally: when the cursor is on a heading line, the `###` markers appear at full heading size and color, visually competing with the heading text itself.

---

## Root Cause Found

`packages/editor/src/themes/base.ts` sets the editor root (`&`) font family to **monospace** (`ui-monospace, Menlo, Consolas...`). This means all prose — paragraphs, headings, everything — currently renders in a code font. This is the single largest contributor to poor visual quality.

---

## Design

### 1. Inter as the prose font (`base.ts`)

Change the `&` font family from monospace to the `--sat-font-sans` stack (Inter → system-ui fallbacks). Monospace is only appropriate for code blocks and inline code, which have their own font overrides.

Also add:
- `font-optical-sizing: auto` — Inter adjusts stroke contrast and spacing per size automatically
- `font-feature-settings: "cv01" "ss01"` — Inter's cleaner alternate glyphs for `a` and `g`

### 2. Heading size scale (`editor.css`)

Reduce heading sizes to match Obsidian's proven scale. Current sizes are too large and poorly differentiated at smaller levels:

| Level | Current | New    |
|-------|---------|--------|
| H1    | 2.5em   | 2em    |
| H2    | 2em     | 1.6em  |
| H3    | 1.6em   | 1.37em |
| H4    | 1.4em   | 1.25em |
| H5    | 1.2em   | 1.12em |
| H6    | 1.1em   | 1em    |

### 3. Heading weight ladder (`editor.css`)

Requires Inter as a variable font (weight axis 100–900). Each level gets a distinct weight so the hierarchy is felt, not just seen by size alone:

| Level | Current | New |
|-------|---------|-----|
| H1    | 700     | 700 |
| H2    | 650     | 650 |
| H3    | 600     | 580 |
| H4    | 600     | 520 |
| H5    | 600     | 470 |
| H6    | 600     | 430 |

### 4. Heading letter-spacing (`editor.css`)

Large Inter at high weight looks optically loose without tightening. No other markdown editor does this in their default theme:

| Level | Letter-spacing |
|-------|---------------|
| H1    | -0.03em       |
| H2    | -0.02em       |
| H3    | -0.01em       |
| H4–H6 | 0             |

### 5. Heading line-heights (`editor.css`)

Tighter line-heights for large headings, relaxing as size decreases:

| Level | New line-height |
|-------|----------------|
| H1    | 1.15           |
| H2    | 1.2            |
| H3    | 1.25           |
| H4    | 1.3            |
| H5–H6 | 1.35           |

### 6. Heading color differentiation (`globals.css`)

The heading color tokens `--sat-editor-heading1` through `--sat-editor-heading6` already exist but are all set to the same value. Differentiate them so lower levels visually recede:

- H1–H2: full `--sat-text-primary` brightness
- H3–H4: slightly muted (explicit hex per theme, not opacity — opacity causes compositing issues in CodeMirror)
- H5–H6: noticeably muted (explicit hex per theme)

Each theme defines its own values since the right muted shade differs between dark and light backgrounds.

Also fix: `editor.css` currently uses `--sat-text-primary` for all headings instead of the `--sat-editor-heading{n}` tokens. Wire them correctly.

### 7. Inter variable font loading (`globals.css`)

Add a `@font-face` declaration loading `Inter[wght].woff2` with `font-weight: 100 900`. This enables the sub-integer weights in §3. The variable font file is bundled with the app.

### 8. Heading marker styling — live preview (`mark-hiding.ts` + `editor.css`)

**Current behavior:** When cursor is on `### My Heading`, the `###` gets the full `cm-live-heading-1` class — same size, same color as the heading text.

**New behavior:** Add a `cm-live-heading-mark` decoration to `HeaderMark` nodes on the active line. CSS gives it muted color and normal size, so the `###` visually recedes while the heading text remains prominent.

Same treatment for `EmphasisMark` (`**`, `_`, `` ` ``) when visible on the active line — add `cm-live-syntax-mark` class with muted color so they're visible but not competing.

### 9. New CSS tokens (`globals.css`)

Add to `:root` and all theme overrides:

```
--sat-editor-h1-letter-spacing: -0.03em
--sat-editor-h2-letter-spacing: -0.02em
--sat-editor-h3-letter-spacing: -0.01em
--sat-editor-h4-letter-spacing: 0
--sat-editor-h5-letter-spacing: 0
--sat-editor-h6-letter-spacing: 0

--sat-editor-heading-mark-color   (muted color for ### markers on active line)
--sat-editor-syntax-mark-color    (muted color for **, _, ` markers on active line)
```

---

## Out of Scope

- Code block styling (separate spec)
- Rust font metrics pipeline (future enhancement)
- User-configurable font size preferences (future enhancement)
- Table typography (follow-up)

---

## Files Changed

| File | Change |
|------|--------|
| `packages/editor/src/themes/base.ts` | Font family → Inter/sans, add font-optical-sizing, font-feature-settings |
| `packages/editor/src/extensions/decorations/mark-hiding.ts` | Add `cm-live-heading-mark` and `cm-live-syntax-mark` decorations on active line |
| `packages/ui/src/styles/editor.css` | Heading sizes, weights, letter-spacing, line-heights, color token wiring |
| `packages/ui/src/styles/globals.css` | Inter variable font @font-face, letter-spacing tokens, differentiated heading colors per theme |
