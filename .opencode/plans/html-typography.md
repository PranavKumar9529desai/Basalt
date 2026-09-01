# Rendered HTML typography — make <h1>/<p>/<span> distinct (Obsidian model)

## Problem
Raw HTML blocks render identically because neither the CM6 live-preview surface
nor Reading styles the injected elements. Markdown has no default styling — only
which HTML element it becomes — so the theme must style those elements (browser
UA stylesheet is absent in `.cm-content` and not supplied in Reading).

## How Obsidian solves it
`.markdown-rendered` typography CSS styles every HTML element with CSS variables
(`--h1-size`, `--p-*`, `--list-*`), so `<h1>` and `# h1` render identically.

## Decisions (confirmed with user)
1. **Mirror markdown tokens** — raw `<h1>` matches `# h1` via existing
   `--sat-editor-heading1..6`, `--sat-text-*`, `--sat-font-*`, `--sat-editor-*`.
2. **Single shared source** — one CSS string, no duplication.

## Implementation
### 1. New shared module `packages/editor/src/preview/html-typography.ts`
Export `HTML_TYPOGRAPHY_CSS: string` — a CSS rule set scoped under `.sat-html`,
covering: `h1..h6` (mirror `editor.css` `.cm-live-heading-*` sizes/weights/line
heights via `--sat-editor-heading*` + `--sat-editor-h{1..6}-letter-spacing`),
`p`, `ul/ol/li`, `table/th/td/caption`, `blockquote`, `pre/code`, `strong/em`,
`a`, `details/summary`, `figure/figcaption`, `img/video` (max-width:100%).
White-space/box reset inside `.sat-html` so block elements stack correctly in CM6.

Why a `.ts` string, not a `.css` import: `packages/editor` is consumed as raw TS
by Vite and has no `*.css` module declaration; its standalone `tsc` must pass.
A single exported string is the one source shared by both surfaces.

### 2. Live Preview (`packages/editor/src/block-widgets/html-block.ts`)
- Widget container div gets class `sat-html` (plus existing `cm-live-html-block`).
- Splice `HTML_TYPOGRAPHY_CSS` into the CM6 theme: wrap in a `<style>`/baseTheme
  — emit via `EditorView.baseTheme` entry, OR append a style node once in the
  widget's `toDOM`. Prefer emitting through theme so it loads with the editor
  and survives. Keep `.cm-live-html-block` container styles.

Guard: `sanitizeHtml` already strips `<style>`/`<script>` from user HTML, so the
injected typography is our own CSS only — no conflict.

### 3. Reading (`apps/tauri/src/features/editor/components/Reading.tsx` + `reading.css`)
- HTMLBlock div gets `className="markdown-reading-html sat-html"`.
- Import/render the same `HTML_TYPOGRAPHY_CSS` once (inject a single `<style>`
  element, or import as a module). Clean up the current
  `div.markdown-reading-html { font-size: inherit; color: inherit }` override so
  it no longer flattens children; keep the box styles.

### 4. Inline raw tags (span/comment) — unchanged (still visible raw markup).

### 5. Docs — update `docs/adr/026-...md` to document the typography model
(mirror-markdown-tokens; single shared `.sat-html` stylesheet).

## Verification
- `<h1>` / `<p>` / `<span>` render distinctly in both Live Preview and Reading.
- Raw `<h1>` matches `# h1` styling.
- `bunx tsc --noEmit` (editor + app), `bun run lint`, `bun run test`.
