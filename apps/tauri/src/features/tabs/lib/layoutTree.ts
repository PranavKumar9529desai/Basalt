import type {
  LayoutNode,
  SplitNode,
  LeafNode,
  TabId,
  PaneId,
  TabGroupId,
} from "../types";

let nextPaneId = 0;

function makePaneId(): PaneId {
  return `pane-${++nextPaneId}` as PaneId;
}

function makeTabGroupId(): TabGroupId {
  return `group-${++nextPaneId}` as TabGroupId;
}

/** Create a leaf node containing a single tab group. */
export function createLeaf(tabIds: TabId[] = []): LeafNode {
  return {
    id: makePaneId(),
    type: "leaf",
    tabGroup: {
      id: makeTabGroupId(),
      tabIds,
      activeTabId: tabIds.length > 0 ? tabIds[tabIds.length - 1] : null,
      previewTabId: null,
    },
  };
}

/** Create a split node with two children. */
export function createSplit(
  orientation: "horizontal" | "vertical",
  first: LayoutNode,
  second: LayoutNode,
): SplitNode {
  return {
    id: makePaneId(),
    type: "split",
    orientation,
    children: [first, second],
  };
}

/** Find a leaf node by pane ID. */
export function findLeaf(root: LayoutNode, paneId: PaneId): LeafNode | null {
  if (root.type === "leaf") {
    return root.id === paneId ? root : null;
  }
  for (const child of root.children) {
    const found = findLeaf(child, paneId);
    if (found) return found;
  }
  return null;
}

/** Find the leaf containing a specific tab. */
export function findLeafByTab(
  root: LayoutNode,
  tabId: TabId,
): LeafNode | null {
  if (root.type === "leaf") {
    return root.tabGroup.tabIds.includes(tabId) ? root : null;
  }
  for (const child of root.children) {
    const found = findLeafByTab(child, tabId);
    if (found) return found;
  }
  return null;
}

/** Immutably map over the single leaf at `paneId`, returning the new tree. */
export function mapLeaf(
  root: LayoutNode,
  paneId: PaneId,
  updater: (leaf: LeafNode) => LeafNode,
): LayoutNode {
  if (root.type === "leaf") {
    return root.id === paneId ? updater(root) : root;
  }
  let changed = false;
  const children = root.children.map((child) => {
    const next = mapLeaf(child, paneId, updater);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Immutably map over every leaf in the tree. */
export function mapLeaves(
  root: LayoutNode,
  updater: (leaf: LeafNode) => LeafNode,
): LayoutNode {
  if (root.type === "leaf") return updater(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = mapLeaves(child, updater);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Find the parent split of a leaf. */
export function findParent(
  root: LayoutNode,
  childId: PaneId,
): SplitNode | null {
  if (root.type === "leaf") return null;
  for (const child of root.children) {
    if (child.id === childId) return root;
    const found = findParent(child, childId);
    if (found) return found;
  }
  return null;
}

/** Remove a leaf from the tree and unwrap single-child splits. */
export function removeLeaf(
  root: LayoutNode,
  paneId: PaneId,
): LayoutNode | null {
  if (root.type === "leaf") {
    return root.id === paneId ? null : root;
  }

  const newChildren = root.children
    .map((child) => removeLeaf(child, paneId))
    .filter((child): child is LayoutNode => child !== null);

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];

  return { ...root, children: newChildren };
}

export interface SplitResult {
  root: LayoutNode;
  newLeafId: PaneId;
}

/** Split a leaf in the given direction, creating a new sibling. Returns the new tree and new leaf ID. */
export function splitLeaf(
  root: LayoutNode,
  targetId: PaneId,
  direction: "horizontal" | "vertical",
  newTabIds: TabId[] = [],
): SplitResult {
  if (root.type === "leaf") {
    if (root.id !== targetId) return { root, newLeafId: targetId };
    const newLeaf = createLeaf(newTabIds);
    return {
      root: createSplit(direction, root, newLeaf),
      newLeafId: newLeaf.id,
    };
  }

  let newLeafId = targetId;
  const newChildren = root.children.map((child) => {
    const result = splitLeaf(child, targetId, direction, newTabIds);
    if (result.root !== child) {
      newLeafId = result.newLeafId;
    }
    return result.root;
  });

  return {
    root: { ...root, children: newChildren },
    newLeafId,
  };
}

/** Collect all leaf nodes in tree order. */
export function collectLeaves(root: LayoutNode): LeafNode[] {
  if (root.type === "leaf") return [root];
  return root.children.flatMap(collectLeaves);
}

/** Serialize a layout node for persistence. */
export function serializeNode(
  node: LayoutNode,
): import("../types").SerializedLayoutNode {
  if (node.type === "leaf") {
    return {
      id: node.id,
      type: "leaf",
      tabGroup: { ...node.tabGroup },
    };
  }
  return {
    id: node.id,
    type: "split",
    orientation: node.orientation,
    children: node.children.map(serializeNode),
  };
}

/** Deserialize a layout node from persistence. */
export function deserializeNode(
  node: import("../types").SerializedLayoutNode,
): LayoutNode {
  if (node.type === "leaf") {
    return {
      id: node.id,
      type: "leaf",
      tabGroup: { ...node.tabGroup },
    };
  }
  return {
    id: node.id,
    type: "split",
    orientation: node.orientation,
    children: node.children.map(deserializeNode),
  };
}
