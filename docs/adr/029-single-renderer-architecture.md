# ADR-029: Single-Renderer Architecture — Unify Edit and Reading Modes

**Status:** Proposed
**Date:** 2026-09-03
**Extends:** ADR-018 (registry-driven workbench), ADR-019 (editor decoration pipeline), ADR-022 (frontmatter engine)

## Context

Basalt has two independent markdown rendering pipelines:

| Mode    | Engine                                       | DOM                          | Code                              |
| ------- | -------------------------------------------- | ---------------------------- | --------------------------------- |
| Edit    | CM6 `livePreviewField` + block-widget system | CM viewport (virtualized)    | ~2000 lines in `packages/editor/` |
| Reading | `Reading.tsx` — Lezer parse → React JSX      | Full React tree (unwindowed) | 1035 lines + 400 lines CSS        |

Every markdown feature (tables, embeds, DQL, callouts, frontmatter, code
highlighting) needs **two implementations**. Bug fixes must be applied twice.
Reading mode commits thousands of React nodes with no virtualization — a
5,000-line note renders every block as a React element at once
(`docs/webview-costs.md:98-103`).

The CM6 block-widget system (ADR-022) already handles tables, HTML blocks,
frontmatter, DQL queries, callouts, and inline formatting as decorations that
render rich content when the cursor is off the block. In reading mode there is
no cursor, so every widget renders rich by default — the infrastructure is
already there.

**Precedent:** `PreviewPane.tsx` (search results) already uses a read-only CM6
view with `previewExtensions()` + `EditorState.readOnly.of(true)` +
`EditorView.editable.of(false)`. This proves the pattern works.

Obsidian maintains two renderers for historical reasons (CM5 → CM6 migration
left the old markdown-it Preview pipeline in place for plugin compat). Basalt
has no such legacy — we can unify from the start.

## Decision

Replace `Reading.tsx` with CM6 in reading mode. The same `livePreviewField` +
block-widget decoration engine renders both modes. Reading mode becomes:

```
EditorState.readOnly.of(true) + EditorView.editable.of(false)
```

Mode switching uses a CM6 `Compartment` to swap mode-specific extensions
without recreating the `EditorView` or its state. Scroll position, undo
history, and cursor survive the toggle automatically.

### New components

1. **`readingExtensions(config)`** — builds the full read-only extension set
   (grammar + live-preview + all block widgets + embed media + link handling).

2. **`embed-media.ts`** — ViewPlugin that resolves `![[file]]` to actual
   `<img>/<audio>/<video>/<iframe>` via a `resolveAssetFacet`, replacing the
   edit-mode placeholder chips.

3. **`reading-link-handler.ts`** — ViewPlugin with event delegation that
   intercepts clicks on `.cm-live-wikilink` and `<a>` elements, navigating
   via `openLinkFacet`.

4. **`resolveAssetFacet`** — CM6 Facet injected by the feature layer, following
   the same pattern as `runQueryFacet` and `openLinkFacet`.

### Removed components

- `Reading.tsx` (1035 lines)
- `reading.css` (400 lines) — typography migrates to CM6 themes

### Mode switch mechanism

```
EditorController
  ├── modeCompartment: Compartment
  ├── editExts: Extension[]    (current extensions)
  └── readingExts: Extension[] (readingExtensions())

setMode("reading"):
  view.dispatch({ effects: modeCompartment.reconfigure(readingExts) })

setMode("edit"):
  view.dispatch({ effects: modeCompartment.reconfigure(editExts) })
```

The `EditorView` is never hidden or destroyed. The `<Reading>` React component
is never mounted. One CM6 view, two extension configurations.

## Consequences

### Simpler

- One rendering pipeline for all markdown features
- Bug fixes applied once
- New features (math, mermaid, etc.) implemented once in the block-widget system
- Scroll position preserved automatically (no ratio capture/restore hack)
- Reading mode gains CM6 viewport virtualization (no unwindowed React tree)

### Removed

- `Reading.tsx` — 1035 lines of independent React rendering
- `reading.css` — 400 lines of duplicated typography
- Scroll ratio manual sync between modes
- Host CSS hide/show toggle (`invisible pointer-events-none`)

### Risks
1. **Task checkbox toggling** — In reading mode, should clicking a checkbox
   toggle it? Obsidian allows this. The implementation dispatches a transaction
   that overrides `readOnly` for the specific click, toggles the `[x]`/`[ ]`,
   then returns to read-only.

3. **Frontmatter editing** — The interactive frontmatter widget (property
   editing, tag picker) is disabled in reading mode. The dim-mode presentation
   (tinted YAML) is used instead. If a user wants to edit properties, they
   switch to edit mode.

## Phased implementation

### Phase 1: `readingExtensions()` + `resolveAssetFacet`

Add to `packages/editor/src/editor.ts`. Extends `previewExtensions()` with
DQL widgets, embed media, and link handling. Export `resolveAssetFacet` from
`packages/editor/src/index.ts`.

### Phase 2: Embed media ViewPlugin

New file `packages/editor/src/input/embed-media.ts`. Scans for `![[target]]`
WikiLink nodes, resolves via `resolveAssetFacet`, renders `<img>/<audio>/
<video>/<iframe>` widgets.

### Phase 3: Reading link handler

New file `packages/editor/src/input/reading-link-handler.ts`. Event delegation
on `.cm-content` for clicks on `.cm-live-wikilink` and `<a>` elements.

### Phase 4: `modeCompartment` in EditorController

Add a `Compartment` to `EditorController` that holds mode-specific extensions.
Add `setMode(mode)` method. `EditorView.tsx` calls `setMode()` on
`tab.viewMode` change instead of mounting `<Reading>`.

### Phase 5: Rewrite `EditorView.tsx`

Remove the Host CSS toggle, the `<Reading>` mount, and the scroll ratio hack.
Call `controller.setMode(tab.viewMode)` via `useEffect`.

### Phase 6: Delete `Reading.tsx` + `reading.css`

Remove files. Add `READING_THEME` CM6 extension for reading-mode typography
(heading scale, prose width, code block styling migrated from `reading.css`).

### Phase 7: Verification

- `bun run lint && bunx tsc --noEmit` clean
- Toggle edit↔reading on notes with: frontmatter, tables, code blocks, DQL
  queries, embeds, wikilinks, callouts, HTML blocks
- Scroll position preserved on toggle
- Large notes (500+ lines) render without jank in reading mode
- No broken imports from deleted files
