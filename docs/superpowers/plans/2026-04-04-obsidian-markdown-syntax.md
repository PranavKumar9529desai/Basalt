# Obsidian Markdown Syntax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual decoration for lists, callouts, highlights, strikethrough, tables, frontmatter, and tags to the Basalt CodeMirror editor to match Obsidian's live-preview rendering.

**Architecture:** Each feature gets its own file in `packages/editor/src/extensions/decorations/`. Block decorations (line classes, replace widgets) go through the existing `StateField` in `live-preview.ts`. Inline mark decorations go through the existing `ViewPlugin`. `==highlight==` gets a Lezer grammar extension (same pattern as WikiLinks). Callouts are detected via regex on `BlockQuote` nodes in the decorator — no grammar extension needed. All syntax markers are hidden on non-active lines via the existing `HIDE_MARKS` set.

**Tech Stack:** CodeMirror 6, `@lezer/markdown` (MarkdownConfig inline parser API), `@codemirror/view` (WidgetType, Decoration, ViewPlugin), `@codemirror/state` (StateField), TypeScript, Bun

---

> **PARALLEL EXECUTION NOTE:** This plan is split into 5 independent agent tracks (A–E). Each runs in its own git worktree. Tracks A, B, D, and E each touch `live-preview.ts` only to add one `handleXxx` call and one import — these will produce small, resolvable merge conflicts at the end. Track C touches `create-extensions.ts` (to register the highlight grammar) and `inline-marks.ts` (to add two new `handleInlineNode` branches). After all 5 tracks complete, merge all worktrees and run `bun run lint && bunx tsc --noEmit`.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `packages/editor/src/extensions/decorations/lists.ts` | **CREATE** | BulletList + OrderedList decoration, `ListBulletWidget`, `ListNumberWidget` |
| `packages/editor/src/extensions/decorations/callouts.ts` | **CREATE** | Callout detection, `CalloutHeaderWidget`, 12-type icon/color map |
| `packages/editor/src/extensions/decorations/tables.ts` | **CREATE** | Table/TableRow/TableCell line classes |
| `packages/editor/src/extensions/decorations/frontmatter.ts` | **CREATE** | YAML frontmatter block line classes |
| `packages/editor/src/extensions/decorations/inline-marks.ts` | **MODIFY** | Add Highlight, Strikethrough, Tag mark handlers |
| `packages/editor/src/extensions/decorations/mark-hiding.ts` | **MODIFY** | Add `ListMark`, `HighlightMark`, `StrikethroughMark` to `HIDE_MARKS` |
| `packages/editor/src/extensions/highlight-grammar.ts` | **CREATE** | Lezer MarkdownConfig for `==text==` |
| `packages/editor/src/extensions/live-preview.ts` | **MODIFY** | Register lists, callouts, tables, frontmatter handlers in tree walk |
| `packages/editor/src/create-extensions.ts` | **MODIFY** | Add `highlightExtension` to `markdown({ extensions: [] })` |

---

## Track A — Lists

**Worktree branch:** `feat/md-lists`  
**Files:** `decorations/lists.ts` (create), `live-preview.ts` (register), `mark-hiding.ts` (add ListMark)

### Task A-1: Create `lists.ts` with bullet list decoration

**Files:**
- Create: `packages/editor/src/extensions/decorations/lists.ts`

- [ ] **Step 1: Create the file with theme and bullet widget**

```typescript
// packages/editor/src/extensions/decorations/lists.ts
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

// Bullet glyphs by nesting depth (0-indexed, wraps at 3)
const BULLET_GLYPHS = ["•", "◦", "▪"];

export const LISTS_THEME = EditorView.baseTheme({
  ".cm-live-list-bullet": {
    paddingLeft: "0",
  },
  ".cm-live-list-ordered": {
    paddingLeft: "0",
  },
  ".cm-live-list-depth-1": { paddingLeft: "1.5rem" },
  ".cm-live-list-depth-2": { paddingLeft: "3rem" },
  ".cm-live-list-depth-3": { paddingLeft: "4.5rem" },
  ".cm-list-bullet-widget": {
    color: "var(--sat-list-bullet-color, #6366f1)",
    display: "inline-block",
    width: "1.2em",
    marginLeft: "-1.2em",
    userSelect: "none",
  },
  ".cm-list-number-widget": {
    color: "var(--sat-list-number-color, #6366f1)",
    display: "inline-block",
    width: "1.8em",
    marginLeft: "-1.8em",
    userSelect: "none",
    textAlign: "right",
    paddingRight: "0.4em",
  },
});

export class ListBulletWidget extends WidgetType {
  constructor(private readonly depth: number) {
    super();
  }

  eq(other: ListBulletWidget) {
    return other.depth === this.depth;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-list-bullet-widget";
    span.textContent = BULLET_GLYPHS[this.depth % BULLET_GLYPHS.length];
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

export class ListNumberWidget extends WidgetType {
  constructor(private readonly number: number) {
    super();
  }

  eq(other: ListNumberWidget) {
    return other.number === this.number;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-list-number-widget";
    span.textContent = `${this.number}.`;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}
```

- [ ] **Step 2: Add the handler function**

Append to `lists.ts`:

```typescript
/**
 * Counts how many BulletList/OrderedList ancestors the given node has.
 * Used to determine nesting depth for indentation.
 */
function listDepth(node: SyntaxNodeRef): number {
  let depth = 0;
  let cur = node.node.parent;
  while (cur) {
    if (cur.name === "BulletList" || cur.name === "OrderedList") depth++;
    cur = cur.parent;
  }
  return depth;
}

/**
 * Handles BulletList and OrderedList nodes.
 * - Adds depth-based indentation line classes to each ListItem's first line.
 * - Injects bullet/number widgets replacing the ListMark on non-active lines.
 * Returns true if the node was a list-related node that was fully handled.
 */
export function handleListNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  const name = node.type.name;

  if (name === "ListItem") {
    const doc = ctx.view.state.doc;
    const itemLine = doc.lineAt(node.from);
    const depth = listDepth(node);
    const depthClass = `cm-live-list-depth-${Math.min(depth, 3)}`;

    // Add depth-based indentation line class to every line of this list item
    const endLine = doc.lineAt(node.to);
    for (let ln = itemLine.number; ln <= endLine.number; ln++) {
      const line = doc.line(ln);
      collector.addLineClass(line.from, depthClass);
    }

    return false; // continue descent to find ListMark inside
  }

  if (name === "ListMark") {
    const onActiveLine = ctx.activeLine
      ? node.from >= ctx.activeLine.from && node.to <= ctx.activeLine.to
      : false;

    if (!onActiveLine) {
      // Determine parent list type
      const parentName = node.node.parent?.parent?.name ?? "";
      const isOrdered = parentName === "OrderedList";

      if (isOrdered) {
        // Figure out which number this item is (1-based, count siblings before it)
        let number = 1;
        let sibling = node.node.parent?.prevSibling;
        while (sibling) {
          if (sibling.name === "ListItem") number++;
          sibling = sibling.prevSibling;
        }
        // Replace `1. ` (ListMark + following space) with a number widget
        const markEnd =
          node.to < ctx.view.state.doc.length &&
          ctx.view.state.doc.sliceString(node.to, node.to + 1) === " "
            ? node.to + 1
            : node.to;
        collector.addReplace(node.from, markEnd, new ListNumberWidget(number));
      } else {
        // Replace `- ` or `* ` with a bullet widget
        const depth = listDepth(node);
        const markEnd =
          node.to < ctx.view.state.doc.length &&
          ctx.view.state.doc.sliceString(node.to, node.to + 1) === " "
            ? node.to + 1
            : node.to;
        collector.addReplace(node.from, markEnd, new ListBulletWidget(depth));
      }
    }

    return true;
  }

  return false;
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors in `lists.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/decorations/lists.ts
git commit -m "feat(editor): add list decoration handler (ListBulletWidget, ListNumberWidget)"
```

---

### Task A-2: Register in `live-preview.ts`

> Do NOT add `ListMark` to `HIDE_MARKS`. The widget replacement in `handleListNode` (block StateField pass) already hides the raw mark visually — adding it to HIDE_MARKS would cause a double-hide conflict with the inline ViewPlugin pass.

**Files:**
- Modify: `packages/editor/src/extensions/live-preview.ts`

- [ ] **Step 1: Import and wire up in `live-preview.ts`**

Add import at the top of `live-preview.ts` (after existing imports):

```typescript
import { handleListNode, LISTS_THEME } from "./decorations/lists";
```

Add `LISTS_THEME` to the exported `LIVE_PREVIEW_THEME` array:

```typescript
export const LIVE_PREVIEW_THEME = [
  HEADINGS_THEME,
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
  LISTS_THEME,  // ← add this
];
```

Add `handleListNode` call inside `buildBlockDecorations`'s `tree.iterate({ enter(node) { ... } })`, after the `handleHeadingNode` call:

```typescript
tree.iterate({
  enter(node) {
    if (handleCodeBlockNode(node, 0, view.state.doc.length, ctx, collector)) {
      return false;
    }

    if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
      return false;
    }

    handleHeadingNode(node, ctx, collector);
    handleBlockquoteNode(node, 0, view.state.doc.length, ctx, collector);
    handleListNode(node, ctx, collector);  // ← add this line
  },
});
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 4: Manual verification**

```bash
bun run dev
```

Open the app, create a note with:
```
- Item one
- Item two
  - Nested item
    - Double nested
1. First
2. Second
   1. Nested number
```

Expected: bullet glyphs (`•`, `◦`, `▪`) replace `-` on non-active lines; numbers replace `1.`; indentation increases with nesting depth. Active line shows raw `- ` or `1. `.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/extensions/decorations/mark-hiding.ts \
        packages/editor/src/extensions/live-preview.ts
git commit -m "feat(editor): register list decorations in live-preview"
```

---

## Track B — Callouts

**Worktree branch:** `feat/md-callouts`  
**Files:** `decorations/callouts.ts` (create), `live-preview.ts` (register)

### Task B-1: Create `callouts.ts` with type map and header widget

**Files:**
- Create: `packages/editor/src/extensions/decorations/callouts.ts`

- [ ] **Step 1: Create type map and theme**

```typescript
// packages/editor/src/extensions/decorations/callouts.ts
import { EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

/** Maps callout type aliases to a canonical name */
const CALLOUT_ALIASES: Record<string, string> = {
  note: "note",
  abstract: "abstract", summary: "abstract", tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip", hint: "tip", important: "tip",
  success: "success", check: "success", done: "success",
  question: "question", help: "question", faq: "question",
  warning: "warning", caution: "warning", attention: "warning",
  failure: "failure", fail: "failure", missing: "failure",
  danger: "danger", error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote", cite: "quote",
};

/** SVG icon paths by canonical callout type */
const CALLOUT_ICONS: Record<string, string> = {
  note: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  abstract: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  todo: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  tip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  question: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  failure: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  danger: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  bug: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`,
  example: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  quote: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 2v7c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 2v7c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>`,
};

/** Border/background colors per canonical type, using --sat-* tokens with fallbacks */
const CALLOUT_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  note:     { border: "var(--sat-callout-note-border, #3b82f6)",     bg: "var(--sat-callout-note-bg, rgba(59,130,246,0.08))",     icon: "var(--sat-callout-note-icon, #3b82f6)" },
  abstract: { border: "var(--sat-callout-abstract-border, #06b6d4)", bg: "var(--sat-callout-abstract-bg, rgba(6,182,212,0.08))",  icon: "var(--sat-callout-abstract-icon, #06b6d4)" },
  info:     { border: "var(--sat-callout-info-border, #3b82f6)",     bg: "var(--sat-callout-info-bg, rgba(59,130,246,0.08))",     icon: "var(--sat-callout-info-icon, #3b82f6)" },
  todo:     { border: "var(--sat-callout-todo-border, #3b82f6)",     bg: "var(--sat-callout-todo-bg, rgba(59,130,246,0.08))",     icon: "var(--sat-callout-todo-icon, #3b82f6)" },
  tip:      { border: "var(--sat-callout-tip-border, #0ea5e9)",      bg: "var(--sat-callout-tip-bg, rgba(14,165,233,0.08))",      icon: "var(--sat-callout-tip-icon, #0ea5e9)" },
  success:  { border: "var(--sat-callout-success-border, #22c55e)",  bg: "var(--sat-callout-success-bg, rgba(34,197,94,0.08))",   icon: "var(--sat-callout-success-icon, #22c55e)" },
  question: { border: "var(--sat-callout-question-border, #eab308)", bg: "var(--sat-callout-question-bg, rgba(234,179,8,0.08))",  icon: "var(--sat-callout-question-icon, #eab308)" },
  warning:  { border: "var(--sat-callout-warning-border, #f97316)",  bg: "var(--sat-callout-warning-bg, rgba(249,115,22,0.08))",  icon: "var(--sat-callout-warning-icon, #f97316)" },
  failure:  { border: "var(--sat-callout-failure-border, #ef4444)",  bg: "var(--sat-callout-failure-bg, rgba(239,68,68,0.08))",   icon: "var(--sat-callout-failure-icon, #ef4444)" },
  danger:   { border: "var(--sat-callout-danger-border, #ef4444)",   bg: "var(--sat-callout-danger-bg, rgba(239,68,68,0.08))",    icon: "var(--sat-callout-danger-icon, #ef4444)" },
  bug:      { border: "var(--sat-callout-bug-border, #ef4444)",      bg: "var(--sat-callout-bug-bg, rgba(239,68,68,0.08))",       icon: "var(--sat-callout-bug-icon, #ef4444)" },
  example:  { border: "var(--sat-callout-example-border, #a855f7)",  bg: "var(--sat-callout-example-bg, rgba(168,85,247,0.08))",  icon: "var(--sat-callout-example-icon, #a855f7)" },
  quote:    { border: "var(--sat-callout-quote-border, #94a3b8)",    bg: "var(--sat-callout-quote-bg, rgba(148,163,184,0.08))",   icon: "var(--sat-callout-quote-icon, #94a3b8)" },
};

/** Regex: matches `> [!type]`, `> [!type]+`, `> [!type]-`, `> [!type]+ Title`, `> [!type]- Title` */
const CALLOUT_RE = /^>\s*\[!([a-zA-Z]+)\]([+-]?)(?:\s+(.*))?$/;

export const CALLOUTS_THEME = EditorView.baseTheme({
  ".cm-live-callout": {
    paddingLeft: "1rem",
  },
  ".cm-callout-header": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "6px 6px 0 0",
    fontWeight: "600",
    fontSize: "0.9rem",
    userSelect: "none",
    cursor: "default",
  },
  ".cm-callout-header svg": {
    flexShrink: "0",
  },
  ".cm-callout-fold": {
    marginLeft: "auto",
    opacity: "0.6",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
});
```

- [ ] **Step 2: Add `CalloutHeaderWidget` and handler**

Append to `callouts.ts`:

```typescript
export class CalloutHeaderWidget extends WidgetType {
  constructor(
    private readonly type: string,
    private readonly title: string,
    private readonly fold: string, // "" | "+" | "-"
  ) {
    super();
  }

  eq(other: CalloutHeaderWidget) {
    return (
      other.type === this.type &&
      other.title === this.title &&
      other.fold === this.fold
    );
  }

  toDOM(view: EditorView) {
    const canonical = CALLOUT_ALIASES[this.type.toLowerCase()] ?? "note";
    const colors = CALLOUT_COLORS[canonical] ?? CALLOUT_COLORS.note;
    const icon = CALLOUT_ICONS[canonical] ?? CALLOUT_ICONS.note;

    const header = document.createElement("div");
    header.className = "cm-callout-header";
    header.style.backgroundColor = colors.bg;
    header.style.borderLeft = `3px solid ${colors.border}`;
    header.style.color = colors.icon;

    header.innerHTML = icon;

    const titleSpan = document.createElement("span");
    titleSpan.textContent =
      this.title || canonical.charAt(0).toUpperCase() + canonical.slice(1);
    header.appendChild(titleSpan);

    if (this.fold !== "") {
      const foldBtn = document.createElement("span");
      foldBtn.className = "cm-callout-fold";
      foldBtn.textContent = this.fold === "+" ? "▾" : "▸";
      header.appendChild(foldBtn);
    }

    header.contentEditable = "false";
    return header;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Handles BlockQuote nodes that are Obsidian callouts.
 * Detects `> [!type]` on the first line and decorates the whole block.
 * Returns true if this blockquote was a callout (caller should not apply plain blockquote styling).
 */
export function handleCalloutNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "BlockQuote") return false;

  const doc = ctx.view.state.doc;
  const firstLine = doc.lineAt(node.from);
  const match = CALLOUT_RE.exec(firstLine.text);
  if (!match) return false;

  const rawType = match[1];
  const fold = match[2] ?? "";
  const title = match[3] ?? "";
  const canonical = CALLOUT_ALIASES[rawType.toLowerCase()] ?? "note";
  const colors = CALLOUT_COLORS[canonical] ?? CALLOUT_COLORS.note;

  const hasCursor =
    ctx.headPos >= node.from && ctx.headPos <= node.to;

  const endLine = doc.lineAt(node.to);

  // Apply background + border to all lines of the callout
  for (let ln = firstLine.number; ln <= endLine.number; ln++) {
    const line = doc.line(ln);
    collector.addLineClass(line.from, "cm-live-callout");
  }

  // When cursor is outside: replace first line with the styled header widget
  if (!hasCursor) {
    collector.addReplace(
      firstLine.from,
      firstLine.to,
      new CalloutHeaderWidget(rawType, title, fold),
      true,
    );
  }

  // Apply per-type border color as an inline style via a line class trick:
  // We can't set inline styles via line classes alone, so we rely on CSS variables
  // set on .cm-live-callout-{type} and the theme declaring them.
  // Add type-specific line class to all lines.
  for (let ln = firstLine.number; ln <= endLine.number; ln++) {
    const line = doc.line(ln);
    collector.addLineClass(line.from, `cm-live-callout-${canonical}`);
  }

  return true; // Consumed — do NOT apply plain blockquote styling
}
```

- [ ] **Step 3: Expand `CALLOUTS_THEME` with per-type line classes**

Replace the `CALLOUTS_THEME` definition from Step 1 with this full version (includes all 13 type-specific rules appended inside the same `baseTheme` object):

```typescript
export const CALLOUTS_THEME = EditorView.baseTheme({
  ".cm-live-callout": {
    paddingLeft: "1rem",
  },
  ".cm-callout-header": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "6px 6px 0 0",
    fontWeight: "600",
    fontSize: "0.9rem",
    userSelect: "none",
    cursor: "default",
  },
  ".cm-callout-header svg": {
    flexShrink: "0",
  },
  ".cm-callout-fold": {
    marginLeft: "auto",
    opacity: "0.6",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  ".cm-line.cm-live-callout-note":     { borderLeft: "3px solid var(--sat-callout-note-border, #3b82f6)",     backgroundColor: "var(--sat-callout-note-bg, rgba(59,130,246,0.05))" },
  ".cm-line.cm-live-callout-abstract": { borderLeft: "3px solid var(--sat-callout-abstract-border, #06b6d4)", backgroundColor: "var(--sat-callout-abstract-bg, rgba(6,182,212,0.05))" },
  ".cm-line.cm-live-callout-info":     { borderLeft: "3px solid var(--sat-callout-info-border, #3b82f6)",     backgroundColor: "var(--sat-callout-info-bg, rgba(59,130,246,0.05))" },
  ".cm-line.cm-live-callout-todo":     { borderLeft: "3px solid var(--sat-callout-todo-border, #3b82f6)",     backgroundColor: "var(--sat-callout-todo-bg, rgba(59,130,246,0.05))" },
  ".cm-line.cm-live-callout-tip":      { borderLeft: "3px solid var(--sat-callout-tip-border, #0ea5e9)",      backgroundColor: "var(--sat-callout-tip-bg, rgba(14,165,233,0.05))" },
  ".cm-line.cm-live-callout-success":  { borderLeft: "3px solid var(--sat-callout-success-border, #22c55e)",  backgroundColor: "var(--sat-callout-success-bg, rgba(34,197,94,0.05))" },
  ".cm-line.cm-live-callout-question": { borderLeft: "3px solid var(--sat-callout-question-border, #eab308)", backgroundColor: "var(--sat-callout-question-bg, rgba(234,179,8,0.05))" },
  ".cm-line.cm-live-callout-warning":  { borderLeft: "3px solid var(--sat-callout-warning-border, #f97316)",  backgroundColor: "var(--sat-callout-warning-bg, rgba(249,115,22,0.05))" },
  ".cm-line.cm-live-callout-failure":  { borderLeft: "3px solid var(--sat-callout-failure-border, #ef4444)",  backgroundColor: "var(--sat-callout-failure-bg, rgba(239,68,68,0.05))" },
  ".cm-line.cm-live-callout-danger":   { borderLeft: "3px solid var(--sat-callout-danger-border, #ef4444)",   backgroundColor: "var(--sat-callout-danger-bg, rgba(239,68,68,0.05))" },
  ".cm-line.cm-live-callout-bug":      { borderLeft: "3px solid var(--sat-callout-bug-border, #ef4444)",      backgroundColor: "var(--sat-callout-bug-bg, rgba(239,68,68,0.05))" },
  ".cm-line.cm-live-callout-example":  { borderLeft: "3px solid var(--sat-callout-example-border, #a855f7)",  backgroundColor: "var(--sat-callout-example-bg, rgba(168,85,247,0.05))" },
  ".cm-line.cm-live-callout-quote":    { borderLeft: "3px solid var(--sat-callout-quote-border, #94a3b8)",    backgroundColor: "var(--sat-callout-quote-bg, rgba(148,163,184,0.05))" },
});
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/extensions/decorations/callouts.ts
git commit -m "feat(editor): add callout decoration handler with 12 types and header widget"
```

---

### Task B-2: Register callouts in `live-preview.ts` (replace blockquote with callout check)

**Files:**
- Modify: `packages/editor/src/extensions/live-preview.ts`

- [ ] **Step 1: Import callout handler and theme**

Add to imports at top of `live-preview.ts`:

```typescript
import {
  CALLOUTS_THEME,
  handleCalloutNode,
} from "./decorations/callouts";
```

Add `CALLOUTS_THEME` to `LIVE_PREVIEW_THEME`:

```typescript
export const LIVE_PREVIEW_THEME = [
  HEADINGS_THEME,
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  CALLOUTS_THEME,   // ← add
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
];
```

- [ ] **Step 2: Replace blockquote call with callout-first check in `buildBlockDecorations`**

Change the tree walk in `buildBlockDecorations`:

```typescript
tree.iterate({
  enter(node) {
    if (handleCodeBlockNode(node, 0, view.state.doc.length, ctx, collector)) {
      return false;
    }

    if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
      return false;
    }

    handleHeadingNode(node, ctx, collector);

    // Try callout first — if it matches, skip plain blockquote styling
    if (!handleCalloutNode(node, ctx, collector)) {
      handleBlockquoteNode(node, 0, view.state.doc.length, ctx, collector);
    }
  },
});
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 4: Manual verification**

```bash
bun run dev
```

Open the app, test:
```
> [!note]
> This is a note callout

> [!warning] Watch out!
> Something important here

> [!tip]+ Collapsible tip
> Hidden content

> [!danger] Danger zone
> Very dangerous
```

Expected: each callout renders with colored left border, correct icon, and type label in the header when cursor is outside. Plain blockquotes (`> text`) still render with the existing gray border. Active line shows raw markdown.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/extensions/live-preview.ts
git commit -m "feat(editor): register callout decorations, callout takes priority over blockquote"
```

---

## Track C — Highlights + Strikethrough

**Worktree branch:** `feat/md-highlights-strikethrough`  
**Files:** `highlight-grammar.ts` (create), `inline-marks.ts` (modify), `mark-hiding.ts` (modify), `create-extensions.ts` (modify)

### Task C-1: Create Lezer grammar extension for `==highlight==`

**Files:**
- Create: `packages/editor/src/extensions/highlight-grammar.ts`

- [ ] **Step 1: Create the grammar extension**

```typescript
// packages/editor/src/extensions/highlight-grammar.ts
import { tags as t } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * Extends the Lezer Markdown parser to recognize ==highlight== spans.
 * Defines two nodes:
 *   - `Highlight`: the full `==text==` span
 *   - `HighlightMark`: the `==` delimiter tokens
 */
export const highlightExtension: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: t.special(t.string) },
    { name: "HighlightMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx: InlineContext, next: number, pos: number): number {
        // 61 is '='
        if (next !== 61 || cx.char(pos + 1) !== 61) return -1;

        // Scan ahead for closing `==`
        for (let i = pos + 2; i < cx.end - 1; i++) {
          if (cx.char(i) === 61 && cx.char(i + 1) === 61) {
            return cx.addElement(
              cx.elt("Highlight", pos, i + 2, [
                cx.elt("HighlightMark", pos, pos + 2),     // opening ==
                cx.elt("HighlightMark", i, i + 2),          // closing ==
              ]),
            );
          }
          // No newlines inside highlights
          if (cx.char(i) === 10) break;
        }
        return -1;
      },
      before: "Emphasis",
    },
  ],
};
```

- [ ] **Step 2: Register in `create-extensions.ts`**

Add import:

```typescript
import { highlightExtension } from "./extensions/highlight-grammar";
```

Change the `markdown(...)` call to include `highlightExtension` in extensions:

```typescript
markdown({
  base: markdownLanguage,
  codeLanguages: languages,
  extensions: [wikiLinkExtension, highlightExtension],
}),
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/highlight-grammar.ts \
        packages/editor/src/create-extensions.ts
git commit -m "feat(editor): add Lezer grammar extension for ==highlight== syntax"
```

---

### Task C-2: Add Highlight and Strikethrough mark handlers

**Files:**
- Modify: `packages/editor/src/extensions/decorations/inline-marks.ts`
- Modify: `packages/editor/src/extensions/decorations/mark-hiding.ts`

- [ ] **Step 1: Update `INLINE_MARKS_THEME` in `inline-marks.ts`**

Add to the existing `EditorView.baseTheme({...})` object in `inline-marks.ts`:

```typescript
".cm-live-highlight": {
  backgroundColor: "var(--sat-highlight-bg, rgba(234,179,8,0.25))",
  color: "var(--sat-highlight-color, inherit)",
  borderRadius: "2px",
  padding: "0 0.1rem",
},
".cm-live-strikethrough": {
  textDecoration: "line-through",
  opacity: "0.6",
},
```

- [ ] **Step 2: Add `Highlight` and `Strikethrough` branches to `handleInlineNode`**

Change `handleInlineNode` in `inline-marks.ts`:

```typescript
export function handleInlineNode(
  node: SyntaxNodeRef,
  collector: DecorationCollector,
): boolean {
  const name = node.type.name;

  if (name === "InlineCode") {
    collector.addMark(node.from, node.to, "cm-live-inline-code");
    return true;
  }

  if (name === "WikiLink") {
    collector.addMark(node.from, node.to, "cm-live-wikilink");
    return true;
  }

  if (name === "Highlight") {
    collector.addMark(node.from, node.to, "cm-live-highlight");
    return true;
  }

  if (name === "Strikethrough") {
    collector.addMark(node.from, node.to, "cm-live-strikethrough");
    return true;
  }

  return false;
}
```

- [ ] **Step 3: Add `HighlightMark` and `StrikethroughMark` to `HIDE_MARKS`**

In `mark-hiding.ts`, change:

```typescript
export const HIDE_MARKS = new Set([
  "HeaderMark",
  "QuoteMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark",
  "WikiLinkMark",
]);
```

To:

```typescript
export const HIDE_MARKS = new Set([
  "HeaderMark",
  "QuoteMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark",
  "WikiLinkMark",
  "HighlightMark",
  "StrikethroughMark",
]);
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 5: Manual verification**

```bash
bun run dev
```

Test in editor:
```
==This text is highlighted==
~~This text is struck through~~
==highlighted== and ~~strikethrough~~ together
```

Expected: yellow highlight background on `==text==`; line-through on `~~text~~`. On active line, `==` and `~~` delimiters are visible. On non-active lines, delimiters are hidden.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/extensions/decorations/inline-marks.ts \
        packages/editor/src/extensions/decorations/mark-hiding.ts
git commit -m "feat(editor): add highlight and strikethrough inline mark decorations"
```

---

## Track D — Tables

**Worktree branch:** `feat/md-tables`  
**Files:** `decorations/tables.ts` (create), `live-preview.ts` (register)

### Task D-1: Create `tables.ts`

**Files:**
- Create: `packages/editor/src/extensions/decorations/tables.ts`

- [ ] **Step 1: Create the file**

```typescript
// packages/editor/src/extensions/decorations/tables.ts
import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

export const TABLES_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-table": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: "0.9em",
  },
  ".cm-line.cm-live-table-header": {
    fontWeight: "700",
    borderBottom: "2px solid var(--sat-table-border, #334155)",
    color: "var(--sat-table-header-color, #e2e8f0)",
  },
  ".cm-line.cm-live-table-delimiter": {
    color: "var(--sat-table-border, #334155)",
    opacity: "0.5",
  },
});

/**
 * Handles Table nodes — adds line classes for header, delimiter, and body rows.
 * Returns true if the node was a Table (caller should not descend further).
 */
export function handleTableNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "Table") return false;

  const doc = ctx.view.state.doc;
  let rowIndex = 0;

  // Walk direct children to identify header row vs delimiter vs body rows
  let child = node.node.firstChild;
  while (child) {
    const line = doc.lineAt(child.from);

    if (child.name === "TableRow") {
      if (rowIndex === 0) {
        // First row: header
        collector.addLineClass(line.from, "cm-live-table");
        collector.addLineClass(line.from, "cm-live-table-header");
      } else {
        collector.addLineClass(line.from, "cm-live-table");
      }
      rowIndex++;
    } else if (child.name === "TableDelimiter") {
      // The `|---|---|` separator row
      collector.addLineClass(line.from, "cm-live-table");
      collector.addLineClass(line.from, "cm-live-table-delimiter");
    }

    child = child.nextSibling;
  }

  return true;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add packages/editor/src/extensions/decorations/tables.ts
git commit -m "feat(editor): add table decoration handler"
```

---

### Task D-2: Register tables in `live-preview.ts`

**Files:**
- Modify: `packages/editor/src/extensions/live-preview.ts`

- [ ] **Step 1: Import and wire up**

Add import:

```typescript
import { handleTableNode, TABLES_THEME } from "./decorations/tables";
```

Add `TABLES_THEME` to `LIVE_PREVIEW_THEME`:

```typescript
export const LIVE_PREVIEW_THEME = [
  HEADINGS_THEME,
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
  TABLES_THEME,   // ← add
];
```

Add `handleTableNode` to the block walk in `buildBlockDecorations`:

```typescript
tree.iterate({
  enter(node) {
    if (handleCodeBlockNode(node, 0, view.state.doc.length, ctx, collector)) {
      return false;
    }

    if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
      return false;
    }

    handleHeadingNode(node, ctx, collector);
    handleBlockquoteNode(node, 0, view.state.doc.length, ctx, collector);

    if (handleTableNode(node, ctx, collector)) {
      return false; // Don't descend into table children — we handled them manually
    }
  },
});
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Manual verification**

```bash
bun run dev
```

Test:
```
| Name       | Role     | Status |
|------------|----------|--------|
| Alice      | Engineer | Active |
| Bob        | Designer | Active |
```

Expected: header row is bold; delimiter row is muted; all rows use monospace font.

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/live-preview.ts
git commit -m "feat(editor): register table decorations in live-preview"
```

---

## Track E — Frontmatter + Tags

**Worktree branch:** `feat/md-frontmatter-tags`  
**Files:** `decorations/frontmatter.ts` (create), `inline-marks.ts` (modify), `live-preview.ts` (register)

### Task E-1: Create `frontmatter.ts`

**Files:**
- Create: `packages/editor/src/extensions/decorations/frontmatter.ts`

- [ ] **Step 1: Create the file**

```typescript
// packages/editor/src/extensions/decorations/frontmatter.ts
import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { DecorationCollector, DecorationContext } from "./types";

export const FRONTMATTER_THEME = EditorView.baseTheme({
  ".cm-line.cm-live-frontmatter": {
    backgroundColor: "var(--sat-frontmatter-bg, rgba(100,116,139,0.08))",
    color: "var(--sat-frontmatter-text, #94a3b8)",
  },
  ".cm-line.cm-live-frontmatter-fence": {
    color: "var(--sat-frontmatter-fence-color, #475569)",
    fontWeight: "600",
  },
  ".cm-live-frontmatter-key": {
    color: "var(--sat-frontmatter-key-color, #818cf8)",
  },
});

/**
 * Handles YAMLFrontMatter nodes (provided by @codemirror/lang-markdown when
 * the document starts with ---).
 * Falls back to a regex scan if the node type is not present.
 * Returns true if frontmatter was found and decorated.
 */
export function handleFrontmatterNode(
  node: SyntaxNodeRef,
  ctx: DecorationContext,
  collector: DecorationCollector,
): boolean {
  if (node.type.name !== "YAMLFrontMatter") return false;

  const doc = ctx.view.state.doc;
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);

  for (let ln = startLine.number; ln <= endLine.number; ln++) {
    const line = doc.line(ln);
    collector.addLineClass(line.from, "cm-live-frontmatter");

    // Fence lines (--- delimiters)
    if (ln === startLine.number || ln === endLine.number) {
      collector.addLineClass(line.from, "cm-live-frontmatter-fence");
    } else {
      // Key lines: `key: value` — mark the key portion
      const keyMatch = /^([a-zA-Z_][\w-]*)(\s*:)/.exec(line.text);
      if (keyMatch) {
        collector.addMark(
          line.from,
          line.from + keyMatch[1].length,
          "cm-live-frontmatter-key",
        );
      }
    }
  }

  return true;
}

/**
 * Fallback: scans for YAML frontmatter at the top of the document using regex.
 * Call this only when no YAMLFrontMatter node was found in the tree.
 * Mutates collector directly.
 */
export function handleFrontmatterFallback(
  ctx: DecorationContext,
  collector: DecorationCollector,
): void {
  const doc = ctx.view.state.doc;
  if (doc.lines < 2) return;

  const firstLine = doc.line(1);
  if (firstLine.text.trim() !== "---") return;

  for (let ln = 2; ln <= doc.lines; ln++) {
    const line = doc.line(ln);
    collector.addLineClass(line.from, "cm-live-frontmatter");

    if (line.text.trim() === "---") {
      collector.addLineClass(line.from, "cm-live-frontmatter-fence");
      // Also decorate the opening ---
      collector.addLineClass(firstLine.from, "cm-live-frontmatter");
      collector.addLineClass(firstLine.from, "cm-live-frontmatter-fence");
      break;
    }

    const keyMatch = /^([a-zA-Z_][\w-]*)(\s*:)/.exec(line.text);
    if (keyMatch) {
      collector.addMark(
        line.from,
        line.from + keyMatch[1].length,
        "cm-live-frontmatter-key",
      );
    }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add packages/editor/src/extensions/decorations/frontmatter.ts
git commit -m "feat(editor): add frontmatter decoration handler with key highlighting"
```

---

### Task E-2: Add tag scan to `inline-marks.ts`

**Files:**
- Modify: `packages/editor/src/extensions/decorations/inline-marks.ts`

- [ ] **Step 1: Add tag theme and scan function**

Add to `INLINE_MARKS_THEME` (append to the baseTheme object):

```typescript
".cm-live-tag": {
  backgroundColor: "var(--sat-tag-bg, rgba(99,102,241,0.15))",
  color: "var(--sat-tag-color, #818cf8)",
  borderRadius: "var(--sat-tag-border-radius, 3px)",
  padding: "0.05rem 0.3rem",
  fontSize: "0.85em",
},
```

Add a new exported function at the bottom of `inline-marks.ts`:

```typescript
const TAG_RE = /#([a-zA-Z][a-zA-Z0-9/_-]*)/g;

/**
 * Scans visible line text for #tags and adds cm-live-tag marks.
 * Skips matches inside code spans (checked via codeBlockRanges).
 * Call this from the ViewPlugin pass (inline decorations only).
 */
export function handleTagsInLine(
  lineFrom: number,
  lineText: string,
  codeBlockRanges: { from: number; to: number }[],
  collector: DecorationCollector,
): void {
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(lineText)) !== null) {
    const from = lineFrom + match.index;
    const to = from + match[0].length;

    // Skip if inside a code block
    const inCode = codeBlockRanges.some((r) => from >= r.from && to <= r.to);
    if (inCode) continue;

    // Skip if preceded by a non-whitespace char (e.g. `example#tag` is not a tag)
    if (match.index > 0 && !/\s/.test(lineText[match.index - 1])) continue;

    collector.addMark(from, to, "cm-live-tag");
  }
}
```

- [ ] **Step 2: Wire tag scan into the ViewPlugin pass in `live-preview.ts`**

Add import:

```typescript
import { handleTagsInLine } from "./decorations/inline-marks";
// (this is in the same file as the existing handleInlineNode import — merge the import)
```

In `buildInlineDecorations`, after the second `tree.iterate` block, add:

```typescript
// Tag scan: regex pass over visible lines
for (const range of view.visibleRanges) {
  const startLine = view.state.doc.lineAt(range.from);
  const endLine = view.state.doc.lineAt(range.to);
  for (let ln = startLine.number; ln <= endLine.number; ln++) {
    const line = view.state.doc.line(ln);
    handleTagsInLine(line.from, line.text, ctx.codeBlockRanges, collector);
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/decorations/inline-marks.ts
git commit -m "feat(editor): add inline tag decoration (#tag, #parent/child)"
```

---

### Task E-3: Register frontmatter in `live-preview.ts`

**Files:**
- Modify: `packages/editor/src/extensions/live-preview.ts`

- [ ] **Step 1: Import and wire up**

Add import:

```typescript
import {
  FRONTMATTER_THEME,
  handleFrontmatterFallback,
  handleFrontmatterNode,
} from "./decorations/frontmatter";
```

Add `FRONTMATTER_THEME` to `LIVE_PREVIEW_THEME`:

```typescript
export const LIVE_PREVIEW_THEME = [
  HEADINGS_THEME,
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
  FRONTMATTER_THEME,  // ← add
];
```

Add frontmatter handling to `buildBlockDecorations`. Track whether a frontmatter node was found, then call fallback if not:

```typescript
function buildBlockDecorations(view: EditorView): DecorationSet {
  const { collector, finish } = makeCollector();
  const headPos = view.state.selection.main.head;

  const ctx: DecorationContext = {
    activeLine: view.hasFocus
      ? (() => {
          const l = view.state.doc.lineAt(headPos);
          return { from: l.from, to: l.to, number: l.number };
        })()
      : null,
    headPos,
    view,
    codeBlockRanges: [],
  };

  const tree =
    ensureSyntaxTree(view.state, view.state.doc.length, 50) ??
    syntaxTree(view.state);

  let frontmatterFound = false;

  tree.iterate({
    enter(node) {
      if (handleCodeBlockNode(node, 0, view.state.doc.length, ctx, collector)) {
        return false;
      }

      if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
        return false;
      }

      handleHeadingNode(node, ctx, collector);
      handleBlockquoteNode(node, 0, view.state.doc.length, ctx, collector);

      if (handleFrontmatterNode(node, ctx, collector)) {
        frontmatterFound = true;
      }
    },
  });

  if (!frontmatterFound) {
    handleFrontmatterFallback(ctx, collector);
  }

  handleHeading7Lines(0, view.state.doc.length, ctx, collector);

  return finish();
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 3: Manual verification**

```bash
bun run dev
```

Test with a note starting with:
```
---
title: My Note
date: 2026-04-04
tags:
  - productivity
  - writing
---

Content starts here #productivity #writing/notes
```

Expected: frontmatter block has a muted background; keys (`title`, `date`, `tags`) are purple; `---` fences are bold. Tags in the body render as indigo chips.

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/live-preview.ts
git commit -m "feat(editor): register frontmatter and tag decorations in live-preview"
```

---

## Final Merge Task

**After all 5 tracks complete:**

### Task F-1: Merge all worktrees

- [ ] **Step 1: Merge each branch into main sequentially**

```bash
git checkout main
git merge feat/md-lists --no-ff -m "merge: lists decoration (Track A)"
git merge feat/md-callouts --no-ff -m "merge: callouts decoration (Track B)"
git merge feat/md-highlights-strikethrough --no-ff -m "merge: highlights + strikethrough (Track C)"
git merge feat/md-tables --no-ff -m "merge: tables decoration (Track D)"
git merge feat/md-frontmatter-tags --no-ff -m "merge: frontmatter + tags decoration (Track E)"
```

Expected conflicts at: `live-preview.ts` (imports + LIVE_PREVIEW_THEME array + tree walk calls), `inline-marks.ts` (INLINE_MARKS_THEME entries + handleInlineNode branches), `create-extensions.ts` (grammar extensions array).

- [ ] **Step 2: Resolve `live-preview.ts` conflicts**

The final imports block should include ALL new handlers:

```typescript
import { handleListNode, LISTS_THEME } from "./decorations/lists";
import { CALLOUTS_THEME, handleCalloutNode } from "./decorations/callouts";
import { handleTableNode, TABLES_THEME } from "./decorations/tables";
import {
  FRONTMATTER_THEME,
  handleFrontmatterFallback,
  handleFrontmatterNode,
} from "./decorations/frontmatter";
import { handleTagsInLine } from "./decorations/inline-marks";
```

Final `LIVE_PREVIEW_THEME`:

```typescript
export const LIVE_PREVIEW_THEME = [
  HEADINGS_THEME,
  CODE_BLOCKS_THEME,
  BLOCKQUOTES_THEME,
  CALLOUTS_THEME,
  INLINE_MARKS_THEME,
  MARK_HIDING_THEME,
  LISTS_THEME,
  TABLES_THEME,
  FRONTMATTER_THEME,
];
```

Final `buildBlockDecorations` tree walk:

```typescript
let frontmatterFound = false;

tree.iterate({
  enter(node) {
    if (handleCodeBlockNode(node, 0, view.state.doc.length, ctx, collector)) {
      return false;
    }

    if (isInCodeBlock(node.from, ctx.codeBlockRanges)) {
      return false;
    }

    handleHeadingNode(node, ctx, collector);

    if (!handleCalloutNode(node, ctx, collector)) {
      handleBlockquoteNode(node, 0, view.state.doc.length, ctx, collector);
    }

    handleListNode(node, ctx, collector);

    if (handleTableNode(node, ctx, collector)) {
      return false;
    }

    if (handleFrontmatterNode(node, ctx, collector)) {
      frontmatterFound = true;
    }
  },
});

if (!frontmatterFound) {
  handleFrontmatterFallback(ctx, collector);
}
```

Final `buildInlineDecorations` tag scan (after the tree.iterate block):

```typescript
for (const range of view.visibleRanges) {
  const startLine = view.state.doc.lineAt(range.from);
  const endLine = view.state.doc.lineAt(range.to);
  for (let ln = startLine.number; ln <= endLine.number; ln++) {
    const line = view.state.doc.line(ln);
    handleTagsInLine(line.from, line.text, ctx.codeBlockRanges, collector);
  }
}
```

- [ ] **Step 3: Resolve `inline-marks.ts` conflicts**

Final `handleInlineNode` should have all four branches: `InlineCode`, `WikiLink`, `Highlight`, `Strikethrough`.

Final `INLINE_MARKS_THEME` should include all CSS classes: `cm-live-inline-code`, `cm-live-wikilink`, `cm-live-highlight`, `cm-live-strikethrough`, `cm-live-tag`.

- [ ] **Step 4: Resolve `mark-hiding.ts` conflict**

Final `HIDE_MARKS`:

```typescript
export const HIDE_MARKS = new Set([
  "HeaderMark",
  "QuoteMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark",
  "WikiLinkMark",
  "HighlightMark",
  "StrikethroughMark",
]);
```

- [ ] **Step 5: Resolve `create-extensions.ts` conflict**

Final `markdown(...)` call:

```typescript
markdown({
  base: markdownLanguage,
  codeLanguages: languages,
  extensions: [wikiLinkExtension, highlightExtension],
}),
```

- [ ] **Step 6: Full lint + type-check**

```bash
cd /Users/pranavkumar/projects/Basalt
bun run lint && bunx tsc --noEmit
```

Expected: zero lint errors, zero type errors.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(editor): merge all Obsidian markdown syntax decoration tracks (A-E)"
```
