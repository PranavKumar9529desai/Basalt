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
   * Monotonically increasing version counter bumped ONLY on structural
   * mutations (open, close, pin, rename).
   * Ephemeral changes (markTabDirty, activateTab) leave this untouched
   * — allowing the persistence layer to subscribe to persistVersion
   * instead of the full `tabs` record and avoid re-rendering on every
   * keystroke.
   */
  persistVersion: number;

  openInPreview: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  openPinned: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  activateTab: (tabId: TabId) => void;
  markTabDirty: (tabId: TabId, isDirty: boolean) => void;
  setTabTitle: (tabId: TabId, title: string) => void;
  pinTab: (tabId: TabId) => void;
  unpinTab: (tabId: TabId) => void;
  togglePinTab: (tabId: TabId) => void;
  closeTab: (
    tabId: TabId,
    options?: CloseTabOptions,
  ) => void;
  closeOtherTabs: (tabId: TabId) => void;
  closeTabsToRight: (tabId: TabId) => void;
  moveTabWithinPane: (
    fromIndex: number,
    toIndex: number,
  ) => void;
  toWorkspaceSnapshot: () => TabsWorkspaceSnapshot;
  hydrateFromWorkspaceSnapshot: (snapshot: TabsWorkspaceSnapshot) => void;
  reset: () => void;
}
