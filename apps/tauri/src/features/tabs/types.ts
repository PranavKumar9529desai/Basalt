export type TabId = string;
export type TabPaneId = string;
export type PaneId = string;
export type TabGroupId = string;
export type NoteViewMode = "edit" | "reading";

export interface OpenableTabInput {
  path: string;
  title?: string;
  /** Optional 1-based line to reveal when the tab opens (search jump-to-line). */
  line?: number;
  /** Transient: focus the note body once when the tab opens. */
  focusOnOpen?: boolean;
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
  /** Registered leaf type that renders this tab's content. */
  leafType: string;
  /** Presentation mode for Markdown leaves; ignored by non-Markdown leaves. */
  viewMode?: NoteViewMode;
  isPinned: boolean;
  isPreview: boolean;
  isDirty: boolean;
  createdAt: number;
  lastAccessedAt: number;
  /** Transient: line to reveal once on open. Not persisted. */
  line?: number;
  /** Transient: focus the note body once when the tab opens. Not persisted. */
  focusOnOpen?: boolean;
  /** Transient: rename title once on first show. Not persisted. */
  renameOnOpen?: boolean;
}

export interface TabPane {
  id: TabPaneId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

// --- Split Pane Layout Tree (ADR-032) ---

export interface TabGroup {
  id: TabGroupId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

export interface SplitNode {
  id: PaneId;
  type: "split";
  orientation: "horizontal" | "vertical";
  children: LayoutNode[];
}

export interface LeafNode {
  id: PaneId;
  type: "leaf";
  tabGroup: TabGroup;
}

export type LayoutNode = SplitNode | LeafNode;

// --- End Split Pane Layout Tree ---

export interface SerializedTab {
  id: TabId;
  path: string;
  title: string;
  /** Registered leaf type needed to restore non-markdown tabs. */
  leafType: string;
  /** Persisted presentation mode for Markdown leaves. */
  viewMode?: NoteViewMode;
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

// --- Serialized Layout Tree (ADR-032) ---

export interface SerializedTabGroup {
  id: TabGroupId;
  tabIds: TabId[];
  activeTabId: TabId | null;
  previewTabId: TabId | null;
}

export interface SerializedSplitNode {
  id: PaneId;
  type: "split";
  orientation: "horizontal" | "vertical";
  children: SerializedLayoutNode[];
}

export interface SerializedLeafNode {
  id: PaneId;
  type: "leaf";
  tabGroup: SerializedTabGroup;
}

export type SerializedLayoutNode = SerializedSplitNode | SerializedLeafNode;

// --- End Serialized Layout Tree ---

/** Version 1: single pane (legacy). */
export interface TabsWorkspaceSnapshotV1 {
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

/** Version 2: split pane layout tree (ADR-032). */
export interface TabsWorkspaceSnapshotV2 {
  version: 2;
  root: SerializedLayoutNode;
  activePaneId: PaneId;
  tabs: SerializedTab[];
}

export type TabsWorkspaceSnapshot = TabsWorkspaceSnapshotV1 | TabsWorkspaceSnapshotV2;
