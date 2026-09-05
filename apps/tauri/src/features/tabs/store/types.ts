import type {
  OpenableTabInput,
  TabPaneId,
  TabId,
  TabModel,
  TabsWorkspaceSnapshot,
  PaneId,
  LayoutNode,
} from "../types";

export type { TabPaneId };
export type { PaneId };
export type { LayoutNode };

export interface CloseTabOptions {
  force?: boolean;
}

export interface OpenTabOptions {
  activate?: boolean;
}

export interface TabsState {
  tabs: Record<TabId, TabModel>;
  /**
   * Monotonically increasing version counter bumped on workspace mutations
   * that must be persisted. Dirty state remains ephemeral because the editor
   * document cache is not part of the workspace snapshot.
   */
  persistVersion: number;

  // Split Pane Layout Tree (ADR-032) — the single source of truth. There is
  // no derived flat pane; consumers resolve a leaf's tab group via
  // `findLeaf(root, paneId)`.
  root: LayoutNode;
  activePaneId: PaneId;

  openInPreview: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  openPinned: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  openView: (
    leafType: string,
    options?: { title?: string; path?: string; activate?: boolean },
  ) => TabId;
  activateTab: (tabId: TabId) => void;
  markTabDirty: (tabId: TabId, isDirty: boolean) => void;
  setTabTitle: (tabId: TabId, title: string) => void;
  setTabViewMode: (tabId: TabId, mode: import("../types").NoteViewMode) => void;
  pinTab: (tabId: TabId) => void;
  unpinTab: (tabId: TabId) => void;
  togglePinTab: (tabId: TabId) => void;
  closeTab: (tabId: TabId, options?: CloseTabOptions) => void;
  closeOtherTabs: (tabId: TabId) => void;
  closeTabsToRight: (tabId: TabId) => void;
  /** Reorder tabs within a pane's group (`paneId` defaults to the active pane). */
  moveTabWithinPane: (
    fromIndex: number,
    toIndex: number,
    paneId?: PaneId,
  ) => void;
  /** Move a tab into another pane's group (cross-pane drag & drop). The
   * tab is pinned on drop so preview eviction can't claim it, the target
   * pane becomes active, and the dropped tab is focused. `insertIndex`
   * defaults to appending at the end of the target group. */
  moveTabToPane: (
    tabId: TabId,
    targetPaneId: PaneId,
    insertIndex?: number,
  ) => void;
  /** Split `paneId` in `direction` and move an existing tab into the new
   * pane (drag-to-edge / move-to-new-pane). Focus follows the tab. */
  moveTabToNewPane: (
    tabId: TabId,
    paneId: PaneId,
    direction: "horizontal" | "vertical",
  ) => void;
  /** Repoint open tabs after files/folders moved on disk. Ids are STABLE:
   * only path/title change, so leaf caches keyed by id survive the move
   * and dirty state is preserved. */
  updateTabPaths: (moves: Array<{ from: string; to: string }>) => void;

  // Split Pane Layout Tree actions (ADR-032 Phase 3)
  splitActivePane: (direction: "horizontal" | "vertical") => void;
  closePane: (paneId: PaneId) => void;
  activatePane: (paneId: PaneId) => void;

  toWorkspaceSnapshot: () => TabsWorkspaceSnapshot;
  hydrateFromWorkspaceSnapshot: (snapshot: TabsWorkspaceSnapshot) => void;
  reset: () => void;
}
