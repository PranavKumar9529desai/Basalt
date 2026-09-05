import { type ReactNode } from "react";
import type { LayoutNode, LeafNode, PaneId } from "../types";
import { useTabsStore } from "../store";
import { useTabDnD } from "../hooks/useTabDnD";
import { SplitPane } from "./SplitPane";

export interface LeafRenderContext {
  paneId: PaneId;
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
  node,
  renderLeaf,
}: {
  node: LeafNode;
  renderLeaf: (ctx: LeafRenderContext) => ReactNode;
}) {
  const markTabDirty = useTabsStore((state) => state.markTabDirty);
  const activatePane = useTabsStore((state) => state.activatePane);
  const tabDnD = useTabDnD();

  // The node prop carries this leaf's own tab group (root is the source of
  // truth in ADR-032), so each pane renders ITS active tab — never another
  // pane's. Rerenders arrive through the tree subscription in the shell.
  const ctx: LeafRenderContext = {
    paneId: node.id,
    activeTabId: node.tabGroup.activeTabId,
    markTabDirty,
  };

  return (
    <section
      className="flex flex-1 min-h-0 min-w-0 flex-col"
      // Focus anywhere inside a leaf (its tab bar, header, or editor) — or a
      // plain mousedown on blank pane space — focuses that pane, the only way
      // `activePaneId` tracks user intent.
      onFocusCapture={() => activatePane(node.id)}
      onMouseDownCapture={() => activatePane(node.id)}
      // Drop a tab on a pane's body (below the bars, incl. empty panes): the
      // tab moves into THIS pane at the end and focus follows it there.
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-basalt-tab")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => tabDnD.handlePaneBodyDrop(node.id, e)}
    >
      {renderLeaf(ctx)}
    </section>
  );
}
