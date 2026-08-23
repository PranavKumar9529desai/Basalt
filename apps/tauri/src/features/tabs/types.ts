export type TabId = string;
export type TabPaneId = string;

export interface OpenableTabInput {
  path: string;
  title?: string;
}

export interface TabModel {
  id: TabId;
  path: string;
  title: string;
  isPinned: boolean;
  isPreview: boolean;
  isDirty: boolean;
  createdAt: number;
  lastAccessedAt: number;
}

export interface TabPane {
  id: TabPaneId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

export interface SerializedTab {
  id: TabId;
  path: string;
  title: string;
  isPinned: boolean;
  isPreview: boolean;
  isDirty: boolean;
  createdAt: number;
  lastAccessedAt: number;
}

export interface SerializedTabPane {
  id: TabPaneId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

/** Backward-compat: old snapshots may have these fields. */
export interface TabsWorkspaceSnapshot {
  version: 1;
  panes?: SerializedTabPane[];
  tabs: SerializedTab[];
  /** Legacy — ignored on hydrate. */
  groups?: SerializedTabPane[];
  /** Legacy — ignored on hydrate. */
  focusedGroupId?: string;
  /** Legacy — ignored on hydrate. */
  groupOrder?: string[];
}
