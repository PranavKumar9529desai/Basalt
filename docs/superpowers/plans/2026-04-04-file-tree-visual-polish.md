# File Tree Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four visual bugs and apply four visual improvements to the file tree so it matches Obsidian's quality.

**Architecture:** All changes are in one component — `FileTreeNode.tsx`. No new files, no new tokens, no logic changes. Two tasks: bug fixes first, then enhancements.

**Tech Stack:** React, Tailwind CSS, `--sat-*` CSS custom properties.

---

## File Map

| File | What changes |
|------|-------------|
| `packages/ui/src/components/file-tree/FileTreeNode.tsx` | All changes — bugs and visual enhancements |

---

## Task 1: Fix four visual bugs

**Files:**
- Modify: `packages/ui/src/components/file-tree/FileTreeNode.tsx`

- [ ] **Step 1: Fix the broken `--sat-text-secondary` token**

Open `packages/ui/src/components/file-tree/FileTreeNode.tsx`. Find the `cn(...)` class block inside the inner `<div>` of `FileTreeNode` (around line 209). The non-selected, non-editing branch reads:

```tsx
: "text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]",
```

Replace `--sat-text-secondary` with `--sat-text-muted`:

```tsx
: "text-[var(--sat-text-muted)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]",
```

- [ ] **Step 2: Fix indent guides — always visible**

Find this line inside the `Array.from({ length: node.depth }).map(...)` block (around line 243):

```tsx
className="absolute top-0 bottom-0 w-px bg-[var(--sat-layout-border)] opacity-0 group-hover:opacity-100 transition-opacity"
```

Replace with:

```tsx
className="absolute top-0 bottom-0 w-px bg-[var(--sat-layout-border)] opacity-30"
```

- [ ] **Step 3: Strip `.md` extension from file labels**

Find the `FileTreeNode` function body (after the `const isEditing` line). Add this line immediately before the `return`:

```tsx
const displayName = !node.isFolder && node.name.endsWith('.md')
  ? node.name.slice(0, -3)
  : node.name;
```

Then find the label `<span>` (inside the `{isEditing ? ... : (...)}` branch):

```tsx
<span
  className={cn(
    "truncate leading-none antialiased",
    isSelected ? "font-medium" : "font-normal",
  )}
>
  {node.name}
</span>
```

Replace `{node.name}` with `{displayName}`:

```tsx
<span
  className={cn(
    "truncate leading-none antialiased",
    isSelected ? "font-medium" : "font-normal",
  )}
>
  {displayName}
</span>
```

- [ ] **Step 4: Unify folder icon colour — remove accent flash**

Find the `FolderIcon` component (around line 33). Replace the entire component with:

```tsx
function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6L7.5 5.5H13.5A1 1 0 0 1 14.5 6.5V12.5A1 1 0 0 1 13.5 13.5H2.5A1 1 0 0 1 1.5 12.5V4.5Z"
        stroke="var(--sat-text-muted)"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}
```

Then find the callsite `<FolderIcon isOpen={isOpen} />` and change it to:

```tsx
<FolderIcon />
```

- [ ] **Step 5: Typecheck**

```bash
fish -c "bunx tsc --noEmit -p apps/tauri/tsconfig.json"
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/file-tree/FileTreeNode.tsx
git commit -m "fix(file-tree): token fix, always-visible indent guides, strip .md extension, unified folder icon"
```

---

## Task 2: Visual enhancements

**Files:**
- Modify: `packages/ui/src/components/file-tree/FileTreeNode.tsx`

- [ ] **Step 1: Row height 26px → 24px**

Find this line near the top of the file:

```tsx
export const TREE_ROW_HEIGHT = 26;
```

Replace with:

```tsx
export const TREE_ROW_HEIGHT = 24;
```

The virtualizer already reads from this constant via `estimateSize: () => TREE_ROW_HEIGHT`, so no second change is needed.

- [ ] **Step 2: Add left accent border to selected rows**

The outermost `<div>` in `FileTreeNode`'s return currently is:

```tsx
<div
  style={{ ...style, height: TREE_ROW_HEIGHT }}
  className="px-2"
>
```

Replace with:

```tsx
<div
  style={{ ...style, height: TREE_ROW_HEIGHT }}
  className={cn(
    "pr-2 border-l-2",
    isSelected
      ? "pl-[6px] border-[var(--sat-accent-primary)]"
      : "pl-2 border-transparent",
  )}
>
```

`pl-[6px]` (6px) + 2px border = 8px total left offset, matching the original `px-2`. This keeps content alignment identical whether selected or not.

- [ ] **Step 3: Reduce selection background tint**

Inside the inner `<div>`'s `cn(...)` block, find the selected branch:

```tsx
isSelected
  ? "bg-[color-mix(in_srgb,var(--sat-accent-primary)_15%,transparent)] text-[var(--sat-text-primary)]"
```

Change `15%` to `10%`:

```tsx
isSelected
  ? "bg-[color-mix(in_srgb,var(--sat-accent-primary)_10%,transparent)] text-[var(--sat-text-primary)]"
```

- [ ] **Step 4: Replace file icon with cleaner glyph**

Find the `FileIcon` component (around line 62). Replace the entire component with:

```tsx
function FileIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="2"
        y="1"
        width="10"
        height="12"
        rx="1.5"
        stroke="var(--sat-text-muted)"
        strokeWidth="1.0"
      />
      <line x1="4.5" y1="5" x2="9.5" y2="5" stroke="var(--sat-text-muted)" strokeWidth="0.75" strokeLinecap="round" />
      <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="var(--sat-text-muted)" strokeWidth="0.75" strokeLinecap="round" />
      <line x1="4.5" y1="10" x2="7.5" y2="10" stroke="var(--sat-text-muted)" strokeWidth="0.75" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
fish -c "bunx tsc --noEmit -p apps/tauri/tsconfig.json"
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/file-tree/FileTreeNode.tsx
git commit -m "feat(file-tree): 24px rows, left accent border on selection, refined file icon"
```
