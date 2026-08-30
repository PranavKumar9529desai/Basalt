export type TabId = string;
export type TabPaneId = string;

export interface OpenableTabInput {
  path: string;
  title?: string;
  /** Optional 1-based line to reveal when the tab opens (search jump-to-line). */
  line?: number;
  /**
   * Transient: enter the leaf's "rename on open" flow once (select-all title
   * editing) on first show. Mirrors `line` — never persisted.
   */
  renameOnOpen?: boolean;
}

export interface TabModel {
  id: TabId;
  path: string;
  title: string;
  /** Registered leaf type that renders this tab's content (ADR-018). */
  leafType: string;
  isPinned: boolean;
  isPreview: boolean;
  isDirty: boolean;
  createdAt: number;
  lastAccessedAt: number;
  /** Transient: line to reveal once on open. Not persisted. */
  line?: number;
  /** Transient: rename title once on first show. Not persisted. */
  renameOnOpen?: boolean;
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
