import { TabListFrame } from "@workspace/ui/components/tabs";
import { type ReactNode, useMemo } from "react";
import { useTabsStore } from "../store";
import type { TabModel } from "../types";

export interface PaneRenderContext {
  activeTab: TabModel | null;
  markTabDirty: (tabId: string, dirty: boolean) => void;
}

export interface TabsProps {
  renderPane: (context: PaneRenderContext) => ReactNode;
}

/**
 * Single-pane tab host reading directly from the tabs store. The tab bar
 * itself lives in TabsBar, rendered by the shell as the editor column's
 * header cell in the workspace grid.
 */
export function Tabs({ renderPane }: TabsProps) {
  const activeTabId = useTabsStore((state) => state.pane.activeTabId);
  // Structural version: bumps on open/close/pin/move/rename. A rename
  // repoints the active tab's path in place (its id is stable), so without
  // this dep the memoized `activeTab` below would keep serving the STALE tab
  // object (old path) to the leaf — and the leaf's autosave would write to
  // the now-deleted old path (ENOENT). Subscribed here so the new record is
  // picked up on every structural change.
  const persistVersion = useTabsStore((state) => state.persistVersion);
  const markTabDirty = useTabsStore((state) => state.markTabDirty);

  const activeTab = useMemo(() => {
    if (!activeTabId) return null;
    // The structural-change version cross-checks the snapshot read: tab ids
    // are stable across a rename/move (so dirty state is kept), and this memo
    // is keyed on persistVersion so a path repoint re-resolves the live tab —
    // without it the stale tab (old path) would drive the leaf's autosave
    // into the now-deleted location (ENOENT).
    void persistVersion;
    const { tabs } = useTabsStore.getState();
    return tabs[activeTabId] ?? null;
  }, [activeTabId, persistVersion]);

  return (
    <div className="flex flex-1 min-h-0 bg-[var(--sat-surface-1)]">
      <div className="flex flex-1 min-h-0 w-full min-w-0">
        <TabListFrame className="flex-1 min-h-0 border-0">
          {renderPane({
            activeTab,
            markTabDirty,
          })}
        </TabListFrame>
      </div>
    </div>
  );
}
