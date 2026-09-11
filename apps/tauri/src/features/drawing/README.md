# Drawing feature — canvas background & theming

> **The drawing canvas background always matches the selected Basalt theme's
> editor surface colour. The drawing feature itself holds no colour.**

## How it works (transparent-canvas strategy)

1. **The canvas is transparent.** Every scene we create or load runs with
   `appState.viewBackgroundColor = "transparent"` (`lib/scene.ts` →
   `CANVAS_BG`). Excalidraw's renderer treats the literal string
   `"transparent"` as "clear the canvas, paint nothing" (`bootstrapCanvas` in
   upstream `renderer/helpers.ts` skips the fill).

2. **The editor pane *is* the canvas background.** `DrawingView` paints
   `bg-[var(--sat-surface-1)]` behind the Excalidraw wrapper. Because the
   canvas is transparent, those tokens show through and *are* the drawing
   surface. The tokens are theme-derived CSS custom properties, so:

   - select any theme (Volcanic Dark, Dracula, Solarized, Catppuccin…) and the
     canvas follows automatically — **no colour lookup, no theme-switch sync,
     no hardcoded hex**;
   - light/dark theme switches repaint the pane and the canvas follows for free.

3. **The canvas-background picker is disabled** (`UIOptions.canvasActions.
   changeViewBackgroundColor: false`) so a user-picked solid colour can't break
   the invariant.

## Why it was hard (and why the naive fix fails)

Excalidraw's background is **not a CSS background** — it is painted into the
canvas every frame from `appState.viewBackgroundColor`, and in dark mode every
painted colour passes through `applyDarkModeFilter`: **93% invert + 180° hue
rotate** (upstream `packages/common/src/colors.ts`). Consequences:

- Setting the editor's dark colour (e.g. `#0d0e12`) directly as the background
  **displays as a bright near-white** (`#DEDFDF`), because the filter inverts it.
- The naive "migrate `#ffffff` → editor colour" fix actively caused the white
  canvas in dark mode.
- A theme-dependent stored colour requires per-theme pre-inversion and a
  theme-change watcher, and still breaks on light/dark flips.

Transparency sidesteps the entire filter because **nothing is painted** — the
pane's already-correct, already-theme-driven pixels show through.

## Exports & embeds (`lib/export.ts`)

The live feature is colour-free, but a downloaded PNG/SVG should carry a
solid, theme-matching background. Exports therefore support a background mode:

- `"none"` (default; used by `DrawingEmbed`) — transparent background; the note
  or editor surface shows through so drawings melt into their context.
- `"theme"` (used by the pane's SVG/PNG download actions) — bakes the live
  `--sat-surface-1` token into the file.

The dark-mode filter also applies at export time
(`applyDarkModeFilter(viewBackgroundColor, exportWithDarkMode)`), so baking a
solid colour in a dark-theme drawing feeds **`darkModePreInvert`** — the exact
upstream inverse (93%-invert undo + self-inverse 180° hue rotation),
re-implemented locally because the published `@excalidraw/excalidraw` bundle
does not export its colour helpers. The exporter's own filter then recovers the
exact token colour (verified round-trip; near-black surfaces saturate to
`#121212`, Excalidraw's own design ceiling — visually identical).

## Theme prop reactivity (`ExcalidrawWrapper`)

Excalidraw's `theme` prop (grid colour, element dark-filtering, chrome class)
tracks Basalt's `data-theme` attribute via a `MutationObserver` — so even
mid-session theme switches keep grid and chrome consistent. Only the background
needs no handling; the rest of Excalidraw's theming still keys off its own
light/dark mode.

## Known boundaries

- Grid dots are Excalidraw's hardcoded per-theme colours (not token-derived);
  subtle on dark surfaces. Only fixable by forking upstream.
- Floating chrome (toolbars, dialogs, the library panel) uses Excalidraw's own
  palette. The canvas melts into the editor; chrome theming is separate
  (CSS-variable mapping) work.
- Persisted scenes store `viewBackgroundColor: "transparent"` — a stable,
  theme-independent value. Legacy files carrying `#ffffff` are loaded
  transparent too.