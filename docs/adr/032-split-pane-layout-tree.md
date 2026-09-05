# ADR-032: Split Pane Layout Tree

**Status:** Accepted (2026-09-04) — **Implementation complete (2026-09-05)**
**Date:** 2026-09-04
**Extends:** ADR-018 (registry-driven workbench), ADR-025 (tab lifecycle and persistence)

## Context

Basalt currently uses a **single-pane tab model**: one `TabPane` object holds all open tabs, rendered as a single `<TabsBar>` + `<Tabs>` column in the workspace grid. This was intentional — ADR-018 Phase 3 explicitly deferred "Layout as serializable tree" until the registry and leaf systems were proven.

Both Obsidian and VS Code have solved this problem, but they took different architectural paths:

| Aspect | Obsidian | VS Code |
|--------|----------|---------|
| Grid model | `WorkspaceSplit` tree (DOM-based) | `SerializableGrid` (custom widget) |
| Split granularity | Root + left/right docks | Editor area only |
| Dock splits | Yes (tabs in sidebars) | No |
| Orientation | Per-split (vertical root default) | Per-branch (toggleable) |
| Maximize/expand | No | Yes |
| Multi-window | Popout windows | Auxiliary windows |
| Persistence | `workspace.json` | `IStorageService` |

**Neither model is directly suitable for Basalt:**

- Obsidian's DOM-based tree works but lacks the proportional resizing and maximize/expand features power users expect.
- VS Code's `SerializableGrid` is powerful but tightly coupled to their `Part` system and DI container — it's not a reusable primitive.

**The gap:** We need split panes in the editor area. ADR-025 already designed the tab contract (stable IDs, preview/pin state, MRU-like activation) to be pane-aware — "Pane splits can later reuse these rules because ordering and active state are already pane-owned."

## Decision

### Hybrid architecture: VS Code's grid model + Obsidian's dock flexibility

**Layer 1: Outer shell** (unchanged)
The workspace grid (`ribbon | left dock | editor area | right dock`) stays as a simple CSS grid. Side docks remain `SideDock` components with their current behavior.

**Layer 2: Editor area split tree** (new)
Inside the editor area (column 3 of the current workspace grid), we introduce a **recursive split tree** using VS Code's grid model principles:

```
EditorArea
└── SplitNode (orientation: vertical = columns)
    ├── LeafNode (tab group A)
    ├── SplitNode (orientation: horizontal = rows)
    │   ├── LeafNode (tab group B)
    │   └── LeafNode (tab group C)
    └── LeafNode (tab group D)
```

### Data model

```ts
type PaneId = string & { __brand: "PaneId" };
type TabGroupId = string & { __brand: "TabGroupId" };

// Branch node: contains 2+ children arranged in one direction
interface SplitNode {
  id: PaneId;
  type: "split";
  orientation: "horizontal" | "vertical";
  children: LayoutNode[];
  // Sizes are proportional (sum = 1.0 within parent)
  // Stored as flex ratios, not pixels
}

// Leaf node: contains a tab group (the actual content)
interface LeafNode {
  id: PaneId;
  type: "leaf";
  tabGroup: TabGroup;
}

// TabGroup: what TabPane becomes (renamed for clarity)
interface TabGroup {
  id: TabGroupId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

type LayoutNode = SplitNode | LeafNode;
```

### Serialization format (workspace.json v2)

```json
{
  "version": 2,
  "root": {
    "type": "split",
    "orientation": "vertical",
    "children": [
      { "type": "leaf", "id": "pane-1", "tabGroup": { "tabIds": [...], "activeTabId": "..." } },
      { "type": "split", "orientation": "horizontal", "children": [
        { "type": "leaf", "id": "pane-2", "tabGroup": { ... } },
        { "type": "leaf", "id": "pane-3", "tabGroup": { ... } }
      ]}
    ]
  },
  "tabs": [...]
}
```

### Store changes (extends current Zustand store)

The current `pane: TabPane` becomes `root: LayoutNode`. Backward compatibility: `hydrateFromWorkspaceSnapshot` detects version 1 (flat pane) and wraps it in a single leaf node.

```ts
interface TabsState {
  tabs: Record<TabId, TabModel>;
  root: LayoutNode;                    // was: pane: TabPane
  activePaneId: PaneId;                // which leaf has focus
  persistVersion: number;

  // Existing actions (now scoped to active pane)
  openInPreview: ...;
  openPinned: ...;
  closeTab: ...;
  // ...

  // New split actions
  splitPane: (direction: "horizontal" | "vertical") => void;
  closePane: (paneId: PaneId) => void;
  moveTabToPane: (tabId: TabId, targetPaneId: PaneId) => void;
  activatePane: (paneId: PaneId) => void;
}
```

### Rendering: recursive PaneRenderer

```tsx
function PaneRenderer({ node, renderLeaf }) {
  if (node.type === "leaf") {
    return renderLeaf(node.tabGroup);
  }
  // node.type === "split"
  const Flex = node.orientation === "vertical" ? VerticalSplit : HorizontalSplit;
  return (
    <Flex>
      {node.children.map((child, i) => (
        <PaneRenderer key={child.id} node={child} renderLeaf={renderLeaf} />
      ))}
    </Flex>
  );
}
```

`VerticalSplit` / `HorizontalSplit` use CSS `flex` + draggable sash dividers (similar to VS Code's sash model but lightweight — no full `SerializableGrid` widget).

### What we adopt from each

**From VS Code:**
- Declarative serialized layout: `{ orientation, children: [{size}] }` tree
- Per-branch orientation (root = vertical, children can be horizontal)
- Grid operations: `addGroup(location, direction)`, `mergeGroup()`, `removeGroup()`
- Proportional sizing (flex ratios, not fixed pixels)

**From Obsidian:**
- Simpler model: `SplitNode | LeafNode` (no `WorkspaceTabs` wrapper — tabs live directly in `LeafNode.tabGroup`)
- Side dock splits: extend the same `LayoutNode` tree to side docks in a future phase (not v1)
- Workspace persistence: single `workspace.json` file, not scattered storage keys

**From neither (deferred):**
- Maximize/expand group (nice-to-have, not v1)
- Multi-window / auxiliary windows (complex, not v1)
- Centered layout (niche)

### Split operations

| Operation | Implementation |
|-----------|----------------|
| Split active pane right | Wrap current leaf + new leaf in a `SplitNode(orientation=vertical)` |
| Split active pane down | Wrap current leaf + new leaf in a `SplitNode(orientation=horizontal)` |
| Close pane | Remove leaf from parent `SplitNode`; if parent has 1 child left, unwrap |
| Move tab to pane | `removeTabFromSource` + `addTabToTarget`; create pane if needed |
| Drag tab between panes | Same as move, triggered by drop handler |
| Resize | Update `size` ratios on sash drag end |

### Close/unwrap invariant

When a `SplitNode` has only 1 child after a close, it unwraps:
```
Before: SplitNode [LeafA, LeafB]
Close LeafB → SplitNode [LeafA]
Unwrap → LeafA (the SplitNode is removed, LeafA takes its place)
```

This prevents degenerate trees with single-child branches.

## Consequences

- Split panes become a natural extension of the tab system — no new feature directory needed.
- The split tree is serializable and restorable, enabling workspace persistence.
- ADR-025's tab contract (stable IDs, preview/pin, active-tab persistence) works unchanged — each `TabGroup` is a `TabPane` with the same semantics.
- Side dock splits can reuse the same `LayoutNode` tree in a future phase by composing `SideDock` with `PaneRenderer`.
- The outer shell (ribbon + docks) remains a simple CSS grid — no need for a heavy grid widget at that level.
- Performance: recursive React rendering is fine for typical split depths (2-5 panes). Deep trees (10+) are an edge case we can optimize later if needed.

## Validation

All validation items pass in the implementation (branch `feat/split-pane-layout`, committed 2026-09-05):

- ✅ Split right/down: new column/row with duplicate of the active tab (fresh tab id, clean state)
- ✅ Close last tab in a pane: pane closes, tree unwraps
- ✅ Drag tab from pane A to pane B: tab moves, focus follows
- ✅ Restart: v2 layout root restores exactly, active pane preserved
- ✅ Version 1 → 2 migration: old single-pane snapshots wrap into a leaf node
- ✅ At least 2 split depths work (columns containing rows)

## Implementation notes

- `root: LayoutNode` + `activePaneId` are the single source of truth; the flat
  `pane` was removed from `TabsState`. Consumers resolve a leaf's tab group via
  `findLeaf(root, paneId)`.
- `splitActivePane` clones the active tab into the new pane (distinct id, same
  path), so each pane mounts an independent editor controller. Source pane keeps
  its tab; empty source → empty new pane.
- Per-pane tab bars: `TabsBar` gained a `paneId` prop and renders inside each
  leaf (ADR-018 `renderLeaf`), replacing the single flat bar in the shell.
  `LeafPane` activates its pane on focus/mousedown capture anywhere in the leaf.
- DnD: the `application/x-basalt-tab` payload carries `sourcePaneId`. Same-pane
  drop = reorder; cross-pane tab drop = `moveTabToPane(tabId, targetPane, idx)`;
  drop on a pane body (incl. empty panes) appends; `moveTabToNewPane` splits a
  fresh pane in the requested direction (ready for future edge-drop zones).
  Dropped tabs are pinned (never previews) and focus follows.
- Persistence: `useTabPersistence.isTabSnapshot` now accepts v2 (layout root),
  so split layouts restore on boot; v1 still wraps into a leaf.

## Implementation phases

1. ✅ **Data model**: Define `LayoutNode`, `TabGroup` types; migrate store; backward-compat hydration
2. ✅ **Pane renderer**: Recursive `PaneRenderer` + per-leave tab bars; wire to current tab rendering
3. ✅ **Split actions**: `splitActivePane()`, `closePane()`, activate-on-click; palette + commands
4. ✅ **Drag & drop**: Move tabs between panes (tab-drop, pane-body drop, `moveTabToPane`/`moveTabToNewPane`)
5. ✅ **Persistence**: Serialize/deserialize tree; workspace.json v2 format; boot restore
6. ⏳ **Resize sashes**: Proportional sizing (`size` ratios) on drag — deferred from v1
7. ⏳ **Edge-drop split zones**: Visual drop targets at pane edges for `moveTabToNewPane` — deferred
