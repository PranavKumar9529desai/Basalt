import { TabGroupFrame } from "@workspace/ui/components/tabs";
import { type ReactNode, useMemo } from "react";
import { useTabsStore } from "../store";
import type { TabModel } from "../types";

export interface PaneRenderContext {
  activeTab: TabModel | null;
  markTabDirty: (tabId: string, dirty: boolean) => void;
}

export interface WorkspaceTabsProps {
  renderPane: (context: PaneRenderContext) => ReactNode;
}

/**
 * Single-pane tab host reading directly from the tabs store. The tab bar
 * itself lives in WorkspaceTabsBar, rendered by the shell as the editor
 * column's header cell in the workspace grid.
 */
export function WorkspaceTabs({ renderPane }: WorkspaceTabsProps) {
  const activeTabId = useTabsStore((state) => state.pane.activeTabId);
  const markTabDirty = useTabsStore((state) => state.markTabDirty);

  const activeTab = useMemo(() => {
    if (!activeTabId) return null;
    const { tabs } = useTabsStore.getState();
    return tabs[activeTabId] ?? null;
  }, [activeTabId]);

  return (
    <div className="flex flex-1 min-h-0 bg-[var(--sat-surface-1)]">
      <div className="flex flex-1 min-h-0 w-full min-w-0">
        <TabGroupFrame className="flex-1 min-h-0 border-0">
          {renderPane({
            activeTab,
            markTabDirty,
          })}
        </TabGroupFrame>
      </div>
    </div>
  );
}
