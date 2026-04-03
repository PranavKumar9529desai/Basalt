import type {
  SplitDirection,
  TabGroupId,
  TabGroupModel,
  TabLayoutAxis,
  TabLayoutNode,
} from "../types";
import { ROOT_GROUP_ID } from "../constants";

function directionToAxis(direction: SplitDirection): TabLayoutAxis {
  return direction === "left" || direction === "right" ? "row" : "column";
}

export function createGroupNode(groupId: TabGroupId): TabLayoutNode {
  return { type: "group", groupId };
}

export function splitLayoutNode(
  root: TabLayoutNode,
  targetGroupId: TabGroupId,
  newGroupId: TabGroupId,
  direction: SplitDirection,
): TabLayoutNode {
  const axis = directionToAxis(direction);
  let replaced = false;

  function recurse(node: TabLayoutNode): TabLayoutNode {
    if (node.type === "group") {
      if (node.groupId === targetGroupId) {
        replaced = true;
        const newChild = createGroupNode(newGroupId);
        const children =
          direction === "left" || direction === "top"
            ? [newChild, node]
            : [node, newChild];
        return { type: "split", axis, children };
      }
      return node;
    }

    const nextChildren = node.children.map((child) => recurse(child));
    const isSame = nextChildren.every(
      (child, index) => child === node.children[index],
    );
    if (isSame) {
      return node;
    }
    return { ...node, children: nextChildren };
  }

  const nextRoot = recurse(root);
  if (replaced) {
    return nextRoot;
  }

  const fallbackChild = { ...root };
  const newChild = createGroupNode(newGroupId);
  const children =
    direction === "left" || direction === "top"
      ? [newChild, fallbackChild]
      : [fallbackChild, newChild];
  return { type: "split", axis, children };
}

export function removeGroupFromLayoutNode(
  node: TabLayoutNode | null,
  groupId: TabGroupId,
): TabLayoutNode | null {
  if (!node) return null;
  if (node.type === "group") {
    return node.groupId === groupId ? null : node;
  }

  const nextChildren = node.children
    .map((child) => removeGroupFromLayoutNode(child, groupId))
    .filter((child): child is TabLayoutNode => Boolean(child));

  if (nextChildren.length === 0) {
    return null;
  }

  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  const isSame = nextChildren.every(
    (child, index) => child === node.children[index],
  );
  if (isSame) {
    return node;
  }

  return { ...node, children: nextChildren };
}

function pruneLayoutNode(
  node: TabLayoutNode | null,
  validGroupIds: Set<TabGroupId>,
): TabLayoutNode | null {
  if (!node) return null;
  if (node.type === "group") {
    return validGroupIds.has(node.groupId) ? node : null;
  }

  const prunedChildren = node.children
    .map((child) => pruneLayoutNode(child, validGroupIds))
    .filter((child): child is TabLayoutNode => Boolean(child));

  if (prunedChildren.length === 0) {
    return null;
  }

  if (prunedChildren.length === 1) {
    return prunedChildren[0];
  }

  const isSame = prunedChildren.every(
    (child, index) => child === node.children[index],
  );
  if (isSame) {
    return node;
  }

  return { ...node, children: prunedChildren };
}

export function normalizeLayoutRoot(
  node: TabLayoutNode | null,
  groups: Record<TabGroupId, TabGroupModel>,
  groupOrder: TabGroupId[],
): TabLayoutNode {
  const validGroupIds = new Set(Object.keys(groups));
  const pruned = pruneLayoutNode(node, validGroupIds);
  if (pruned) return pruned;

  const fallbackGroupId = groupOrder[0] ?? ROOT_GROUP_ID;
  return createGroupNode(fallbackGroupId as TabGroupId);
}
