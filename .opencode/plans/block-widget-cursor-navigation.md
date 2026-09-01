# Fix arrow-key travel through rendered block widgets (HTML + frontmatter)

## Problem
The caret cannot travel through rendered block widgets (HTML block, frontmatter
Properties panel) with Up/Down arrows as in a normal editor — it skips the
whole widget.

## Root cause (confirmed)
`packages/editor/src/block-widgets/registry.ts:123` hardcodes `block: true` on
`collector.addReplace(...)`. Per CodeMirror 6, the default ArrowUp/ArrowDown
commands will **not** place the caret inside a `block: true` replace range — it
skips the entire widget. This contradicts the documented invariant in
`live-preview.ts:27-29` ("Why NOT block: true — it yanks replaced ranges out of
normal line flow, breaking cursor navigation"). The working HR/callout/code-block
widgets all use `block: false` (default).

## Fix: Model A — `block: false` + `atomicRanges`

### 1. `packages/editor/src/block-widgets/registry.ts`
- Line 123: change `collector.addReplace(span.from, span.to, widget, true)` →
  `collector.addReplace(span.from, span.to, widget)` (block:false).
- Keeps the widget DOM as a full block `<div>` (frontmatter `.cm-frontmatter-properties`,
  HTML `.cm-live-html-block`) so visuals persist.

### 2. `packages/editor/src/preview/live-preview.ts`
- Provide the replace decorations to `EditorView.atomicRanges` so arrow travel
  skips the collapsed hidden span in one press.
- Filter to replace decorations only (PointDecoration with isReplace / zero-width
  widget replaces), building a RangeSet for the atomicRanges facet.
- Conditional reveal preserved: block widgets only replace while the caret is
  away, so atomic range exists only while replaced → caret can still enter and
  edit raw source.

## Verification
- `bunx tsc --noEmit` (editor + app)
- `bun run lint`
- `bun run test` (214 app tests)
- Manual: caret above/below HTML block + frontmatter in
  `/home/pranav/Documents/obsidian/test-html-renderer.md` — arrow travel
  line-by-line as a normal editor; click rendered block flips to raw source.
