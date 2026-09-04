import { type ReactNode } from "react";
import type { LayoutNode, LeafNode } from "../types";
import { useTabsStore } from "../store";
import { SplitPane } from "./SplitPane";

export interface LeafRenderContext {
  activeTabId: string | null;
  markTabDirty: (tabId: string, dirty: boolean) => void;
}

export interface PaneRendererProps {
  node: LayoutNode;
  renderLeaf: (context: LeafRenderContext) => ReactNode;
}

/**
 * Recursive renderer for the split pane layout tree (ADR-032).
 *
 * - LeafNode: renders a tab group via `renderLeaf`
 * - SplitNode: renders a SplitPane with children
 */
export function PaneRenderer({ node, renderLeaf }: PaneRendererProps) {
  if (node.type === "leaf") {
    return <LeafPane node={node} renderLeaf={renderLeaf} />;
  }
  return (
    <SplitPane orientation={node.orientation}>
      {node.children.map((child) => (
        <PaneRenderer key={child.id} node={child} renderLeaf={renderLeaf} />
      ))}
    </SplitPane>
  );
}

function LeafPane({
  renderLeaf,
}: {
  node: LeafNode;
  renderLeaf: (ctx: LeafRenderContext) => ReactNode;
}) {
  const activeTabId = useTabsStore(
    (state) => state.pane.activeTabId,
  );
  const markTabDirty = useTabsStore((state) => state.markTabDirty);

  // Phase 1: all leaves share the single pane's activeTabId.
  // Future: each leaf will have its own activeTabId.
  const ctx: LeafRenderContext = {
    activeTabId,
    markTabDirty,
  };

  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col">
      {renderLeaf(ctx)}
    </div>
  );
}
