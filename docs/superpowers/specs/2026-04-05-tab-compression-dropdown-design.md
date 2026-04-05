# Tab Compression & Dropdown Design

**Date:** 2026-04-05  
**Status:** Approved

---

## Overview

Two related improvements to the Basalt tab bar:

1. **Width compression** — tabs shrink to fit the available bar width (minimum 60px) instead of always scrolling. When tabs hit the 60px floor and still overflow, the existing scroll chevrons activate as a fallback.
2. **Tab list dropdown** — a permanent ⌄ button on the right of every tab bar opens a dropdown listing all open tabs across all groups, plus tab management actions.

---

## Feature 1: Tab Width Compression

### Approach

Pure CSS flex. No JavaScript measurement, no ResizeObserver. The tabs already have `flex-1` — the only blockers are the hardcoded minimum widths and the `min-w-max` on the container.

### Changes

**`packages/ui/src/components/tabs/TabItem.tsx`**

| Before | After |
|--------|-------|
| Outer wrapper: `min-w-[170px] max-w-[300px]` | `min-w-[60px] max-w-[300px]` (inactive), `min-w-[120px] max-w-[300px]` (active) |
| Inner content div: `min-w-[170px] max-w-[300px]` | `min-w-0 max-w-[300px]` |
| Title: `truncate max-w-[180px]` | `flex-1 min-w-0 truncate` |

Active tabs get `min-w-[120px]` to keep the current note's title readable at all times. Inactive tabs compress to 60px. The close button behaviour is unchanged — it already only shows on hover for inactive tabs, so it naturally disappears when there is no space.

**`packages/ui/src/components/tabs/TabsBar.tsx`**

Remove `min-w-max` from the tabs flex container. The scroll area and left/right scroll chevrons remain exactly as-is — they activate only when compressed tabs still overflow.

---

## Feature 2: Tab List Dropdown

### Trigger

A `ChevronDown` button (lucide-react icon, same icon family as the rest of the app) sits at the far right of the tab bar. It is always visible — not toggled by scroll state. It is placed in the existing `rightSlot` prop of `TabsBar`.

### Dropdown Structure

```
Sort by name
Close tabs to the right
───────────────────────
Close all tabs                ← destructive color
═══════════════════════
Left pane                     ← group label (omitted if only one group)
  ✓ Workflow backend          ← active tab in this group
    Untitled 1
    Test2
Right pane
    Cost analyser email
    New tab
```

- Clicking a tab item switches focus to that group and activates that tab.
- "Close all tabs" closes all tabs in the **current group** (the group whose tab bar hosts this button).
- "Close tabs to the right" closes tabs to the right of the active tab in the current group.
- "Sort by name" reorders tabs in the current group alphabetically by title.
- Group labels are shown only when 2 or more groups exist.

### New Component

**`packages/ui/src/components/tabs/TabListDropdown.tsx`**

Dumb component — all data and callbacks via props. Uses Radix `DropdownMenu` (already present via shadcn).

```ts
interface TabListDropdownProps {
  currentGroupId: string
  allGroups: Array<{
    groupId: string
    label: string            // "Left pane", "Right pane", etc.
    tabs: TabItemData[]
    activeTabId: string | null
  }>
  onSwitchTab: (groupId: string, tabId: string) => void
  onCloseAll: (groupId: string) => void
  onCloseToRight: (groupId: string, tabId: string) => void
  onSortByName: (groupId: string) => void
}
```

Exported from `packages/ui/src/components/tabs/index.ts`.

### New Store Action

**`sortTabsByName(groupId: string)`** added to the move slice (`apps/tauri/src/features/tabs/store/slices/moveSlice.ts`).

Sorts `tabIds[]` in the group alphabetically by `tabs[id].title`. Pure array reorder, no other side effects. Exposed via `useTabs` hook.

### Wiring

**`apps/tauri/src/features/tabs/components/WorkspaceTabs.tsx`**

For each rendered tab group, pass a `<TabListDropdown>` as the `rightSlot` of `TabsBar`. The component reads all groups from the Zustand store, constructs the `allGroups` array (with human-readable position labels based on layout tree position), and wires up all callbacks.

Group labels are derived from the layout tree position: a group on the left side of a row split → "Left pane", right → "Right pane", top → "Top pane", bottom → "Bottom pane". If the layout is a single group (no splits), no label is shown.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/ui/src/components/tabs/TabItem.tsx` | Reduce min-width, fix title flex |
| `packages/ui/src/components/tabs/TabsBar.tsx` | Remove `min-w-max` from container |
| `packages/ui/src/components/tabs/TabListDropdown.tsx` | **New** — dropdown component |
| `packages/ui/src/components/tabs/index.ts` | Export `TabListDropdown` |
| `apps/tauri/src/features/tabs/store/slices/moveSlice.ts` | Add `sortTabsByName` |
| `apps/tauri/src/features/tabs/store/types.ts` | Add `sortTabsByName` to `TabsState` |
| `apps/tauri/src/features/tabs/hooks/useTabs.ts` | Expose `sortTabsByName` |
| `apps/tauri/src/features/tabs/components/WorkspaceTabs.tsx` | Wire dropdown into each group's tab bar |

---

## Out of Scope

- Pinned tab visual grouping / clustering
- Keyboard navigation within the dropdown
- Per-pane tab count badge on the ⌄ button
- Context menu changes (already has close-to-right etc.)
