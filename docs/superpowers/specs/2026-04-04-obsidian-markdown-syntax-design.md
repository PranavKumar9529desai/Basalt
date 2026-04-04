# Obsidian Markdown Syntax — Editor Decoration Design

**Date:** 2026-04-04  
**Status:** Approved  
**Scope:** `packages/editor`

---

## Problem

The Basalt editor uses CodeMirror 6 + Lezer's markdown grammar but has no visual treatment for most common markdown constructs. Lists, callouts, highlights, strikethrough, tables, frontmatter, and tags all render as plain unstyled text. This makes the editor feel unfinished compared to Obsidian.

---

## Approach: Option B — Grammar extensions for non-standard syntax, pure decoration for the rest

Lezer already parses standard Markdown (lists, tables, strikethrough, blockquotes, frontmatter). For Obsidian-specific syntax that Lezer does not parse (`==highlight==`, callouts `> [!type]`), we add small Lezer grammar extensions — the same pattern used for WikiLinks.

No changes to the `StateField` / `ViewPlugin` split established in `live-preview.ts`. Each new feature gets its own file in `packages/editor/src/extensions/decorations/`.

---

## Architecture

### Extension split (unchanged)

| Layer | Responsibility | When rebuilt |
|---|---|---|
| `StateField` (`livePreviewBlockFieldWithEffects`) | Block decorations — line classes + block replace widgets | Every doc/selection/focus change |
| `ViewPlugin` (`livePreviewInlinePlugin`) | Inline mark decorations — visible ranges only | Every doc/viewport/selection change |

### New grammar extensions (added to `markdown({ extensions: [] })` in `create-extensions.ts`)

| Extension | Parses | New nodes |
|---|---|---|
| `highlightExtension` | `==text==` | `Highlight`, `HighlightMark` |
| `calloutExtension` | `> [!type]`, `> [!type]+`, `> [!type]- Title` | `Callout`, `CalloutType`, `CalloutTitle`, `CalloutFold` |

### New decoration files

| File | Feature |
|---|---|
| `decorations/lists.ts` | Bullet lists, ordered lists, nesting depth |
| `decorations/callouts.ts` | Callout line classes + header widget |
| `decorations/tables.ts` | Table row/cell/header line classes |
| `decorations/frontmatter.ts` | YAML frontmatter block |
| `inline-marks.ts` (additions) | Highlight, Strikethrough, Tags |

---

## Feature Specifications

### 1. Lists

**Scope:** `BulletList`, `OrderedList`, `ListItem` nodes from Lezer.

**Behavior:**
- Each `ListItem`'s first line gets a line class: `cm-live-list-bullet` or `cm-live-list-ordered`.
- Nesting depth (1–3+) tracked by counting ancestor list nodes → adds `cm-live-list-depth-1`, `cm-live-list-depth-2`, `cm-live-list-depth-3`.
- `ListMark` node added to `HIDE_MARKS` — the raw `- ` and `1. ` are hidden on non-active lines.
- On non-active lines, a `ListBulletWidget` replaces the `ListMark` with a styled bullet glyph (`•`, `◦`, `▪` by depth) or a styled number glyph for ordered lists.
- On the active line: marks are shown as raw text (existing mark-hiding behavior).

**CSS tokens:** `--sat-list-bullet-color`, `--sat-list-indent`, `--sat-list-number-color`

---

### 2. Callouts

**Scope:** Obsidian-specific. Blockquotes whose first content line matches `[!type]`.

**Grammar extension:**
- Detects `> [!type]`, `> [!type]+`, `> [!type]- Optional Title` on the opening line of a `BlockQuote`.
- Produces: `Callout` wrapping the whole block, `CalloutType` (the string between `[!` and `]`), `CalloutFold` (`+` or `-` if present), `CalloutTitle` (text after the fold marker).

**Supported types (12):** `note`, `abstract`/`summary`/`tldr`, `info`, `todo`, `tip`/`hint`/`important`, `success`/`check`/`done`, `question`/`help`/`faq`, `warning`/`caution`/`attention`, `failure`/`fail`/`missing`, `danger`/`error`, `bug`, `example`, `quote`/`cite`

**Decoration behavior:**
- All lines in a `Callout` block get `cm-live-callout cm-live-callout-{type}` line classes.
- When cursor is **outside** the callout: the first line (`> [!type] Title`) is replaced by a `CalloutHeaderWidget` block widget showing an SVG icon + type label + title.
- When cursor is **inside** the callout: raw markdown shown (consistent with blockquote/code-block behavior).
- `QuoteMark` (`>`) on callout lines hidden via existing `HIDE_MARKS` mechanism.
- Collapsible callouts (`+`/`-`): the `CalloutHeaderWidget` renders a chevron button; clicking dispatches a transaction that toggles the fold marker and collapses/expands the body lines using `Decoration.replace` on the body range.

**CSS tokens:** `--sat-callout-{type}-border`, `--sat-callout-{type}-bg`, `--sat-callout-{type}-icon-color`, `--sat-callout-{type}-title-color`

---

### 3. Highlights

**Scope:** `==text==` — not in standard Lezer markdown grammar.

**Grammar extension:** `highlightExtension` — inline rule that wraps `==...==` spans in a `Highlight` node with `HighlightMark` children (the `==` delimiters).

**Decoration behavior:**
- `handleInlineNode` gets a new `Highlight` branch: adds `cm-live-highlight` mark.
- `HighlightMark` added to `HIDE_MARKS` — `==` hidden on non-active lines.

**CSS tokens:** `--sat-highlight-bg`, `--sat-highlight-color`

---

### 4. Strikethrough

**Scope:** `~~text~~` — Lezer already parses this as `Strikethrough` with `StrikethroughMark` children.

**Decoration behavior:**
- `handleInlineNode` gets a `Strikethrough` branch: adds `cm-live-strikethrough` mark (`text-decoration: line-through`).
- `StrikethroughMark` added to `HIDE_MARKS`.

**CSS:** `text-decoration: line-through; opacity: 0.6`

---

### 5. Tables

**Scope:** `Table`, `TableRow`, `TableDelimiter`, `TableCell` nodes — Lezer parses these when `tables: true` in the markdown config (already enabled via `markdownLanguage`).

**Decoration behavior:**
- `Table` node: all lines get `cm-live-table` line class.
- First `TableRow` (header): gets `cm-live-table-header` line class.
- `TableDelimiter` row (`|---|---|`): gets `cm-live-table-delimiter` line class (hidden when cursor outside, shown when cursor inside).
- No widgets needed — pure CSS: `border`, column alignment, header background.

**CSS tokens:** `--sat-table-border`, `--sat-table-header-bg`, `--sat-table-cell-padding`

---

### 6. Frontmatter

**Scope:** YAML frontmatter block at the very start of the document (`---\n...\n---`).

**Detection:** Use `YAMLFrontMatter` node if available from `@codemirror/lang-markdown` with `yaml: true`; otherwise scan lines 1–N for opening `---` at position 0 and closing `---`.

**Decoration behavior:**
- All lines within the frontmatter block get `cm-live-frontmatter` line class.
- Opening and closing `---` lines get `cm-live-frontmatter-fence` line class.
- Keys (lines matching `key:`) get `cm-live-frontmatter-key` mark on the key portion.

**CSS tokens:** `--sat-frontmatter-bg`, `--sat-frontmatter-text`, `--sat-frontmatter-key-color`, `--sat-frontmatter-fence-color`

---

### 7. Tags

**Scope:** `#tag`, `#parent/child` — not in standard Lezer grammar.

**Detection:** Inline regex scan in `ViewPlugin` pass. Pattern: `/#[a-zA-Z][a-zA-Z0-9/_-]*/g` applied to visible lines. Skip matches inside code spans, code blocks, and WikiLinks.

**Decoration behavior:**
- Matched spans get `cm-live-tag` mark.
- No mark hiding (the `#` is part of the tag identity, not syntax noise).

**CSS tokens:** `--sat-tag-bg`, `--sat-tag-color`, `--sat-tag-border-radius`

---

## CSS / Theming

All new classes follow the `--sat-*` token convention from ADR-002. New tokens are added to `packages/ui/src/styles/` and `packages/ui/theme/`.

Mark hiding (`cm-live-hide`) applies uniformly to all new marks via the existing `HIDE_MARKS` set in `mark-hiding.ts`. Show syntax on active line, hide otherwise — no special cases.

---

## Implementation Plan: 5 Parallel Agents

Each agent works in an isolated git worktree. Files touched are non-overlapping except for shared registration points (`live-preview.ts`, `inline-marks.ts`, `create-extensions.ts`). Merge conflicts at those files are expected and small.

| Agent | Deliverable | Files |
|---|---|---|
| **A — Lists** | `lists.ts` + `ListBulletWidget` | `decorations/lists.ts`, `live-preview.ts` (register), `HIDE_MARKS` |
| **B — Callouts** | `callouts.ts` + grammar ext + `CalloutHeaderWidget` | `decorations/callouts.ts`, `create-extensions.ts` (grammar), `live-preview.ts` (register) |
| **C — Highlights + Strikethrough** | Grammar ext for `==`, inline mark handlers | `inline-marks.ts`, `mark-hiding.ts` (`HIDE_MARKS`), `create-extensions.ts` (grammar) |
| **D — Tables** | `tables.ts` | `decorations/tables.ts`, `live-preview.ts` (register) |
| **E — Frontmatter + Tags** | `frontmatter.ts`, tag scan in `inline-marks.ts` | `decorations/frontmatter.ts`, `inline-marks.ts`, `live-preview.ts` (register) |

After all agents complete: merge all worktrees → resolve small conflicts at registration files → `bun run lint && bunx tsc --noEmit` → done.

---

## Success Criteria

- [ ] Bullet and ordered lists render with styled bullets/numbers, correct indentation per nesting depth, hidden marks on non-active lines
- [ ] All 12 callout types render with correct icon, border color, and title when cursor is outside
- [ ] Collapsible callouts (`+`/`-`) toggle on click
- [ ] `==text==` renders as highlighted, `==` hidden on non-active lines
- [ ] `~~text~~` renders as strikethrough, `~~` hidden on non-active lines
- [ ] Tables render with borders and styled header row
- [ ] Frontmatter block renders with distinct background; keys are colored
- [ ] `#tags` render as styled chips inline
- [ ] Active-line behavior: all syntax marks are revealed when cursor is on that line
- [ ] `bun run lint && bunx tsc --noEmit` passes with zero errors
