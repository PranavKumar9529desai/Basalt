import type {
  OpenableTabInput,
  TabPaneId,
  TabPane,
  TabId,
  TabModel,
  TabsWorkspaceSnapshot,
} from "../types";

export type { TabPane };
export type { TabPaneId };

export interface CloseTabOptions {
  force?: boolean;
}

export interface OpenTabOptions {
  activate?: boolean;
}

export interface TabsState {
  tabs: Record<TabId, TabModel>;
  pane: TabPane;
  /**
   * Monotonically increasing version counter bumped on workspace mutations
   * that must be persisted. Dirty state remains ephemeral because the editor
   * document cache is not part of the workspace snapshot.
   */
  persistVersion: number;

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
  moveTabWithinPane: (fromIndex: number, toIndex: number) => void;
  /** Repoint open tabs after files/folders moved on disk. Ids are STABLE:
   * only path/title change, so leaf caches keyed by id survive the move
   * and dirty state is preserved. */
  updateTabPaths: (moves: Array<{ from: string; to: string }>) => void;
  toWorkspaceSnapshot: () => TabsWorkspaceSnapshot;
  hydrateFromWorkspaceSnapshot: (snapshot: TabsWorkspaceSnapshot) => void;
  reset: () => void;
}
