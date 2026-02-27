import type {
    OpenableTabInput,
    SplitDirection,
    TabGroupId,
    TabGroupModel,
    TabId,
    TabModel,
    TabsWorkspaceSnapshot,
} from "../types";

export type { TabGroupModel };

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
