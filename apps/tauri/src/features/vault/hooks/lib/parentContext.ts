import type { FlatTreeNode } from "../../types";

/** Destination context for a create targeting a node: the parent folder path
 * (folders create inside themselves, files inside their parent) and the new
 * node's depth. Pure core of the controller's `deriveParentContext`. */
export function parentContextFor(node: FlatTreeNode): {
  parentRelPath: string;
  depth: number;
} {
  const isFolder = node.kind === "folder";
  const parentRelPath = isFolder
    ? node.relPath
    : (() => {
        const lastSlash = node.relPath.lastIndexOf("/");
        return lastSlash === -1 ? "" : node.relPath.slice(0, lastSlash);
      })();
  const parentDepth = isFolder ? node.depth : Math.max(0, node.depth - 1);
  return { parentRelPath, depth: parentDepth + 1 };
}
