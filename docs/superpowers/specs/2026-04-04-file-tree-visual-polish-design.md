# File Tree Visual Polish — Design Spec

**Date:** 2026-04-04  
**Scope:** Visual quality of `FileTreeNode.tsx` only. No logic changes, no new CSS tokens, no new files.

---

## Goal

Make the file tree feel as polished as Obsidian's. Fix four bugs in the current code and apply five visual improvements — all in one component.

---

## Bugs Fixed

| Bug | Location | Fix |
|-----|----------|-----|
| `--sat-text-secondary` used but never defined in token system | `FileTreeNode.tsx:218` | Replace with `--sat-text-muted` |
| Indent guides `opacity-0` by default, appear only on hover | `FileTreeNode.tsx:243` | Constant `opacity-30` — always visible |
| `.md` extension shown in labels | label render | Strip `.md` suffix before display |
| Open folder uses accent colour, closed uses muted — inconsistent | `FileTreeNode.tsx:47,53` | Both states use `--sat-text-muted` stroke; chevron rotation communicates open/closed |

---

## Visual Improvements

### 1. Token fix — unselected item text
`--sat-text-secondary` resolves to nothing, so unselected items inherit an unpredictable colour. Replace with `--sat-text-muted`. Hover and selection states already override this, so only the resting state is affected.

### 2. Indent guides — always visible
Remove `opacity-0 group-hover:opacity-100`. Use `opacity-30` constant. The tree hierarchy must be readable at a glance, not only on hover.

### 3. `.md` extension stripping
Before rendering the label `{node.name}`, strip a trailing `.md` suffix:
```ts
const displayName = node.name.endsWith('.md') 
  ? node.name.slice(0, -3) 
  : node.name;
```
Non-markdown files (any other extension) render unchanged. Folders are never stripped.

### 4. Unified folder icon colour
Both open and closed `FolderIcon` variants use `--sat-text-muted` for their stroke. Remove the accent-coloured open state — the animated chevron rotation already communicates open/closed clearly.

### 5. Row height — 26px → 24px
`TREE_ROW_HEIGHT` drops from 26 to 24. Obsidian's tree is dense. The virtualizer `estimateSize` must match this constant (it already reads from `TREE_ROW_HEIGHT`, so no second change needed).

### 6. Selection highlight — left accent border
Current: `color-mix(accent 15%, transparent)` background only.  
New: `color-mix(accent 10%, transparent)` background + `border-l-2 border-[var(--sat-accent-primary)]` left border. This matches Obsidian's active-file indicator pattern.

The inner div needs `pl-0.5` reduction to compensate for the 2px border so text doesn't shift.

### 7. Hover state — full text brightness
Unselected items on hover should reach `--sat-text-primary`. Currently blocked by the broken token. Fixed as a side effect of the token fix in §1, but make it explicit: add `hover:text-[var(--sat-text-primary)]` to the class string.

### 8. File icon — cleaner glyph
Replace the current folded-corner document SVG with a simpler single-line glyph:
- Thinner stroke (1.0 instead of 1.2)
- Slightly smaller: 12×12 viewport  
- No fold corner — just a clean rectangle with ruled lines suggesting text content, matching Obsidian's minimal file icon

---

## Out of Scope

- Vault name header (separate feature)
- Search in sidebar (separate feature)  
- Context menu changes
- ActivityBar changes
- SidebarHeader changes
- SidebarPanel resize behaviour

---

## Files Changed

| File | Change |
|------|--------|
| `packages/ui/src/components/file-tree/FileTreeNode.tsx` | All changes above — one file, pure visual |
