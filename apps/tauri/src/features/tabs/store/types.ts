import type {
  OpenableTabInput,
  SplitDirection,
  TabGroupId,
  TabGroupModel,
  TabId,
  TabLayoutNode,
  TabModel,
  TabsWorkspaceSnapshot,
} from "../types";

export type { TabGroupModel };
export type { TabGroupId };

export interface CloseTabOptions {
  force?: boolean;
}

export interface OpenTabOptions {
  groupId?: TabGroupId;
  activate?: boolean;
}

export interface MoveTabOptions {
  fromGroupId: TabGroupId;
  toGroupId: TabGroupId;
  tabId: TabId;
  toIndex?: number;
}

export interface TabsState {
  tabs: Record<TabId, TabModel>;
  groups: Record<TabGroupId, TabGroupModel>;
  groupOrder: TabGroupId[];
  focusedGroupId: TabGroupId;
  layoutRoot: TabLayoutNode;
  /**
   * Monotonically increasing version counter bumped ONLY on structural
   * mutations (open, close, move, split, merge, pin, rename).
   * Ephemeral changes (markTabDirty, activateTab, setFocusedGroup) leave
   * this untouched — allowing the persistence layer to subscribe to
   * persistVersion instead of the full `tabs`/`groups` records and avoid
   * re-rendering on every keystroke.
   */
  persistVersion: number;

  openInPreview: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  openPinned: (note: OpenableTabInput, options?: OpenTabOptions) => TabId;
  activateTab: (groupId: TabGroupId, tabId: TabId) => void;
  setFocusedGroup: (groupId: TabGroupId) => void;
  markTabDirty: (tabId: TabId, isDirty: boolean) => void;
  setTabTitle: (tabId: TabId, title: string) => void;
  pinTab: (tabId: TabId) => void;
  unpinTab: (tabId: TabId) => void;
  togglePinTab: (tabId: TabId) => void;
  closeTab: (
    groupId: TabGroupId,
    tabId: TabId,
    options?: CloseTabOptions,
  ) => void;
  closeOtherTabs: (groupId: TabGroupId, tabId: TabId) => void;
  closeTabsToRight: (groupId: TabGroupId, tabId: TabId) => void;
  moveTabWithinGroup: (
    groupId: TabGroupId,
    fromIndex: number,
    toIndex: number,
  ) => void;
  moveTabBetweenGroups: (options: MoveTabOptions) => void;
  splitGroupWithTab: (
    groupId: TabGroupId,
    direction: SplitDirection,
    tabId?: TabId,
  ) => TabGroupId;
  removeGroup: (groupId: TabGroupId) => void;
  toWorkspaceSnapshot: () => TabsWorkspaceSnapshot;
  hydrateFromWorkspaceSnapshot: (snapshot: TabsWorkspaceSnapshot) => void;
  reset: () => void;
}
