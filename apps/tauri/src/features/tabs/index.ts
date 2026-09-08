export { TabsBar } from "./components/TabsBar";
export { PaneRenderer } from "./components/PaneRenderer";
export type { LeafRenderContext } from "./components/PaneRenderer";
export { SplitPane } from "./components/SplitPane";
export { TabDragGhost } from "./components/TabDragGhost";
export { useTabDnD } from "./hooks/useTabDnD";
export { useTabPersistence } from "./hooks/useTabPersistence";
export { getTabByPath } from "./store/selectors";
export type { CloseTabOptions, OpenTabOptions, TabsState } from "./store";
export { useTabsStore } from "./store";
export type {
  OpenableTabInput,
  TabPaneId,
  TabPane,
  TabId,
  TabModel,
  NoteViewMode,
  TabsWorkspaceSnapshot,
  PaneId,
  TabGroupId,
  LayoutNode,
  SplitNode,
  LeafNode,
  TabGroup,
} from "./types";
export {
  createLeaf,
  createSplit,
  splitLeaf,
  removeLeaf,
  findLeaf,
  findLeafByTab,
  collectLeaves,
  mapLeaf,
  mapLeaves,
} from "./lib/layoutTree";
