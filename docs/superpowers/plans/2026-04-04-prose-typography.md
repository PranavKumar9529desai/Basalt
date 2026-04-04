# Prose Typography System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Basalt's monospace-default editor with a full prose typography system — Inter variable font, differentiated heading hierarchy, and muted syntax markers on active lines.

**Architecture:** Install Inter as a variable font via `@fontsource-variable/inter`, fix the editor root font in `base.ts`, add heading color/size/weight/letter-spacing tokens to `globals.css`, and update `editor.css` to consume them. Heading syntax markers (`###`, `**`) on active lines get a muted-color decoration in `mark-hiding.ts` instead of appearing at full heading style.

**Tech Stack:** CodeMirror 6 (EditorView.theme / baseTheme), CSS custom properties (`--sat-*` token system), Inter variable font (weight axis 100–900), Biome lint, TypeScript strict mode.

---

## File Map

| File | What changes |
|------|-------------|
| `packages/ui/package.json` | Add `@fontsource-variable/inter` |
| `packages/ui/src/styles/globals.css` | `@import` Inter variable font; add letter-spacing tokens; differentiate `--sat-editor-heading1`–`heading6` per theme |
| `packages/editor/src/themes/base.ts` | `&` fontFamily → `var(--sat-font-sans)`; add fontOpticalSizing, fontFeatureSettings |
| `packages/editor/src/extensions/decorations/inline-marks.ts` | `.cm-live-inline-code` fontFamily → `var(--sat-font-mono)` |
| `packages/editor/src/extensions/decorations/mark-hiding.ts` | Active-line marks → `cm-live-block-mark` / `cm-live-inline-mark` instead of no-op |
| `packages/ui/src/styles/editor.css` | Heading sizes, weights, letter-spacing, line-heights; wire `--sat-editor-heading{n}` colors; add `cm-live-block-mark` / `cm-live-inline-mark` styles |

---

## Task 1: Install Inter variable font and wire it into globals.css

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Install `@fontsource-variable/inter` in the ui package**

```bash
cd /path/to/repo && bun add @fontsource-variable/inter --cwd packages/ui
```

Expected output: a line added to `packages/ui/package.json` under `dependencies`.

- [ ] **Step 2: Import the variable font at the top of `globals.css`**

Open `packages/ui/src/styles/globals.css`. Add this as the very first line, before the `:root {` block:

```css
@import '@fontsource-variable/inter/wght.css';
```

This registers the `@font-face` for `'Inter Variable'` with `font-weight: 100 900`.

- [ ] **Step 3: Update `--sat-font-sans` to reference the variable font**

The current value starts with `Inter`. Replace it to prefer `Inter Variable` first:

Find this block in `globals.css` `:root`:
```css
  --sat-font-sans:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
```

Replace with:
```css
  --sat-font-sans:
    'Inter Variable', Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
```

- [ ] **Step 4: Add letter-spacing tokens to `:root` in `globals.css`**

Inside the `:root { ... }` block, after the existing `--sat-font-*` lines, add:

```css
  --sat-editor-h1-letter-spacing: -0.03em;
  --sat-editor-h2-letter-spacing: -0.02em;
  --sat-editor-h3-letter-spacing: -0.01em;
  --sat-editor-h4-letter-spacing: 0;
  --sat-editor-h5-letter-spacing: 0;
  --sat-editor-h6-letter-spacing: 0;
```

- [ ] **Step 5: Differentiate heading colors in `:root`**

The default dark theme currently has `heading1` through `heading6` all set to `#e2e8f0`. Find and update these lines in the `:root` block (look for `--sat-editor-heading1`):

```css
  --sat-editor-heading1: #e2e8f0;
  --sat-editor-heading2: #e2e8f0;
  --sat-editor-heading3: #cbd5e1;
  --sat-editor-heading4: #cbd5e1;
  --sat-editor-heading5: #94a3b8;
  --sat-editor-heading6: #94a3b8;
```

- [ ] **Step 6: Differentiate heading colors in each theme override**

Apply the same pattern for every `[data-theme="..."]` block. Use these values:

**`[data-theme="catppuccin-latte"]`** — find the existing `--sat-editor-heading7` line and add above it:
```css
  --sat-editor-heading1: #4c4f69;
  --sat-editor-heading2: #4c4f69;
  --sat-editor-heading3: #5c5f77;
  --sat-editor-heading4: #5c5f77;
  --sat-editor-heading5: #6c6f85;
  --sat-editor-heading6: #6c6f85;
```

**`[data-theme="catppuccin-mocha"]`** — find the existing `--sat-editor-heading7` line and add above it:
```css
  --sat-editor-heading1: #cdd6f4;
  --sat-editor-heading2: #cdd6f4;
  --sat-editor-heading3: #bac2de;
  --sat-editor-heading4: #bac2de;
  --sat-editor-heading5: #a6adc8;
  --sat-editor-heading6: #a6adc8;
```

**`[data-theme="dracula"]`** — find the existing `--sat-editor-heading7` line and add above it:
```css
  --sat-editor-heading1: #f8f8f2;
  --sat-editor-heading2: #f8f8f2;
  --sat-editor-heading3: #d4d4ce;
  --sat-editor-heading4: #d4d4ce;
  --sat-editor-heading5: #b0b0aa;
  --sat-editor-heading6: #b0b0aa;
```

**`[data-theme="light"]`** — find the existing `--sat-editor-heading7` line and add above it:
```css
  --sat-editor-heading1: #0f172a;
  --sat-editor-heading2: #0f172a;
  --sat-editor-heading3: #1e293b;
  --sat-editor-heading4: #1e293b;
  --sat-editor-heading5: #475569;
  --sat-editor-heading6: #475569;
```

**`[data-theme="solarized-dark"]`** — find the existing `--sat-editor-heading7` line and add above it:
```css
  --sat-editor-heading1: #93a1a1;
  --sat-editor-heading2: #93a1a1;
  --sat-editor-heading3: #8b9898;
  --sat-editor-heading4: #8b9898;
  --sat-editor-heading5: #839496;
  --sat-editor-heading6: #839496;
```

**`[data-theme="solarized-light"]`** — find the existing `--sat-editor-heading7` line and add above it:
```css
  --sat-editor-heading1: #586e75;
  --sat-editor-heading2: #586e75;
  --sat-editor-heading3: #657b83;
  --sat-editor-heading4: #657b83;
  --sat-editor-heading5: #748b93;
  --sat-editor-heading6: #748b93;
```

- [ ] **Step 7: Run lint and typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/package.json packages/ui/src/styles/globals.css bun.lockb
git commit -m "feat(typography): install Inter variable font, add heading color hierarchy and letter-spacing tokens"
```

---

## Task 2: Fix editor base font — monospace → Inter

**Files:**
- Modify: `packages/editor/src/themes/base.ts`
- Modify: `packages/editor/src/extensions/decorations/inline-marks.ts`

- [ ] **Step 1: Replace base.ts `&` font with the prose font**

Open `packages/editor/src/themes/base.ts`. The current `&` block is:

```ts
  "&": {
    height: "100%",
    maxHeight: "100%",
    minHeight: "0",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
    fontSize: "16px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
```

Replace the entire `"&"` block with:

```ts
  "&": {
    height: "100%",
    maxHeight: "100%",
    minHeight: "0",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
    fontSize: "16px",
    fontFamily: "var(--sat-font-sans)",
    fontOpticalSizing: "auto",
    fontFeatureSettings: '"cv01", "ss01"',
  },
```

- [ ] **Step 2: Fix inline-code font in inline-marks.ts**

Open `packages/editor/src/extensions/decorations/inline-marks.ts`. The `.cm-live-inline-code` block has a hardcoded monospace stack:

```ts
  ".cm-live-inline-code": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
```

Replace the `fontFamily` line with:

```ts
  ".cm-live-inline-code": {
    fontFamily: "var(--sat-font-mono)",
```

- [ ] **Step 3: Run lint and typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/themes/base.ts packages/editor/src/extensions/decorations/inline-marks.ts
git commit -m "fix(editor): use prose font (Inter) as editor root, mono font via token for inline code"
```

---

## Task 3: Rewrite heading styles in editor.css

**Files:**
- Modify: `packages/ui/src/styles/editor.css`

The current heading rules use `--sat-text-primary` for all colors (ignoring the per-heading tokens), have oversized `font-size` values, and no `letter-spacing`. Replace all six heading rules entirely.

- [ ] **Step 1: Replace all heading rules in `editor.css`**

Find and replace the entire block from `.cm-line.cm-live-heading-1` through `.cm-line.cm-live-heading-7` (lines 14–75 in editor.css). Replace with:

```css
.cm-line.cm-live-heading-1 {
  color: var(--sat-editor-heading1, var(--sat-text-primary));
  font-size: 2em;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: var(--sat-editor-h1-letter-spacing, -0.03em);
  padding-top: 1.5rem;
  padding-bottom: 0.5rem;
}

.cm-line.cm-live-heading-2 {
  color: var(--sat-editor-heading2, var(--sat-text-primary));
  font-size: 1.6em;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: var(--sat-editor-h2-letter-spacing, -0.02em);
  padding-top: 1.2rem;
  padding-bottom: 0.4rem;
}

.cm-line.cm-live-heading-3 {
  color: var(--sat-editor-heading3, var(--sat-text-primary));
  font-size: 1.37em;
  font-weight: 580;
  line-height: 1.25;
  letter-spacing: var(--sat-editor-h3-letter-spacing, -0.01em);
  padding-top: 1rem;
  padding-bottom: 0.3rem;
}

.cm-line.cm-live-heading-4 {
  color: var(--sat-editor-heading4, var(--sat-text-primary));
  font-size: 1.25em;
  font-weight: 520;
  line-height: 1.3;
  letter-spacing: var(--sat-editor-h4-letter-spacing, 0);
  padding-top: 0.8rem;
  padding-bottom: 0.2rem;
}

.cm-line.cm-live-heading-5 {
  color: var(--sat-editor-heading5, var(--sat-text-primary));
  font-size: 1.12em;
  font-weight: 470;
  line-height: 1.35;
  letter-spacing: var(--sat-editor-h5-letter-spacing, 0);
  padding-top: 0.6rem;
  padding-bottom: 0.1rem;
}

.cm-line.cm-live-heading-6 {
  color: var(--sat-editor-heading6, var(--sat-text-primary));
  font-size: 1em;
  font-weight: 430;
  line-height: 1.35;
  letter-spacing: var(--sat-editor-h6-letter-spacing, 0);
  padding-top: 0.4rem;
  padding-bottom: 0.1rem;
}

.cm-line.cm-live-heading-7 {
  color: var(--sat-editor-heading7, var(--sat-text-primary));
  font-size: 1em;
  font-weight: 400;
  line-height: 1.5;
  padding-top: 0.2rem;
  padding-bottom: 0.1rem;
}
```

- [ ] **Step 2: Add syntax marker styles to editor.css**

After the last heading rule block (after `.cm-line.cm-live-heading-7`), add:

```css
/* Syntax markers on the active line — muted so they recede behind content */
.cm-live-block-mark {
  color: var(--sat-text-muted);
}

.cm-live-inline-mark {
  color: var(--sat-text-muted);
}
```

- [ ] **Step 3: Run lint and typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/styles/editor.css
git commit -m "feat(typography): heading scale, weight ladder, letter-spacing, color tokens, syntax marker styles"
```

---

## Task 4: Mute syntax markers on the active line

**Files:**
- Modify: `packages/editor/src/extensions/decorations/mark-hiding.ts`

**Context:** `handleMarkHidingNode` currently does nothing (`return true`) for marks on the active line — they're left at full heading style. We want `HeaderMark` and `QuoteMark` to get `cm-live-block-mark` (muted color), and all other marks (`EmphasisMark`, `CodeMark`, etc.) to get `cm-live-inline-mark`.

- [ ] **Step 1: Add the new CSS classes to `MARK_HIDING_THEME`**

Open `packages/editor/src/extensions/decorations/mark-hiding.ts`. Find `MARK_HIDING_THEME` and add the two new classes:

```ts
export const MARK_HIDING_THEME = EditorView.baseTheme({
  ".cm-live-hide": {
    display: "none",
  },
  ".cm-live-block-mark": {
    color: "#94a3b8",
  },
  ".cm-live-inline-mark": {
    color: "#94a3b8",
  },
});
```

(The hardcoded `#94a3b8` is a fallback. `editor.css` overrides this with the `--sat-text-muted` token.)

- [ ] **Step 2: Replace the `onActiveLine` early-return with mark decoration**

Find this block inside `handleMarkHidingNode`:

```ts
  if (onActiveLine) return true; // Don't hide marks on the active line
```

Replace it with:

```ts
  if (onActiveLine) {
    // Style marks as muted rather than hiding them
    if (name === "HeaderMark" || name === "QuoteMark") {
      const docLength = ctx.view.state.doc.length;
      let markTo = node.to;
      while (markTo < docLength) {
        const nextChar = ctx.view.state.doc.sliceString(markTo, markTo + 1);
        if (nextChar === " ") markTo += 1;
        else break;
      }
      collector.addMark(node.from, markTo, "cm-live-block-mark");
    } else {
      collector.addMark(node.from, node.to, "cm-live-inline-mark");
    }
    return true;
  }
```

- [ ] **Step 3: Run lint and typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/decorations/mark-hiding.ts
git commit -m "feat(editor): mute syntax markers (##, **, _) on active line instead of showing at full style"
```

---

## Task 5: Verify end-to-end in the dev app

- [ ] **Step 1: Start the dev server**

```bash
bun run dev
```

- [ ] **Step 2: Open a note with varied markdown and verify each change**

Check against this list — each should be visibly improved:

| What to check | Expected result |
|---|---|
| Body paragraphs | Rendered in Inter (not monospace), comfortable to read |
| H1 | 2em, weight 700, letter-spacing tight |
| H2 | 1.6em, weight 650, slightly looser than H1 |
| H3 vs H4 vs H5 | Clearly different weights, progressively lighter |
| H5/H6 color | Noticeably dimmer than H1/H2 |
| Cursor on `### heading` | `###` shows in muted color; heading text at full heading style |
| Cursor on `**bold**` | `**` shows in muted color; "bold" renders bold |
| Inline code `` `foo` `` | Renders in JetBrains Mono (not Inter) |
| Switch theme | Heading colors update correctly per theme |

- [ ] **Step 3: Final lint and typecheck**

```bash
bun run lint && bunx tsc --noEmit
```

Expected: no errors.
