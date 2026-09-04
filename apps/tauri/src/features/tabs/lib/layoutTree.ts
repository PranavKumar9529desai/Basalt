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

/** Split a leaf in the given direction, creating a new sibling. */
export function splitLeaf(
  root: LayoutNode,
  targetId: PaneId,
  direction: "horizontal" | "vertical",
  newTabIds: TabId[] = [],
): LayoutNode {
  if (root.type === "leaf") {
    if (root.id !== targetId) return root;
    const newLeaf = createLeaf(newTabIds);
    return createSplit(direction, root, newLeaf);
  }

  return {
    ...root,
    children: root.children.map((child) =>
      splitLeaf(child, targetId, direction, newTabIds),
    ),
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
