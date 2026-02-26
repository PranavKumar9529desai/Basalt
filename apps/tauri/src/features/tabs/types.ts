export type TabId = string;
export type TabGroupId = string;

export type SplitDirection = "left" | "right" | "top" | "bottom";

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

export interface TabGroupModel {
  id: TabGroupId;
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

export interface SerializedTabGroup {
  id: TabGroupId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

export interface TabsWorkspaceSnapshot {
  version: 1;
  focusedGroupId: TabGroupId | null;
  groupOrder: TabGroupId[];
  groups: SerializedTabGroup[];
  tabs: SerializedTab[];
}

