# Sidebar & File Tree — Desktop Shell Implementation Plan

> **Goal**: Transform Basalt from a "web page with panels" into a flush, native-feeling
> desktop workspace shell — starting with the sidebar and file tree.
>
> **Status**: 🟡 Planning complete — ready for implementation
>
> **Date**: 2026-02-26

---

## Table of Contents

1. [Reading Instructions](#reading-instructions)
2. [Current vs Target](#current-vs-target)
3. [Phase 1 — Shell Layout Overhaul](#phase-1--shell-layout-overhaul)
4. [Phase 2 — Activity Bar](#phase-2--activity-bar)
5. [Phase 3 — Sidebar Container](#phase-3--sidebar-container)
6. [Phase 4 — File Tree Node Refinement](#phase-4--file-tree-node-refinement)
7. [Rust Performance Wins](#rust-performance-wins)
8. [Layer Ownership Map](#layer-ownership-map)
9. [Validation Checklist](#validation-checklist)

---

## Reading Instructions

- **Execute phases in order** — each phase builds on the previous one.
- **One phase = one PR/commit** — keep changes atomic and reviewable.
- **No skipping** — Phase 1 (layout) is the foundation; nothing else works without it.
- Each phase lists:
  - ✅ **What** — the deliverable
  - 📁 **Where** — which files/folders are touched
  - 🔧 **How** — specific implementation details
  - ✔️ **Done when** — acceptance criteria
- Follow the [UI Rules](/home/pranav/Projects/Basalt/.agents/workflows/ui-rules.md):
  - shadcn components first
  - `--sat-*` theme vars for all colors
  - Dumb components in `packages/ui/`, wired in `apps/tauri/`

---

## Current vs Target

### Current (Basalt)

```
┌──────────────────────────────────────────────────┐
│  Home  New Page                    [Light ▾] Next│ ← web nav links
├──────────────────────────────────────────────────┤
│  📁 Vault: obsidian  [Change] [Re-index]         │ ← toolbar row
├──────────┬───────────────────────────────────────┤
│ ╭──────╮ │                                       │
│ │FILES │ │   Editor area                         │ ← card in padded
│ │ > 📁 │ │                                       │   container with
│ │ > 📁 │ │                                       │   gaps everywhere
│ │  📄  │ │                                       │
│ ╰──────╯ │                                       │
├──────────┴───────────────────────────────────────┤
│                                                  │ ← no status bar
└──────────────────────────────────────────────────┘
```

### Target (Obsidian-like)

```
┌─┬──────────┬─────────────────────────────────────┐
│ │ ⊕ 📁 ↕ ▼ │  Tab 1  │  Tab 2  │                │
│▣│──────────│─────────────────────────────────────│
│🔍│ ▾ Basalt │  Basalt > Note Title                │
│⚙│   Core   │                                     │
│ │   Note1  │  Editor area (flush, no gaps)        │
│ │   Note2  │                                     │
│ │ ▾ Daily  │                                     │
│ │   ...    │                                     │
│ │          │                                     │
│ ├──────────┼─────────────────────────────────────│ ← resize handle
│⚙│          │                                     │
├─┴──────────┴─────────────────────────────────────┤
│ obsidian          │  407 words · 2,375 characters │ ← status bar
└──────────────────────────────────────────────────┘
 ↑         ↑                    ↑
 Activity  Sidebar (flush,     Editor (no card wrapper,
 Bar       resizable)          tabs at top)
```

### Key Visual Differences

| Property          | Current (Basalt)                          | Target (Obsidian)                              |
|-------------------|-------------------------------------------|-----------------------------------------------|
| Root padding      | `p-4` + `gap-3`                           | **0** — flush edge-to-edge                     |
| Top bar           | Web nav links + toolbar row               | Activity bar + sidebar header icons            |
| Sidebar           | Bordered rounded card                     | Full-height flush panel, resizable             |
| Selection style   | Bold accent bar + inverse text            | Subtle 10-12% accent tint, normal text         |
| Row height        | 28px                                      | 24px                                           |
| Bottom            | Nothing                                   | Status bar (vault, word count)                 |
| Left edge         | Nothing                                   | Activity bar (~44px icon ribbon)               |
| Folder badges     | Child count shown                         | No child count                                 |

---

## Phase 1 — Shell Layout Overhaul

> **Foundation**: Remove web-app patterns. Create the flush desktop skeleton.

### ✅ What

Strip the current padded, web-nav layout and replace it with a flush desktop
workspace skeleton: `[ActivityBar | Sidebar | Editor]` with status bar at bottom.

### 📁 Where

| File | Action |
|------|--------|
| `apps/tauri/src/routes/__root.tsx` | **Rewrite** — remove nav links, padding, web layout |
| `apps/tauri/src/routes/index.tsx` | **Edit** — remove toolbar, gap, padding from body |
| `apps/tauri/src/features/vault/components/Toolbar.tsx` | **Delete** — vault controls move to sidebar header & command palette |

### 🔧 How

**1. `__root.tsx` — new structure:**
```tsx
// BEFORE:
<div className="p-4 flex flex-col min-h-screen ...">
  <Link to="/">Home</Link>  // ← remove
  <Link to="/new">New Page</Link>  // ← remove
  <ThemeSelect />
  <Outlet />
</div>

// AFTER:
<div className="flex flex-col h-screen bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)] overflow-hidden">
  <AppCommands />
  {/* Main workspace area — fills all space */}
  <div className="flex flex-1 min-h-0">
    <Outlet />
  </div>
  {/* Status bar — always visible */}
  <StatusBar />
</div>
```

**Key changes:**
- `h-screen` + `overflow-hidden` — app fills the window exactly
- **Zero padding** — `p-0` everywhere on the shell
- Remove `Home`/`New Page` links entirely (command palette + activity bar replace them)
- Remove `ThemeSelect` from top bar (moves to settings/command palette)
- `StatusBar` placeholder at the bottom

**2. `index.tsx` route — flush layout:**
```tsx
// BEFORE:
<div className="flex flex-1 min-h-0 gap-3 p-3">
  <div className="w-56 shrink-0">   {/* ← fixed width, floating */}
    <FileTree ... />
  </div>
  <div className="... rounded-lg">  {/* ← card-like editor */}
    ...
  </div>
</div>

// AFTER:
<div className="flex flex-1 min-h-0">
  {/* Activity Bar — narrow icon strip */}
  <ActivityBar ... />

  {/* Sidebar — resizable, flush */}
  <SidebarPanel>
    <FileTree ... />
  </SidebarPanel>

  {/* Editor — fills remaining space, no card wrapper */}
  <div className="flex-1 flex flex-col min-h-0">
    ...
  </div>
</div>
```

**Key changes:**
- `gap-0` (or just remove `gap-3`)
- No `p-3` padding on body
- Editor loses `rounded-lg border` card wrapper
- Everything is flush and structural

**3. Vault controls relocation:**
- "Change vault" → Command palette command (`Cmd+Shift+V`)
- "Re-index" → Command palette command
- Vault name → Status bar (bottom-left)

### ✔️ Done when

- [x] Window shows zero visible gaps between structural sections
- [x] No "Home" / "New Page" links visible
- [x] No toolbar row visible
- [x] Activity bar placeholder takes ~44px on the left
- [x] Sidebar + editor fill remaining space flush
- [x] Status bar placeholder visible at bottom
- [x] App still builds and renders correctly

---

## Phase 2 — Activity Bar

> **Desktop feel**: The narrow icon ribbon that says "this is a workspace, not a webpage."

### ✅ What

A ~44px wide vertical icon strip on the far-left edge. For now, only a few icons
since we don't have Calendar/Graph/etc yet.

### Initial Icons

| Position | Icon | Label | Action |
|----------|------|-------|--------|
| Top | Files/Explorer | "Explorer" | Opens/focuses file tree sidebar |
| Top | Search 🔍 | "Search" | (placeholder — future global search) |
| Bottom | Settings ⚙ | "Settings" | (placeholder — future settings panel) |

> **Note**: Calendar, Graph, Tags, Bookmarks, etc. get added here later as those
> features are built. The activity bar is designed to grow incrementally.

### 📁 Where

| File | Action |
|------|--------|
| `packages/ui/src/components/activity-bar/ActivityBar.tsx` | **Create** — dumb component |
| `packages/ui/src/components/activity-bar/ActivityBarItem.tsx` | **Create** — individual icon button |
| `packages/ui/src/components/activity-bar/index.ts` | **Create** — re-exports |
| `apps/tauri/src/app-shell/AppActivityBar.tsx` | **Create** — wires icons to real actions |

### 🔧 How

**Dumb component API (`packages/ui`):**
```tsx
interface ActivityBarProps {
  topItems: ActivityBarItemData[];
  bottomItems: ActivityBarItemData[];
  activeId: string | null;
  onItemClick: (id: string) => void;
}

interface ActivityBarItemData {
  id: string;
  icon: React.ReactNode;  // Lucide or inline SVG
  label: string;          // Tooltip text
  badge?: number | boolean; // Optional notification badge
}
```

**Styling requirements:**
- Width: `w-11` (44px)
- Background: `var(--sat-surface-2)` or slightly darker than sidebar
- Right border: `1px solid var(--sat-layout-border)`
- Icons: 18-20px, `var(--sat-text-muted)` default, `var(--sat-text-primary)` on hover
- Active indicator: 2-3px accent-colored bar on the left edge of the active item
- Item padding: `py-2.5` centered
- Tooltips via shadcn `Tooltip` component (shows on hover, positioned to the right)
- `flex flex-col` — top items at top, bottom items pushed down with `mt-auto`

### ✔️ Done when

- [x] 44px ribbon visible on far-left edge
- [x] "Explorer" icon shown and highlighted as active
- [x] "Search" and "Settings" icons shown (Search top, Settings bottom)
- [x] Hovering any icon shows a tooltip to the right
- [x] Clicking "Explorer" keeps sidebar open (future: toggle)
- [x] Uses `--sat-*` theme vars, no hard-coded colors
- [x] Component in `packages/ui/` has zero Tauri imports

---

## Phase 3 — Sidebar Container

> **Structure**: A resizable, flush panel that houses the file tree (and later: search, backlinks, etc.)

### ✅ What

Replace the current `w-56 shrink-0` card with a proper sidebar panel that:
- Is flush (no border-radius, no card wrapper)
- Has a resize handle on its right edge
- Has a header with action icons (new note, new folder, sort, collapse all)
- Uses shadcn `ScrollArea` for the content area
- Can collapse/expand

### 📁 Where

| File | Action |
|------|--------|
| `packages/ui/src/components/sidebar/SidebarPanel.tsx` | **Create** — resizable panel container |
| `packages/ui/src/components/sidebar/SidebarHeader.tsx` | **Create** — action icons header |
| `packages/ui/src/components/sidebar/ResizeHandle.tsx` | **Create** — drag handle |
| `packages/ui/src/components/sidebar/index.ts` | **Create** — re-exports |
| `apps/tauri/src/features/vault/components/FileTree.tsx` | **Edit** — remove self-contained card wrapper |

### 🔧 How

**SidebarPanel — resizable container:**
```tsx
interface SidebarPanelProps {
  children: React.ReactNode;
  defaultWidth?: number;     // default: 240
  minWidth?: number;         // default: 160
  maxWidth?: number;         // default: 400
  collapsed?: boolean;
  onWidthChange?: (width: number) => void;
  onCollapseToggle?: () => void;
}
```

**Styling:**
- Background: `var(--sat-surface-2)` — distinct from editor but no card feel
- No `rounded-*` — flush against edges
- Right border only: `border-r border-[var(--sat-layout-border)]` — subtle divider
- Resize handle: invisible by default, shows on hover as a 4px accent-colored strip
  on the right edge. Cursor changes to `col-resize`.

**SidebarHeader — action icon bar:**
```tsx
interface SidebarHeaderProps {
  actions: SidebarAction[];
}

interface SidebarAction {
  id: string;
  icon: React.ReactNode;
  label: string;           // Tooltip
  onClick: () => void;
  disabled?: boolean;
}
```

**Initial actions:**
| Icon | Label | Tauri Command |
|------|-------|---------------|
| ✏️ (file-plus) | "New note" | `create_note` |
| 📁 (folder-plus) | "New folder" | `create_folder` |
| ↕️ (arrow-up-down) | "Sort" | Toggle sort order |
| ▼ (chevrons-down-up) | "Collapse all" | Collapse all folders |

**Styling:**
- `h-9` (36px) header height
- Icons: 14-16px, spaced with `gap-1`
- Background: same as sidebar body
- Bottom border: `border-b border-[var(--sat-layout-border)]`
- Icons use `var(--sat-text-muted)`, hover → `var(--sat-text-primary)`

**FileTree changes:**
```tsx
// BEFORE (self-contained card):
<div className="flex flex-col h-full bg-[var(--sat-surface-2)]
  border border-[var(--sat-layout-border)] rounded-lg overflow-hidden">
  {/* Header */}
  <div>FILES 72</div>
  {/* Scroll area */}
  ...
</div>

// AFTER (content only — sidebar provides the wrapper):
<ScrollArea className="h-full">
  {/* Just the virtualised tree, no header, no card */}
  ...
</ScrollArea>
```

### ✔️ Done when

- [x] Sidebar panel is flush — no border-radius, full height
- [x] Resize handle visible on hover, drag-resizable between 160-400px
- [x] Header shows 4 action icons with tooltips
- [x] File tree renders inside the sidebar without its own card wrapper
- [x] shadcn `ScrollArea` used for scrollable content
- [x] Uses `--sat-*` theme vars, no hard-coded colors
- [x] Collapse/expand works (optional — can defer)

---

## Phase 4 — File Tree Node Refinement

> **Polish**: Compact, quiet, professional file tree rows.

### ✅ What

Refine `FileTreeNode` to match Obsidian's compact, minimal aesthetic.

### 📁 Where

| File | Action |
|------|--------|
| `apps/tauri/src/features/vault/components/FileTreeNode.tsx` | **Edit** — all changes below |
| `apps/tauri/src/features/vault/components/FileTree.tsx` | **Edit** — update `TREE_ROW_HEIGHT` |

### 🔧 How — Change-by-Change

**A. Row height: 28px → 24px**
```tsx
// BEFORE:
export const TREE_ROW_HEIGHT = 28;

// AFTER:
export const TREE_ROW_HEIGHT = 24;
```

**B. Selection style: Bold accent → Subtle tint**
```tsx
// BEFORE:
isSelected
  ? "bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)]"
  : "text-[var(--sat-text-primary)] hover:bg-[var(--sat-surface-3)]"

// AFTER:
isSelected
  ? "bg-[color-mix(in_srgb,var(--sat-accent-primary)_12%,transparent)] text-[var(--sat-text-primary)]"
  : "text-[var(--sat-text-secondary)] hover:bg-[var(--sat-surface-3)] hover:text-[var(--sat-text-primary)]"
```

Key differences:
- Selected: 12% opacity accent tint — subtle, professional
- Default text: `--sat-text-secondary` (dimmer) → `--sat-text-primary` on hover/select
- No inverse text — keeps readability in all themes

**C. Remove child count badges**
```tsx
// BEFORE:
{isFolder && node.childCount > 0 && (
  <span className="...">{node.childCount}</span>
)}

// AFTER:
// Removed entirely — reduces visual noise
```

**D. Simplify icons**
- Folders: Keep chevron. Replace folder SVG with a **smaller, simpler** version
  or remove the folder icon entirely (Obsidian barely uses them).
- Files: Remove the document icon. Just the file name with indent is enough.
  The lack of a chevron already identifies it as a file, not a folder.

```tsx
// BEFORE (file icon column):
<span className="mr-1.5 flex items-center shrink-0">
  {isFolder ? <FolderIcon isOpen={isOpen} /> : <FileIcon />}
</span>

// AFTER:
<span className="mr-1.5 flex items-center shrink-0">
  {isFolder && <FolderIcon isOpen={isOpen} />}
  {/* Files: no icon — identified by absence of chevron */}
</span>
```

**E. Add indent guide lines**
```tsx
// Add thin vertical lines at each depth level using a pseudo-element approach.
// For each depth > 0, render a thin 1px left-border line.

// In the node's inline style or a wrapper:
{Array.from({ length: node.depth }).map((_, i) => (
  <span
    key={i}
    className="absolute top-0 bottom-0 w-px bg-[var(--sat-layout-divider)]"
    style={{ left: `${i * INDENT_PX + 6 + INDENT_PX / 2}px` }}
  />
))}
```

Or simpler with a CSS approach:
```css
/* Tree indent guide */
.tree-indent-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--sat-layout-divider);
  opacity: 0.4;
}
```

**F. Increase indent depth**
```tsx
// BEFORE:
const INDENT_PX = 12;

// AFTER:
const INDENT_PX = 16;  // More room for guide lines and visual clarity
```

**G. Font size adjustment**
```tsx
// BEFORE:
text-sm  // 14px

// AFTER:
text-xs  // 12px — matches Obsidian's compact feel
```

### ✔️ Done when

- [ ] Row height is 24px
- [ ] Selected item shows subtle tint (not bold accent bar)
- [ ] Hover shows very light background change
- [ ] No child count badges
- [ ] Files have no document icon (just indented name)
- [ ] Indent guide lines visible at each nesting level
- [ ] Font is `text-xs` (12px)
- [ ] Deep nesting (e.g., Calendar with 300 items) looks clean and scannable

---

## Rust Performance Wins

Things we already have or can add for performance superiority over Obsidian:

| Feature | Status | Details |
|---------|--------|---------|
| Flat tree from Rust | ✅ Done | Pre-sorted, pre-annotated in Rust — zero JS computation |
| Virtualization | ✅ Done | TanStack Virtual — only visible rows render |
| Incremental FS watching | 🎯 Next | Rust `notify` crate → tree patch events (not full rebuilds) |
| Fuzzy file search | 🎯 Future | Rust `nucleo` crate — 10-50x faster than JS fuzzy matching |
| Full-text search | 🎯 Future | Rust `tantivy` — near-instant vault-wide search |
| Layout persistence | 🎯 Phase 3 | Save sidebar width to Rust config file |
| Memory usage | ✅ Inherent | Tauri < 50MB vs Electron 150-300MB |

---

## Layer Ownership Map

Following the [UI Rules](/home/pranav/Projects/Basalt/.agents/workflows/ui-rules.md) three-layer architecture:

```
packages/ui/src/components/          ← DUMB (no Tauri, no state)
├── activity-bar/
│   ├── ActivityBar.tsx              Phase 2
│   ├── ActivityBarItem.tsx          Phase 2
│   └── index.ts
├── sidebar/
│   ├── SidebarPanel.tsx             Phase 3
│   ├── SidebarHeader.tsx            Phase 3
│   ├── ResizeHandle.tsx             Phase 3
│   └── index.ts
└── file-tree/                       (if we extract dumb node)
    └── ...

apps/tauri/src/app-shell/            ← WIRING (composes features)
├── AppActivityBar.tsx               Phase 2 — wires icons to actions
├── AppSidebar.tsx                   Phase 3 — wires sidebar to vault state
└── StatusBar.tsx                    Phase 1 — vault name, word count

apps/tauri/src/features/vault/       ← FEATURE (state + IPC)
├── components/
│   ├── FileTree.tsx                 Phase 3 — strips card wrapper
│   └── FileTreeNode.tsx             Phase 4 — refined styling
├── hooks/
│   ├── useVaultTree.ts              Existing ✅
│   └── useVaultActions.ts           Existing ✅
└── types.ts                         Existing ✅
```

---

## Validation Checklist

After all 4 phases, the app should pass these checks:

### Visual
- [ ] Zero visible gaps/padding between structural sections
- [ ] Activity bar on far-left with accent indicator
- [ ] Sidebar is flush, resizable, has action icons
- [ ] File tree rows are compact (24px), subtle selection
- [ ] Status bar at bottom shows vault name
- [ ] No web-style nav links anywhere
- [ ] Dark theme and light theme both look polished

### Functional
- [ ] Click activity bar "Explorer" → sidebar stays open
- [ ] Resize sidebar by dragging right edge
- [ ] New note / new folder buttons in sidebar header work
- [ ] File tree navigation works (click file → opens in editor)
- [ ] Folder expand/collapse works
- [ ] Virtualization still works (test with 300+ item Calendar folder)
- [ ] Vault change/reindex accessible via command palette

### Architecture
- [ ] All `packages/ui/` components have zero Tauri imports
- [ ] All colors use `--sat-*` theme variables
- [ ] shadcn components used where applicable (ScrollArea, Tooltip, Separator)
- [ ] Feature hooks own state; UI components are dumb
- [ ] `cn()` used for conditional class merging

### Performance
- [ ] No layout shifts on initial load
- [ ] Sidebar resize is smooth (60fps)
- [ ] File tree scroll is smooth with 1000+ items
- [ ] Memory usage stays under 80MB with large vault
